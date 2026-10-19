export interface AuthoringResource {
  id: string;
  name: string;
  kind: "capability" | "bundled_skill" | "local_code";
  guidance: string;
}

export interface AuthoringResourceSelection {
  source: "jev" | "unavailable";
  model?: string;
  selectedIds: string[];
  decisions: { id: string; use: boolean; probability: number }[];
  limitation?: string;
}
