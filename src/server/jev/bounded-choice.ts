import { randomUUID } from "node:crypto";
import { APIError } from "@typesafe-ai/sdk";
import { runJevChoice, jevChoicePayload } from "./choice";

type ChoiceOptions = Parameters<typeof runJevChoice>[0];
/** Conservative UTF-8 size safeguard; not an exact JEV token count. */
export const jevChoiceInputByteBudget = 32000;

/** Preserve all candidates through model-selected subgroup finalists; never prune by score. */
export async function runBoundedJevChoice(
  options: Omit<ChoiceOptions, "state"> & { state: (ids: readonly string[]) => unknown },
) {
  async function split(ids: string[], label: string): ReturnType<typeof runJevChoice> {
    const midpoint = Math.ceil(ids.length / 2);
    const leftIds = ids.slice(0, midpoint);
    const rightIds = ids.slice(midpoint);
    const left =
      leftIds.length === 1
        ? leftIds[0]
        : (await compare(leftIds, `${label} · first group`)).answer.choice;
    const right =
      rightIds.length === 1
        ? rightIds[0]
        : (await compare(rightIds, `${label} · second group`)).answer.choice;
    return compare([left, right], `${label} · finalists`);
  }
  async function compare(ids: string[], label: string): ReturnType<typeof runJevChoice> {
    options.signal.throwIfAborted();
    const call = {
      ...options,
      invocationId: label === options.label ? options.invocationId : randomUUID(),
      label,
      criteria: Object.fromEntries(ids.map((id) => [id, options.criteria[id]])),
      state: options.state(ids),
      question:
        label === options.label
          ? options.question
          : `${options.question} Compare only candidates supplied in this call; other candidates are compared separately.`,
    };
    const bytes = Buffer.byteLength(JSON.stringify(jevChoicePayload(call)), "utf8");
    if (bytes > jevChoiceInputByteBudget) {
      if (ids.length > 2) return split(ids, label);
      throw Error(
        `JEV comparison needs more compact context: ${bytes} UTF-8 bytes exceeds the ${jevChoiceInputByteBudget}-byte preflight budget. No request was sent.`,
      );
    }
    try {
      return await runJevChoice(call);
    } catch (error) {
      options.signal.throwIfAborted();
      if (
        !(error instanceof APIError) ||
        error.status !== 400 ||
        !JSON.stringify(error.body).includes('"max_tokens_exceeded"') ||
        ids.length <= 2
      )
        throw error;
      return split(ids, label);
    }
  }
  return compare(Object.keys(options.criteria), options.label);
}
