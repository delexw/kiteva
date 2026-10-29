import { expect, it } from "vitest";
import { applyPatch } from "rfc6902";
import { renderCacheEvidence } from "../src/server/jev/strategies/render-cache/evidence";

const snapshot = (text: string) => ({ text, hash: "fixture-hash", complete: true });
const input = () => ({
  shot: "first.html",
  unchangedRenderSettings: { fps: 60 },
  staticGraphComplete: false,
  changes: [
    {
      file: "arbitrary.json",
      before: snapshot("one\ntwo\nthree"),
      after: snapshot("one\nchanged\nthree"),
    },
  ],
  sourceContext: [{ file: "first.html", ...snapshot("<p>Opening</p>") }],
});
it("keeps complete reversible line changes without classifying names as safe", () => {
  const value = input();
  for (const file of [
    "arbitrary.json",
    "production.json",
    "prompt-inputs/request.json",
    "shots/credits.html",
  ]) {
    value.changes[0].file = file;
    const state = renderCacheEvidence(value);
    const content = state.changes[0].content;
    expect(content.encoding).toBe("json-patch-lines");
    if (!("patch" in content) || !content.patch || !content.reversePatch)
      throw Error("Missing patches");
    const lines = value.changes[0].before.text.split("\n");
    expect(applyPatch(lines, content.patch).every((error) => error === null)).toBe(true);
    expect(lines.join("\n")).toBe(value.changes[0].after.text);
    applyPatch(lines, content.reversePatch);
    expect(lines.join("\n")).toBe(value.changes[0].before.text);
    expect(state.changes[0].file).toBe(file);
  }
});
it("retains large shared code using compiler minification without truncation", () => {
  const value = input();
  const text = Array.from(
    { length: 400 },
    (_, i) => `globalThis.value${i} = ${i}; // readable shared implementation\n`,
  ).join("");
  expect(text.length).toBeGreaterThan(24000);
  value.sourceContext = [{ file: "shared.js", ...snapshot(text) }];
  const state = renderCacheEvidence(value);
  expect(state.sourceContext[0].encoding).toBe("compiler-minified");
  expect(state.sourceContext[0].text).toContain("value399=399");
  expect(state.sourceContext[0].complete).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThan(24000);
});
it("preserves binary and truncated content limitations and rejects oversized payloads", () => {
  const value = input();
  const before = { hash: "old-media", complete: false };
  const after = { hash: "new-media", complete: false };
  const state = renderCacheEvidence({ ...value, changes: [{ file: "clip.webm", before, after }] });
  expect(state.changes[0]).toMatchObject({
    beforeHash: "old-media",
    afterHash: "new-media",
    content: { encoding: "snapshots", before: { complete: false }, after: { complete: false } },
  });
  value.sourceContext[0].text = "x".repeat(30000);
  expect(() => renderCacheEvidence(value)).toThrow("no evidence omitted");
});

it("bounds diff work for many short lines without losing contents", () => {
  const value = input();
  value.changes[0].before = snapshot("a\n".repeat(1000));
  value.changes[0].after = snapshot("b\n".repeat(1000));
  expect(renderCacheEvidence(value).changes[0].content).toMatchObject({
    encoding: "snapshots",
    before: { text: value.changes[0].before.text },
    after: { text: value.changes[0].after.text },
  });
});
