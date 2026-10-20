import type { AgentMcpCapability } from "./capabilities/shared/types";
import type { z } from "zod";
import type { Provider } from "../../shared/contracts";

export interface ProviderEvent {
  type: string;
  message: string;
  data?: unknown;
}

export interface AgentTurnOptions<T> {
  provider: Provider;
  workspace: string;
  prompt: string;
  promptContext?: unknown;
  schema: z.ZodType<T>;
  signal: AbortSignal;
  sessionId?: string;
  onEvent: (event: ProviderEvent) => void;
  readOnly?: boolean;
  planMode?: boolean;
  model?: string;
  textOnly?: boolean;
  reasoningEffort?: "low" | "medium";
  referenceUrls?: string[];
  exploreBriefSections?: boolean;
  images?: string[];
}

export interface AgentExecutionOptions extends Omit<
  AgentTurnOptions<unknown>,
  "provider" | "schema" | "promptContext"
> {
  model: string;
  systemPrompt: string;
  jsonSchema: z.core.JSONSchema.BaseSchema;
  capabilityServers?: Record<string, AgentMcpCapability>;
  referenceServer?: {
    command: string;
    args: string[];
    env: Record<string, string>;
  };
}

export interface Agent {
  readonly provider: Provider;
  run(options: AgentExecutionOptions): Promise<{ result: unknown; sessionId?: string }>;
}
