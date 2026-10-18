import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { appRoot, dataRoot, childEnvironment } from "../src/server/runtime/config";

const require = createRequire(import.meta.url);
const cli = path.join(
  path.dirname(require.resolve("@caveman-ai/cli/package.json")),
  "dist",
  "index.js",
);
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: appRoot,
  env: { ...childEnvironment(), CAVEMAN_HOME: path.join(dataRoot, "caveman") },
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
