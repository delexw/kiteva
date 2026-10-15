import { type PageProduction } from "../../../shared/agents/schemas/page";
import path from "node:path";
import { readFile, copyFile } from "node:fs/promises";
import { isolatedCommand } from "../../runtime/process";
import { appRoot } from "../../runtime/config";
import type { PageGenerationJob } from "../../../shared/domains/page";
export async function validatePage(
  job: PageGenerationJob,
  production: PageProduction,
  signal: AbortSignal,
  emit: (type: string, message: string) => void,
) {
  if (production.sourceFile !== "index.html") throw Error("Page entry point must be index.html");
  await copyFile(
    path.join(appRoot, "src/browser/page/motion-runtime.js"),
    path.join(job.workspace, "motion-runtime.js"),
  );
  emit(
    "validation",
    "Checking page load, local resources, responsive layout, viewport motion lifecycle and reduced motion",
  );
  await isolatedCommand(
    process.execPath,
    [path.join(appRoot, "scripts/validate-page.mjs"), job.workspace],
    job.workspace,
    signal,
    (t) => emit("validation", t),
  );
  const report = JSON.parse(
    await readFile(path.join(job.workspace, "renders/page-validation.json"), "utf8"),
  );
  if (!report.passed) throw Error("Page validation failed");
  return { page: "index.html", poster: "renders/page.png" };
}
