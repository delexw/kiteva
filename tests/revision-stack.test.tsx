import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RequestSchema, type GenerationJob, type Phase, type Run } from "../src/shared/contracts";
import {
  defaultRevision,
  fullRevisionGroups,
  revisionStripTarget,
  selectedRevision,
} from "../src/client/lib/revision-stack";
import { RevisionStack } from "../src/client/components/revision-stack";
import { roomQuestionScope } from "../src/client/room/question-scope";
import { RoomProject } from "../src/client/room/room-project";
import { ProjectConversation } from "../src/client/components/project-conversation";
import type { VideoGenerationJob } from "../src/shared/domains/video";

const job = (
  id: string,
  candidateId: string,
  phase: Phase,
  extra: Partial<VideoGenerationJob> = {},
): GenerationJob => ({
  id,
  runId: "project",
  candidateId,
  kind: "full",
  phase,
  workspace: "/unused",
  model: "example-model",
  duration: 20,
  ...(phase === "ready"
    ? { video: "film.mp4", finishedAt: "2026-01-01T00:10:00Z" }
    : phase === "failed"
      ? { error: "boom", errorCode: "VIDEO_GENERATION_FAILED" }
      : {}),
  ...extra,
});

const project = (jobs: GenerationJob[]): Run => ({
  id: "project",
  createdAt: "2026-01-01T00:00:00Z",
  phase: "ready",
  request: RequestSchema.parse({ instructions: "Explain a connected idea" }),
  // Two directions deliberately share a title and style; they must stay separate.
  candidates: [
    { id: "alpha", displayTitle: "Same look", styleId: "shared-style" },
    { id: "beta", displayTitle: "Same look", styleId: "shared-style" },
  ] as unknown as Run["candidates"],
  jobs,
});

const group = (jobs: GenerationJob[], key = "alpha") =>
  fullRevisionGroups(jobs).find((item) => item.key === key)!;

describe("full revision grouping", () => {
  it("groups by candidateId only, keeps job order and excludes previews", () => {
    const jobs = [
      job("preview-a", "alpha", "ready", { kind: "preview" }),
      job("a1", "alpha", "ready"),
      job("b1", "beta", "ready"),
      job("a2", "alpha", "generating"),
      job("loose", "", "failed"),
    ];
    const groups = fullRevisionGroups(jobs);
    expect(groups.map((item) => item.key)).toEqual(["alpha", "beta", "loose"]);
    expect(groups[0].revisions.map((item) => [item.job.id, item.version, item.state])).toEqual([
      ["a1", 1, "ready"],
      ["a2", 2, "active"],
    ]);
    // Version identity matches the existing question/activity scope labels.
    const run = project(jobs);
    for (const revision of groups[0].revisions)
      expect(roomQuestionScope(run, revision.job.id)).toContain(`version ${revision.version}`);
  });

  it("selects the latest playable revision while newer ones build or fail", () => {
    const building = group([job("a1", "alpha", "ready"), job("a2", "alpha", "rendering")]);
    expect(defaultRevision(building).job.id).toBe("a1");
    expect(revisionStripTarget(building, defaultRevision(building))?.job.id).toBe("a2");

    const failed = group([
      job("a1", "alpha", "ready"),
      job("a2", "alpha", "ready"),
      job("a3", "alpha", "interrupted"),
    ]);
    expect(defaultRevision(failed).job.id).toBe("a2");
    expect(revisionStripTarget(failed, defaultRevision(failed))).toMatchObject({
      version: 3,
      state: "failed",
    });

    const noPlayable = group([job("a1", "alpha", "failed"), job("a2", "alpha", "queued")]);
    expect(defaultRevision(noPlayable).job.id).toBe("a2");
    expect(revisionStripTarget(noPlayable, defaultRevision(noPlayable))).toBeUndefined();

    const cancelledNewest = group([job("a1", "alpha", "ready"), job("a2", "alpha", "cancelled")]);
    expect(revisionStripTarget(cancelledNewest, defaultRevision(cancelledNewest))).toBeUndefined();
  });

  it("keeps an explicit selection and points a selected running revision back to the film", () => {
    const stack = group([job("a1", "alpha", "ready"), job("a2", "alpha", "generating")]);
    const running = selectedRevision(stack, "a2");
    expect(running.job.id).toBe("a2");
    expect(revisionStripTarget(stack, running)?.job.id).toBe("a1");
    // A remembered job that no longer exists falls back to the default.
    expect(selectedRevision(stack, "deleted").job.id).toBe("a1");
    // A newer finished revision does not take over a remembered selection.
    const finished = group([job("a1", "alpha", "ready"), job("a2", "alpha", "ready")]);
    expect(selectedRevision(finished, "a1").job.id).toBe("a1");
    expect(revisionStripTarget(finished, selectedRevision(finished, "a1"))).toMatchObject({
      version: 2,
      state: "ready",
    });
  });
});

