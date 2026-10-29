import { storyboardPageSchema } from "./storyboard-model";
import { useArtifactJson } from "./use-artifact-json";

/** Shared lazy reader for the saved storyboard; opening a viewer never changes the project. */
export function useStoryboard(projectId: string, jobId: string) {
  const base = `/api/artifacts/${encodeURIComponent(projectId)}/${encodeURIComponent(jobId)}`;
  const { data: storyboard, error } = useArtifactJson(
    `${base}/STORYBOARD.json`,
    storyboardPageSchema,
  );
  return { storyboard, error, base };
}
