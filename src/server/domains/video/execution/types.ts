import type { prepareVideoBuildPlan } from "../build-plan";

export type VideoBuildTurn = (prompt: string) => Promise<void>;
export type VideoExecutionInput = {
  planning: Parameters<typeof prepareVideoBuildPlan>[0];
  buildTurn: VideoBuildTurn;
};