const card = (job: GenerationJob, slots?: { switcher?: unknown; strip?: unknown }) => (
  <article data-card={job.id}>
    <a data-download={job.id} href={`/download/${job.id}`}>
      MP4
    </a>
    {slots?.strip as never}
    {slots?.switcher as never}
  </article>
);

describe("revision stack rendering", () => {
  it("renders one Full card per direction with the playable revision and an in-card strip", () => {
    const run = project([
      job("preview-a", "alpha", "ready", { kind: "preview" }),
      job("a1", "alpha", "ready"),
      job("b1", "beta", "ready"),
      job("a2", "alpha", "rendering"),
    ]);
    const html = renderToStaticMarkup(
      <RoomProject
        run={run}
        events={[]}
        renderPreview={(item) => <i data-preview={item.id} />}
        renderFull={card}
        controls={null}
        onQuestion={vi.fn()}
        onUpdated={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onCancelJob={vi.fn()}
        onRetry={vi.fn()}
        view={{ tab: "full", refine: "" }}
        onView={vi.fn()}
      />,
    );
    expect(html.match(/data-card="/g)).toHaveLength(2);
    expect(html).toContain('data-card="a1"');
    expect(html).toContain('data-card="b1"');
    expect(html).not.toContain('data-card="a2"');
    expect(html).not.toContain("data-preview");
    expect(html).toContain('data-download="a1"');
    // The building revision has its own stop control inside the alpha card only.
    expect(html.match(/aria-label="Stop version 2"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Versions of Same look"');
    // A single-revision card has no switcher.
    expect(html.match(/revision-switcher-tabs/g)).toHaveLength(1);
  });

  it("shows the latest failed card without a strip when nothing is playable", () => {
    const stack = group([job("a1", "alpha", "failed"), job("a2", "alpha", "failed")]);
    const html = renderToStaticMarkup(
      <RevisionStack
        group={stack}
        title="Same look"
        onSelect={vi.fn()}
        events={[]}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      >
        {card}
      </RevisionStack>,
    );
    expect(html).toContain('data-card="a2"');
    expect(html).not.toContain("revision-strip");
  });

  it("shows one card per direction in the conversation and points later revisions at it", () => {
    const run = project([
      job("a1", "alpha", "ready", { startedAt: "2026-01-01T00:01:00Z" }),
      job("a2", "alpha", "generating", { startedAt: "2026-01-01T00:20:00Z" }),
    ]);
    const html = renderToStaticMarkup(
      <ProjectConversation
        onRunUpdated={vi.fn()}
        run={run}
        events={[]}
        now={0}
        titleFor={() => "Same look"}
        controls={null}
        renderPreview={() => null}
        renderFull={(item, _activity, slots) => card(item, slots)}
        onCancel={vi.fn()}
      />,
    );
    expect(html.match(/data-card="/g)).toHaveLength(1);
    expect(html).toContain('data-card="a1"');
    expect(html).toContain('id="generation-full-a1"');
    expect(html).toContain('id="generation-full-a2"');
    expect(html).toContain("Version 2 of Same look · Building");
    expect(html).toContain('aria-label="Stop version 2"');
  });
});
