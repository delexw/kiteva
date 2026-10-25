import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { technologyPool } from "../../shared/technology-pool";
import type { TechnologyAvailability } from "../../shared/technology-capabilities";
import { defaultPython, systemEnvironment } from "../runtime/platform";

const execute = promisify(execFile);
const browserEntries: Record<string, string> = {
  gsap_drawsvgplugin: "gsap/DrawSVGPlugin",
  gsap_morphsvgplugin: "gsap/MorphSVGPlugin",
  scrambled_text_reveal: "gsap/ScrambleTextPlugin",
  unrealbloompass: "three/addons/postprocessing/UnrealBloomPass.js",
  postprocessing: "three/addons/postprocessing/EffectComposer.js",
  gltf_scene_assembly_and_part_animation: "three/addons/loaders/GLTFLoader.js",
  raycast_object_interaction_and_camera_navigation: "three/addons/controls/OrbitControls.js",
};
const externalTools: Record<string, { command: string; application?: string }> = {
  blender: { command: "blender", application: "/Applications/Blender.app/Contents/MacOS/Blender" },
  krita: { command: "krita", application: "/Applications/krita.app/Contents/MacOS/krita" },
  aseprite: {
    command: "aseprite",
    application: "/Applications/Aseprite.app/Contents/MacOS/aseprite",
  },
  ffmpeg: { command: "ffmpeg" },
  python: { command: defaultPython() },
};
const blenderKeys = new Set(["blender", "python_bpy", "cycles", "eevee", "eevee_cycles"]);
const pythonModules: Record<string, string> = {
  pillow: "PIL",
  numpy: "numpy",
  manim: "manim",
  librosa: "librosa",
};

/** Per-request probe cache: no persistent availability snapshot can become authoritative. */
export function technologyExecutableKey(id: string) {
  if (blenderKeys.has(id)) return "blender";
  if (Object.hasOwn(pythonModules, id)) return "python";
  return Object.hasOwn(externalTools, id) ? id : undefined;
}

