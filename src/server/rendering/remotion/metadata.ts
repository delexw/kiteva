import { separateAudioGuidance } from "../../../shared/audio-tracks";
import { sharedRendererAudioPolicy, type RendererMetadata } from "../metadata";

export const remotionMetadata = {
  id: "remotion",
  name: "Remotion",
  pipeline: "Remotion",
  selectionPolicy:
    "Fallback only when HyperFrames has a verified required-capability limitation and production.fallbackReason records it. Not a replacement for a user-selected Multiplane renderer.",
  entryPoint: "React composition entry exporting composition id Video",
  execution: {
    cliPath: "node_modules/@remotion/cli/remotion-cli.js",
    outputArgument: null,
    commonFlags: [],
    commandFlags: { render: [] },
    stages: { preview: ["render"], full: ["render"] },
    compositionId: "Video",
  },
  visuals: {
    frameContract:
      "React composition driven by frame number; requested dimensions, fps and durationInFrames must match the job.",
    reactComponents:
      "React is native to this authoring path, but component motion must still derive from the rendered frame and available dependencies.",
    recordedVideo:
      "Integrate local recorded video using Remotion's supported frame-driven media components, preserving source timing and recorded interaction cues.",
  },
  audio: {
    ...sharedRendererAudioPolicy,
    integration: "composition_media_tracks",
    multipleSources:
      "Author local sources in React audio/video media components with explicit composition timing and levels.",
    manifestField: null,
    cliArgument: null,
    pageAudio:
      "Use supported Remotion audio components and frame-driven timing rather than arbitrary live browser audio playback.",
    preparationOrder: [
      "Create or inspect the required local audio assets",
      "Integrate audio with supported React composition media components",
      "Render composition Video; Kiteva mixes prepared narration afterward",
    ],
    guidance: `${separateAudioGuidance}\nREMOTION AUDIO HANDOFF: Integrate actual local audio assets through supported composition media components and explicit frame-driven timing/volume. The current Kiteva Remotion command does not consume production.audioFile as a separate soundtrack flag. Keep application-prepared narration separate for the post-render voice mix. A verified fallback reason is still required; audio availability alone does not authorize a renderer switch.`,
  },
  limitations: [
    "A verified fallbackReason is mandatory",
    "No network-dependent assets or external music services in the build session",
  ],
} satisfies RendererMetadata;
