import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { expect, it, vi } from "vitest";

it("does not inherit real provider credentials", () => {
  for (const key of Object.values(credentialEnvironmentVariables))
    expect(process.env[key]).toBe("");
});

it("rejects real external API calls before making a request", async () => {
  await expect(fetch("https://example.com/api")).rejects.toThrow(
    "Tests must not call real external APIs",
  );
});

it("allows an explicitly mocked provider response without network access", async () => {
  const transport = vi.fn(async () => new Response('{"result":"fixture"}'));
  vi.stubGlobal("fetch", transport);
  expect(await (await fetch("https://example.com/api")).json()).toEqual({ result: "fixture" });
  expect(transport).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("restores the external API block after another test removes its mock", async () => {
  await expect(fetch("https://example.com/api")).rejects.toThrow(
    "Tests must not call real external APIs",
  );
});
