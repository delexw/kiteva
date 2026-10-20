/** Independent of the visual authoring-resource decision and of soundtrack manifest fields. */
export interface AudioAuthoringSelection {
  source: "jev" | "uploads" | "skipped" | "unavailable";
  selectedId?: "local_audio" | "audio_studio";
  model?: string;
  decisions: { id: string; use: boolean; probability: number }[];
  limitation?: string;
}
