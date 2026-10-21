import path from "node:path";
import { appRoot } from "../runtime/config";
import type { RendererMetadata, RendererCommand, RendererJobKind } from "./metadata";

export function rendererCliPath(renderer: RendererMetadata) {
  return path.join(appRoot, renderer.execution.cliPath);
}
export function rendererCommandFlags(renderer: RendererMetadata, command: RendererCommand) {
  return [...(renderer.execution.commandFlags[command] ?? []), ...renderer.execution.commonFlags];
}
export function rendererUsesStage(
  renderer: RendererMetadata,
  kind: RendererJobKind,
  command: RendererCommand,
) {
  return renderer.execution.stages[kind].includes(command);
}
export function rendererCommandLabel(renderer: RendererMetadata, command: RendererCommand) {
  return [command, ...renderer.execution.commonFlags].join(" ");
}
export function rendererReproductionCommand(
  renderer: RendererMetadata,
  source: string,
  fps: number,
  kind: RendererJobKind,
) {
  const policy = renderer.execution;
  const format = policy.format?.[kind] ?? "mp4";
  return [
    `node_modules/.bin/${renderer.id}`,
    "render",
    source,
    ...(policy.compositionId ? [policy.compositionId] : []),
    ...rendererCommandFlags(renderer, "render"),
    "--fps",
    String(fps),
    ...(policy.quality ? ["--quality", policy.quality[kind]] : []),
    ...(policy.outputArgument ? [policy.outputArgument] : []),
    `renders/output.${format}`,
  ].join(" ");
}

export function rendererStageLabels(renderer: RendererMetadata, kind: RendererJobKind) {
  const labels = renderer.execution.stages[kind].map((command) =>
    rendererCommandLabel(renderer, command),
  );
  return labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
    : (labels[0] ?? "");
}
