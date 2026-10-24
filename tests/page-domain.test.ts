import { PageBriefSchema, PageProductionSchema } from "../src/shared/agents/schemas/page";
import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/domains/page/validation", () => ({ validatePage: vi.fn() }));
import { RequestSchema } from "../src/shared/contracts";
import { type PageGenerationJob } from "../src/shared/domains/page";
import { generatePage } from "../src/server/domains/page/workflow";
import { buildPagePrompt } from "../src/server/domains/page/prompts";
import { agentTurn } from "../src/server/agents/providers";
import { validatePage } from "../src/server/domains/page/validation";
import { loadCatalog } from "../src/server/catalog/catalog";
import { selectedStyleWeightingGuidance } from "../src/shared/style-combinations";
const brief = PageBriefSchema.parse({
  subject: "An idea",
  audience: "General",
  objective: "Explain",
  facts: [],
  exactCopy: [],
  previewBeat: "Explore a diagram",
  assetDescriptions: [],
  constraints: [],
  sections: ["Introduction"],
  interactionGoals: ["Inspect connections"],
});
const candidate = {
  id: "option",
  primaryStyleId: "style-001",
  supportingStyleIds: [],
  sceneRoles: ["Hero"],
  rationale: "Clear",
  feasible: true,
  missingAssets: [],
  score: 90,
  confidence: 0.8,
  dimensions: {},
};
const production = PageProductionSchema.parse({
  sourceFile: "index.html",
  title: "Explore",
  styleRenderer: ["SVG"],
  interactionEngine: ["GSAP"],
  interactions: ["Select node"],
  responsiveStrategy: "Fluid grid",
  limitations: [],
});
describe("interactive page domain", () => {
  it("keeps page requests separate from video timing and maintains legacy video defaults", () => {
    expect(RequestSchema.parse({ instructions: "Explore a diagram" })).toMatchObject({
      outputType: "video",
      duration: "auto",
    });
    const page = RequestSchema.parse({ instructions: "Explore a diagram", outputType: "page" });
    expect(page).toMatchObject({ outputType: "page", viewport: "desktop" });
    expect(page).not.toHaveProperty("duration");
    expect(() => RequestSchema.parse({ ...page, duration: 30 })).toThrow();
    expect(() => RequestSchema.parse({ ...page, outputType: "slides" })).toThrow();
    expect(brief).not.toHaveProperty("suggestedDuration");
  });
  it("uses interaction prompts rather than the video catalog template", async () => {
    const catalog = await loadCatalog();
    const request = RequestSchema.parse({ instructions: "Explore a diagram", outputType: "page" });
    if (request.outputType !== "page") throw Error("Expected page");
    const job: PageGenerationJob = {
      outputType: "page",
      id: "job",
      runId: "run",
      candidateId: "option",
      kind: "preview",
      phase: "queued",
      workspace: "example",
      model: "test",
    };
    const prompt = buildPagePrompt({ job, request, brief, candidate, styles: catalog.styles });
    expect(prompt).toContain("responsive interactive HTML page");
    expect(prompt).toContain("keyboard access");
    expect(prompt).toContain("IntersectionObserver");
    expect(prompt).toContain("onProgress(progress)");
    expect(prompt).toContain("offscreen ambient motion MUST pause");
    expect(prompt).toContain("motion-runtime.js");
    expect(prompt).not.toContain("data-composition-id");
    expect(prompt).not.toContain("{{");
    expect(prompt).not.toContain(selectedStyleWeightingGuidance);
    const selectedRequest = { ...request, selectedStyleIds: [candidate.primaryStyleId] };
    expect(
      buildPagePrompt({ job, request: selectedRequest, brief, candidate, styles: catalog.styles }),
    ).toContain(selectedStyleWeightingGuidance);
  });
  it("continues the provider session for repair and caches the completed page production", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "page-domain-"));
    try {
      const request = RequestSchema.parse({
        instructions: "Explore a diagram",
        outputType: "page",
      });
      if (request.outputType !== "page") throw Error("Expected page");
      const job: PageGenerationJob = {
        outputType: "page",
        id: "job",
        runId: "run",
        candidateId: "option",
        kind: "preview",
        phase: "generating",
        workspace,
        model: "test",
        sessionId: "approved-session",
      };
      vi.mocked(agentTurn)
        .mockResolvedValueOnce({ value: production, sessionId: "continued-session" })
        .mockResolvedValueOnce({
          value: { title: "Repaired title" },
          sessionId: "continued-session",
        });
      vi.mocked(validatePage)
        .mockRejectedValueOnce(Error("Horizontal overflow"))
        .mockResolvedValue({ page: "index.html", poster: "renders/page.png" });
      const input = {
        job,
        request,
        brief,
        candidate,
        styles: (await loadCatalog()).styles,
        signal: new AbortController().signal,
        update: vi.fn(),
        onEvent: vi.fn(),
        emit: vi.fn(),
      };
      await generatePage(input);
      expect(job.phase).toBe("ready");
      expect(job.page).toBe("index.html");
      expect(job.pageProduction).toEqual({ ...production, title: "Repaired title" });
      expect(job).not.toHaveProperty("video");
      expect(vi.mocked(agentTurn).mock.calls.at(-1)?.[0]).toMatchObject({
        sessionId: "continued-session",
        prompt: expect.stringContaining("Horizontal overflow"),
      });
      const turns = vi.mocked(agentTurn).mock.calls.length;
      await generatePage(input);
      expect(vi.mocked(agentTurn).mock.calls.length).toBe(turns);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

it("expands a winning page using its approved source and provider session", async () => {
  const { Workflow } = await import("../src/server/jobs/workflow");
  const { Store } = await import("../src/server/jobs/store");
  const { writeFile, readFile } = await import("node:fs/promises");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "page-approved-"));
  const store = new Store(":memory:");
  const workflow = new Workflow(store, await loadCatalog());
  let fullWorkspace: string | undefined;
  try {
    await writeFile(path.join(workspace, "index.html"), "<h1>Approved illustration</h1>");
    const request = RequestSchema.parse({ instructions: "Explore a diagram", outputType: "page" });
    const run: import("../src/shared/contracts").Run = {
      id: "page-expansion",
      createdAt: new Date().toISOString(),
      phase: "ready",
      request,
      brief,
      candidates: [candidate],
      jobs: [
        {
          outputType: "page",
          id: "preview",
          runId: "page-expansion",
          candidateId: candidate.id,
          kind: "preview",
          phase: "ready",
          workspace,
          model: "test",
          page: "index.html",
          pageProduction: production,
          sessionId: "approved-session",
        },
      ],
    };
    vi.spyOn(workflow, "generate").mockResolvedValue();
    const full = await workflow.full(run, candidate.id, "Keep the approved diagram");
    fullWorkspace = full.workspace;
    expect(full).toMatchObject({ outputType: "page", kind: "full", sessionId: "approved-session" });
    expect(full).not.toHaveProperty("duration");
    expect(full).not.toHaveProperty("pageProduction");
    expect(await readFile(path.join(full.workspace, "index.html"), "utf8")).toContain(
      "Approved illustration",
    );
    expect(workflow.generate).toHaveBeenCalledWith(run, full, "Keep the approved diagram");
  } finally {
    await workflow.shutdown();
    store.close();
    await rm(workspace, { recursive: true, force: true });
    if (fullWorkspace) await rm(path.dirname(fullWorkspace), { recursive: true, force: true });
  }
});
