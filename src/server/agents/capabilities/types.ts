import type { InstrumentReadiness, RenderedInstrumental } from "../../audio/instruments/fluidsynth";

export interface AgentMcpCapability {
  command: string;
  args: string[];
  env: Record<string, string>;
  enabledTools: string[];
  toolTimeoutSeconds?: number;
}

export interface ReactBitsComponent {
  name: string;
  description?: string;
  dependencies: string[];
  registryDependencies: string[];
  files: { path: string; content: string }[];
}

export type ReactBitsResult =
  | { kind: "discovery"; items: { name: string; description?: string }[] }
  | { kind: "source"; item: ReactBitsComponent; source: string }
  | { kind: "installed"; directory: string; dependencies: string[]; source: string }
  | { kind: "error"; message: string };

export type InstrumentToolResult =
  | ({ kind: "status" } & InstrumentReadiness)
  | ({ kind: "rendered" } & RenderedInstrumental)
  | { kind: "error"; message: string };
