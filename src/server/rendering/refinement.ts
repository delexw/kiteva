import { cp, lstat, rm } from "node:fs/promises";
import path from "node:path";
import type { RendererMetadata } from "./metadata";
import { hyperframesMetadata } from "./hyperframes/metadata";
import { multiplaneMetadata } from "./multiplane/metadata";
import { remotionMetadata } from "./remotion/metadata";

const renderers: readonly RendererMetadata[] = [
  hyperframesMetadata,
  multiplaneMetadata,
  remotionMetadata,
];

/** Dispatch provider-owned artifact policy. Inherited bytes still require native cache validation. */
export async function inheritRendererCache(source: string, destination: string, pipeline: string) {
  const renderer = renderers.find((entry) => entry.pipeline === pipeline || entry.id === pipeline);
  const inherited: string[] = [];
  for (const directory of renderer?.refinement?.cacheDirectories ?? []) {
    const target = path.join(destination, directory);
    try {
      const origin = path.join(source, directory);
      const info = await lstat(origin);
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      await cp(origin, target, {
        recursive: true,
        filter: async (file) => !(await lstat(file)).isSymbolicLink(),
      });
      inherited.push(directory);
    } catch {
      // Missing, unreadable or interrupted cache copies are an ordinary cold render.
      await rm(target, { recursive: true, force: true });
    }
  }
  return inherited;
}
