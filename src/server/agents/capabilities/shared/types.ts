import type { z } from "zod";

export interface AgentMcpCapability {
  command: string;
  args: string[];
  env: Record<string, string>;
  enabledTools: string[];
  toolTimeoutSeconds?: number;
}

export interface ComponentRegistryItem {
  name: string;
  description?: string;
  dependencies: string[];
  registryDependencies: string[];
  files: { path: string; content: string }[];
}

export type ComponentRegistryResult =
  | { kind: "discovery"; items: { name: string; description?: string }[] }
  | { kind: "source"; item: ComponentRegistryItem; source: string }
  | { kind: "installed"; directory: string; dependencies: string[]; source: string }
  | { kind: "error"; message: string };

export interface ComponentRegistry {
  id: string;
  displayName: string;
  url: string;
  licenseUrl: string;
  itemName: z.ZodString;
}
