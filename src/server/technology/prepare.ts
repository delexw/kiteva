import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, type BuildOptions } from "esbuild";
import type { PreparedTechnology } from "../../shared/technology-capabilities";

import { technologyEnvironment } from "./availability";

const localBrowserBundle: BuildOptions = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  metafile: true,
  logLevel: "silent",
  // Browser-oriented CommonJS packages may use the conventional global alias.
  define: { global: "globalThis", "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
    ".png": "file",
    ".jpg": "file",
    ".svg": "file",
    ".wasm": "file",
  },
  plugins: [
    {
      name: "local-technology-only",
      setup(builder) {
        builder.onResolve({ filter: /^(?:https?:)?\/\// }, () => ({
          errors: [{ text: "Remote dependencies are unavailable. Use installed local packages." }],
        }));
      },
    },
  ],
};

function projectBrowserBundle(root: string): BuildOptions {
  return {
    ...localBrowserBundle,
    plugins: [
      ...localBrowserBundle.plugins!,
      {
        name: "project-runtime-boundary",
        setup(builder) {
          builder.onLoad({ filter: /.*/ }, async (args) => {
            const file = await realpath(args.path);
            const boundary = await realpath(root);
            if (!file.startsWith(boundary + path.sep))
              return {
                errors: [{ text: "Dependency resolved outside its isolated project runtime" }],
              };
            return undefined;
          });
        },
      },
    ],
  };
}

/** Bundle a chosen package from a model-prepared project runtime; never install dependencies. */
export async function prepareTechnology(
  id: string,
  workspace: string,
  signal: AbortSignal,
  sourceRoot?: string,
): Promise<PreparedTechnology> {
  signal.throwIfAborted();
  const catalog = await technologyEnvironment(sourceRoot).inspect(id);
  if (!catalog.entry)
    throw Error(
      "This operation bundles browser packages only. Use the model-prepared executable or environment for Node, Python and other offline tools.",
    );
  const root = sourceRoot ?? workspace;
  const availability = await technologyEnvironment(root).inspect(id);
  if (availability.status !== "available" || !availability.entry)
    throw Error(`${availability.name}: ${availability.guidance}`);
  const directory = await realpath(workspace);
  const output = await mkdtemp(path.join(directory, `technology-${id}-`));
  const relative = (file: string) => path.relative(directory, file).split(path.sep).join("/");
  try {
    const result = await build({
      stdin: {
        contents: `import * as technology from ${JSON.stringify(availability.entry)}; export { technology };`,
        resolveDir: root,
        sourcefile: `${id}.entry.js`,
      },
      ...projectBrowserBundle(root),
      format: "esm",
      outfile: path.join(output, "index.js"),
    });
    signal.throwIfAborted();
    const outputs = Object.keys(result.metafile!.outputs).map((file) => path.resolve(file));
    const packages = [
      ...new Set(
        Object.keys(result.metafile!.inputs).flatMap((input) => {
          const local = input.split("node_modules/").at(-1)!;
          if (local === input) return [];
          return [
            local
              .split("/")
              .slice(0, local.startsWith("@") ? 2 : 1)
              .join("/"),
          ];
        }),
      ),
    ].sort();
    const prepared: PreparedTechnology = {
      id,
      directory: relative(output),
      modulePath: relative(path.join(output, "index.js")),
      cssPaths: outputs.filter((file) => file.endsWith(".css")).map(relative),
      assetPaths: outputs.filter((file) => !/\.(?:js|css)$/.test(file)).map(relative),
      importStatement: `import { technology } from "./${relative(path.join(output, "index.js"))}";`,
      packages,
      guidance:
        "Local browser bundle compiled successfully; this is not proof that the composition uses it or that every API works. Import the returned module from a module script (adjust the relative path for nested shots). The technology export is the package namespace; inspect its actual exports, including default for CommonJS libraries. Load every returned CSS file and retain its local assets. Import any additional package stylesheet through prepare_technology_stylesheet. Follow the canonical technology lifecycle, licensing and renderer-specific time/seek guidance. Choose and verify the implementation yourself; preparing a library does not require using it.",
    };
    await writeFile(
      path.join(output, "technology.json"),
      JSON.stringify({ ...prepared, version: availability.version }, null, 2),
    );
    return prepared;
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

/** Stylesheets have their own package subpaths; accept only files belonging to an installed catalog package. */
export async function prepareTechnologyStylesheet(
  id: string,
  stylesheet: string,
  workspace: string,
  signal: AbortSignal,
  sourceRoot?: string,
) {
  const root = sourceRoot ?? workspace;
  const availability = await technologyEnvironment(root).inspect(id);
  if (!availability.entry || availability.status !== "available" || !availability.package)
    throw Error("Choose an available browser technology with an installed package.");
  if (
    !stylesheet.endsWith(".css") ||
    path.isAbsolute(stylesheet) ||
    stylesheet.split(/[\\/]/).includes("..")
  )
    throw Error("Use a package-relative CSS path, without parent traversal.");
  const packageRoot = await realpath(path.join(root, "node_modules", availability.package));
  const source = await realpath(path.join(packageRoot, stylesheet));
  if (!source.startsWith(packageRoot + path.sep))
    throw Error("Stylesheet must remain inside its catalog package.");
  signal.throwIfAborted();
  const output = await mkdtemp(path.join(await realpath(workspace), `technology-${id}-css-`));
  try {
    const result = await build({
      ...projectBrowserBundle(root),
      entryPoints: [source],
      outdir: output,
    });
    signal.throwIfAborted();
    const base = await realpath(workspace);
    const files = Object.keys(result.metafile!.outputs).map((file) =>
      path.relative(base, path.resolve(file)).split(path.sep).join("/"),
    );
    return {
      id,
      directory: path.relative(base, output),
      cssPaths: files.filter((file) => file.endsWith(".css")),
      assetPaths: files.filter((file) => !file.endsWith(".css")),
    };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
