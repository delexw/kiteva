export interface CreativePoolEntry {
  kind: "motion_graphic" | "motion" | "technology";
  id: string;
  name: string;
  definition: Record<string, unknown>;
}

export type CreativePoolResult =
  | { kind: "search"; entries: Omit<CreativePoolEntry, "definition">[] }
  | { kind: "entry"; entry: CreativePoolEntry }
  | { kind: "error"; message: string };
