import { animateUiRegistry } from "./metadata";
import { createComponentRegistryTools } from "../shared/component-registry-tools";

export function createAnimateUiTools(options: {
  workspace: string;
  readOnly: boolean;
  signal: AbortSignal;
  fetch?: typeof fetch;
}) {
  return createComponentRegistryTools({
    ...options,
    registry: animateUiRegistry,
  });
}
