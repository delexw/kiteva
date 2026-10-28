import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import {
  buildRenderCacheBrief,
  renderCacheBriefInputBudget,
} from "../src/server/jev/strategies/render-cache/brief";

const roots: string[] = [];
afterEach(async () => {
  vi.mocked(agentTurn).mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const brief = {
  summary: "Only metadata changed; the shared source is unchanged.",
  changedFiles: ["production.json"],
  renderImpact: "No effect on this shot's pixels, timing or media.",
  limitations: [],
  uncertain: false,
};
async function input() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "cache-brief-"));
  roots.push(workspace);
  return {
    workspace,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
    state: {
      shot: "shot.html",
      staticGraphComplete: false,
      changes: [{ file: "production.json", before: { hash: "old" }, after: { hash: "new" } }],
      sourceContext: [{ file: "shared.js", text: "x".repeat(50000) }],
    },
  };
}
it("asks Haiku for a bounded factual brief and retains the raw evidence for audit", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockImplementation(async (turn) => {
    turn.onEvent({ type: "usage", message: "Summary usage", data: { provider: "claude" } });
    return { value: brief };
  });
  expect(await buildRenderCacheBrief(options)).toEqual(brief);
  const turn = vi.mocked(agentTurn).mock.calls[0][0];
  expect(turn).toMatchObject({
    provider: "claude",
    model: "claude-haiku-5-5",
    readOnly: true,
    textOnly: true,
    workspace: options.workspace,
    signal: options.signal,
  });
  expect(turn.prompt).not.toContain("x".repeat(50000));
  expect(Buffer.byteLength(turn.prompt)).toBeLessThanOrEqual(renderCacheBriefInputBudget);
  expect(turn.prompt).toContain("incomplete dependency evidence");
  expect(options.onEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "usage",
      data: { provider: "claude", purpose: "Render cache change summary" },
    }),
  );
  const folder = path.join(options.workspace, "renders/cache-reviews");
  const files = await readdir(folder);
  expect(files).toHaveLength(1);
  expect(JSON.parse(await readFile(path.join(folder, files[0]), "utf8"))).toEqual({
    evidence: options.state,
    summaryEvidence: { changes: options.state.changes },
    brief,
  });
});
it.each([
  { changedFiles: [] },
  { changedFiles: ["missing.js"] },
  { changedFiles: ["production.json", "production.json"] },
])("rejects incomplete or invented file coverage: %j", async ({ changedFiles }) => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValue({ value: { ...brief, changedFiles } });
  await expect(buildRenderCacheBrief(options)).rejects.toThrow("cover every changed file");
});
it("rejects an oversized brief and propagates abort without invoking Haiku", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValue({ value: { ...brief, summary: "x".repeat(4001) } });
  await expect(buildRenderCacheBrief(options)).rejects.toThrow();
  vi.mocked(agentTurn).mockClear();
  await expect(
    buildRenderCacheBrief({ ...options, signal: AbortSignal.abort(Error("Stopped")) }),
  ).rejects.toThrow("Stopped");
  expect(agentTurn).not.toHaveBeenCalled();
});

it("shares one summary across concurrent shots and reuses it on the next render", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockResolvedValue({ value: brief });
  const other = { ...options, state: { ...options.state, shot: "other.html", sourceContext: [] } };
  expect(await Promise.all([buildRenderCacheBrief(options), buildRenderCacheBrief(other)])).toEqual(
    [brief, brief],
  );
  expect(agentTurn).toHaveBeenCalledOnce();
  expect(await buildRenderCacheBrief({ ...other, signal: new AbortController().signal })).toEqual(
    brief,
  );
  expect(agentTurn).toHaveBeenCalledOnce();
  const changed = {
    ...options,
    state: {
      ...options.state,
      changes: [{ ...options.state.changes[0], after: { hash: "newer" } }],
    },
  };
  await buildRenderCacheBrief(changed);
  expect(agentTurn).toHaveBeenCalledTimes(2);
});
it.each(["oversized-text", "many-files", "multibyte-text"])(
  "rejects %s before invoking a provider",
  async (kind) => {
    const options = await input();
    const changes =
      kind === "many-files"
        ? Array.from({ length: 2339 }, (_, i) => ({ file: `frames/${i}.jpg` }))
        : [
            {
              file: "shared.js",
              after: {
                text: (kind === "multibyte-text" ? "字" : "x").repeat(
                  kind === "multibyte-text"
                    ? renderCacheBriefInputBudget / 2
                    : renderCacheBriefInputBudget,
                ),
              },
            },
          ];
    await expect(
      buildRenderCacheBrief({ ...options, state: { ...options.state, changes } }),
    ).rejects.toThrow("input exceeds its budget");
    expect(agentTurn).not.toHaveBeenCalled();
  },
);
it("does not pay again for a failed summary for the same change set within a render", async () => {
  const options = await input();
  vi.mocked(agentTurn).mockRejectedValue(Error("Unavailable"));
  await expect(buildRenderCacheBrief(options)).rejects.toThrow("Unavailable");
  await expect(
    buildRenderCacheBrief({ ...options, state: { ...options.state, shot: "other.html" } }),
  ).rejects.toThrow("Unavailable");
  expect(agentTurn).toHaveBeenCalledOnce();
});

it.each([".private/secret.js", "assets/.cache/image.png", "audio\\.runtime\\voice.json", ".env"])(
  "keeps hidden evidence local: %s",
  async (file) => {
    const options = await input();
    for (const state of [
      { ...options.state, changes: [{ file }] },
      { ...options.state, sourceContext: [{ file, text: "private" }] },
    ])
      await expect(buildRenderCacheBrief({ ...options, state })).rejects.toThrow("stay local");
    expect(agentTurn).not.toHaveBeenCalled();
  },
);
