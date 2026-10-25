import { expect, it } from "vitest";
import { commandActivity } from "../src/server/agents/command-activity";

it.each([
  "npm install matter-js",
  "/bin/zsh -lc 'cd runtime && npm install matter-js'",
  "cd runtime && npm ci",
  "pnpm add pixi.js",
  "yarn add gsap",
  "bun install",
  ".venv/bin/pip install Pillow",
  "python3.15 -m pip install Pillow",
  "uv pip install numpy",
  "uv sync",
  "cargo install tool",
  "npm_config_cache=.cache npm install",
])("recognizes model-owned installation: %s", (command) => {
  expect(commandActivity(command)).toBe("dependencies");
});
it.each(["esbuild input.js --bundle", "npx esbuild input.js --bundle", "vite build"])(
  "recognizes explicit bundling: %s",
  (command) => expect(commandActivity(command)).toBe("bundling"),
);
it.each([
  "echo 'npm install matter-js'",
  "node setup.js",
  "npm list",
  "python --version",
  "echo 'unterminated",
])("does not guess from prose or unknown scripts: %s", (command) =>
  expect(commandActivity(command)).toBeUndefined(),
);

it.each([
  ["cat install.md", "reading"],
  ["/bin/zsh -lc 'rg --files assets'", "reading"],
  ["cp input.png assets/image.png", "editing"],
  ["node --check main.js", "checking"],
  ["npm run test", "checking"],
  ["cat package.json && npm install matter-js", "dependencies"],
  ["ls assets && npx esbuild main.js --bundle", "bundling"],
])("classifies equivalent shell work: %s", (command, expected) => {
  expect(commandActivity(command)).toBe(expected);
});
