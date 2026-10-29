import { prepareProjectLayout, workspacePaths } from "../src/server/runtime/workspace";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prepareVideoRefinement } from "../src/server/domains/video/refinement";
import { inheritRendererCache } from "../src/server/rendering/refinement";
import type { VideoGenerationJob } from "../src/shared/domains/video";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-refinement-checkpoint-"));
  directories.push(root);
  const workspace = path.join(root, "source");
  await mkdir(workspace);
  const source: VideoGenerationJob = {
    id: "original",
    runId: "example",
    candidateId: "chosen",
    kind: "full",
    phase: "ready",
    duration: 30,
    model: "example",
    sessionId: "saved-session",
    workspace,
    video: "renders/full.mp4",
  };
  const job: VideoGenerationJob = {
    ...source,
    id: "revision",
    phase: "queued",
    workspace: path.join(root, "revision"),
    refinementPrompt: "Enlarge captions",
  };
  return { root, source, job };
}
it("records verified source state, copies provider cache only and preserves source output", async () => {
  const { source, job } = await fixture();
  await writeFile(path.join(source.workspace, "production.json"), '{"sourceFile":"shot.html"}');
  await writeFile(path.join(source.workspace, "STORYBOARD.json"), '{"scenes":[]}');
  await writeFile(path.join(source.workspace, "shot.html"), "original source");
  await mkdir(path.join(source.workspace, "renders/multiplane-cache"), { recursive: true });
  await writeFile(
    path.join(source.workspace, "renders/multiplane-cache/entry.video"),
    "cached video",
  );
  await writeFile(path.join(source.workspace, "renders/full.mp4"), "completed output");
  await writeFile(path.join(source.workspace, "renders/qa-report.json"), "old QA");
  const checkpoint = await prepareVideoRefinement(
    source,
    job,
    "Multiplane",
    new AbortController().signal,
  );
  expect(checkpoint).toMatchObject({
    sourceJobId: source.id,
    sourceSessionId: "saved-session",
    sourcePhase: "ready",
    workspace: job.workspace,
    inheritedCacheDirectories: ["renders/multiplane-cache"],
  });
  expect(checkpoint.files.find((file) => file.path === source.video)).toMatchObject({
    available: true,
    sha256: createHash("sha256").update("completed output").digest("hex"),
    bytes: 16,
  });
  expect(
    JSON.parse(
      await readFile(path.join(job.workspace, "renders/refinement-checkpoint.json"), "utf8"),
    ),
  ).toEqual(checkpoint);
  expect(
    await readFile(path.join(job.workspace, "renders/multiplane-cache/entry.video"), "utf8"),
  ).toBe("cached video");
  await expect(readFile(path.join(job.workspace, "renders/full.mp4"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(path.join(job.workspace, "renders/qa-report.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await writeFile(path.join(job.workspace, "shot.html"), "revised source");
  expect(await readFile(path.join(source.workspace, "shot.html"), "utf8")).toBe("original source");
  expect(await readFile(path.join(source.workspace, "renders/full.mp4"), "utf8")).toBe(
    "completed output",
  );
});
it("reports absent artifacts honestly and permits cold refinements for unsupported or missing caches", async () => {
  const { source, job } = await fixture();
  const checkpoint = await prepareVideoRefinement(
    source,
    job,
    "HyperFrames",
    new AbortController().signal,
  );
  expect(checkpoint.files.every((file) => !file.available && !file.sha256)).toBe(true);
  expect(checkpoint.inheritedCacheDirectories).toEqual([]);
  expect(
    await inheritRendererCache(
      source.workspace,
      job.workspace,
      "Multiplane",
      new AbortController().signal,
    ),
  ).toEqual([]);
});
it("does not inherit cache symlinks or follow source artifacts outside the workspace", async () => {
  const { root, source, job } = await fixture();
  await mkdir(path.join(source.workspace, "renders"));
  await mkdir(path.join(root, "external"));
  await writeFile(path.join(root, "external/full.mp4"), "outside");
  await symlink(
    path.join(root, "external"),
    path.join(source.workspace, "renders/multiplane-cache"),
  );
  await symlink(
    path.join(root, "external/full.mp4"),
    path.join(source.workspace, "renders/full.mp4"),
  );
  const checkpoint = await prepareVideoRefinement(
    source,
    job,
    "Multiplane",
    new AbortController().signal,
  );
  expect(checkpoint.inheritedCacheDirectories).toEqual([]);
  expect(checkpoint.files.find((file) => file.path === source.video)?.available).toBe(false);
});

it("stops checkpoint and cache preparation before creating output when the caller aborted", async () => {
  const { source, job } = await fixture();
  const signal = AbortSignal.abort(Error("Stop project"));
  await expect(prepareVideoRefinement(source, job, "Multiplane", signal)).rejects.toThrow(
    "Stop project",
  );
  await expect(
    inheritRendererCache(source.workspace, job.workspace, "Multiplane", signal),
  ).rejects.toThrow("Stop project");
});

it.each([false, true])(
  "copies refinement references into the matching media role (versioned=%s)",
  async (versioned) => {
    const { root, source, job } = await fixture();
    if (versioned) await prepareProjectLayout(source.workspace);
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } })
      .png()
      .toBuffer();
    const file = path.join(root, "reference.png");
    await writeFile(file, bytes);
    await prepareVideoRefinement(source, job, "Multiplane", new AbortController().signal, [
      {
        id: "reference",
        name: "reference.png",
        path: file,
        kind: "image/png",
        bytes: bytes.length,
      },
    ]);
    const expected = `${workspacePaths(job.workspace).refinementImages}/reference.png`;
    const images = JSON.parse(
      await readFile(path.join(job.workspace, "REFINEMENT_IMAGES.json"), "utf8"),
    );
    expect(images[0].originalPath).toBe(expected);
    expect(await readFile(path.join(job.workspace, expected))).toEqual(bytes);
  },
);
