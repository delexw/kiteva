import { reactBitsRegistry } from "./metadata";
import { createComponentRegistryTools } from "../shared/component-registry-tools";

export function createReactBitsTools(options: {
  workspace: string;
  readOnly: boolean;
  signal: AbortSignal;
  fetch?: typeof fetch;
}) {
  return createComponentRegistryTools({
    ...options,
    registry: reactBitsRegistry,
  });
}
