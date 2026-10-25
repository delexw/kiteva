/** Provider-independent work categories; raw SDK event counts are not workflow steps. */
export const toolActivityLabels = {
  dependencies: "Installing project dependencies…",
  bundling: "Bundling project assets…",
  reading: "Reading project content…",
  editing: "Updating project files…",
  checking: "Checking project code…",
} as const;
export type ToolActivity = keyof typeof toolActivityLabels;
