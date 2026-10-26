import { mkdtemp, readdir, realpath, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PassThrough, Readable } from "node:stream";
import { ZipFile } from "yazl";
import { z } from "zod";
import type { GenerationJob } from "../../shared/contracts";
import { StoryboardSchema } from "../../shared/agents/schemas/storyboard";
import { appRoot } from "../runtime/config";
import { command } from "../runtime/process";
import { probeVideo } from "../rendering/video-probe";
import { editableTimeline, storyboardSubtitles, type ExportMedia } from "./timeline";

const excluded = new Set([
  "node_modules",
  "prompt-inputs",
  "style-context.json",
  "input.json",
  "EXECUTABLE_PROMPT.md",
  "PLAN_PROMPT.md",
  "reference-screenshots.json",
]);
export async function projectFiles(workspace: string) {
  const files: { path: string; name: string }[] = [];
  async function collect(folder: string) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || excluded.has(entry.name) || entry.isSymbolicLink())
        continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile())
        files.push({ path: file, name: path.relative(workspace, file).split(path.sep).join("/") });
    }
  }
  try {
    await collect(workspace);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return files;
}
export async function projectAvailable(workspace: string) {
  return (await projectFiles(workspace)).length > 0;
}
async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}
export async function createProjectBundle(job: GenerationJob, signal: AbortSignal) {
  signal.throwIfAborted();
  const files = await projectFiles(job.workspace);
  if (!(await projectAvailable(job.workspace)))
    throw Error("No editable project files are available yet");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "editable-project-"));
  const zip = new ZipFile();
  const output = new PassThrough();
  output.on("error", () => {});
  zip.on("error", (error: Error) => output.destroy(error));
  zip.outputStream.on("error", (error: Error) => output.destroy(error));
  const warnings: string[] = [];
  const abort = () => {
    if (zip.outputStream instanceof Readable)
      zip.outputStream.destroy(
        signal.reason instanceof Error ? signal.reason : Error("Project export cancelled"),
      );
    output.destroy(
      signal.reason instanceof Error ? signal.reason : Error("Project export cancelled"),
    );
  };
  signal.addEventListener("abort", abort, { once: true });
  const cleanup = () => {
    signal.removeEventListener("abort", abort);
    return rm(temporary, { recursive: true, force: true });
  };
  const finish = () => {
    signal.throwIfAborted();
    zip.outputStream.pipe(output);
    zip.end();
    output.once("close", () => {
      void cleanup();
    });
    return output;
  };
  try {
    signal.throwIfAborted();
    for (const file of files)
      zip.addFile(file.path, job.outputType === "page" ? file.name : `source/${file.name}`, {
        compress: false,
      });
    if (job.outputType === "page") return finish();
    if (!files.some((file) => file.name === "package.json")) {
      // Preserve the exact installed dependency declarations for standalone source editing.
      zip.addFile(path.join(appRoot, "package.json"), "source/package.json");
      if (!files.some((file) => file.name === "package-lock.json"))
        zip.addFile(path.join(appRoot, "package-lock.json"), "source/package-lock.json");
    }
    let production = job.production;
    if (!production) {
      const parsed = await readJson(path.join(job.workspace, "production.json"));
      const { ProductionSchema } = await import("../../shared/agents/schemas/video");
      const result = ProductionSchema.safeParse(parsed);
      if (result.success) production = result.data;
    }
    const parsed = await readJson(path.join(job.workspace, "STORYBOARD.json"));
    const result = StoryboardSchema.safeParse(parsed);
    const storyboard = result.success ? result.data : undefined;
    let fps: number = production?.fps ?? 30;
    const audio: ExportMedia[] = [];
    let video: ExportMedia | undefined;
    let referenceMix: ExportMedia | undefined;
    const safeMedia = async (relative: string) => {
      const root = await realpath(job.workspace);
      const file = await realpath(path.resolve(root, relative));
      if (
        !file.startsWith(`${root}${path.sep}`) ||
        file.includes(`${path.sep}node_modules${path.sep}`)
      )
        throw Error("Media outside project");
      return file;
    };
    const videoPath = job.video || "renders/full.mp4";
    if (videoPath) {
      try {
        const file = await safeMedia(videoPath);
        const probe = await probeVideo(file, signal);
        const duration = z.coerce.number().positive().parse(probe.format.duration);
        const rate = probe.streams.find((stream) => stream.codec_type === "video")?.avg_frame_rate;
        if (rate) {
          const [numerator, denominator] = rate.split("/").map(Number);
          const measuredFps = numerator / denominator;
          if (Number.isFinite(measuredFps) && measuredFps > 0) fps = measuredFps;
        }
        const silent = path.join(temporary, "visuals.mp4");
        await command(
          "ffmpeg",
          ["-y", "-i", file, "-map", "0:v:0", "-an", "-c:v", "copy", silent],
          job.workspace,
          signal,
        );
        zip.addFile(silent, "media/visuals.mp4", { compress: false });
        video = { path: "media/visuals.mp4", name: "Rendered video", duration };
        // Also preserve the exact delivered mix as an optional reference, never double it with stems.
        if (probe.streams.some((stream) => stream.codec_type === "audio")) {
          const mix = path.join(temporary, "reference-mix.wav");
          await command(
            "ffmpeg",
            ["-y", "-i", file, "-vn", "-c:a", "pcm_s16le", mix],
            job.workspace,
            signal,
          );
          zip.addFile(mix, "media/reference-mix.wav", { compress: false });
          referenceMix = { path: "media/reference-mix.wav", name: "Rendered audio mix", duration };
        }
      } catch (error) {
        warnings.push(
          `Rendered video unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const entry of [
      { name: "Music", file: production?.audioFile },
      { name: "Narration", file: job.speechTrack?.file },
    ]) {
      if (!entry.file) continue;
      try {
        const file = await safeMedia(entry.file);
        const probe = await probeVideo(file, signal);
        const duration = z.coerce.number().positive().parse(probe.format.duration);
        const name = `media/${entry.name.toLowerCase()}${path.extname(file)}`;
        zip.addFile(file, name, { compress: false });
        audio.push({
          path: name,
          name: entry.name,
          duration: Math.min(duration, video?.duration ?? duration),
        });
      } catch (error) {
        warnings.push(
          `${entry.name} unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (referenceMix && !audio.some((media) => media.name === "Music")) {
      // The rendered mix preserves renderer-authored audio when no separate music stem exists.
      audio.splice(0, audio.length, referenceMix);
    }
    {
      zip.addBuffer(
        Buffer.from(
          editableTimeline({
            title: storyboard?.title ?? "Editable video",
            fps,
            video,
            audio,
            storyboard,
          }),
        ),
        "timeline.otio",
      );
      zip.addBuffer(Buffer.from(storyboardSubtitles(storyboard)), "captions.srt");
    }
    zip.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            version: 1,
            phase: job.phase,
            renderer: production?.pipeline ?? null,
            sourceFile: production?.sourceFile ?? null,
            videoAvailable: Boolean(video),
            warnings,
          },
          null,
          2,
        ),
      ),
      "export.json",
    );
    zip.addBuffer(
      Buffer.from(
        `Editable project\n\nUnzip the complete folder before opening timeline.otio in an OTIO-compatible editor. Media paths are relative. Import captions.srt separately if your editor supports subtitles.\n\nRendered scenes are clips referencing ranges of media/visuals.mp4. Graphics and any already-burned captions inside those clips are flattened; editable original renderer sources, fonts and assets are in source/. Editing SRT does not erase burned text.\n\nAudio stems start at zero to match Kiteva's current narration mix. When no separate music stem exists, the timeline uses the rendered reference mix instead; available narration files remain in media/ for manual editing. Music processing and ducking are not reconstructed as editor effects. media/reference-mix.wav, when present, is the exact rendered mix for comparison; use it instead of, never together with, the separate stems.\n\nRenderer: ${production?.pipeline ?? "not yet identified"}. Entry: source/${production?.sourceFile ?? "see source files"}. HyperFrames uses its CLI/Studio; Multiplane uses its shot HTML and CLI; Remotion uses its React entry and Studio. Sources may require the dependencies in source/package.json. No renderer conversion or graphic-layer conversion is implied.\n\nThis is a snapshot of available files, including failed or incomplete builds. Missing outputs remain missing; an empty video track means no usable rendered video exists yet.\n\nWarnings:\n${warnings.join("\n") || "None"}\n`,
      ),
      "README.txt",
    );
    return finish();
  } catch (error) {
    output.destroy();
    await cleanup();
    throw error;
  }
}
