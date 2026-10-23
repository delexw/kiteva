import { expect, it } from "vitest";
import { z } from "zod";
import {
  CapturePresentationSchema,
  captureCursorThemes,
  captureCursorAppearance,
  AppliedCapturePresentationSchema,
  captureFramingAppearance,
  resolveCapturePresentation,
} from "../src/server/capture/presentation";

it("disables cursor smoothing while leaving optional effects to OpenScreen", () => {
  expect(CapturePresentationSchema.parse({})).toEqual({
    cursorTheme: "default",
  });
});

it("leaves zoom configuration to native editing while reading historical provenance", () => {
  const region = { startSeconds: 1, endSeconds: 3, depth: 3, focusX: 0.2, focusY: 0.7 };
  expect(CapturePresentationSchema.safeParse({ zoomRegions: [region] }).success).toBe(false);
  expect(z.toJSONSchema(CapturePresentationSchema).properties).not.toHaveProperty("zoomRegions");
  expect(
    AppliedCapturePresentationSchema.parse({ zoomRegions: [region] }).zoomRegions?.[0],
  ).toMatchObject({ ...region, focusMode: "manual" });
});

it.each([
  { framing: { padding: -1 } },
  { framing: { aspectRatio: "unsupported" } },
  { framing: { borderRadius: 100 } },
  { autoZoom: false },
  { cursorTheme: "unknown" },
  { cursorModel3d: false },
  { cursorModel3d: true },
  { cursorAlwaysArrow: true },
  { cursorSize: 0 },
  { cursorSmoothing: 0.15 },
  { cursorSmoothing: 2 },
  { cursorSmoothing: 0 },
  { cursorSmoothing: 0.6 },
  { cursorMotionBlur: -1 },
  { cursorClickBounce: 2.5 },
  { cursorClickBounce: 3 },
  { zoomRegions: [{ startSeconds: 3, endSeconds: 2, depth: 2, focusX: 0.5, focusY: 0.5 }] },
  { zoomRegions: [{ startSeconds: 1, endSeconds: 2, depth: 7, focusX: 0.5, focusY: 0.5 }] },
  { zoomRegions: [{ startSeconds: 1, endSeconds: 2, depth: 2, focusX: 2, focusY: 0.5 }] },
  {
    zoomRegions: [
      { startSeconds: 1, endSeconds: 3, depth: 2, focusX: 0.5, focusY: 0.5 },
      { startSeconds: 2, endSeconds: 4, depth: 2, focusX: 0.5, focusY: 0.5 },
    ],
  },
])("rejects unsupported or unsafe presentation controls: %j", (settings) => {
  expect(CapturePresentationSchema.safeParse(settings).success).toBe(false);
});

it.each(captureCursorThemes)("exposes the %s theme in the capture input", (cursorTheme) => {
  expect(CapturePresentationSchema.parse({ cursorTheme }).cursorTheme).toBe(cursorTheme);
});
it("retains historical 3D recording provenance", () => {
  expect(
    AppliedCapturePresentationSchema.parse({ cursorTheme: "prism-glow", cursorModel3d: true })
      .cursorModel3d,
  ).toBe(true);
});

it("advertises all seven themes in the tool JSON schema without a 3D parameter", () => {
  const schema = z.toJSONSchema(CapturePresentationSchema);
  expect(schema).toMatchObject({ properties: { cursorTheme: { enum: [...captureCursorThemes] } } });
  expect(schema.properties).not.toHaveProperty("cursorModel3d");
});

it("fixes click effects and framing without advertising them as tool inputs", () => {
  const schema = z.toJSONSchema(CapturePresentationSchema);
  for (const cursorClickBounce of [0, 2]) {
    expect(CapturePresentationSchema.safeParse({ cursorClickBounce }).success).toBe(false);
  }
  expect(CapturePresentationSchema.safeParse({ cursorClickImpact: false }).success).toBe(false);
  expect(schema.properties).not.toHaveProperty("cursorClickBounce");
  expect(schema.properties).not.toHaveProperty("cursorClickImpact");
  for (const [name, value] of Object.entries(captureFramingAppearance)) {
    expect(CapturePresentationSchema.safeParse({ framing: { [name]: value } }).success).toBe(false);
  }
  const framingSchema = z.toJSONSchema(CapturePresentationSchema.shape.framing.unwrap());
  expect(Object.keys(framingSchema.properties ?? {}).sort()).toEqual([
    "motionBlurAmount",
    "shadowIntensity",
  ]);
  expect(resolveCapturePresentation()).toMatchObject({
    cursorTheme: "default",
    cursorClickBounce: 2,
    cursorClickImpact: false,
    framing: { padding: 24, borderRadius: 0, backgroundBlur: 1, aspectRatio: "16:9" },
  });
});

it("preserves legacy click and frame settings without changing new capture policy", () => {
  const legacy = {
    cursorClickBounce: 2.5,
    cursorClickImpact: true,
    framing: { padding: 0, borderRadius: 32, backgroundBlur: 0, aspectRatio: "native" },
  };
  expect(AppliedCapturePresentationSchema.parse(legacy)).toMatchObject(legacy);
  const selected = resolveCapturePresentation({
    cursorTheme: "glass-lens",
    cursorMotionBlur: 0.3,
    framing: { shadowIntensity: 0.7, motionBlurAmount: 0.5 },
  });
  expect(selected).toMatchObject({
    cursorTheme: "glass-lens",
    cursorMotionBlur: 0.3,
    framing: { ...captureFramingAppearance, shadowIntensity: 0.7, motionBlurAmount: 0.5 },
  });
  expect(resolveCapturePresentation(selected)).toEqual(selected);
});

it("keeps historical smoothing values without changing new capture policy", () => {
  expect(AppliedCapturePresentationSchema.parse({ cursorSmoothing: 0 }).cursorSmoothing).toBe(0);
  expect(captureCursorAppearance.cursorSmoothing).toBe(0);
  expect(resolveCapturePresentation().cursorSmoothing).toBe(0);
  expect(AppliedCapturePresentationSchema.parse({ cursorSmoothing: 0.15 }).cursorSmoothing).toBe(
    0.15,
  );
  expect(z.toJSONSchema(CapturePresentationSchema).properties).not.toHaveProperty(
    "cursorSmoothing",
  );
});

it("allows focus regions beyond two minutes and more than twenty regions", () => {
  const zoomRegions = Array.from({ length: 25 }, (_, i) => ({
    startSeconds: 600 + i * 3,
    endSeconds: 602 + i * 3,
    depth: 1,
  }));
  expect(AppliedCapturePresentationSchema.parse({ zoomRegions }).zoomRegions).toHaveLength(25);
});

it("fixes new cursor sizes at 1.5 while reading older takes", () => {
  for (const cursorSize of [1.49, 1.5, 1.8, 2, 2.01, 3, 6])
    expect(CapturePresentationSchema.safeParse({ cursorSize }).success).toBe(false);
  expect(captureCursorAppearance.cursorSize).toBe(1.5);
  for (const cursorSize of [1.8, 2, 3, 6])
    expect(AppliedCapturePresentationSchema.parse({ cursorSize }).cursorSize).toBe(cursorSize);
  expect(AppliedCapturePresentationSchema.parse({})).not.toHaveProperty("cursorSize");
  expect(z.toJSONSchema(CapturePresentationSchema).properties).not.toHaveProperty("cursorSize");
});
