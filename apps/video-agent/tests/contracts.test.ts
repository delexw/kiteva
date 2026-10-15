import { describe, it, expect } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { RequestSchema, dimensions, isRunSettled } from "../src/shared/contracts";
import { resolveTemplate } from "../src/server/domains/video/prompts";
import { weightedScore } from "../src/server/catalog/ranking";
import { isPublicAddress, readReferenceUrl } from "../src/server/requests/inputs";
import { Store } from "../src/server/jobs/store";
import { WorkQueue } from "../src/server/jobs/queue";
import type { Run } from "../src/shared/contracts";
import { codexEvent, claudeEvent } from "../src/server/agents/providers";
import { illustrativeSvg } from "../scripts/bootstrap-examples";
describe("catalog and production contracts", () => {
  it("only allows settled projects when all jobs have stopped", () => {
    const run: Run = {
      id: "project",
      createdAt: "",
      phase: "cancelled",
      request: RequestSchema.parse({ instructions: "Explain a generic workflow" }),
      candidates: [],
      jobs: [],
    };
    expect(isRunSettled(run)).toBe(true);
    expect(isRunSettled({ ...run, phase: "generating" })).toBe(false);
    const job: Run["jobs"][number] = {
      id: "job",
      runId: run.id,
      candidateId: "candidate",
      kind: "preview",
      phase: "rendering",
      workspace: "",
      model: "test",
      duration: 3,
    };
    expect(isRunSettled({ ...run, jobs: [job] })).toBe(false);
    expect(isRunSettled({ ...run, jobs: [{ ...job, phase: "interrupted" }] })).toBe(true);
  });
  it("loads every style with separate rendering, motion and export roles", async () => {
    const c = await loadCatalog();
    expect(c.styles).toHaveLength(136);
    expect(c.motions).toHaveLength(42);
    for (const s of c.styles) {
      expect(s.audio_direction.prompt).toBeTruthy();
      expect(s.executable_prompt_template).toContain("{{render_pipeline}}");
      expect(s.tech.style_renderer.recommended_stack_refs).not.toContain("HyperFrames");
      expect(s.tech.motion_engine.recommended_stack_refs).not.toContain("Remotion");
      expect(illustrativeSvg(s, 1)).toContain(s.palette.tokens.background);
    }
  });
  it("links the cinematic opening reference to manga and comic styles", async () => {
    const catalog = await loadCatalog();
    const reference = catalog.motions.find((motion) => motion.id === "motion-016")!;
    expect(reference.name).toBe("Cinematic Manga Opening Sequence");
    expect(reference.motion_sequence.join(" ")).toContain("lettering");
    for (const id of ["style-031", "style-032"]) {
      expect(
        catalog.styles.find((style) => style.id === id)!.motion_references.candidates,
      ).toContainEqual(expect.objectContaining({ motion_id: "motion-016" }));
    }
  });
  it("links all added motions to compatible styles", async () => {
    const catalog = await loadCatalog();
    for (const id of ["motion-017", "motion-018", "motion-019", "motion-020", "motion-021"]) {
      const motion = catalog.motions.find((item) => item.id === id)!;
      expect(motion.name).toBe(motion.reference_label);
      expect(
        catalog.styles.some((style) =>
          style.motion_references.candidates.some(
            (ref: { motion_id: string }) => ref.motion_id === id,
          ),
        ),
      ).toBe(true);
    }
  });
  it("rejects invalid requests and applies declared defaults", () => {
    const r = RequestSchema.parse({ instructions: "Explain a generic workflow" });
    expect(r.duration).toBe("auto");
    expect(r.provider).toBe("codex");
    expect(r.candidateCount).toBe(5);
    expect(() => RequestSchema.parse({ ...r, duration: 0 })).toThrow();
    expect(() => RequestSchema.parse({ ...r, candidateCount: 6 })).toThrow();
  });
  it("resolves every placeholder or fails clearly", () => {
    expect(
      resolveTemplate("{{subject}} uses {{render_pipeline}}", {
        subject: "Example",
        render_pipeline: "HyperFrames",
      }),
    ).toBe("Example uses HyperFrames");
    expect(() => resolveTemplate("{{missing}}", {})).toThrow("Unresolved placeholder");
  });
  it("calculates distinct context and creativity scores without treating confidence as fit", () => {
    const scores = { relevance: 1, clarity: 1, creativity: 0, feasibility: 1 };
    expect(weightedScore(scores, "context")).toBe(90);
    expect(weightedScore(scores, "creative")).toBe(60);
  });
  it("keeps codec-compatible output dimensions", () => {
    expect(dimensions("16:9", 720)).toEqual({ width: 1280, height: 720 });
    expect(dimensions("9:16", 1080)).toEqual({ width: 1080, height: 1920 });
    expect(dimensions("1:1", 720)).toEqual({ width: 720, height: 720 });
  });
});
describe("URL boundary", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
  ])("rejects private or special address %s", (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
  it("allows public addresses", () => expect(isPublicAddress("1.1.1.1")).toBe(true));
  it("rejects private URLs before connecting", async () => {
    await expect(readReferenceUrl("http://10.0.0.1", new AbortController().signal)).rejects.toThrow(
      "Private-network",
    );
    await expect(
      readReferenceUrl("file:///etc/passwd", new AbortController().signal),
    ).rejects.toThrow("Only HTTP");
  });
});
describe("durable progress and scheduling", () => {
  it("persists ordered cursor events and marks interrupted jobs without losing completed output", () => {
    const s = new Store(":memory:");
    const request = RequestSchema.parse({ instructions: "Explain a generic workflow" });
    const run: Run = {
      id: "test-run",
      createdAt: new Date().toISOString(),
      request,
      phase: "generating",
      candidates: [],
      jobs: [
        {
          id: "one",
          runId: "test-run",
          candidateId: "candidate",
          kind: "preview",
          phase: "ready",
          workspace: "/tmp/job",
          model: "test",
          duration: 3,
          video: "renders/preview.mp4",
        },
        {
          id: "two",
          runId: "test-run",
          candidateId: "candidate",
          kind: "full",
          phase: "rendering",
          workspace: "/tmp/job2",
          model: "test",
          duration: 30,
        },
      ],
    };
    s.save(run);
    const first = s.emit(run.id, "tool", "working");
    const second = s.emit(run.id, "phase", "rendering");
    expect(s.events(run.id, first.id).map((e) => e.id)).toEqual([second.id]);
    s.recover();
    expect(s.get(run.id)?.jobs[0].video).toBe("renders/preview.mp4");
    expect(s.get(run.id)?.jobs[1].phase).toBe("interrupted");
    s.close();
  });
  it("limits active work and continues after failure", async () => {
    const q = new WorkQueue(2);
    let active = 0,
      peak = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        q.run(async () => {
          active++;
          peak = Math.max(active, peak);
          await new Promise((r) => setTimeout(r, 5));
          active--;
          if (i === 1) throw Error("test");
          return i;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  });
});
describe("native SDK event mapping", () => {
  it("retains Codex command updates and session identity", () => {
    expect(codexEvent({ type: "thread.started", thread_id: "session" })).toMatchObject({
      type: "session",
      data: { sessionId: "session" },
    });
    expect(
      codexEvent({
        type: "item.updated",
        item: {
          id: "cmd",
          type: "command_execution",
          command: "render",
          aggregated_output: "frame 3",
          status: "in_progress",
        },
      })?.message,
    ).toContain("frame 3");
  });
  it("retains Claude partial text without inventing thinking", () => {
    const e = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Building geometry" },
      },
      parent_tool_use_id: null,
      session_id: "session",
      uuid: "id",
    };
    expect(claudeEvent(e as Parameters<typeof claudeEvent>[0])).toEqual({
      type: "text_delta",
      message: "Building geometry",
    });
  });
});
