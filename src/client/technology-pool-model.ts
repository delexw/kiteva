import { technologyPool, type TechnologyDefinition } from "../shared/technology-pool";

export interface TechnologyEntry {
  key: string;
  definition: TechnologyDefinition;
  kind: string;
}
export const technologyEntries: TechnologyEntry[] = Object.entries(technologyPool).map(
  ([key, definition]) => ({ key, definition, kind: definition.kind }),
);

export function filterTechnologyEntries(
  entries: TechnologyEntry[],
  query: string,
  kind?: string,
  role?: string,
) {
  const search = query.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (!kind || entry.kind === kind) &&
      (!role || entry.definition.production_roles?.includes(role)) &&
      (!search ||
        `${entry.key} ${JSON.stringify(entry.definition)}`.toLowerCase().includes(search)),
  );
}

export function groupTechnologyEntries(entries: TechnologyEntry[]) {
  return [...new Set(entries.map((entry) => entry.kind))]
    .sort((a, b) => a.localeCompare(b))
    .map((kind) => ({ kind, entries: entries.filter((entry) => entry.kind === kind) }));
}

export function technologyCardPath(key: string) {
  return `/technologies?tool=${encodeURIComponent(key)}`;
}

export function technologyEntryForDefinition(definition: TechnologyDefinition) {
  return technologyEntries.find((entry) => entry.definition.name === definition.name);
}
