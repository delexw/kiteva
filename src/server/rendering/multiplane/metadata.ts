import { sharedRendererAudioPolicy, type RendererMetadata } from "../metadata";

export const multiplaneMetadata = {
  id: "multiplane",
  name: "Multiplane",
  pipeline: "Multiplane",
  selectionPolicy:
    "Experimental renderer explicitly chosen by the user. Preserve this selection; no HyperFrames or Remotion substitution.",
  entryPoint: "shot.html",
  visuals: {
    frameContract:
      "Shot.define with synchronous render(t). Load/decode assets in setup(); each frame is a deterministic function of t with no carried state or autonomous browser media playback.",
    reactComponents:
      "Direct React/browser interaction is not the shot contract. Adapt compatible component source into the deterministic shot without changing renderers.",
    recordedVideo:
      "Extract recorded footage into bounded frame sequences and synchronously select ready frames by composition/source time. Check decoded-frame memory cost, pointer and zoom preservation.",
  },
  audio: {
    ...sharedRendererAudioPolicy,
    integration: "single_premixed_file",
    multipleSources:
      "One soundtrack file is passed to the renderer. Several music/SFX sources must be pre-mixed before that handoff.",
    manifestField: "audioFile",
    cliArgument: "--audio",
    pageAudio:
      "No autonomous audio element playback or audio synthesis inside render(t). The existing soundtrack is muxed by the renderer.",
    preparationOrder: [
      "Generate the requested WAV using the chosen available audio capability, or inspect uploaded audio",
      "Verify decoding and duration; complete permitted trims, loops, fades and multi-source mixing",
      "Pass the workspace-relative WAV in production.audioFile to Multiplane --audio",
      "Kiteva mixes prepared narration afterward",
    ],
    guidance: `MULTIPLANE AUDIO-FIRST HANDOFF: Multiplane renders visuals and muxes an existing sound file; it does not generate music or play page audio. For a full film requiring generated music or sound, first read audioAuthoring in style-context.json and generate the actual WAV using the chosen audio capability. If audio_studio was selected, call its MCP generate_audio and any needed edit_audio/process_audio tools; do not leave the soundtrack as a plan. If local_audio was selected, create the WAV with the available local audio tools. Verify the returned file exists, decodes and has the intended duration before implementing audio-synchronized visuals. During a planning-only turn, describe this order without generating files.
For uploaded music, inspect and use the supplied audio under its existing upload guidance rather than replacing it; prepare a renderer-ready WAV where needed. Complete permitted trimming, looping, fades and any multi-source sound mix before the Multiplane handoff. Use the actual audio and cue timings to drive the visual plan. Preserve the user's music instructions and keep application-prepared narration separate: Kiteva mixes and ducks that voice after rendering.
Set production.json audioFile and the structured production response to the same workspace-relative WAV path (for example audio/audio-studio/score.wav). Kiteva passes that path to Multiplane render --audio. Do not embed a playing audio element or generate the soundtrack inside render(t). If no music or sound is requested or supplied, audioFile may be null. If requested audio cannot be created or decoded, report the actual capability limitation; do not claim the soundtrack is complete.`,
  },
  limitations: [
    "render(t) must be synchronous; video clips require ready extracted frames",
    "Music generation is separate from rendering; the WAV must exist before audio integration",
    "Decoded frame sequences require a bounded memory budget",
  ],
} satisfies RendererMetadata;
