import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import { prepareVideoRefinement } from "../src/server/domains/video/refinement";
import path from "node:path";
import {
  multiplaneInputFingerprint,
  multiplaneCacheKey,
  restoreMultiplaneShot,
  storeMultiplaneShot,
} from "../src/server/rendering/multiplane/cache";

const directories: string[] = [];
const signal = AbortSignal.timeout(120000);
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "multiplane-cache-"));
  directories.push(workspace);
  await writeFile(path.join(workspace, "shot.html"), "<div>example</div>");
  return workspace;
}
it("fingerprints contents, new files and settings, not timestamps; generated renders do not invalidate", async () => {
  const workspace = await fixture();
  const original = await multiplaneInputFingerprint(workspace, signal);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  await writeFile(path.join(workspace, "shot.html"), "<div>example</div>");
  expect(await multiplaneInputFingerprint(workspace, signal)).toBe(original);
  const key = multiplaneCacheKey(original!, { fps: 30 });
  expect(multiplaneCacheKey(original!, { fps: 60 })).not.toBe(key);
  await writeFile(path.join(workspace, "dynamic-asset.txt"), "one");
  const withAsset = await multiplaneInputFingerprint(workspace, signal);
  expect(withAsset).not.toBe(original);
  await writeFile(path.join(workspace, "dynamic-asset.txt"), "two");
  expect(await multiplaneInputFingerprint(workspace, signal)).not.toBe(withAsset);
});
it("restores exact bytes and refuses corrupt, missing and interrupted cache records", async () => {
  const workspace = await fixture();
  const fingerprint = (await multiplaneInputFingerprint(workspace, signal))!;
  const key = multiplaneCacheKey(fingerprint, { kind: "full" });
  const output = path.join(workspace, "renders/shot.mp4");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(output));
  await writeFile(output, "validated-video");
  const input = { workspace, fingerprint, key, output, signal };
  expect(await restoreMultiplaneShot(input)).toBe(false);
  await storeMultiplaneShot(input);
  expect(await multiplaneInputFingerprint(workspace, signal)).toBe(fingerprint);
  await rm(output);
  expect(await restoreMultiplaneShot(input)).toBe(true);
  expect(await readFile(output, "utf8")).toBe("validated-video");
  await writeFile(path.join(workspace, "renders/multiplane-cache", `${key}.video`), "corrupt");
  expect(await restoreMultiplaneShot(input)).toBe(false);
  await rm(path.join(workspace, "renders/multiplane-cache", `${key}.json`));
  expect(await restoreMultiplaneShot(input)).toBe(false);
});
it("does not publish when inputs change while rendering", async () => {
  const workspace = await fixture();
  const fingerprint = (await multiplaneInputFingerprint(workspace, signal))!;
  const output = path.join(workspace, "output.mp4");
  await writeFile(output, "render-in-flight");
  const input = {
    workspace,
    fingerprint,
    output,
    key: multiplaneCacheKey(fingerprint, {}),
    signal,
  };
  await storeMultiplaneShot(input);
  expect(await restoreMultiplaneShot(input)).toBe(false);
});
it("disables reuse for symlinked inputs and propagates cancellation", async () => {
  const workspace = await fixture();
  await symlink(path.join(workspace, "shot.html"), path.join(workspace, "alias.html"));
  expect(await multiplaneInputFingerprint(workspace, signal)).toBeUndefined();
  await expect(multiplaneInputFingerprint(workspace, AbortSignal.abort())).rejects.toThrow();
});

