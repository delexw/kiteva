import { expect, it } from "vitest";
import { z } from "zod";
import { mergeCorrection } from "../src/server/agents/correction-merge";

const schema = z.object({
  title: z.string(),
  audioFile: z.string().nullable().optional(),
  metadata: z.object({ width: z.number().positive(), height: z.number().positive() }),
  shots: z.array(z.object({ sourceFile: z.string(), duration: z.number().positive() })),
  limitations: z.array(z.string()),
});
const accepted = {
  title: "Existing film",
  audioFile: "audio/score.wav",
  metadata: { width: 1280, height: 720 },
  shots: [{ sourceFile: "first.html", duration: 3 }],
  limitations: ["Existing limitation"],
};
it("preserves every omitted field and nested property while applying only returned changes", () => {
  const updated = mergeCorrection(
    accepted,
    { title: "Revised", audioFile: undefined, metadata: { width: 1920 } },
    schema,
  );
  expect(updated).toEqual({
    ...accepted,
    title: "Revised",
    metadata: { width: 1920, height: 720 },
  });
  expect(accepted.title).toBe("Existing film");
  expect(accepted.metadata.width).toBe(1280);
});
it("replaces arrays and accepts explicit empty arrays and nullable fields", () => {
  const shots = [{ sourceFile: "replacement.html", duration: 3 }];
  expect(mergeCorrection(accepted, { shots, limitations: [], audioFile: null }, schema)).toEqual({
    ...accepted,
    shots,
    limitations: [],
    audioFile: null,
  });
  expect(accepted.shots[0].sourceFile).toBe("first.html");
});
it("validates the merged result atomically and never mutates accepted data on failure", () => {
  expect(() =>
    mergeCorrection(accepted, { metadata: { width: -1 }, audioFile: null }, schema),
  ).toThrow();
  expect(accepted.audioFile).toBe("audio/score.wav");
  expect(accepted.metadata.width).toBe(1280);
  expect(() => mergeCorrection(accepted, { title: null }, schema)).toThrow();
});
it("validates initial generation without inventing missing required fields and rejects non-object corrections", () => {
  expect(mergeCorrection(undefined, accepted, schema)).toEqual(accepted);
  expect(() => mergeCorrection(undefined, { title: "Incomplete" }, schema)).toThrow();
  expect(() => mergeCorrection(accepted, null, schema)).toThrow();
});
it("ignores prototype pollution keys through the native merge library", () => {
  const result = mergeCorrection(
    accepted,
    JSON.parse(
      '{"__proto__":{"polluted":true},"metadata":{"constructor":{"prototype":{"polluted":true}}}}',
    ),
    schema,
  );
  expect(result).toEqual(accepted);
  expect(Object.prototype).not.toHaveProperty("polluted");
});
