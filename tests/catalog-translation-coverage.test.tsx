import { afterEach, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { loadCatalog } from "../src/server/catalog/catalog";
import { appRoot } from "../src/server/runtime/config";
import { technologyPool } from "../src/shared/technology-pool";
import { CatalogDisplayText } from "../src/client/i18n/catalog-content";
import { uiLanguage } from "../src/client/i18n";
import chinese from "../src/client/i18n/catalog.zh-CN.json";
import { MotionGraphicVariants, MotionVariantList } from "../src/client/catalog-variants";
import { RecommendedStack } from "../src/client/recommended-stack";
import { MemoryRouter } from "react-router-dom";
import { technologyEntries } from "../src/client/technology-pool-model";
import { TechnologyCard } from "../src/client/components/technology-card";

afterEach(() => uiLanguage.change("en"));

it("requires Chinese resources for every displayed catalog detail, not only names and descriptions", async () => {
  const catalog = await loadCatalog();
  const index = new CatalogDisplayText();
  const source = JSON.stringify(catalog);
  for (const style of catalog.styles) index.style(style);
  for (const motion of catalog.motions) index.motion(motion);
  index.stack(Object.values(technologyPool));
  const examples = JSON.parse(
    await readFile(path.join(appRoot, "assets/style-art/manifest.json"), "utf8"),
  );
  for (const example of examples) index.example(example);
  const videos = JSON.parse(
    await readFile(path.join(appRoot, "assets/style-previews/videos.json"), "utf8"),
  );
  for (const video of videos)
    index.example({
      motionDescription: video.illustrationPlan?.rationale || video.recipe?.rationale,
    });
  expect(index.texts().filter((text) => !Object.hasOwn(chinese, text))).toEqual([]);
  expect(index.texts().length).toBeGreaterThan(4000);
  await uiLanguage.change("zh-CN");
  for (const text of index.texts()) {
    const translated = uiLanguage.translate(text);
    expect(translated.trim(), text).not.toBe("");
    if (text.length > 90 && /\b(the|with|and|from|only|when|before)\b/i.test(text))
      expect(translated, text).toMatch(/[\u3400-\u9fff]/);
    expect(
      [...new Set([...translated.matchAll(/#[\da-fA-F]{6}\b/g)].map((match) => match[0]))].sort(),
    ).toEqual(
      [...new Set([...text.matchAll(/#[\da-fA-F]{6}\b/g)].map((match) => match[0]))].sort(),
    );
  }
  expect(JSON.stringify(catalog)).toBe(source);
});

it("renders the reported Constructivism variant and motion/tool guidance in Chinese", async () => {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === "style-003")!;
  const motion = catalog.motions.find((entry) => entry.id === "motion-044")!;
  await uiLanguage.change("zh-CN");
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <MotionGraphicVariants variants={style.motion_graphic_variants} />
      <MotionVariantList variants={motion.variants} />
      <RecommendedStack
        libraries={style.tech.recommended_stack}
        implementation={style.tech.implementation}
        selectionGuidance={style.tech.library_selection}
      />
    </MemoryRouter>,
  );
  for (const variant of style.motion_graphic_variants ?? []) {
    expect(html).toContain(uiLanguage.translate(variant.name));
    expect(html).not.toContain(variant.summary);
    expect(html).not.toContain(variant.use_when);
  }
  expect(html).not.toContain(style.tech.implementation);
  expect(html).not.toContain(style.tech.library_selection);
});

it("deduplicates presentation text and excludes IDs, URLs, APIs and executable templates", async () => {
  const catalog = await loadCatalog();
  const style = catalog.styles[0];
  const values = new CatalogDisplayText()
    .add("Repeated", ["Repeated", "Another"], undefined)
    .style(style)
    .texts();
  expect(values.filter((text) => text === "Repeated")).toHaveLength(1);
  expect(values).not.toContain(style.id);
  expect(values).not.toContain(style.executable_prompt_template);
  for (const library of style.tech.recommended_stack) {
    expect(values).not.toContain(library.docs_url);
    for (const api of library.suggested_apis ?? []) expect(values).not.toContain(api);
  }
});

it("renders Chinese guidance for every technology card, including PhotoSwipe integration instructions", async () => {
  await uiLanguage.change("zh-CN");
  for (const entry of technologyEntries) {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TechnologyCard entry={entry} />
      </MemoryRouter>,
    );
    for (const field of [
      entry.definition.purpose,
      entry.definition.runtime,
      entry.definition.integration_guidance,
    ]) {
      if (!field) continue;
      expect(html, entry.key).toContain(uiLanguage.translate(field));
      if (uiLanguage.translate(field) !== field) expect(html, entry.key).not.toContain(field);
    }
    for (const api of entry.definition.suggested_apis ?? [])
      expect(html, `${entry.key}: preserve API identifiers`).toContain(
        renderToStaticMarkup(<code>{api}</code>),
      );
  }
});