it("inherits a valid cache across fine-tune workspaces but refuses changed inputs and corrupt bytes", async () => {
  const workspace = await fixture();
  const destination = await fixture();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.join(workspace, "renders"));
  const output = path.join(workspace, "renders/shot.mp4");
  await writeFile(output, "validated-shot");
  const fingerprint = (await multiplaneInputFingerprint(workspace, signal))!;
  const key = multiplaneCacheKey(fingerprint, { kind: "full" });
  await storeMultiplaneShot({ workspace, fingerprint, key, output, signal });
  const source = {
    id: "source",
    runId: "example",
    candidateId: "example",
    kind: "full" as const,
    phase: "ready" as const,
    model: "example",
    sessionId: "saved-session",
    workspace,
    duration: 3,
  };
  await prepareVideoRefinement(
    source,
    {
      ...source,
      id: "revision",
      workspace: destination,
      refinementPrompt: "Refine existing video",
    },
    "Multiplane",
  );
  expect(await multiplaneInputFingerprint(destination, signal)).toBe(fingerprint);
  const inherited = {
    workspace: destination,
    fingerprint,
    key,
    output: path.join(destination, "renders/shot.mp4"),
    signal,
  };
  expect(await restoreMultiplaneShot(inherited)).toBe(true);
  expect(await readFile(inherited.output, "utf8")).toBe("validated-shot");
  await writeFile(path.join(destination, "shot.html"), "changed source");
  expect(await restoreMultiplaneShot(inherited)).toBe(false);
  await writeFile(path.join(destination, "shot.html"), "<div>example</div>");
  await writeFile(
    path.join(destination, "renders/multiplane-cache", `${key}.video`),
    "corrupt bytes",
  );
  expect(await restoreMultiplaneShot(inherited)).toBe(false);
});

async function twoShots() {
  const workspace = await fixture();
  await writeFile(path.join(workspace, "second.html"), "<div>second</div>");
  const shotSources = ["shot.html", "second.html"];
  const first = { sourceFile: shotSources[0], shotSources };
  const second = { sourceFile: shotSources[1], shotSources };
  const fingerprint = (scope = first) => multiplaneInputFingerprint(workspace, signal, scope);
  return { workspace, first, second, fingerprint };
}

it("invalidates only the edited shot, and content restoration recovers its key", async () => {
  const { workspace, first, second, fingerprint } = await twoShots();
  const before = [await fingerprint(first), await fingerprint(second)];
  expect(before.every(Boolean)).toBe(true);
  await writeFile(path.join(workspace, "shot.html"), "<div>changed first</div>");
  expect(await fingerprint(first)).not.toBe(before[0]);
  expect(await fingerprint(second)).toBe(before[1]);
  await writeFile(path.join(workspace, "shot.html"), "<div>example</div>");
  expect(await fingerprint(first)).toBe(before[0]);
});

it("traces shared CSS imports, fonts, images and static modules to their consumers", async () => {
  const { workspace, first, second, fingerprint } = await twoShots();
  await writeFile(
    path.join(workspace, "shot.html"),
    '<link rel="stylesheet" href="theme.css"><script type="module" src="entry.js"></script>',
  );
  await writeFile(path.join(workspace, "second.html"), '<link rel="stylesheet" href="theme.css">');
  await writeFile(
    path.join(workspace, "theme.css"),
    '@import "font.css"; body {background:url("picture.png")}',
  );
  await writeFile(
    path.join(workspace, "font.css"),
    '@font-face {font-family:Example;src:url("font.woff2")}',
  );
  await writeFile(path.join(workspace, "picture.png"), "image-a");
  await writeFile(path.join(workspace, "font.woff2"), "font-a");
  await writeFile(path.join(workspace, "entry.js"), 'import "./module.js";');
  await writeFile(path.join(workspace, "module.js"), 'export const color = "red";');
  for (const file of ["font.css", "picture.png", "font.woff2", "module.js"]) {
    const before = [await fingerprint(first), await fingerprint(second)];
    expect(before.every(Boolean)).toBe(true);
    await writeFile(
      path.join(workspace, file),
      file === "font.css"
        ? '@font-face {font-family:Example;src:url("font.woff2")} body{color:red}'
        : file === "module.js"
          ? 'export const color = "blue";'
          : "changed",
    );
    expect(await fingerprint(first)).not.toBe(before[0]);
    if (file === "module.js") expect(await fingerprint(second)).toBe(before[1]);
    else expect(await fingerprint(second)).not.toBe(before[1]);
  }
});

