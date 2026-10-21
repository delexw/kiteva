import { sharedRendererAudioPolicy, type RendererMetadata } from "../metadata";

export const multiplaneShotGuidance = `MULTIPLANE SHOT LOADING: Readiness has a fixed 30-second limit. For a long film with recorded footage, author independently loadable short HTML shots, normally one per feature/scene (split further when its asset budget requires it). Each shot preloads only its own required frames in setup()/ready; never import a film-wide preload manifest into every shot. Estimate both compressed bytes and decoded memory (unique frames × width × height × 4); packing files reduces request count but not decoded memory. Keep the requested resolution, frame rate and real cursor/zoom footage. Do not use async render(t), lazy loading during render, or autonomous video playback.
Declare production.shots as an ordered array of { sourceFile, duration }, for example [{"sourceFile":"shots/01.html","duration":5},{"sourceFile":"shots/02.html","duration":7}]. Durations are seconds, must align to output frames and sum exactly to the requested film duration. Set production.sourceFile to the first shot path. Each Shot.define duration equals that shot's duration; render(t) receives shot-local time. Keep the storyboard and soundtrack on the full-film timeline; explicitly map shot-local time to original source/film time for footage, captions and motion. At adjacent shot boundaries preserve the intended visual continuity or chapter transition; splitting a load is not permission to insert a new cut. Kiteva inspects, verifies and renders each shot independently, concatenates silent outputs in order without re-encoding their video, then applies production.audioFile once across the complete film and mixes prepared narration afterward. Do not restart the soundtrack or duplicate narration in each shot.
For a short single shot, omit shots and keep sourceFile as shot.html. Validate actual setup readiness for every shot and run verify before treating it as complete; split or reduce redundant asset loading when ready_timeout occurs, rather than merely repacking all frames or requesting a longer timeout.`;

export const multiplaneMetadata = {
  id: "multiplane",
  name: "Multiplane",
  pipeline: "Multiplane",
  selectionPolicy:
    "Experimental renderer explicitly chosen by the user. Preserve this selection; no HyperFrames or Remotion substitution.",
  entryPoint: "shot.html for a single shot; production.shots[0].sourceFile for a segmented film",
  visuals: {
    frameContract:
      "Shot.define with synchronous render(t). Load/decode assets in setup(); each frame is a deterministic function of t with no carried state or autonomous browser media playback.",
    reactComponents:
      "Direct React/browser interaction is not the shot contract. Adapt compatible component source into the deterministic shot without changing renderers.",
    recordedVideo:
      "Extract recorded footage into bounded per-shot frame sequences and synchronously select ready frames by composition/source time. An ordered production.shots list enables independent loading, verification and rendering, then continuous film/audio assembly. Each shot has a fixed 30-second readiness window. Check decoded-frame memory cost, pointer and zoom preservation.",
  },
  audio: {
    ...sharedRendererAudioPolicy,
    integration: "single_premixed_file",
    multipleSources:
      "One film-level soundtrack file is supplied. Several music/SFX sources must be pre-mixed before the single-shot renderer handoff or the segmented film's final mux.",
    manifestField: "audioFile",
    cliArgument: "--audio",
    pageAudio:
      "No autonomous audio element playback or audio synthesis inside render(t). The existing soundtrack is muxed by the renderer.",
    preparationOrder: [
      "Generate the requested WAV using the chosen available audio capability, or inspect uploaded audio",
      "Verify decoding and duration; complete permitted trims, loops, fades and multi-source mixing",
      "Pass the workspace-relative WAV in production.audioFile; single shots use Multiplane --audio, segmented films mux it once after joining silent shots",
      "Kiteva mixes prepared narration afterward",
    ],
    guidance: `MULTIPLANE AUDIO-FIRST HANDOFF: Multiplane renders visuals and muxes an existing sound file; it does not generate music or play page audio. For a full film requiring generated music or sound, first read audioAuthoring in style-context.json and generate the actual WAV using the chosen audio capability. If audio_studio was selected, call its MCP generate_audio and any needed edit_audio/process_audio tools; do not leave the soundtrack as a plan. If local_audio was selected, create the WAV with the available local audio tools. Verify the returned file exists, decodes and has the intended duration before implementing audio-synchronized visuals. During a planning-only turn, describe this order without generating files.
For uploaded music, inspect and use the supplied audio under its existing upload guidance rather than replacing it; prepare a renderer-ready WAV where needed. Complete permitted trimming, looping, fades and any multi-source sound mix before the Multiplane handoff. Use the actual audio and cue timings to drive the visual plan. Preserve the user's music instructions and keep application-prepared narration separate: Kiteva mixes and ducks that voice after rendering.
Set production.json audioFile and the structured production response to the same workspace-relative WAV path (for example audio/audio-studio/score.wav). For a single shot, Kiteva passes that path to Multiplane render --audio. For production.shots, Kiteva renders silent shots, joins their video, then muxes that soundtrack once across the complete film. Do not embed a playing audio element or generate the soundtrack inside render(t). If no music or sound is requested or supplied, audioFile may be null. If requested audio cannot be created or decoded, report the actual capability limitation; do not claim the soundtrack is complete.`,
  },
  limitations: [
    "render(t) must be synchronous; video clips require ready extracted frames",
    "Music generation is separate from rendering; the WAV must exist before audio integration",
    "Decoded frame sequences require a bounded memory budget",
  ],
} satisfies RendererMetadata;
