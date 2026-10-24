import type { GenerationJob } from "../src/shared/contracts";
import { afterEach, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UiLanguageProvider, UiLanguageSwitch, uiLanguage } from "../src/client/i18n";
import { UiLanguageService, isUiLanguage } from "../src/client/i18n/service";
import en from "../src/client/i18n/en.json";
import zh from "../src/client/i18n/zh-CN.json";
import { RoomDraftSchema } from "../src/shared/room";
import { roomOnboardingReplies } from "../src/client/room/onboarding-replies";
import { VideoRequestSchema } from "../src/shared/domains/video";

afterEach(async () => {
  await uiLanguage.change("en");
});
it("has matching English/Chinese resource keys and preserves interpolation variables", () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
  for (const key of Object.keys(en) as Array<keyof typeof en>) {
    expect(zh[key].trim().length, key).toBeGreaterThan(0);
    expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
  }
});
it("switches through the service, preserves unknown names and supports interpolation/plurals", async () => {
  const language = new UiLanguageService();
  expect(language.language).toBe("en");
  expect(language.translate("New idea")).toBe("New idea");
  await language.change("zh-CN");
  expect(language.translate("New idea")).toBe("新创意");
  expect(language.translate("Open project: {{value0}}", { value0: "An original project" })).toBe(
    "打开项目：An original project",
  );
  expect(language.translate("A user-created catalog entry")).toBe("A user-created catalog entry");
  expect(language.translate("activity.updates", { count: 2 })).toBe("2 次更新");
  await language.change("en");
  expect(language.translate("activity.updates", { count: 1 })).toBe("1 update");
  expect(language.translate("activity.updates", { count: 2 })).toBe("2 updates");
  expect(isUiLanguage("zh-CN")).toBe(true);
  expect(isUiLanguage("invalid")).toBe(false);
});
it("renders server-side without accessing browser storage or globals", () => {
  expect(() =>
    renderToStaticMarkup(
      <UiLanguageProvider>
        <UiLanguageSwitch />
      </UiLanguageProvider>,
    ),
  ).not.toThrow();
});
it("changes UI summaries without altering the idea, script, lyrics or output-language setting", async () => {
  const draft = RoomDraftSchema.parse({
    step: 6,
    stepLayout: "separate-speech",
    request: {
      instructions: "Keep my original idea",
      outputType: "video",
      outputLanguage: "en",
      candidateCount: 2,
      duration: 30,
      lyrics: { mode: "provided", text: "Keep my original lyrics" },
      speech: { mode: "narration", source: "provided", text: "Keep my original script" },
    },
  });
  const before = JSON.stringify(draft);
  const request = VideoRequestSchema.parse(draft.request);
  await uiLanguage.change("zh-CN");
  const replies = roomOnboardingReplies(request, [], []);
  expect(replies[0].text).toBe("Keep my original idea");
  expect(replies[5].text).toContain("Keep my original lyrics");
  expect(replies[5].text).toContain("Keep my original script");
  expect(replies[6].text).toContain("模型：");
  expect(JSON.stringify(draft)).toBe(before);
  expect(draft.request.outputLanguage).toBe("en");
});

it("covers every catalog card and tool purpose, with bilingual search and stable source data", async () => {
  const [
    { default: styles },
    { default: motions },
    { technologyPool },
    { filterTechnologyEntries, technologyEntries },
  ] = await Promise.all([
    import("../assets/catalog/video-style-catalog.json"),
    import("../assets/catalog/motion-pattern-catalog.json"),
    import("../src/shared/technology-pool"),
    import("../src/client/technology-pool-model"),
  ]);
  const source = JSON.stringify({ styles, motions, technologyPool });
  await uiLanguage.change("zh-CN");
  for (const entry of styles.styles) {
    for (const text of [entry.name_en, entry.visual_cues, entry.category])
      expect(uiLanguage.translate(text), entry.id).toMatch(/[\u3400-\u9fff]/);
  }
  for (const entry of motions.patterns) {
    for (const text of [entry.name, entry.description, entry.category])
      expect(uiLanguage.translate(text), entry.id).toMatch(/[\u3400-\u9fff]/);
  }
  for (const entry of Object.values(technologyPool)) {
    expect(uiLanguage.translate(entry.purpose), entry.name).toMatch(/[\u3400-\u9fff]/);
    expect(uiLanguage.translate(entry.kind), entry.kind).toMatch(/[\u3400-\u9fff]/);
  }
  expect(uiLanguage.matches("卡带", "Cassette Futurism")).toBe(true);
  expect(uiLanguage.matches("Cassette", "Cassette Futurism")).toBe(true);
  expect(filterTechnologyEntries(technologyEntries, "碰撞").map((entry) => entry.key)).toContain(
    "matter_js",
  );
  expect(JSON.stringify({ styles, motions, technologyPool })).toBe(source);
  await uiLanguage.change("en");
  expect(uiLanguage.translate("Cassette Futurism")).toBe("Cassette Futurism");
});

