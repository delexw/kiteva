import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  styleSummarySource,
  summarizeStyle,
  summaryModels,
  styleSummaryCacheFolder,
} from "../src/server/catalog/style-summaries";
import { appRoot } from "../src/server/runtime/config";
import type { agentTurn } from "../src/server/agents/providers";

const folders: string[] = [];
it("keeps the shared extraction cache in persistent codebase assets", () => {
  expect(styleSummaryCacheFolder).toBe(path.join(appRoot, "assets", "style-summaries"));
});
afterEach(async () => {
  await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })));
});
async function cache() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "style-summary-test-"));
  folders.push(folder);
  return folder;
}
const summary = {
  styleId: "style-001",
  name: "Example",
  visualIdentity: "Grid",
  suitableUses: "Clarity",
  limitations: "Restrained",
  palette: "Original",
  motionAndInteraction: "Assembly",
  audio: "Flexible",
  assetRequirements: "Code-created",
  combinations: "Optional",
  productionApproach: "Illustration-led",
};

it("sends all original metadata and referenced motion information, without truncation", async () => {
  const catalog = await loadCatalog();
  catalog.originalStyles[0].extraOriginalField = "x".repeat(14000) + "END_OF_ORIGINAL";
  const source = styleSummarySource(catalog, "style-001");
  expect(source.style).toEqual(catalog.originalStyles[0]);
  const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
  await summarizeStyle(source, "claude", new AbortController().signal, await cache(), generate);
  expect(generate).toHaveBeenCalledWith(
    expect.objectContaining({
      model: summaryModels.claude,
      promptContext: { originalSource: source },
      readOnly: true,
      prompt: expect.stringContaining("Read the complete originalSource"),
    }),
  );
});

it.each(["claude", "codex"] as const)(
  "shares a %s-authored summary with the other provider",
  async (provider) => {
    const source = styleSummarySource(await loadCatalog(), "style-001");
    const folder = await cache();
    const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
    const events = vi.fn();
    await summarizeStyle(source, provider, new AbortController().signal, folder, generate);
    await summarizeStyle(
      source,
      provider === "claude" ? "codex" : "claude",
      new AbortController().signal,
      folder,
      generate,
      events,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ provider, model: summaryModels[provider] }),
    );
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "summary_cache",
        data: { provider, model: summaryModels[provider], styleId: "style-001" },
      }),
    );
    await summarizeStyle(
      { ...source, style: { ...source.style, newConstraint: "Keep exact colors" } },
      provider,
      new AbortController().signal,
      folder,
      generate,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  },
);

it.each(["claude", "codex"] as const)(
  "uses %s's lightweight model on a cache miss",
  async (provider) => {
    const generate = vi.fn(async () => ({ value: summary })) as unknown as typeof agentTurn;
    await summarizeStyle(
      styleSummarySource(await loadCatalog(), "style-001"),
      provider,
      new AbortController().signal,
      await cache(),
      generate,
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        model: provider === "codex" ? "gpt-6-luna" : "claude-haiku-5-5",
      }),
    );
  },
);

it.each(["claude", "codex"] as const)(
  "migrates both legacy layouts authored by %s for either provider",
  async (provider) => {
    const source = styleSummarySource(await loadCatalog(), "style-001");
    const model = summaryModels[provider];
    const hash = createHash("sha256")
      .update(JSON.stringify({ revision: 3, model, source }))
      .digest("hex");
    for (const isolated of [false, true]) {
      const folder = await cache();
      const directory = path.join(folder, provider, ...(isolated ? ["models"] : []));
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `style-001-${hash}.json`),
        JSON.stringify(isolated ? { summary, provider, model } : summary),
      );
      const generate = vi.fn(async () => {
        throw Error("Must reuse");
      }) as unknown as typeof agentTurn;
      const events = vi.fn();
      await expect(
        summarizeStyle(
          source,
          provider === "claude" ? "codex" : "claude",
          new AbortController().signal,
          folder,
          generate,
          events,
        ),
      ).resolves.toEqual(summary);
      await rm(path.join(folder, provider), { recursive: true });
      await expect(
        summarizeStyle(source, provider, new AbortController().signal, folder, generate),
      ).resolves.toEqual(summary);
      expect(generate).not.toHaveBeenCalled();
      expect(events).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "summary_cache",
          data: { provider, model, styleId: "style-001" },
        }),
      );
    }
  },
);

it("does not cache failures or accept summaries for another style", async () => {
  const source = styleSummarySource(await loadCatalog(), "style-001"),
    folder = await cache(),
    signal = new AbortController().signal;
  const generate = vi
    .fn()
    .mockRejectedValueOnce(Error("Model unavailable"))
    .mockResolvedValueOnce({ value: { ...summary, styleId: "style-002" } })
    .mockResolvedValue({ value: summary }) as unknown as typeof agentTurn;
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).rejects.toThrow(
    "Model unavailable",
  );
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).rejects.toThrow(
    "different Motion Graphic",
  );
  await expect(summarizeStyle(source, "claude", signal, folder, generate)).resolves.toEqual(
    summary,
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    summarizeStyle(source, "claude", controller.signal, folder, generate),
  ).rejects.toThrow();
});