it("tracks encoded cross-shot references and cyclic static imports", async () => {
  const { workspace, fingerprint } = await twoShots();
  await writeFile(
    path.join(workspace, "shot.html"),
    '<a href="%73econd.html">linked shot</a><script type="module" src="a.js"></script>',
  );
  await writeFile(path.join(workspace, "a.js"), 'import "./b.js";');
  await writeFile(path.join(workspace, "b.js"), 'import "./a.js";');
  const before = await fingerprint();
  expect(before).toBeTruthy();
  await writeFile(path.join(workspace, "second.html"), "changed");
  expect(await fingerprint()).not.toBe(before);
});

it.each([
  '<script>fetch("shot-" + 1 + ".html")</script>',
  '<script>const loader = fetch; loader("other.html")</script>',
  '<script>window["f" + "etch"]("other.html")</script>',
  '<script type="module">import("./other.js")</script>',
  '<script>const el = document.createElement("img")</script>',
  "<script>broken syntax{</script>",
  '<iframe src="second.html"></iframe>',
  '<script src="https://example.com/code.js"></script>',
  '<link rel="stylesheet" href="https://example.com/style.css">',
  '<style>body{background:url("missing.png")}</style>',
  '<style>body{background:image-set("a.png" 1x)}</style>',
])("refuses cache reuse when dependencies are incomplete: %s", async (html) => {
  const { workspace, fingerprint } = await twoShots();
  await writeFile(path.join(workspace, "shot.html"), html);
  expect(await fingerprint()).toBeUndefined();
});

it("does not publish a scoped cache after an input changes during rendering", async () => {
  const { workspace, first, fingerprint } = await twoShots();
  const before = (await fingerprint())!;
  const { mkdir } = await import("node:fs/promises");
  const output = path.join(workspace, "renders/shot.webm");
  await mkdir(path.dirname(output));
  await writeFile(output, "validated");
  await writeFile(path.join(workspace, "shot.html"), "changed while rendering");
  const input = {
    workspace,
    fingerprint: before,
    output,
    key: multiplaneCacheKey(before, {}),
    signal,
    scope: first,
  };
  await storeMultiplaneShot(input);
  expect(await restoreMultiplaneShot(input)).toBe(false);
});

it("tracks SVG presentation URLs and single-shot audio", async () => {
  const { workspace, first, fingerprint } = await twoShots();
  await writeFile(
    path.join(workspace, "shot.html"),
    '<svg><rect fill="url(paint.svg#paint)"/></svg>',
  );
  await writeFile(path.join(workspace, "paint.svg"), '<svg><linearGradient id="paint"/></svg>');
  await writeFile(path.join(workspace, "audio.wav"), "audio-a");
  const scoped = { ...first, additionalFiles: ["audio.wav"] };
  const before = await fingerprint(scoped);
  expect(before).toBeTruthy();
  await writeFile(path.join(workspace, "paint.svg"), '<svg><radialGradient id="paint"/></svg>');
  expect(await fingerprint(scoped)).not.toBe(before);
  const withPaint = await fingerprint(scoped);
  await writeFile(path.join(workspace, "audio.wav"), "audio-b");
  expect(await fingerprint(scoped)).not.toBe(withPaint);
});

it("invalidates conservatively for added/deleted paths and environment changes", async () => {
  const { workspace, fingerprint } = await twoShots();
  const before = await fingerprint();
  await writeFile(path.join(workspace, "new-file.txt"), "new input");
  const added = await fingerprint();
  expect(added).not.toBe(before);
  await writeFile(path.join(workspace, "new-file.txt"), "unused content edit");
  expect(await fingerprint()).toBe(added);
  await rm(path.join(workspace, "new-file.txt"));
  expect(await fingerprint()).toBe(before);
  const previous = process.env.MULTIPLANE_CACHE_TEST_SETTING;
  try {
    process.env.MULTIPLANE_CACHE_TEST_SETTING = "changed";
    expect(await fingerprint()).not.toBe(before);
  } finally {
    if (previous === undefined) delete process.env.MULTIPLANE_CACHE_TEST_SETTING;
    else process.env.MULTIPLANE_CACHE_TEST_SETTING = previous;
  }
});
