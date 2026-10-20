import { rendererMetadataFor } from "../../rendering/renderer-metadata";
import { randomUUID } from "node:crypto";
import type { VideoRequest } from "../../../shared/domains/video";
import type { AudioAuthoringSelection } from "../../../shared/agents/audio-authoring";
import type { ProviderEvent } from "../../agents/agent";
import { audioStudioAvailability } from "../../agents/capabilities/audio-studio/client";
import { videoRendererOf } from "../../../shared/video-renderers";
import { safeMessage } from "../../runtime/config";
import { runJevChoice } from "../choice";

/** Music uploads bypass generation selection. Prompt-only requests retain the user's exact wording. */
export async function selectAudioAuthoring(input: {
  request: VideoRequest;
  workspace: string;
  preview: boolean;
  signal: AbortSignal;
  onEvent: (event: ProviderEvent) => void;
}): Promise<AudioAuthoringSelection> {
  input.signal.throwIfAborted();
  if (input.preview) return { source: "skipped", decisions: [] };
  const music = input.request.requirements?.music;
  if (music?.assetIds.length) return { source: "uploads", decisions: [] };
  if (!music?.instructions.trim()) return { source: "skipped", decisions: [] };
  const invocationId = randomUUID();
  try {
    let studio: Awaited<ReturnType<typeof audioStudioAvailability>>;
    try {
      studio = await audioStudioAvailability(input.workspace, input.signal);
    } catch (error) {
      input.signal.throwIfAborted();
      studio = { available: false, limitation: safeMessage(error) };
    }
    const criteria: Record<string, string> = {
      local_audio:
        "Author audio using available local code, synthesis and audio tools, then integrate it using the selected renderer. Suitable for precise timed cues, procedural or simple musical structures. Renderer playback/mixing alone does not generate music. No external audio services.",
      ...(studio.available
        ? {
            audio_studio:
              "Use local Audio Studio MCP (Stable Audio 3) to generate instrumental music, instrument stems or sound effects, then optionally edit, extend, loop, normalize and export them for the chosen renderer. Suitable for expressive generated timbres and musical tracks. MCP startup/tools verified; model weights load on first generation and can still report runtime limitations.",
          }
        : {}),
    };
    const result = await runJevChoice({
      invocationId,
      label: "Audio authoring selection",
      questionKey: "audio",
      question:
        "Choose exactly one available audio authoring capability that best satisfies the complete unchanged music request. Compare musical expressiveness, required cue precision, duration support, discovered editing operations, verified runtime availability and renderer integration constraints. Renderer metadata describes export/mixing, not music-generation readiness; inspect audioStudio.tools and its actual argument limits rather than inferring capability from a name. Respect supplied sources and explicit restrictions. Do not change the renderer, rewrite the request or prefer a tool merely because it is installed.",
      criteria,
      state: {
        musicPrompt: music.instructions,
        originalIdea: input.request.instructions,
        renderer: rendererMetadataFor(videoRendererOf(input.request)),
        duration: input.request.duration,
        speech: {
          mode: input.request.speech?.mode,
          timingInstructions:
            input.request.speech?.mode === "narration"
              ? input.request.speech.instructions
              : undefined,
          mixResponsibility: "Kiteva post-render narration mix and music ducking",
        },
        availableCapabilities: criteria,
        audioStudio: studio,
      },
      signal: input.signal,
      onEvent: input.onEvent,
    });
    return {
      source: "jev",
      selectedId: result.answer.choice as "local_audio" | "audio_studio",
      model: result.model,
      decisions: Object.keys(criteria).map((id) => ({
        id,
        use: id === result.answer.choice,
        probability: result.answer.probabilities[id],
      })),
      limitation: studio.limitation,
    };
  } catch (error) {
    input.signal.throwIfAborted();
    const limitation = safeMessage(error);
    input.onEvent({
      type: "warning",
      message:
        "JEV audio selection unavailable; the main model retains the original music request and available audio tools.",
      data: { provider: "jev", invocationId, limitation },
    });
    return { source: "unavailable", decisions: [], limitation };
  }
}
