import type { Run, GenerationJob } from "./contracts";
import { scopedAssetQuestions } from "./asset-question-scopes";
export class InputRequired extends Error {
  constructor() {
    super("Waiting for a user decision");
    this.name = "InputRequired";
  }
}
export interface InputWait {
  jobId?: string;
  checkpoint: "prepare" | "generate";
  questionIds?: string[];
}
export function blockingQuestions(run: Run, job?: Pick<GenerationJob, "id">) {
  return scopedAssetQuestions(run).filter(
    (question) =>
      question.state === "open" &&
      question.mode === "blocking" &&
      (!question.jobId || question.jobId === job?.id),
  );
}
