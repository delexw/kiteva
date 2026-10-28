import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { RoomProject } from "../src/client/room/room-project";
import { ProjectConversation } from "../src/client/components/project-conversation";
import { RefinementMessage } from "../src/client/components/refinement-message";
import { roomQuestionScope } from "../src/client/room/question-scope";

const run: Run = {
  id: "example-project",
  createdAt: "2026-01-01T00:00:00Z",
  phase: "ready",
  request: RequestSchema.parse({ instructions: "Explain an example concept" }),
  candidates: [],
  jobs: [
    {
      id: "original",
      runId: "example-project",
      candidateId: "direction",
      kind: "full",
      phase: "ready",
      model: "example",
      workspace: "/unused",
      duration: 20,
      createdAt: "2026-01-01T00:01:00Z",
    },
    {
      id: "revision",
      runId: "example-project",
      candidateId: "direction",
      kind: "full",
      phase: "queued",
      model: "example",
      workspace: "/unused",
      duration: 20,
      createdAt: "2026-01-01T00:02:00Z",
      sourceJobId: "original",
      refinementPrompt: "Make the opening clearer",
      refinementAssetIds: ["example-image"],
    },
  ],
};

it("shows the saved refinement message and images once, with its revision scope, in the Conversation tab", () => {
  const props = {
    run,
    events: [],
    renderPreview: () => null,
    renderFull: () => null,
    controls: null,
    onQuestion: vi.fn(),
    onUpdated: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    view: { tab: "conversation" as const, refine: "" },
    onView: vi.fn(),
  };
  const html = renderToStaticMarkup(<RoomProject {...props} />);
  expect(html.match(/Make the opening clearer/g)).toHaveLength(1);
  expect(html).toContain(roomQuestionScope(run, "revision"));
  expect(html).toContain("/api/assets/example-image/preview");
  expect(html).toContain('alt="Refinement reference 1"');
  // Reloading from the same stored project does not depend on composer state or events.
  expect(renderToStaticMarkup(<RoomProject {...props} run={structuredClone(run)} />)).toContain(
    "Make the opening clearer",
  );
});

it("uses the same saved message and image presentation in the legacy conversation", () => {
  const html = renderToStaticMarkup(
    <ProjectConversation
      run={run}
      events={[]}
      now={0}
      onRunUpdated={vi.fn()}
      titleFor={() => "Example direction"}
      controls={null}
      renderPreview={() => null}
      renderFull={() => null}
    />,
  );
  expect(html.match(/Make the opening clearer/g)).toHaveLength(1);
  expect(html).toContain("/api/assets/example-image/preview");
});

it("renders older text-only refinements without an empty image area", () => {
  const html = renderToStaticMarkup(
    <RefinementMessage job={{ ...run.jobs[0], refinementPrompt: "Improve spacing" }} />,
  );
  expect(html).toContain("Improve spacing");
  expect(html).not.toContain("refinement-message-images");
});
