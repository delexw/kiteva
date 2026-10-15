import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { appRoot } from "../runtime/config.js";
import { isolatedCommand } from "../runtime/process.js";

export const multiplaneCli = path.join(appRoot, "node_modules/multiplane/bin/multiplane");
export const multiplaneJobsDir = "renders/multiplane-jobs";

const ResultSchema = z.object({
  type: z.literal("result"),
  ok: z.boolean(),
  code: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  hint: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type MultiplaneResult = z.infer<typeof ResultSchema>;

export function multiplaneEnvironment(): Record<string, string> {
  return {
    MULTIPLANE_HOSTED: "0",
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ||
      path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
  };
}
export function multiplaneInspectArgs(shot: string) {
  return [multiplaneCli, "inspect", shot, "--json"];
}
export function multiplaneShotProblems(
  data: Record<string, unknown> | null | undefined,
  expected: { width: number; height: number; duration: number; fps: number },
) {
  const stage = (data?.stage ?? {}) as { width?: unknown; height?: unknown };
  const problems: string[] = [];
  if (stage.width !== expected.width || stage.height !== expected.height)
    problems.push(
      `#stage is ${String(stage.width)}×${String(stage.height)}; it must be ${expected.width}×${expected.height} CSS pixels`,
    );
  if (data?.duration !== expected.duration)
    problems.push(
      `Shot.define duration is ${String(data?.duration)}; it must be ${expected.duration}`,
    );
  if (data?.fps !== expected.fps)
    problems.push(`Shot.define fps is ${String(data?.fps)}; it must be ${expected.fps}`);
  return problems;
}
export function multiplaneVerifyArgs(shot: string, fps: number) {
  return [
    multiplaneCli,
    "verify",
    shot,
    "--json",
    "--no-hosted",
    "--fps",
    String(fps),
    "--job-dir",
    multiplaneJobsDir,
  ];
}
export function multiplaneRenderArgs(input: {
  shot: string;
  output: string;
  fps: number;
  kind: "preview" | "full";
  audioFile?: string | null;
}) {
  const preview = input.kind === "preview";
  return [
    multiplaneCli,
    "render",
    input.shot,
    "--json",
    "--no-hosted",
    "--overwrite",
    "--job-dir",
    multiplaneJobsDir,
    "--fps",
    String(input.fps),
    "--format",
    preview ? "webm" : "mp4",
    "--quality",
    preview ? "fast" : "standard",
    "--out",
    input.output,
    ...(!preview && input.audioFile ? ["--audio", input.audioFile] : []),
  ];
}
export function multiplaneResult(stdout: string): MultiplaneResult | undefined {
  const lines = stdout.split("\n").filter((line) => line.trim().startsWith("{"));
  for (const line of lines.reverse()) {
    try {
      const parsed = ResultSchema.safeParse(JSON.parse(line));
      if (parsed.success) return parsed.data;
    } catch {
      continue;
    }
  }
  return undefined;
}
export function multiplaneProgress(line: string) {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      phase?: string;
      done?: number;
      total?: number | null;
    };
    if (event.type !== "progress" || typeof event.done !== "number") return undefined;
    return event.total
      ? `${event.phase}: ${event.done}/${event.total} frames`
      : `${event.phase}: ${event.done} frames`;
  } catch {
    return undefined;
  }
}
export function multiplaneFailure(command: string, result: MultiplaneResult | undefined) {
  if (!result) return Error(`Multiplane ${command} did not report a result`);
  return Error(
    `Multiplane ${command} failed (${result.code || "unknown"}): ${result.message || "no message"}${result.hint ? ` Hint: ${result.hint}` : ""}`,
  );
}
export async function runMultiplane(
  command: string,
  args: string[],
  workspace: string,
  signal: AbortSignal,
  onProgress: (text: string) => void = () => {},
  timeout = 600000,
) {
  let stdout = "";
  let pending = "";
  let failure: unknown;
  try {
    await isolatedCommand(
      process.execPath,
      args,
      workspace,
      signal,
      () => {},
      timeout,
      (text) => {
        stdout += text;
        pending += text;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const progress = multiplaneProgress(line);
          if (progress) onProgress(progress);
        }
      },
      multiplaneEnvironment(),
    );
  } catch (error) {
    signal.throwIfAborted();
    failure = error;
  }
  const result = multiplaneResult(stdout);
  if (result?.ok) return result;
  if (!result && failure) throw failure;
  throw multiplaneFailure(command, result);
}

export type MultiplaneStatus = {
  available: boolean;
  version: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  problem?: string;
};
let cachedStatus: { at: number; status: Promise<MultiplaneStatus> } | undefined;
export function multiplaneStatus(workspace: string, version: string) {
  if (cachedStatus && Date.now() - cachedStatus.at < 300000) return cachedStatus.status;
  const status = (async (): Promise<MultiplaneStatus> => {
    if (!existsSync(multiplaneCli))
      return {
        available: false,
        version,
        checks: [],
        problem: "Multiplane is not installed. Run npm install.",
      };
    await mkdir(workspace, { recursive: true });
    try {
      const result = await runMultiplane(
        "doctor",
        [multiplaneCli, "doctor", "--json"],
        workspace,
        AbortSignal.timeout(60000),
        () => {},
        60000,
      );
      const checks = (result.data?.checks ?? []) as MultiplaneStatus["checks"];
      return { available: true, version, checks };
    } catch (error) {
      return { available: false, version, checks: [], problem: (error as Error).message };
    }
  })();
  cachedStatus = { at: Date.now(), status };
  return status;
}
