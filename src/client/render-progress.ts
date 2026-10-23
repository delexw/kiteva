// Browser-safe dispatcher; all renderer-specific interpretation stays with its renderer.
export { renderProgressUpdate, isRendererProgressEvent } from "../server/rendering/progress";
export type { RenderProgress } from "../shared/render-progress";