it("localizes Governance task and cost explanations without modifying usage records", async () => {
  const { GovernanceUsageTable } = await import("../src/client/governance/usage-table");
  const { modelPromptTreeData } = await import("../src/client/governance/model-prompts");
  const row = {
    model: "example-model",
    purpose: "Contrast correction · initial lower-cost repair",
    calls: 1,
    tools: 3,
    cacheHits: 0,
    inputTokens: 123,
    outputTokens: 45,
    cachedTokens: null,
    uncachedInputTokens: null,
    cacheWriteTokens: null,
    cacheWrite5mTokens: null,
    cacheWrite1hTokens: null,
    costLow: 0.1,
    costHigh: 0.2,
    costBasis: "Published Jev API rate",
  };
  const original = JSON.stringify(row);
  await uiLanguage.change("zh-CN");
  const html = renderToStaticMarkup(<GovernanceUsageTable rows={[row]} byFunction />);
  expect(html).toContain("对比度修正 · 首次低成本修复");
  expect(html).toContain("Jev 公布的 API 费率");
  expect(html).toContain("example-model");
  expect(html).toContain("$0.1000–$0.2000");
  const prompts = [
    {
      id: "example-call",
      model: "example-model",
      purpose: "Brief preparation",
      time: "2026-10-18T00:00:00Z",
      source: "recorded" as const,
    },
  ];
  expect(modelPromptTreeData(prompts)[0].children?.[0].title).toBe(
    uiLanguage.translate("Brief preparation"),
  );
  expect(JSON.stringify(row)).toBe(original);
  expect(uiLanguage.number(1234)).toBe("1,234");
  expect(uiLanguage.date("2026-10-18T00:00:00Z")).toContain("2026");
});

it("translates selected MG names in finished-result summaries while preserving custom names", async () => {
  const { ResultSummary } = await import("../src/client/components/result-summary");
  const { RequestSchema } = await import("../src/shared/contracts");
  const request = RequestSchema.parse({ instructions: "An original idea" });
  const job: GenerationJob = {
    id: "example-job",
    runId: "example-project",
    candidateId: "example-direction",
    kind: "full",
    phase: "ready",
    duration: 30,
    workspace: "/tmp/example",
    model: "example-model",
  };
  await uiLanguage.change("zh-CN");
  const html = renderToStaticMarkup(
    <ResultSummary
      job={job}
      request={request}
      styleNames={["Cassette Futurism", "Kinetic Typography", "My original direction"]}
    />,
  );
  expect(html).toContain("卡带未来主义 + 动态字体 + My original direction");
  expect(html).not.toContain("Cassette Futurism");
  await uiLanguage.change("en");
  expect(
    renderToStaticMarkup(
      <ResultSummary job={job} request={request} styleNames={["Cassette Futurism"]} />,
    ),
  ).toContain("Cassette Futurism");
});

it("translates every storyboard crew name and action without changing the saved cues", async () => {
  const { StoryboardMovie } = await import("../src/client/storyboard-movie-player");
  const { StoryboardCrew, storyboardCrewLabels } = await import("../src/client/storyboard-crew");
  const { storyboardPageSchema } = await import("../src/client/storyboard-model");
  const storyboard = storyboardPageSchema.parse({
    durationSeconds: 10,
    scenes: [
      {
        startSeconds: 0,
        endSeconds: 10,
        beats: [
          {
            startSeconds: 0,
            endSeconds: 10,
            development: "Camera pans past a photo as the spotlight lights the title",
            audio: { effects: ["Impact"] },
          },
        ],
      },
    ],
  });
  const original = JSON.stringify(storyboard);
  await uiLanguage.change("zh-CN");
  const html = renderToStaticMarkup(<StoryboardMovie storyboard={storyboard} base="/example/" />);
  for (const name of ["灯光", "音效", "摄影", "正在前往"]) expect(html).toContain(name);
  for (const name of ["LIGHTING", "SOUND", "CAMERA", ">Ready<"]) expect(html).not.toContain(name);
  for (const [role, label] of Object.entries(storyboardCrewLabels)) {
    expect(uiLanguage.translate(label.name)).toMatch(/[\u3400-\u9fff]/);
    expect(
      renderToStaticMarkup(<StoryboardCrew role={role as keyof typeof storyboardCrewLabels} />),
    ).not.toContain(label.description);
  }
  for (const action of [
    "On my way",
    "Resetting",
    "Set the prop",
    "Aim the light",
    "Set the lettering",
    "Cue the sound",
    "Track the shot",
  ])
    expect(uiLanguage.translate(action)).toMatch(/[\u3400-\u9fff]/);
  const quiet = storyboardPageSchema.parse({
    durationSeconds: 10,
    scenes: [
      {
        startSeconds: 0,
        endSeconds: 10,
        beats: [{ startSeconds: 0, endSeconds: 10, development: "Quiet reading hold" }],
      },
    ],
  });
  expect(renderToStaticMarkup(<StoryboardMovie storyboard={quiet} base="/example/" />)).toContain(
    "已就绪",
  );
  expect(JSON.stringify(storyboard)).toBe(original);
  await uiLanguage.change("en");
  expect(
    renderToStaticMarkup(<StoryboardMovie storyboard={storyboard} base="/example/" />),
  ).toContain("LIGHTING");
});

it("loads catalog resources on demand and keeps the latest language selection during loading", async () => {
  const language = new UiLanguageService();
  expect(language.engine.getResource("zh-CN", "translation", "Cassette Futurism")).toBeUndefined();
  const pendingChinese = language.change("zh-CN");
  await language.change("en");
  await pendingChinese;
  expect(language.language).toBe("en");
  expect(language.translate("Cassette Futurism")).toBe("Cassette Futurism");
  await language.change("zh-CN");
  expect(language.translate("Cassette Futurism")).toBe("卡带未来主义");
});
