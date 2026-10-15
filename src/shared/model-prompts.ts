export interface ModelPromptSummary {
  id: string;
  model: string;
  purpose: string;
  time: string;
  jobId?: string;
  source: "recorded" | "historical";
}
export interface ModelPromptRecord extends ModelPromptSummary {
  system: string | null;
  user: string | null;
  outputSchema: unknown;
  reasoningEffort: string | null;
  note?: string;
}
// Preserve all text; only indent complete JSON objects/arrays on their own lines.
export function formatModelPrompt(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return value && typeof value === "object" ? JSON.stringify(value, null, 2) : line;
      } catch {
        return line;
      }
    })
    .join("\n");
}
