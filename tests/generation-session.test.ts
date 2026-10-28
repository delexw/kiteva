import { expect, it, vi } from "vitest";
import { generationSessionEvents } from "../src/server/jobs/generation-session";
import { Store } from "../src/server/jobs/store";
import type { JobState } from "../src/shared/domains/common";

it("persists only the explicitly owned generation stream before a turn can be interrupted", () => {
  const job: JobState = {
    id: "job",
    runId: "project",
    candidateId: "direction",
    kind: "full",
    phase: "generating",
    workspace: "/unused",
    model: "example",
    sessionId: "previous",
  };
  const record = vi.fn(),
    update = vi.fn();
  const build = generationSessionEvents(job, record, update);
  build({ type: "session", message: "Build opened", data: { sessionId: "builder" } });
  expect(job.sessionId).toBe("builder");
  expect(update).toHaveBeenCalledOnce();
  record({
    type: "session",
    message: "Helper opened",
    data: { sessionId: "helper", purpose: "Render cache change summary" },
  });
  expect(job.sessionId).toBe("builder");
  build({ type: "usage", message: "Done", data: { sessionId: "irrelevant" } });
  expect(job.sessionId).toBe("builder");
});

it("recovers the newest main build session and refuses a known helper fallback", () => {
  const store = new Store(":memory:");
  try {
    store.emit("project", "session", "Main", "job", {
      purpose: "full video generation",
      sessionId: "builder",
    });
    store.emit("project", "session", "Helper", "job", {
      purpose: "Render cache change summary",
      sessionId: "helper",
    });
    expect(store.generationSessionId("project", "job", "helper")).toBe("builder");
    store.emit("project", "session", "Main repair", "job", {
      purpose: "layout correction",
      correctionTier: "main",
      sessionId: "repaired-builder",
    });
    expect(store.generationSessionId("project", "job", "helper")).toBe("repaired-builder");
    store.emit("project", "session", "Other direction", "other", {
      purpose: "full video generation",
      sessionId: "other-builder",
    });
    expect(store.generationSessionId("project", "job", "helper")).toBe("repaired-builder");
    store.emit("project", "session", "Only helper", "broken", {
      purpose: "Video copy translation",
      sessionId: "translation",
    });
    expect(store.generationSessionId("project", "broken", "translation")).toBeUndefined();
    expect(store.generationSessionId("project", "legacy", "legacy-session")).toBe("legacy-session");
  } finally {
    store.close();
  }
});
