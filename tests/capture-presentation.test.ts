import { expect, it } from "vitest";
import { z } from "zod";
import {
  CapturePresentationSchema,
  captureCursorThemes,
  AppliedCapturePresentationSchema,
} from "../src/server/capture/presentation";

it("leaves omitted cursor timing and effect settings to OpenScreen", () => {
  expect(CapturePresentationSchema.parse({})).toEqual({ zoomRegions: [], cursorTheme: "default" });
});

it("defaults custom zooms to cursor following without requiring fixed coordinates", () => {
  const settings = CapturePresentationSchema.parse({
    zoomRegions: [{ startSeconds: 1, endSeconds: 3, depth: 3 }],
  });
  expect(settings.zoomRegions[0]).toMatchObject({ focusMode: "auto", focusX: 0.5, focusY: 0.5 });
});

it("preserves explicit manual focus and historical manual recording provenance", () => {
  const region = { startSeconds: 1, endSeconds: 3, depth: 3, focusX: 0.2, focusY: 0.7 };
  expect(
    CapturePresentationSchema.parse({ zoomRegions: [{ ...region, focusMode: "manual" }] })
      .zoomRegions[0],
  ).toMatchObject({ focusMode: "manual", focusX: 0.2, focusY: 0.7 });
  const previous = AppliedCapturePresentationSchema.parse({
    zoomRegions: [region],
    cursorTheme: "glass-lens",
  });
  expect(previous.zoomRegions[0].focusMode).toBe("manual");
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
  { cursorSmoothing: 2 },
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

it("uses the native MCP bounce limit for new takes while reading historical metadata", () => {
  expect(CapturePresentationSchema.parse({ cursorClickBounce: 2 }).cursorClickBounce).toBe(2);
  expect(AppliedCapturePresentationSchema.parse({ cursorClickBounce: 2.5 }).cursorClickBounce).toBe(
    2.5,
  );
  expect(z.toJSONSchema(CapturePresentationSchema).properties?.cursorClickBounce).toMatchObject({
    minimum: 0,
    maximum: 2,
  });
});
