import Fastify from "fastify";
import { expect, it } from "vitest";
import { z } from "zod";
import { RequestSchema } from "../src/shared/contracts";
import { apiErrorHandler } from "../src/server/runtime/api-errors";

it("returns readable selection validation instead of a raw issue array", async () => {
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  app.post("/request", async (request) => RequestSchema.parse(request.body));
  try {
    const response = await app.inject({
      method: "POST",
      url: "/request",
      payload: {
        instructions: "A visual story",
        candidateCount: 0,
        selectedStyleIds: [],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "INVALID_REQUEST",
      error: "Select Motion Graphics for zero directions, or request 1–5 generated directions.",
    });
  } finally {
    await app.close();
  }
});

it("deduplicates validation messages and still redacts secrets", async () => {
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  app.get("/invalid", async () => {
    throw new z.ZodError([
      { code: "custom", path: ["first"], message: "Check sk-example1234567890." },
      { code: "custom", path: ["second"], message: "Check sk-example1234567890." },
    ]);
  });
  try {
    const response = await app.inject("/invalid");
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "INVALID_REQUEST", error: "Check [redacted]." });
  } finally {
    await app.close();
  }
});
