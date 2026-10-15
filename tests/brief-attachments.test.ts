import { beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Asset } from "../src/shared/contracts";
vi.mock("../src/server/runtime/process", () => ({ isolatedCommand: vi.fn() }));
import { isolatedCommand } from "../src/server/runtime/process";
import {
  prepareBriefAttachments,
  briefAttachmentInstructions,
} from "../src/server/requests/brief-attachments";
import { describeAsset } from "../src/server/requests/inputs";
const metadata = {
  streams: [{ codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "44100", channels: 1 }],
  format: { duration: "0.250000" },
};
beforeEach(() => vi.clearAllMocks());
it("retains full document text beyond the input excerpt and inventories every attachment", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "attachment-review-"));
  try {
    await mkdir(path.join(workspace, "assets"));
    const text = "Product context.\n".repeat(2000) + "Exact closing copy: A clearer result.";
    const assets: Asset[] = [
      {
        id: "document",
        name: "document.txt",
        originalName: "Product notes.txt",
        kind: "text/plain",
        bytes: text.length,
        path: path.join(workspace, "assets/document.txt"),
      },
      {
        id: "image",
        name: "image.png",
        originalName: "Product view.png",
        kind: "image/png",
        bytes: 100,
        path: path.join(workspace, "assets/image.png"),
      },
    ];
    await writeFile(assets[0].path, text);
    await writeFile(
      assets[1].path,
      await sharp({ create: { width: 16, height: 16, channels: 3, background: "#123456" } })
        .png()
        .toBuffer(),
    );
    expect(await describeAsset(assets[0])).not.toContain("A clearer result");
    const result = await prepareBriefAttachments(
      workspace,
      assets,
      [{ originalPath: "assets/image.png", inspectionPath: "assets/image.png" }],
      new AbortController().signal,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      displayName: "Product notes.txt",
      status: "text_extracted",
      textPath: "brief-attachments/document.txt.txt",
      characters: text.length,
    });
    expect(await readFile(path.join(workspace, "brief-attachments/document.txt.txt"), "utf8")).toBe(
      text,
    );
    expect(result[1]).toMatchObject({
      inspectionPath: "assets/image.png",
      status: "image_available",
    });
    expect(briefAttachmentInstructions).toContain("review EVERY listed attachment");
    expect(briefAttachmentInstructions).toContain("untrusted source material");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
it("makes music available from verified metadata without requiring speech transcription", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "attachment-music-"));
  try {
    await mkdir(path.join(workspace, "assets"));
    const original = Buffer.from("An uploaded track");
    const asset: Asset = {
      id: "track",
      name: "track.wav",
      originalName: "Background music.wav",
      kind: "audio/wav",
      bytes: original.length,
      path: path.join(workspace, "assets/track.wav"),
    };
    await writeFile(asset.path, original);
    vi.mocked(isolatedCommand).mockResolvedValue(JSON.stringify(metadata));
    const result = await prepareBriefAttachments(
      workspace,
      [asset],
      [],
      new AbortController().signal,
    );
    expect(result[0]).toMatchObject({
      kind: "audio",
      status: "metadata_only",
      metadata,
      frames: [],
    });
    expect(await readFile(asset.path)).toEqual(original);
    expect(isolatedCommand).toHaveBeenCalledTimes(1);
    expect(vi.mocked(isolatedCommand).mock.calls[0][1]).toContain("file,pipe");
    expect(vi.mocked(isolatedCommand).mock.calls[0][1]).toContain("mov,matroska,webm,wav,mp3");
    expect(briefAttachmentInstructions).toContain(
      "needs no transcript just to use as a soundtrack",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
it("samples timestamped video frames for the brief model and preserves the original", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "attachment-video-"));
  try {
    await mkdir(path.join(workspace, "assets"));
    const asset: Asset = {
      id: "clip",
      name: "clip.mp4",
      originalName: "Product demo.mp4",
      kind: "video/mp4",
      bytes: 4,
      path: path.join(workspace, "assets/clip.mp4"),
    };
    await writeFile(asset.path, "clip");
    const frame = await sharp({
      create: { width: 100, height: 50, channels: 3, background: "#abcdef" },
    })
      .png()
      .toBuffer();
    vi.mocked(isolatedCommand).mockImplementation(async (executable, args) => {
      if (executable === "ffprobe")
        return JSON.stringify({
          streams: [{ codec_type: "video", codec_name: "h264", width: 100, height: 50 }],
          format: { duration: "10" },
        });
      await writeFile(args.at(-1)!, frame);
      return "";
    });
    const result = await prepareBriefAttachments(
      workspace,
      [asset],
      [],
      new AbortController().signal,
    );
    expect(result[0]).toMatchObject({
      status: "video_frames_sampled",
      frames: [{ time: 0 }, { time: 5 }, { time: 9 }],
    });
    expect(await readFile(asset.path, "utf8")).toBe("clip");
    expect(isolatedCommand).toHaveBeenCalledTimes(4);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
it("records inspection limits without blocking other assets and propagates cancellation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "attachment-unavailable-"));
  try {
    const asset: Asset = {
      id: "track",
      name: "track.mp3",
      originalName: "Track.mp3",
      kind: "audio/mpeg",
      bytes: 1,
      path: path.join(workspace, "assets/track.mp3"),
    };
    vi.mocked(isolatedCommand).mockRejectedValue(Error("Codec unavailable"));
    const result = await prepareBriefAttachments(
      workspace,
      [asset],
      [],
      new AbortController().signal,
    );
    expect(result[0]).toMatchObject({ status: "not_inspected", originalPath: "assets/track.mp3" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareBriefAttachments(workspace, [asset], [], controller.signal),
    ).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("retains verified video metadata and available frames when a later sample cannot be decoded", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "attachment-partial-video-"));
  try {
    const asset: Asset = {
      id: "clip",
      name: "clip.mp4",
      originalName: "Clip.mp4",
      kind: "video/mp4",
      bytes: 4,
      path: path.join(workspace, "assets/clip.mp4"),
    };
    const frame = await sharp({
      create: { width: 100, height: 50, channels: 3, background: "#abcdef" },
    })
      .png()
      .toBuffer();
    let count = 0;
    vi.mocked(isolatedCommand).mockImplementation(async (executable, args) => {
      if (executable === "ffprobe")
        return JSON.stringify({
          streams: [{ codec_type: "video", width: 100, height: 50 }],
          format: { duration: "1" },
        });
      if (count++ > 0) throw Error("No later frame");
      await writeFile(args.at(-1)!, frame);
      return "";
    });
    const result = await prepareBriefAttachments(
      workspace,
      [asset],
      [],
      new AbortController().signal,
    );
    expect(result[0]).toMatchObject({
      status: "video_frames_sampled",
      metadata: { format: { duration: "1" } },
      frames: [{ time: 0 }],
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
