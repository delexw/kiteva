import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** A prepared isolated runtime fixture; unit tests never need registry access. */
export async function technologyRuntimeFixture(workspace: string, id: string) {
  const pkg = { name: id === "matter_js" ? "matter-js" : "gsap", version: "1.0.0" };
  const root = workspace;
  const directory = path.join(root, "node_modules", pkg.name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}");
  await writeFile(path.join(root, "ready.json"), JSON.stringify(pkg));
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ ...pkg, type: "module", main: "index.js" }),
  );
  await writeFile(
    path.join(directory, "index.js"),
    `export const name = ${JSON.stringify(pkg.name)};`,
  );
  return { root, directory, pkg };
}
