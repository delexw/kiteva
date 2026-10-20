import { z } from "zod";
import type { ComponentRegistry } from "./types";

/** Same upstream client for MCP tools and JEV evidence; no installation or code execution. */
export function createComponentRegistryClient(options: {
  registry: ComponentRegistry;
  signal: AbortSignal;
  fetch?: typeof fetch;
}) {
  const { registry } = options;
  const summary = z.object({ name: registry.itemName, description: z.string().optional() });
  const catalogItem = summary.extend({
    title: z.string().optional(),
    type: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    registryDependencies: z.array(z.string()).optional(),
  });
  const itemSchema = summary
    .extend({
      dependencies: z.array(z.string()).default([]),
      registryDependencies: z.array(z.string()).default([]),
      files: z.array(z.object({ path: z.string(), content: z.string() }).passthrough()).min(1),
    })
    .passthrough();
  const request = options.fetch || fetch;
  const responses = new Map<string, Promise<string>>();
  async function download(url: string) {
    if (!responses.has(url)) {
      const pending = (async () => {
        const response = await request(url, {
          redirect: "error",
          signal: AbortSignal.any([options.signal, AbortSignal.timeout(30000)]),
        });
        if (!response.ok)
          throw Error(`${registry.displayName} registry returned HTTP ${response.status}`);
        return response.text();
      })();
      responses.set(url, pending);
      void pending.catch(() => responses.delete(url));
    }
    return responses.get(url)!;
  }
  return {
    catalog: async () =>
      z
        .object({ items: z.array(catalogItem) })
        .parse(JSON.parse(await download(`${registry.url}registry.json`))),
    readItem: async (name: string) => {
      registry.itemName.parse(name);
      const source = `${registry.url}${name}.json`;
      const item = itemSchema.parse(JSON.parse(await download(source)));
      if (item.name !== name) throw Error("Registry component identity mismatch");
      return { item, source };
    },
    license: () => download(registry.licenseUrl),
  };
}
