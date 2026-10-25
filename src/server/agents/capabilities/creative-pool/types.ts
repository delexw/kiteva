import type { TechnologyToolResult } from "../../../../shared/technology-capabilities";

export interface CreativePoolEntry {
  kind: "motion_graphic" | "motion" | "technology";
  id: string;
  name: string;
  definition: Record<string, unknown>;
}

export type CreativePoolResult =
  | TechnologyToolResult
  | { kind: "search"; entries: Omit<CreativePoolEntry, "definition">[] }
  | { kind: "entry"; entry: CreativePoolEntry };
