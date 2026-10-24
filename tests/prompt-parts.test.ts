import { expect, it } from "vitest";
import { parsePromptParts } from "../src/shared/prompt-parts";

it("recognizes CSS hex lengths and preserves exact source spelling and whitespace", () => {
  const value = "Ink #191919; paper (#fff), alpha #1234 and #FF6E2880.\n";
  const parts = parsePromptParts(value);
  expect(parts.filter((p) => p.type === "color").map((p) => p.value)).toEqual([
    "#191919",
    "#fff",
    "#1234",
    "#FF6E2880",
  ]);
  expect(
    parts.map((p) => (p.type === "text" ? p.text : p.type === "color" ? p.value : p.xml)).join(""),
  ).toBe(value);
});
it("keeps style chips intact and ignores invalid hex strings and URL fragments", () => {
  const value =
    '<style id="style-001">A #fff style</style> #87E64B #12345 #1234567 #xyz #abc-label https://example.com/#abc';
  const parts = parsePromptParts(value);
  expect(parts.filter((p) => p.type === "style")).toHaveLength(1);
  expect(parts.filter((p) => p.type === "color")).toEqual([{ type: "color", value: "#87E64B" }]);
});
