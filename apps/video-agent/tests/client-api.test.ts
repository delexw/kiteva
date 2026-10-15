import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/client/lib/api";

afterEach(() => vi.unstubAllGlobals());

it.each(["GET", "DELETE"])("does not declare an absent %s body as JSON", async (method) => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(api("/api/runs/example", { method })).resolves.toEqual({ ok: true });
  expect(fetchMock.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
});

it("declares JSON bodies and preserves Headers instances", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/api/runs", {
    method: "POST",
    body: JSON.stringify({ instructions: "Explain an idea" }),
    headers: new Headers({ "X-Request-ID": "example" }),
  });
  const headers = fetchMock.mock.calls[0][1].headers;
  expect(headers.get("Content-Type")).toBe("application/json");
  expect(headers.get("X-Request-ID")).toBe("example");
});

it("lets the browser set multipart boundaries and preserves explicit content types", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  await api("/api/uploads", { method: "POST", body: new FormData() });
  expect(fetchMock.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
  await api("/api/example", {
    method: "POST",
    body: "example",
    headers: [["Content-Type", "text/plain"]],
  });
  expect(fetchMock.mock.calls[1][1].headers.get("Content-Type")).toBe("text/plain");
});

it("reports server errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ code: "PROJECT_ACTIVE", error: "Project is active" }, { status: 409 }),
      ),
  );
  await expect(api("/api/runs/example", { method: "DELETE" })).rejects.toThrow("Project is active");
});

it("preserves a stable code regardless of diagnostic wording", async () => {
  for (const diagnostic of ["Run not found", "Changed server diagnostic"]) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: "PROJECT_NOT_FOUND", error: diagnostic }, { status: 404 }),
        ),
    );
    await expect(api("/api/runs/example")).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      statusCode: 404,
    });
  }
});
it("does not treat a legacy error message as a code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "Run not found" }, { status: 404 })),
  );
  await expect(api("/api/runs/example")).rejects.toMatchObject({ code: "REQUEST_FAILED" });
});
