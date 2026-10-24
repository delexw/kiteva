import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { VideoRequestSchema, type VideoRequest } from "../../shared/domains/video";
import { BriefSchema } from "../../shared/agents/schemas/video";
import { SpeechSettingsSchema, SpeechTrackSchema, type SpeechTrack } from "../../shared/speech";
import { command } from "../runtime/process";
import { prepareSpeech } from "./speech";
import {
  NarrationConfigSchema,
  NarrationStateSchema,
  narrationConfigPath,
  narrationStatePath,
  type NarrationConfig,
  type NarrationState,
  CreateNarrationSchema,
  EditNarrationSchema,
  type NarrationCueSchema,
} from "./narration-types";

type Cue = z.infer<typeof NarrationCueSchema>;

async function workspaceFile(workspace: string, file: string) {
  const root = await realpath(workspace);
  const resolved = await realpath(path.resolve(root, file));
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw Error("Narration files must stay inside the job workspace");
  return resolved;
}

async function saveJson(workspace: string, file: string, value: unknown) {
  await mkdir(path.dirname(path.join(workspace, file)), { recursive: true });
  await workspaceFile(workspace, path.dirname(file));
  const temporary = path.join(workspace, `${file}.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
  await rename(temporary, path.join(workspace, file));
}

export async function readNarrationState(workspace: string): Promise<NarrationState | undefined> {
  try {
    const file = await workspaceFile(workspace, narrationStatePath);
    return NarrationStateSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

/** Register configured voices without generating speech; the model creates the first track. */
export async function prepareNarrationCapability(
  workspace: string,
  request: VideoRequest,
  duration: number,
) {
  const profiles: NarrationConfig["profiles"] = {};
  if (request.scriptItems !== undefined) {
    for (const item of request.scriptItems)
      if (item.speech.mode === "narration")
        profiles[item.id] = SpeechSettingsSchema.parse(item.speech);
  } else if (request.speech?.mode === "narration") profiles.default = request.speech;
  if (!Object.keys(profiles).length) {
    await rm(path.join(workspace, narrationConfigPath), { force: true });
    await rm(path.join(workspace, narrationStatePath), { force: true });
    return false;
  }
  const config = NarrationConfigSchema.parse({ duration, profiles });
  let unchanged = false;
  try {
    const file = await workspaceFile(workspace, narrationConfigPath);
    unchanged =
      JSON.stringify(NarrationConfigSchema.parse(JSON.parse(await readFile(file, "utf8")))) ===
      JSON.stringify(config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await saveJson(workspace, narrationConfigPath, config);
  if (!unchanged) await rm(path.join(workspace, narrationStatePath), { force: true });
  return true;
}

/** Read the model-updated track at the orchestration boundary before every render. */
export async function currentNarrationTrack(workspace: string, fallback?: SpeechTrack) {
  const state = await readNarrationState(workspace);
  if (!state) return fallback;
  await workspaceFile(workspace, state.track.file);
  return state.track;
}

export function narrationService(
  workspace: string,
  config: NarrationConfig,
  dependencies = { prepare: prepareSpeech, run: command },
) {
  const profile = (cue: Cue) => {
    const key =
      cue.scriptItemId ??
      (config.profiles.default
        ? "default"
        : Object.keys(config.profiles).length === 1
          ? Object.keys(config.profiles)[0]
          : "");
    const settings = config.profiles[key];
    if (!settings || settings.mode !== "narration")
      throw Error("Choose a configured narration scriptItemId");
    return settings;
  };
  async function synthesize(cue: Cue, signal: AbortSignal) {
    const settings = profile(cue);
    const source = await workspaceFile(workspace, "style-context.json");
    const context = z
      .object({ request: VideoRequestSchema, brief: BriefSchema })
      .parse(JSON.parse(await readFile(source, "utf8")));
    const track = await dependencies.prepare({
      workspace,
      duration: config.duration,
      request: {
        ...context.request,
        scriptItems: undefined,
        speech: { ...settings, source: "provided", text: cue.text, startSeconds: 0 },
        lyrics: { mode: "off" },
      },
      brief: context.brief,
      signal,
      onEvent: () => {},
      emit: () => {},
    });
    if (!track) throw Error("Narration synthesis produced no audio");
    await workspaceFile(workspace, track.file);
    return {
      ...cue,
      file: track.file,
      sourceStartSeconds: 0,
      durationSeconds: track.durationSeconds,
    };
  }
  function checkRevision(current: NarrationState | undefined, expected?: string) {
    if (current?.revision !== expected)
      throw Error(
        `Narration revision changed. Read ${narrationStatePath} and retry with its revision.`,
      );
  }
  async function commit(
    segments: NarrationState["segments"],
    signal: AbortSignal,
    expected?: string,
  ) {
    segments.sort((a, b) => a.startSeconds - b.startSeconds);
    let end = 0;
    const ids = new Set<string>();
    for (const segment of segments) {
      if (ids.has(segment.id)) throw Error("Narration cue IDs must be unique");
      ids.add(segment.id);
      if (segment.startSeconds < end - 0.001)
        throw Error(`Narration cue ${segment.id} overlaps the preceding measured speech`);
      end = segment.startSeconds + segment.durationSeconds;
      if (end > config.duration)
        throw Error(
          `Narration cue ${segment.id} ends at ${end.toFixed(3)}s, beyond the ${config.duration}s film. Revise text or placement; speech was not truncated.`,
        );
    }
    const files = await Promise.all(
      segments.map((segment) => workspaceFile(workspace, segment.file)),
    );
    const revision = randomUUID();
    const directory = path.join(workspace, "audio/narration");
    await mkdir(directory, { recursive: true });
    await workspaceFile(workspace, "audio/narration");
    const file = `audio/narration/${revision}.wav`;
    const filters = segments.map(
      (segment, index) =>
        `[${index}:a]atrim=start=${segment.sourceStartSeconds}:duration=${segment.durationSeconds},asetpts=PTS-STARTPTS,adelay=${segment.startSeconds * 1000}:all=1[v${index}]`,
    );
    filters.push(
      `${segments.map((_, index) => `[v${index}]`).join("")}amix=inputs=${segments.length}:duration=longest:normalize=0[out]`,
    );
    await dependencies.run(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        ...files.flatMap((file) => ["-i", file]),
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[out]",
        "-ar",
        "48000",
        "-ac",
        "2",
        path.join(workspace, file),
      ],
      workspace,
      signal,
    );
    signal.throwIfAborted();
    checkRevision(await readNarrationState(workspace), expected);
    const state = NarrationStateSchema.parse({
      revision,
      segments,
      track: SpeechTrackSchema.parse({
        file,
        durationSeconds: end,
        source: "narration",
        cues: segments.map((segment) => ({
          text: segment.text,
          startSeconds: segment.startSeconds,
          endSeconds: segment.startSeconds + segment.durationSeconds,
          scriptItemId: segment.scriptItemId,
          showLyrics: segment.showLyrics,
        })),
      }),
    });
    await saveJson(workspace, narrationStatePath, state);
    return state;
  }
  return {
    async create(value: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      const input = CreateNarrationSchema.parse(value);
      checkRevision(await readNarrationState(workspace), input.expectedRevision);
      const segments = [];
      for (const cue of input.cues) {
        signal.throwIfAborted();
        segments.push(await synthesize(cue, signal));
      }
      return commit(segments, signal, input.expectedRevision);
    },
    async edit(value: unknown, signal: AbortSignal) {
      signal.throwIfAborted();
      const input = EditNarrationSchema.parse(value);
      const state = await readNarrationState(workspace);
      checkRevision(state, input.expectedRevision);
      if (!state) throw Error("Create narration before editing it");
      const segments = structuredClone(state.segments);
      const ids = new Set<string>();
      for (const edit of input.edits) {
        if (ids.has(edit.id)) throw Error("Edit each narration cue once per call");
        ids.add(edit.id);
        const index = segments.findIndex((cue) => cue.id === edit.id);
        if (index < 0) throw Error(`Unknown narration cue: ${edit.id}`);
        const updated = { ...segments[index], ...edit };
        segments[index] =
          edit.text !== undefined && edit.text !== segments[index].text
            ? await synthesize(updated, signal)
            : updated;
      }
      return commit(segments, signal, input.expectedRevision);
    },
  };
}
