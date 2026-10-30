import type { VideoRequest } from "./domains/video";

export const kitevaMcpPath = "/mcp";

export type KitevaIdeaSummary = {
  id: string;
  name: string;
  kind: "draft" | "project";
  phase: string;
};

/** Public agent-facing data only: no workspaces, credentials, source code or event logs. */
export type KitevaMcpResult =
  | { kind: "search"; ideas: KitevaIdeaSummary[] }
  | { kind: "idea"; id: string; request: Record<string, unknown>; revision?: number }
  | { kind: "created"; id: string; request: VideoRequest; url: string; started: false }
  | { kind: "started"; id: string; phase: string; url: string }
  | { kind: "options"; defaults: Partial<VideoRequest>; settingsSchema: Record<string, unknown> }
  | {
      kind: "styles";
      styles: { id: string; name: string; category: string; visualDirection: string }[];
    }
  | { kind: "error"; message: string };
