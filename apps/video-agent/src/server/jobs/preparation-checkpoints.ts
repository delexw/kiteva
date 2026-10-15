import { createHash } from "node:crypto";
import { z } from "zod";
import type { CreativeRequest, Run, PreparationStep } from "../../shared/contracts";
import { errorCode } from "../../shared/errors";

import { preparationSteps } from "../../shared/preparation";
/** The brief is prepared from the original materials; answer-supplied files go to builds only. */
export function preparationRequest(run: Run): CreativeRequest {
  const answered = new Set(
    (run.assetQuestions || []).flatMap((q) => (q.state === "answered" && q.assetIds) || []),
  );
  const keep = (ids: string[]) => ids.filter((id) => !answered.has(id));
  const { requirements, ...request } = run.request;
  const sections = requirements && {
    ...requirements,
    main: { ...requirements.main, assetIds: keep(requirements.main.assetIds) },
    images: { ...requirements.images, assetIds: keep(requirements.images.assetIds) },
    music: { ...requirements.music, assetIds: keep(requirements.music.assetIds) },
  };
  const empty =
    !sections ||
    (Object.values(sections).every((section) => !section.instructions) &&
      [sections.main, sections.images, sections.music].every(
        (section) => !section.assetIds.length,
      ));
  return {
    ...request,
    assetIds: keep(run.request.assetIds),
    ...(empty ? {} : { requirements: sections }),
  } as CreativeRequest;
}
const preparationFingerprint = (inputs: unknown) =>
  createHash("sha256")
    .update(JSON.stringify({ revision: 2, inputs }))
    .digest("hex");
export function initializePreparation(run: Run, inputs: unknown, equivalentInputs: unknown[] = []) {
  const fingerprint = preparationFingerprint(inputs);
  if (
    run.preparation &&
    equivalentInputs.some((item) => preparationFingerprint(item) === run.preparation!.fingerprint)
  )
    run.preparation.fingerprint = fingerprint;
  if (run.preparation?.fingerprint !== fingerprint)
    run.preparation = { fingerprint, checkpoints: {} };
}

export async function preparationCheckpoint<T>(options: {
  run: Run;
  step: PreparationStep;
  schema: z.ZodType<T>;
  signal: AbortSignal;
  save: () => void;
  task: () => Promise<T>;
  validate?: (output: T) => Promise<void>;
}): Promise<T> {
  const { run, step, schema, signal, save } = options;
  if (!run.preparation) throw Error("Preparation must be initialized before a checkpoint");
  signal.throwIfAborted();
  const existing = run.preparation.checkpoints[step];
  if (existing?.state === "completed") {
    try {
      const output = schema.parse(existing.output);
      await options.validate?.(output);
      signal.throwIfAborted();
      return output;
    } catch {
      signal.throwIfAborted();
      // An invalid or missing artifact also invalidates every dependent result.
    }
  }
  for (const dependent of preparationSteps.slice(preparationSteps.indexOf(step)))
    delete run.preparation.checkpoints[dependent];
  run.preparation.checkpoints[step] = { state: "running", startedAt: new Date().toISOString() };
  save();
  try {
    const output = schema.parse(await options.task());
    await options.validate?.(output);
    signal.throwIfAborted();
    run.preparation.checkpoints[step] = {
      state: "completed",
      completedAt: new Date().toISOString(),
      output: structuredClone(output),
    };
    save();
    return output;
  } catch (error) {
    run.preparation.checkpoints[step] = {
      state: signal.aborted ? "interrupted" : "failed",
      finishedAt: new Date().toISOString(),
      errorCode: errorCode(error, signal.aborted ? "GENERATION_INTERRUPTED" : "PREPARATION_FAILED"),
    };
    save();
    throw error;
  }
}
