import { randomUUID } from "node:crypto";
import { Store } from "../src/server/jobs/store";
import { Workflow } from "../src/server/jobs/workflow";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  RequestSchema,
  type Run,
  type Provider,
  type GenerationJob,
} from "../src/shared/contracts";
import { dataRoot, models } from "../src/server/runtime/config";
import path from "node:path";
const provider = (process.argv[2] || "codex") as Provider;
const prepareOnly = process.argv.includes("--prepare-only");
const catalog = await loadCatalog();
const store = new Store();
const workflow = new Workflow(store, catalog);
const id = randomUUID();
const jobId = randomUUID();
const job: GenerationJob = {
  id: jobId,
  runId: id,
  candidateId: "verification",
  kind: "preview",
  phase: prepareOnly ? "interrupted" : "queued",
  workspace: path.join(dataRoot, "runs", id, jobId),
  model: models[provider],
  duration: 3,
};
const run: Run = {
  id,
  createdAt: new Date().toISOString(),
  request: RequestSchema.parse({
    instructions:
      "SDK verification: illustrate three connected blocks assembling into a coherent system",
    provider,
    candidateCount: 1,
  }),
  phase: prepareOnly ? "interrupted" : "generating",
  brief: {
    subject: prepareOnly
      ? `Preview model test · ${job.model}`
      : "SDK verification · assembling a system",
    audience: "Technical viewers",
    objective: "Demonstrate coherent spatial assembly",
    facts: [],
    exactCopy: [],
    previewBeat: "Three isometric blocks rise, settle, and connect into one coherent system.",
    assetDescriptions: ["Code-generated geometry; no external assets required"],
    constraints: [
      "No invented business claims",
      "Three.js orthographic geometry and GSAP motion; silent",
    ],
    suggestedDuration: 15,
    durationReason: "A short three-scene demonstration",
  },
  candidates: [
    {
      id: "verification",
      primaryStyleId: "style-108",
      supportingStyleIds: [],
      sceneRoles: ["Isometric geometry for block assembly"],
      rationale: "SDK verification fixture; this is not a Jev-ranked recommendation.",
      feasible: true,
      missingAssets: [],
      score: 0,
      confidence: 0,
      dimensions: {},
    },
  ],
  jobs: [job],
};
store.save(run);
let seen = 0;
store.bus.on(id, (e) => {
  if (["session", "error", "preview_ready", "repair"].includes(e.type))
    console.log(e.type, e.message.slice(0, 800));
  seen++;
});
if (!prepareOnly) await workflow.generate(run, job);
run.phase = job.phase;
store.save(run);
console.log(
  JSON.stringify({
    runId: id,
    phase: job.phase,
    events: seen,
    model: job.model,
    video: job.video,
    error: job.error,
  }),
);
store.close();
if (!prepareOnly && job.phase !== "ready") process.exitCode = 1;
