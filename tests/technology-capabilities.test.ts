import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { technologyEnvironment } from "../src/server/technology/availability";
import { prepareTechnology, prepareTechnologyStylesheet } from "../src/server/technology/prepare";
import { technologyPool } from "../src/shared/technology-pool";

const folders: string[] = [];
const signal = () => new AbortController().signal;
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function folder() {
  const result = await mkdtemp(path.join(os.tmpdir(), "technology-capability-"));
  folders.push(result);
  return result;
}
async function fixture(source = "export const version = 'fixture';") {
  const root = await folder();
  const pkg = path.join(root, "node_modules/gsap");
  await mkdir(pkg, { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}");
  await writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "gsap", version: "1.0.0", type: "module", main: "index.js" }),
  );
  await writeFile(path.join(pkg, "index.js"), source);
  return { root, pkg };
}
it("classifies every catalog entry without claiming asset formats or algorithms are installed tools", async () => {
  const root = await folder();
  const environment = technologyEnvironment(root, { PATH: "" });
  const rows = await Promise.all(Object.keys(technologyPool).map((id) => environment.inspect(id)));
  expect(rows).toHaveLength(Object.keys(technologyPool).length);
  expect(rows.find((row) => row.id === "svg")).toMatchObject({
    category: "native",
    status: "available",
  });
  expect(rows.find((row) => row.id === "layered_png_assets")).toMatchObject({
    category: "asset",
    status: "requires_assets",
  });
  expect(rows.find((row) => row.id === "extended_position_based_dynamics_xpbd")).toMatchObject({
    category: "technique",
    status: "requires_implementation",
  });
  expect(rows.find((row) => row.id === "gsap")).toMatchObject({
    status: "unavailable",
    package: "gsap",
  });
  await expect(environment.inspect("../../package.json")).rejects.toThrow("Unknown technology");
});
it("reports exact browser entry points and keeps host-only packages out of browser preparation", async () => {
  const env = technologyEnvironment();
  expect(await env.inspect("gsap_drawsvgplugin")).toMatchObject({
    status: "unavailable",
    entry: "gsap/DrawSVGPlugin",
  });
  expect(await env.inspect("unrealbloompass")).toMatchObject({
    entry: "three/addons/postprocessing/UnrealBloomPass.js",
  });
  expect(await env.inspect("sharp")).toMatchObject({
    category: "host_tool",
    status: "unavailable",
  });
  expect(await env.inspect("sharp")).not.toHaveProperty("entry");
  await expect(prepareTechnology("sharp", await folder(), signal())).rejects.toThrow(
    "browser packages only",
  );
});
it("honors an explicit missing host executable without quietly selecting another installation", async () => {
  const env = technologyEnvironment(undefined, {
    PATH: process.env.PATH,
    KITEVA_TECHNOLOGY_PYTHON: "/nonexistent/example-python",
  });
  expect(await env.inspect("python")).toMatchObject({ status: "unavailable" });
  expect(await env.inspect("numpy")).toMatchObject({ status: "unavailable" });
});
it("bundles only the model-chosen package into an isolated project-local module with provenance", async () => {
  const { root } = await fixture();
  const workspace = await folder();
  await writeFile(path.join(workspace, "shot.html"), "original");
  const first = await prepareTechnology("gsap", workspace, signal(), root);
  const second = await prepareTechnology("gsap", workspace, signal(), root);
  expect(first.modulePath).not.toBe(second.modulePath);
  expect(first.packages).toEqual(["gsap"]);
  expect(first.importStatement).toContain(first.modulePath);
  expect(await readFile(path.join(workspace, first.modulePath), "utf8")).toContain("fixture");
  expect(
    JSON.parse(await readFile(path.join(workspace, first.directory, "technology.json"), "utf8")),
  ).toMatchObject({ id: "gsap", version: "1.0.0" });
  expect(await readFile(path.join(workspace, "shot.html"), "utf8")).toBe("original");
});
it("rejects missing packages, remote imports and Node-only code without leaving broken output", async () => {
  const workspace = await folder();
  const missing = await folder();
  await expect(prepareTechnology("gsap", workspace, signal(), missing)).rejects.toThrow(
    "project-local environment",
  );
  for (const source of [
    "import 'https://example.com/library.js';",
    "import fs from 'node:fs'; export {fs};",
  ]) {
    const { root } = await fixture(source);
    await expect(prepareTechnology("gsap", workspace, signal(), root)).rejects.toThrow();
    expect(await readdir(workspace)).toEqual([]);
  }
});
it("prepares CSS and referenced local assets while rejecting traversal and symlink escape", async () => {
  const { root, pkg } = await fixture();
  const workspace = await folder();
  await writeFile(path.join(pkg, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(path.join(pkg, "style.css"), "body{background:url(./icon.svg)}");
  const css = await prepareTechnologyStylesheet("gsap", "style.css", workspace, signal(), root);
  expect(css.cssPaths).toHaveLength(1);
  expect(css.assetPaths).toHaveLength(1);
  expect(await readFile(path.join(workspace, css.cssPaths[0]), "utf8")).toContain(".svg");
  await expect(
    prepareTechnologyStylesheet("gsap", "../outside.css", workspace, signal(), root),
  ).rejects.toThrow("parent traversal");
  const outside = path.join(await folder(), "outside.css");
  await writeFile(outside, "body{}");
  await symlink(outside, path.join(pkg, "escape.css"));
  await expect(
    prepareTechnologyStylesheet("gsap", "escape.css", workspace, signal(), root),
  ).rejects.toThrow("inside");
});
it("cancels before writing any technology output", async () => {
  const workspace = await folder();
  const controller = new AbortController();
  controller.abort();
  await expect(prepareTechnology("gsap", workspace, controller.signal)).rejects.toThrow();
  expect(await readdir(workspace)).toEqual([]);
});

it("does not borrow packages from ancestors or symlinks into another environment", async () => {
  const { root, pkg } = await fixture();
  const nested = path.join(root, "project");
  await mkdir(nested);
  await writeFile(path.join(nested, "package.json"), "{}");
  expect(await technologyEnvironment(nested).inspect("gsap")).toMatchObject({
    status: "unavailable",
  });
  await mkdir(path.join(nested, "node_modules"));
  await symlink(pkg, path.join(nested, "node_modules/gsap"), "junction");
  expect(await technologyEnvironment(nested).inspect("gsap")).toMatchObject({
    status: "unavailable",
  });
});

it("rejects transitive imports outside the selected runtime and cleans failed bundles", async () => {
  const { root, pkg } = await fixture("import {name} from 'outside'; export {name};");
  const outside = path.join(await folder(), "index.js");
  await writeFile(outside, "export const name = 'outside';");
  await mkdir(path.join(root, "node_modules/outside"));
  await writeFile(
    path.join(root, "node_modules/outside/package.json"),
    JSON.stringify({ name: "outside", main: "index.js" }),
  );
  await symlink(outside, path.join(root, "node_modules/outside/index.js"));
  const workspace = await folder();
  await expect(prepareTechnology("gsap", workspace, signal(), root)).rejects.toThrow(
    "outside its isolated project runtime",
  );
  expect(await readdir(workspace)).toEqual([]);
  expect(await readFile(path.join(pkg, "index.js"), "utf8")).toContain("outside");
});

it("rechecks availability after model setup without a persistent installed snapshot", async () => {
  const root = await folder();
  const environment = technologyEnvironment(root);
  expect(await environment.inspect("gsap")).toMatchObject({ status: "unavailable" });
  const pkg = path.join(root, "node_modules/gsap");
  await mkdir(pkg, { recursive: true });
  await writeFile(path.join(pkg, "package.json"), '{"name":"gsap","version":"2.0.0"}');
  expect(await environment.inspect("gsap")).toMatchObject({
    status: "available",
    version: "2.0.0",
  });
});

it("does not mistake an executable directory for an installed command", async () => {
  const directory = await folder();
  expect(
    await technologyEnvironment(undefined, { KITEVA_TECHNOLOGY_PYTHON: directory }).inspect(
      "python",
    ),
  ).toMatchObject({ status: "unavailable" });
});
