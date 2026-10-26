import type { AgentMcpCapability } from "../shared/types";
import type { cavemanRuntime } from "../../caveman";

export function contextRecoveryCapabilities(
  runtime: Awaited<ReturnType<typeof cavemanRuntime>>,
): Record<string, AgentMcpCapability> {
  return runtime
    ? { caveman: { ...runtime.mcp, enabledTools: ["caveman_retrieve"], toolTimeoutSeconds: 60 } }
    : {};
}
