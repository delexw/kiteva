import type { HTTPRequest, Page } from "puppeteer-core";
import CachePolicy from "http-cache-semantics";
import { URLPattern } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { referenceResource, referenceResourceLimits } from "./reference-resource";
import type { BrowserCapabilityRequest } from "./reference-tool-registry";

type NetworkRequest = Extract<BrowserCapabilityRequest, { operation: "browser_network" }>;
type Resource = Awaited<ReturnType<typeof referenceResource>>;

/** Hosted response delivery needs emulation; local requests use Chrome's native network controls. */
export function createReferenceNetwork(options: {
  mode: "local" | "hosted";
  signal: AbortSignal;
  consumeBytes: (bytes: number) => void;
}) {
  const states = new WeakMap<
    Page,
    {
      offline: boolean;
      latency: number;
      download: number;
      upload: number;
      cacheEnabled: boolean;
      blocked: URLPattern[];
      cache: Map<string, { policy: CachePolicy; response: Resource }>;
    }
  >();
  function state(page: Page) {
    let value = states.get(page);
    if (!value) {
      value = {
        offline: false,
        latency: 0,
        download: -1,
        upload: -1,
        cacheEnabled: false,
        blocked: [],
        cache: new Map(),
      };
      states.set(page, value);
    }
    return value;
  }
  function checkRequest(page: Page, url: string) {
    const current = state(page);
    if (current.offline || current.blocked.some((pattern) => pattern.test(url)))
      throw Error(current.offline ? "Browser is offline" : "Request blocked by browser_network");
  }
  return {
    checkRequest,
    configure(page: Page, input: NetworkRequest) {
      const current = state(page);
      if (input.action === "offline") current.offline = Boolean(input.enabled);
      if (input.action === "throttle") {
        current.latency = input.enabled === false ? 0 : (input.latency ?? 0);
        current.download = input.enabled === false ? -1 : (input.download ?? -1);
        current.upload = input.enabled === false ? -1 : (input.upload ?? -1);
      }
      if (input.action === "cache") {
        current.cacheEnabled = Boolean(input.enabled);
        if (!current.cacheEnabled) current.cache.clear();
      }
      if (input.action === "block")
        current.blocked = (input.patterns ?? []).map(
          (pattern) => new URLPattern(pattern.includes("://") ? pattern : { pathname: pattern }),
        );
      return { offline: current.offline };
    },
    async resource(page: Page, request: HTTPRequest) {
      const current = state(page),
        url = request.url();
      checkRequest(page, url);
      const headers = request.headers(),
        method = request.method();
      const cacheKey = method + " " + url;
      const policyRequest = { url, method, headers };
      const cached = current.cacheEnabled && current.cache.get(cacheKey);
      if (cached && cached.policy.satisfiesWithoutRevalidation(policyRequest))
        return {
          ...cached.response,
          headers: cached.policy.responseHeaders() as Record<string, string>,
        };
      const response = await referenceResource(
        url,
        options.signal,
        options.mode,
        headers,
        options.consumeBytes,
      );
      const policy = new CachePolicy(
        policyRequest,
        { status: response.status, headers: response.headers },
        { shared: false },
      );
      if (current.cacheEnabled && policy.storable()) {
        current.cache.set(cacheKey, { policy, response });
        let bytes = [...current.cache.values()].reduce(
          (sum, entry) => sum + entry.response.body.length,
          0,
        );
        while (current.cache.size > 100 || bytes > referenceResourceLimits.resourceBytes) {
          const key = current.cache.keys().next().value!;
          bytes -= current.cache.get(key)!.response.body.length;
          current.cache.delete(key);
        }
      }
      // Explicit network emulation only; there is no automatic recording pause.
      const transfer = current.download > 0 ? (response.body.length / current.download) * 1000 : 0;
      const upload =
        current.upload > 0
          ? (Buffer.byteLength(JSON.stringify(headers)) / current.upload) * 1000
          : 0;
      if (current.latency + transfer + upload > 0)
        await delay(current.latency + transfer + upload, undefined, { signal: options.signal });
      return response;
    },
  };
}
