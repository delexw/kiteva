import { Store } from "../src/server/jobs/store";
import { Workflow } from "../src/server/jobs/workflow";
import { loadCatalog } from "../src/server/catalog/catalog";
const store = new Store();
const workflow = new Workflow(store, await loadCatalog());
const run = store
  .list()
  .find(
    (r) =>
      r.request.provider === (process.argv[2] || "codex") &&
      r.request.instructions.startsWith("SDK verification:") &&
      r.jobs.some((j) => j.kind === "preview" && j.phase === "ready"),
  );
if (!run) throw Error("Complete an SDK preview verification first");
store.bus.on(run.id, (e) => {
  if (["session", "error", "repair", "preview_ready"].includes(e.type))
    console.log(e.type, e.message.slice(0, 1000));
});
run.request.duration = 6;
const job = await workflow.full(
  run,
  run.candidates[0].id,
  "Make a six-second, three-scene demonstration: components approach, assemble, then reveal the complete connected system. Preserve the original renderer and palette. Use code-created audio only if useful; silence is acceptable.",
);
while (!["ready", "failed", "cancelled"].includes(job.phase))
  await new Promise((r) => setTimeout(r, 500));
console.log(
  JSON.stringify({
    runId: run.id,
    jobId: job.id,
    phase: job.phase,
    duration: job.duration,
    video: job.video,
    error: job.error,
  }),
);
store.close();
if (job.phase !== "ready") process.exitCode = 1;
