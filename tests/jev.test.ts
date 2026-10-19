import { afterEach, expect, it, vi } from "vitest";
import { noul } from "@typesafe-ai/sdk";
import { jevClient, jevModel } from "../src/server/agents/jev";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  ["primary-placeholder", "fallback-placeholder", "primary-placeholder"],
  ["", "fallback-placeholder", "fallback-placeholder"],
])(
  "uses the configured JEV credential with primary-key precedence",
  async (primary, fallback, expected) => {
    vi.stubEnv("TYPESAFE_API_KEY", primary);
    vi.stubEnv("JEV_API_KEY", fallback);
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
  },
);

it("fails before making a request when neither JEV key is configured", () => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("JEV_API_KEY", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(() => jevClient()).toThrow("Jev ranking is not configured");
  expect(fetch).not.toHaveBeenCalled();
});
