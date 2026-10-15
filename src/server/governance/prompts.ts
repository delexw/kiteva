import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import type { AgentProgressEvent, Run } from "../../shared/contracts";
import type { ModelPromptRecord } from "../../shared/model-prompts";
import { dataRoot, redactSecrets } from "../runtime/config";
import { correctionActivityPurpose } from "../../shared/governance";
const PromptSchema = z.object({
  system: z.string().nullable(),
  user: z.string(),
  outputSchema: z.unknown(),
  reasoningEffort: z.string().nullable(),
  note: z.string().optional(),
});
export async function recordedModelPrompt(
  run: Run,
  events: AgentProgressEvent[],
  id: string,
): Promise<ModelPromptRecord | undefined> {
  const invocation = events.find(
    (event) =>
      event.type === "invocation" && (event.data as { invocationId?: string })?.invocationId === id,
  );
  if (!invocation) return undefined;
  const data = invocation.data as Record<string, unknown>;
  const related = events.filter(
    (event) => (event.data as { invocationId?: string })?.invocationId === id,
  );
  const model = related.find((event) => event.type === "usage")?.data as
    | { model?: string }
    | undefined;
  const base = {
    id,
    model: model?.model || String(data.model),
    purpose: correctionActivityPurpose(data) || String(data.purpose || "Unrecorded function"),
    time: invocation.time,
    jobId: invocation.jobId,
  };
  const stored = PromptSchema.safeParse(data.prompt);
  if (stored.success)
    return {
      ...base,
      ...stored.data,
      system: stored.data.system === null ? null : redactSecrets(stored.data.system),
      user: redactSecrets(stored.data.user),
      outputSchema: JSON.parse(
        JSON.stringify(stored.data.outputSchema ?? null, (_key, value) =>
          typeof value === "string" ? redactSecrets(value) : value,
        ),
      ),
      source: "recorded",
    };
  // Recover only the user message belonging to this recorded invocation, never infer historical system instructions.
  const session = related
    .map((event) => (event.data as { sessionId?: string })?.sessionId)
    .find((value) => value && z.string().uuid().safeParse(value).success);
  const job = run.jobs.find((job) => job.id === invocation.jobId);
  const workspace = job?.workspace || path.join(dataRoot, "runs", run.id, "brief");
  if (
    data.provider === "claude" &&
    session &&
    path.resolve(workspace).startsWith(path.resolve(dataRoot, "runs") + path.sep)
  ) {
    const next = events.find(
      (event) =>
        event.type === "invocation" && event.id > invocation.id && event.jobId === invocation.jobId,
    );
    const file = path.join(
      os.homedir(),
      ".claude",
      "projects",
      workspace.replace(/[^a-zA-Z0-9]/g, "-"),
      `${session}.jsonl`,
    );
    try {
      const lines = (await readFile(file, "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const message = lines.find(
        (event) =>
          event.type === "user" &&
          Date.parse(event.timestamp) >= Date.parse(invocation.time) &&
          (!next || Date.parse(event.timestamp) < Date.parse(next.time)) &&
          (typeof event.message?.content === "string" ||
            event.message?.content?.some((block: { type: string }) => block.type === "text")),
      );
      if (message) {
        const user =
          typeof message.message.content === "string"
            ? message.message.content
            : message.message.content
                .filter((block: { type: string }) => block.type === "text")
                .map((block: { text: string }) => block.text)
                .join("\n");
        return {
          ...base,
          system: null,
          user: redactSecrets(user),
          outputSchema: null,
          reasoningEffort: null,
          source: "historical",
          note: "User prompt recovered from the SDK transcript. Historical system instructions, schema and effort were not recorded.",
        };
      }
    } catch {
      /* Missing historical transcripts are shown explicitly, never reconstructed from today's templates. */
    }
  }
  return {
    ...base,
    source: "historical",
    system: null,
    user: null,
    outputSchema: null,
    reasoningEffort: null,
    note: "This historical invocation did not record its full prompt and no matching transcript was available.",
  };
}
