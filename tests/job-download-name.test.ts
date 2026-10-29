import { expect, it } from "vitest";
import { jobDownloadBasename } from "../src/shared/job-download-name";
import type { GenerationJob } from "../src/shared/contracts";
const job: GenerationJob = {
  id: "revision",
  runId: "project",
  candidateId: "direction",
  kind: "full",
  phase: "ready",
  model: "example",
  workspace: "/tmp/example",
  duration: 30,
  version: 7,
};
it.each([
  ["Channel Surf", "channel-surf-v7"],
  ["  Café / News: Demo!  ", "cafe-news-demo-v7"],
  ["知识讲解", "知识讲解-v7"],
  ["../../Demo\r\nInjected", "demo-injected-v7"],
])("normalizes %s while preserving the actual version", (title, expected) => {
  const run = { candidates: [{ id: "direction", displayTitle: title }], jobs: [job] };
  expect(jobDownloadBasename(run, job)).toBe(expected);
});
it("uses the same legacy revision ordering and missing-title fallback as cards", () => {
  const first = { ...job, id: "first", version: undefined };
  const second = { ...job, id: "second", version: undefined };
  const run = { candidates: [{ id: "direction", displayTitle: "" }], jobs: [first, second] };
  expect(jobDownloadBasename(run, second)).toBe("direction-1-v2");
  expect(jobDownloadBasename({ candidates: [], jobs: [job] }, job)).toBe("your-direction-v7");
});
