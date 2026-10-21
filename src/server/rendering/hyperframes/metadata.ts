import { sharedRendererAudioPolicy, type RendererMetadata } from "../metadata";

export const hyperframesMetadata = {
  id: "hyperframes",
  name: "HyperFrames",
  pipeline: "HyperFrames",
  selectionPolicy:
    "Default renderer. A Remotion fallback requires a verified required-capability limitation; never change a selected Multiplane route to HyperFrames.",
  entryPoint: "index.html",
  execution: {
    cliPath: "node_modules/hyperframes/bin/hyperframes.mjs",
    outputArgument: "--output",
    commonFlags: [],
    commandFlags: { check: ["--json", "--snapshots"], render: [] },
    stages: { preview: ["render"], full: ["check", "render"] },
    quality: { preview: "draft", full: "delivery" },
  },
  visuals: {
    frameContract:
      "Standalone HTML with a paused GSAP timeline registered at window.__timelines.video. Frames must derive from composition time and support direct/repeated/out-of-order seeks.",
    reactComponents:
      "Adapt or locally bundle compatible React sources into the HTML/runtime. Component installation alone does not establish deterministic animation or compatible dependencies.",
    recordedVideo:
      "Use supported timeline media timing/seeking for actual recorded footage. Verify decoded frame readiness rather than relying on wall-clock video autoplay.",
  },
  audio: {
    ...sharedRendererAudioPolicy,
    integration: "composition_media_tracks",
    multipleSources:
      "Local audio/video sources are authored as composition media tracks with their intended timing and levels.",
    manifestField: null,
    cliArgument: null,
    pageAudio:
      "Use the documented local audio media/timeline contract. Arbitrary live browser audio synthesis is not a guaranteed export source.",
    optionalAuthoringHelpers:
      "The installed upstream media-use documentation describes retrieval and local generation helpers. Those have additional credential/runtime/model requirements and are not verified available merely because HyperFrames is installed. Kiteva does not permit external music services in build sessions.",
    preparationOrder: [
      "Create or inspect actual local audio assets using the selected available capability",
      "Place audio sources on the composition timeline with verified timing and levels",
      "Render the composition; Kiteva mixes prepared narration afterward",
    ],
    guidance:
      "HYPERFRAMES AUDIO HANDOFF: Create or inspect the actual local soundtrack assets before integrating them as documented composition audio media tracks. Set timeline timing and levels explicitly and verify the exported mix; do not assume a production.audioFile value alone is consumed by the HyperFrames path. Renderer playback is not music generation. Keep application-prepared narration separate for Kiteva's post-render mix. Respect uploaded sources; an empty music request adds no soundtrack task.",
  },
  limitations: [
    "Local dependencies and assets only; no network imports or external music generation services",
    "Wall-clock animation, autonomous playback and unseekable effects do not establish deterministic exports",
  ],
} satisfies RendererMetadata;
