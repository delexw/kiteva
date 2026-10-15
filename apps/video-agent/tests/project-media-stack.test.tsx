import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectMediaStack } from "../src/client/components/project-media-stack";
import { RequestSchema, type Run, type GenerationJob } from "../src/shared/contracts";
const viewport = vi.hoisted(() => ({ visible: true }));
vi.mock("../src/client/use-viewport-visibility", () => ({
  useViewportVisibility: () => viewport.visible,
}));
beforeEach(() => {
  viewport.visible = true;
});
const project: Run = {
  id: "example-project",
  createdAt: "2026-01-01",
  phase: "ready",
  request: RequestSchema.parse({ instructions: "An original story" }),
  candidates: [],
  jobs: [],
};
const job = (
  id: string,
  kind: "full" | "preview",
  phase: GenerationJob["phase"],
  createdAt: string,
): GenerationJob => ({
  id,
  kind,
  phase,
  createdAt,
  runId: project.id,
  candidateId: id,
  outputType: "video",
  duration: 3,
  model: "example-model",
  workspace: "/tmp/example",
  video: "renders/video.mp4",
});
it("stacks finished full versions, starts with the newest and mounts only one player", () => {
  const html = renderToStaticMarkup(
    <ProjectMediaStack
      onOpen={() => {}}
      project={{
        ...project,
        jobs: [
          job("old", "full", "ready", "2026-01-02"),
          job("new", "full", "ready", "2026-01-03"),
          job("preview", "preview", "ready", "2026-01-04"),
          job("failed", "full", "failed", "2026-01-05"),
        ],
      }}
    />,
  );
  expect(html).toContain('aria-roledescription="carousel"');
  expect(html).toContain('class="recent-project-media project-preview-frame"');
  expect(html).toContain('data-variant="video"');
  expect(html).not.toContain("Version 2 of 2");
  expect(html).toContain("Previous result for An original story");
  expect(html).toContain("Next result for An original story");
  expect(html).toContain("example-project/new/renders/video.mp4");
  expect(html.match(/<video /g)).toHaveLength(1);
  expect(html).not.toContain("example-project/preview/renders/video.mp4");
});
it("plays a full film's WebM viewing copy and keeps older films on their MP4", () => {
  const html = (viewingVideo?: string) =>
    renderToStaticMarkup(
      <ProjectMediaStack
        onOpen={() => {}}
        project={{
          ...project,
          jobs: [{ ...job("film", "full", "ready", "2026-01-02"), viewingVideo } as GenerationJob],
        }}
      />,
    );
  expect(html("renders/view-720p30.webm")).toContain(
    'src="/api/artifacts/example-project/film/renders/view-720p30.webm"',
  );
  expect(html("renders/view-720p30.webm")).not.toContain("renders/video.mp4");
  expect(html()).toContain('src="/api/artifacts/example-project/film/renders/video.mp4"');
});
it("shows a finished film's muted card clip with a play button instead of loading the film", () => {
  const html = renderToStaticMarkup(
    <ProjectMediaStack
      onOpen={() => {}}
      project={{
        ...project,
        jobs: [
          {
            ...job("film", "full", "ready", "2026-01-02"),
            viewingVideo: "renders/view-720p30.webm",
            cardClip: "renders/card-3s.webm",
            poster: "renders/full.jpg",
          } as GenerationJob,
        ],
      }}
    />,
  );
  expect(html).toContain('src="/api/artifacts/example-project/film/renders/card-3s.webm"');
  expect(html).toContain('poster="/api/artifacts/example-project/film/renders/full.jpg"');
  expect(html).toMatch(/<video[^>]*muted=""[^>]*loop=""/);
  expect(html).not.toMatch(/<video[^>]*controls/);
  expect(html).not.toContain("view-720p30.webm");
  expect(html).not.toContain("renders/video.mp4");
  expect(html).toContain('aria-label="Play film: An original story"');
});
it("keeps one full result flat and does not substitute a direction preview", () => {
  for (const kind of ["preview", "full"] as const) {
    const html = renderToStaticMarkup(
      <ProjectMediaStack
        onOpen={() => {}}
        project={{ ...project, jobs: [job("only", kind, "ready", "2026-01-02")] }}
      />,
    );
    expect(html).not.toContain('aria-roledescription="carousel"');
    expect(html).not.toContain("Next result");
    if (kind === "full") expect(html).toContain("Latest finished result");
    else {
      expect(html).toContain('data-variant="progress"');
      expect(html).toContain("Choose a direction");
      expect(html).not.toContain("<video");
      expect(html).not.toContain("/api/artifacts/");
    }
  }
});

it("does not attach media or poster URLs until the project enters the viewport", () => {
  viewport.visible = false;
  const html = renderToStaticMarkup(
    <ProjectMediaStack
      onOpen={() => {}}
      project={{
        ...project,
        jobs: [{ ...job("only", "full", "ready", "2026-01-02"), poster: "renders/poster.jpg" }],
      }}
    />,
  );
  expect(html).toContain("Preview loads when visible");
  expect(html).toContain('data-variant="placeholder"');
  expect(html).not.toContain("<video");
  expect(html).not.toContain("/api/artifacts/");
  expect(html).not.toContain("<iframe");
});
