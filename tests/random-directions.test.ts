import { expect, it, vi, afterEach } from "vitest";
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  randomInt: vi.fn(),
}));
import { randomInt } from "node:crypto";
import { randomDirections } from "../src/server/jobs/random-directions";
import { loadCatalog } from "../src/server/catalog/catalog";
import { RequestSchema } from "../src/shared/contracts";
import { projectSettingsDraft } from "../src/client/lib/project-settings";

afterEach(() => vi.resetAllMocks());

it("makes every catalog entry reachable as a primary with equal draw bounds, without metric filtering", async () => {
  const { styles } = await loadCatalog();
  for (let index = 0; index < styles.length; index++) {
    vi.mocked(randomInt)
      .mockReset()
      .mockImplementation(((min: number, max?: number) =>
        max === undefined ? index : min) as typeof randomInt);
    const draw = randomDirections(styles, 1, { min: 1, max: 1 });
    expect(draw.candidates[0].primaryStyleId).toBe(styles[index].id);
    expect(randomInt).toHaveBeenNthCalledWith(1, styles.length);
    expect(draw.candidates[0]).toMatchObject({ score: 0, confidence: 0, dimensions: {} });
  }
});
it("draws primary identities and supporting contributions without replacement, up to the duration limit", async () => {
  const { styles } = await loadCatalog();
  vi.mocked(randomInt).mockImplementation(((min: number, max?: number) =>
    max === undefined ? min - 1 : max - 1) as typeof randomInt);
  const draw = randomDirections(styles, 5, { min: 2, max: 6 });
  expect(new Set(draw.candidates.map((item) => item.primaryStyleId)).size).toBe(5);
  for (const item of draw.candidates) {
    const ids = [item.primaryStyleId, ...item.supportingStyleIds];
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids.every((id) => styles.some((style) => style.id === id))).toBe(true);
  }
});
it("rejects invalid draws and conflicting explicit selections, and preserves the saved approach", async () => {
  const { styles } = await loadCatalog();
  expect(() => randomDirections(styles, 0, { min: 1, max: 3 })).toThrow();
  expect(() => randomDirections(styles.slice(0, 1), 2, { min: 1, max: 3 })).toThrow();
  for (const outputType of ["video", "page"]) {
    const request = {
      instructions: "Introduce an original idea",
      outputType,
      preference: "random",
    };
    expect(projectSettingsDraft(RequestSchema.parse(request)).preference).toBe("random");
    expect(RequestSchema.safeParse({ ...request, pinnedStyleId: "style-001" }).success).toBe(false);
    expect(
      RequestSchema.safeParse({ ...request, selectedStyleIds: ["style-001"], candidateCount: 0 })
        .success,
    ).toBe(false);
  }
});