export function technologyEnvironment(
  root: string | undefined = undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const probes = new Map<string, Promise<string | undefined>>();
  const memo = (key: string, action: () => Promise<string | undefined>) => {
    if (!probes.has(key)) probes.set(key, action());
    return probes.get(key)!;
  };
  const executable = (key: string) =>
    memo(key, async () => {
      const tool = externalTools[key];
      const configured = env[`KITEVA_TECHNOLOGY_${key.toUpperCase()}`];
      const candidates = configured
        ? [configured]
        : [
            ...(env.PATH || "")
              .split(path.delimiter)
              .filter(Boolean)
              .map((folder) =>
                path.join(folder, tool.command + (process.platform === "win32" ? ".exe" : "")),
              ),
            ...(process.platform === "darwin" && tool.application ? [tool.application] : []),
          ];
      for (let attempt = 0; attempt < 2; attempt++)
        for (const candidate of candidates)
          try {
            await access(candidate, constants.X_OK);
            if (!(await stat(candidate)).isFile()) continue;
            return candidate;
          } catch {
            /* Try the next configured/local executable. */
          }
      return undefined;
    });
  async function inspect(id: string): Promise<TechnologyAvailability> {
    if (!Object.hasOwn(technologyPool, id))
      throw Error(`Unknown technology ID: ${id}. Use search_pool for the exact ID.`);
    const definition = technologyPool[id as keyof typeof technologyPool];
    const base = { id, name: definition.name };
    if (definition.kind === "input_asset")
      return {
        ...base,
        category: "asset",
        status: "requires_assets",
        guidance:
          "Supply or author the actual project-local assets; this entry is an asset type, not an executable tool.",
      };
    if (definition.kind === "browser_native" || definition.kind === "shader_language")
      return {
        ...base,
        category: "native",
        status: "available",
        guidance:
          "Provided by the browser, not npm. Check the actual renderer/browser context; bake unsupported live audio or interaction before video export.",
      };
    if (definition.kind === "simulation_algorithm")
      return {
        ...base,
        category: "technique",
        status: "requires_implementation",
        guidance:
          "This is an algorithm, not an installed solver. Choose and verify a concrete implementation, then bake or deterministically evaluate its states.",
      };
    if (definition.kind === "python_library") {
      const python = await executable("python");
      const module = pythonModules[id];
      const installed =
        python &&
        (await memo(`python:${module}`, async () => {
          for (let attempt = 0; attempt < 2; attempt++)
            try {
              const result = await execute(
                python,
                [
                  "-c",
                  `import importlib; m=importlib.import_module(${JSON.stringify(module)}); print(getattr(m,'__version__','installed'))`,
                ],
                { timeout: 10000, maxBuffer: 4096, env: systemEnvironment(env) },
              );
              return result.stdout.trim();
            } catch {
              /* Retry before reporting an unavailable module. */
            }
          return undefined;
        }));
      return {
        ...base,
        category: "host_tool",
        status: installed ? "available" : "unavailable",
        package: definition.package || undefined,
        ...(python ? { executable: python } : {}),
        ...(installed ? { version: installed } : {}),
        guidance: installed
          ? "Use this exact Python executable for offline preparation and save resulting assets inside the project. Do not import this module into the browser."
          : "Prepare the required Python package in a project environment, then inspect using its project-relative pythonExecutable. Read its documentation with Skill(anysearch) as needed.",
      };
    }
    if (blenderKeys.has(id) || Object.hasOwn(externalTools, id)) {
      const toolKey = blenderKeys.has(id) ? "blender" : id;
      const command = await executable(toolKey);
      return {
        ...base,
        category: "host_tool",
        status: command ? "available" : "unavailable",
        ...(command ? { executable: command } : {}),
        guidance: command
          ? "Executable discovered locally; verify the operation before claiming it works. Use bundled bpy/render engines inside Blender, not ordinary Python. Export offline results into the project. A discovered executable is not a completed render test."
          : `Executable not found after two checks. Configure KITEVA_TECHNOLOGY_${toolKey.toUpperCase()} with its absolute executable path; prepare it with documented project-local commands or report missing platform prerequisites.`,
      };
    }
    const packageName = definition.package;
    if (!packageName) throw Error(`No availability strategy for ${id}`);
    let version: string | undefined;
    let license: string | undefined;
    try {
      if (!root) throw Error("No prepared project runtime");
      const packageRoot = await realpath(path.join(root, "node_modules", packageName));
      if (!packageRoot.startsWith((await realpath(root)) + path.sep))
        throw Error("Package is outside the project runtime");
      const metadata = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
      version = metadata.version;
      license = typeof metadata.license === "string" ? metadata.license : undefined;
    } catch {
      /* Resolve the module independently below. */
    }
    if (!version) {
      try {
        if (!root) throw Error("No prepared project runtime");
        const resolved = await realpath(
          createRequire(path.join(root, "package.json")).resolve(packageName),
        );
        if (!resolved.startsWith((await realpath(root)) + path.sep))
          throw Error("Package is outside the project runtime");
        version = "resolved";
      } catch {
        /* Both package metadata and resolution were checked. */
      }
    }
    const hostOnly =
      /Node.js only/.test(definition.runtime) || definition.kind === "npm_cli_framework";
    const technique =
      definition.kind === "rendering_technique" || definition.kind === "bundled_library_component";
    return {
      ...base,
      category: hostOnly ? "host_tool" : technique ? "technique" : "browser_library",
      status: version ? "available" : "unavailable",
      package: packageName,
      ...(license ? { license } : {}),
      ...(version ? { version } : {}),
      ...(!hostOnly ? { entry: browserEntries[id] || packageName } : {}),
      guidance: !version
        ? "Prepare this package in a project-local environment using its documented package manager. Then inspect or bundle that runtimeDirectory. Kiteva’s package.json is not required."
        : hostOnly
          ? "Use in the host runtime or project-selected render pipeline, not as a browser import."
          : "Call prepare_technology to create a local browser module and receive import/CSS paths. Availability is not proof of scene integration. Techniques still require authored implementation; choose the tools that fit the scene and verify seeking in the selected renderer.",
    };
  }
  return { inspect };
}
