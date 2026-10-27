import { choice } from "@typesafe-ai/sdk";
import { z } from "zod";
import { jevClient, jevModel } from "./client";
import { redactSecrets } from "../runtime/config";
import type { ProviderEvent } from "../agents/agent";

/** Shared native Choice API execution and attribution; strategies own their criteria and policy. */
type JevChoiceOptions = {
  invocationId: string;
  label: string;
  questionKey: string;
  question: string;
  criteria: Record<string, string>;
  state: unknown;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
};

export function jevChoicePayload(
  options: Pick<JevChoiceOptions, "questionKey" | "question" | "criteria" | "state">,
) {
  const questions = { [options.questionKey]: choice(options.question, options.criteria) };
  const state = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify(options.state)));
  return { model: jevModel, state, questions };
}

export async function runJevChoice(options: JevChoiceOptions) {
  options.signal.throwIfAborted();
  const ids = Object.keys(options.criteria);
  if (!ids.length) throw Error("JEV Choice requires at least one available option");
  const idSchema = z.enum(ids);
  const answerSchema = z.object({
    type: z.literal("choice"),
    choice: idSchema,
    confidence: z.number().finite().min(0).max(1),
    probabilities: z.record(idSchema, z.number().finite().min(0).max(1)),
  });
  const payload = jevChoicePayload(options);
  const client = jevClient();
  options.onEvent({
    type: "invocation",
    message: `${options.label} started`,
    data: {
      provider: "jev",
      model: jevModel,
      invocationId: options.invocationId,
      prompt: {
        system: null,
        user: redactSecrets(JSON.stringify(payload)),
        outputSchema: null,
        reasoningEffort: null,
        note: "JEV Choice API strategy; the SDK does not expose its internal prompt.",
      },
    },
  });
  const result = await client.systemOne(payload, { signal: options.signal });
  options.onEvent({
    type: "usage",
    message: `${options.label} complete`,
    data: {
      provider: "jev",
      model: result.model,
      invocationId: options.invocationId,
      usage: result.usage,
      decision: {
        questionKey: options.questionKey,
        answer: result.answers[options.questionKey],
        comparedIds: ids,
      },
    },
  });
  options.signal.throwIfAborted();
  return {
    model: result.model,
    answer: answerSchema.parse(result.answers[options.questionKey]),
    comparedIds: ids,
  };
}
