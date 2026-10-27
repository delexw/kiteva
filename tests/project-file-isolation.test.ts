import { expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { command, isolatedCommand } from "../src/server/runtime/process";
import {
  projectDirectory,
  projectRuntimeFiles,
  projectRuntimeEnvironment,
} from "../src/server/runtime/project-files";
import { dataRoot } from "../src/server/runtime/config";
import { runMultiplane, multiplaneCli } from "../src/server/rendering/multiplane";

it("keeps SDK sessions stable across jobs in one project and separates other projects", () => {
  const root = path.join(dataRoot, "runs");
  const preview = path.join(root, "project-a", "preview");
  const full = path.join(root, "project-a", "full");
  const other = path.join(root, "project-b", "preview");
  expect(projectDirectory(preview)).toBe(path.join(root, "project-a"));
  expect(projectRuntimeFiles(preview, "agent")).toEqual(projectRuntimeFiles(full, "agent"));
  expect(projectRuntimeFiles(other, "agent").home).not.toBe(
    projectRuntimeFiles(preview, "agent").home,
  );
  expect(projectRuntimeFiles(preview, "render").home).not.toBe(
    projectRuntimeFiles(full, "render").home,
  );
  expect(projectDirectory(path.join(dataRoot, "runs-other", "project-a"))).toBe(
    path.join(dataRoot, "runs-other", "project-a"),
  );
  expect(projectRuntimeEnvironment(preview, "render").MAC_CHROMIUM_TMPDIR).toBe(
    projectRuntimeFiles(preview, "render").tmp,
  );
});

it.skipIf(process.platform !== "darwin")(
  "launches Multiplane Chromium concurrently in deep project-local renderer directories",
  async () => {
    const root = await mkdtemp(path.join(dataRoot, "runtime", "multiplane-isolation-"));
    const workspaces = ["a", "b"].map((name) =>
      path.join(root, `project-${name}-${"x".repeat(30)}`, "preview-job"),
    );
    try {
      await Promise.all(workspaces.map((workspace) => mkdir(workspace, { recursive: true })));
      const results = await Promise.allSettled(
        workspaces.map((workspace) =>
          runMultiplane(
            "doctor",
            [multiplaneCli, "doctor", "--json"],
            workspace,
            AbortSignal.timeout(30000),
            () => {},
            30000,
          ),
        ),
      );
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
        expect(result.value.ok).toBe(true);
        expect(result.value.data?.checks).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "browser", ok: true })]),
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  40000,
);

it("runs simultaneous tools with identical home/cache/temp filenames without cross-project overwrites", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-files-"));
  const projects = [path.join(root, "a"), path.join(root, "b")];
  try {
    await Promise.all(projects.map((p) => mkdir(p)));
    const script = `const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
      const value=process.argv[1];const vars=['HOME','TMPDIR','TEMP','TMP','XDG_CACHE_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','APPDATA','LOCALAPPDATA','npm_config_cache','PIP_CACHE_DIR','UV_CACHE_DIR'];
      for(const key of vars){fs.mkdirSync(process.env[key],{recursive:true});fs.writeFileSync(path.join(process.env[key],'same-name'),value)}
      console.log(JSON.stringify({home:os.homedir(),tmp:os.tmpdir()}));`;
    const results = await Promise.all(
      projects.map((p, i) =>
        command(process.execPath, ["-e", script, String(i)], p, new AbortController().signal),
      ),
    );
    for (const [i, p] of projects.entries()) {
      const env = projectRuntimeEnvironment(p, "tools");
      for (const dir of new Set(Object.values(env)))
        expect(await readFile(path.join(dir, "same-name"), "utf8")).toBe(String(i));
      expect(JSON.parse(results[i])).toEqual({ home: env.HOME, tmp: env.TMPDIR });
    }
    await rm(projects[0], { recursive: true, force: true });
    expect(
      await readFile(
        path.join(projectRuntimeFiles(projects[1], "tools").home, "same-name"),
        "utf8",
      ),
    ).toBe("1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform !== "darwin")(
  "allows native renderer home/temp writes but rejects shared-temp and sibling-project writes",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "render-files-"));
    const first = path.join(root, "a"),
      second = path.join(root, "b");
    const hostTmpFile = path.join(root, "host-tmp-marker");
    try {
      await Promise.all([mkdir(first), mkdir(second)]);
      const code = `const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
      const env={home:os.homedir(),tmp:os.tmpdir()};
      fs.writeFileSync(path.join(env.home,'same-name'),'home');fs.writeFileSync(path.join(env.tmp,'same-name'),'temp');
      const denied=process.argv.slice(1).map(file=>{try{fs.writeFileSync(file,'forbidden');return false}catch{return true}});
      console.log(JSON.stringify({...env,denied}));`;
      const output = await isolatedCommand(
        process.execPath,
        ["-e", code, path.join(second, "marker"), hostTmpFile],
        first,
        new AbortController().signal,
      );
      expect(JSON.parse(output)).toEqual({
        home: projectRuntimeFiles(first, "render").home,
        tmp: projectRuntimeFiles(first, "render").tmp,
        denied: [true, true],
      });
      await expect(access(hostTmpFile)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
