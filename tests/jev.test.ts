import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { afterEach, expect, it, vi } from "vitest";
import { noul } from "@typesafe-ai/sdk";
import { jevClient, jevModel } from "../src/server/jev/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("uses the configured JEV credential with the native SDK", async () => {
  const expected = "test-placeholder";
  vi.stubEnv(credentialEnvironmentVariables.typesafeApiKey, expected);
  const fetch = vi.fn(async (_url, options) => {
    expect(new Headers(options.headers).get("authorization")).toBe(`Bearer ${expected}`);
    expect(JSON.parse(options.body).model).toBe("jev-1.14.0");
    return new Response(
      JSON.stringify({
        model: "jev-1.14.0",
        answers: { valid: { type: "noul", noul: 1 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const result = await jevClient().systemOne({
    model: jevModel,
    state: "A generic request",
    questions: { valid: noul("Is the request present?") },
  });
  expect(result.model).toBe(jevModel);
  expect(fetch).toHaveBeenCalledOnce();
});

it("fails before making a request when the JEV credential is not configured", () => {
  vi.stubEnv(credentialEnvironmentVariables.typesafeApiKey, "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(() => jevClient()).toThrow("JEV decisions are not configured");
  expect(fetch).not.toHaveBeenCalled();
});
