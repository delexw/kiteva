export const videoRenderers = {
  hyperframes: { label: "HyperFrames", pipeline: "HyperFrames", trial: false },
  multiplane: { label: "Multiplane · trial", pipeline: "Multiplane", trial: true },
} as const;
export type VideoRenderer = keyof typeof videoRenderers;
export const videoRendererIds = Object.keys(videoRenderers) as [VideoRenderer, ...VideoRenderer[]];
export const multiplaneVersion = "0.3.8";

export function videoRendererOf(request: { renderer?: VideoRenderer }): VideoRenderer {
  return request.renderer ?? "hyperframes";
}

export function rendererPipelineProblem(renderer: VideoRenderer, pipeline: string) {
  if (renderer === "multiplane")
    return pipeline === "Multiplane"
      ? undefined
      : "The Multiplane trial was chosen for this project; write a Multiplane shot.html instead";
  return pipeline === "Multiplane"
    ? "Multiplane is only available when the project chooses the Multiplane trial renderer"
    : undefined;
}

export type RendererSettingSupport = "supported" | "partial" | "unsupported";
export const multiplaneSettingCoverage: Array<{
  setting: string;
  support: RendererSettingSupport;
  detail: string;
  limit?: string;
}> = [
  { setting: "Length", support: "supported", detail: "Any length you choose, up to 5 minutes." },
  { setting: "Shape", support: "supported", detail: "16:9, 9:16 and 1:1." },
  { setting: "Resolution", support: "supported", detail: "1080p and 2K. Previews are 720p." },
  { setting: "Frame rate", support: "supported", detail: "30 or 60 fps." },
  {
    setting: "Preview quality",
    support: "partial",
    detail: "Previews use a faster quality setting at full preview size.",
    limit: "faster preview quality",
  },
  { setting: "Full-film quality", support: "supported", detail: "Standard final quality." },
  { setting: "Preview video", support: "supported", detail: "Silent WebM." },
  { setting: "Full-film video", support: "supported", detail: "MP4, as now." },
  {
    setting: "Sound",
    support: "partial",
    detail: "One sound file for the full film. Several sounds are mixed into one first.",
    limit: "one sound file",
  },
  {
    setting: "Video clips in scenes",
    support: "unsupported",
    detail: "Video clips can't play inside a scene yet.",
    limit: "no video clips in scenes",
  },
  {
    setting: "Layout and contrast checks",
    support: "unsupported",
    detail:
      "The automatic layout and contrast checks don't run. Every frame is still checked for consistency.",
    limit: "no layout or contrast checks",
  },
];
export const multiplaneLimits = multiplaneSettingCoverage.flatMap((item) =>
  item.limit ? [item.limit] : [],
);
