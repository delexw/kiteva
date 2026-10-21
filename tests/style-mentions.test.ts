import { expect, it } from "vitest";
import {
  parseStyleMentions,
  styleMentionQuery,
  styleMentionXml,
} from "../src/shared/style-mentions";

it("serializes an ID and name as escaped XML and preserves the complete surrounding idea", () => {
  const xml = styleMentionXml({ id: "style-140", name_en: 'Ink & Film <Leader> "时代"' });
  expect(xml).toBe('<style id="style-140">Ink &amp; Film &lt;Leader&gt; &quot;时代&quot;</style>');
  const prompt = `Act 1: ${xml}.\nAct 3: ${xml}; no mosaic.\n`;
  const parts = parseStyleMentions(prompt);
  expect(parts).toEqual([
    { type: "text", text: "Act 1: " },
    { type: "style", id: "style-140", name: 'Ink & Film <Leader> "时代"', xml },
    { type: "text", text: ".\nAct 3: " },
    { type: "style", id: "style-140", name: 'Ink & Film <Leader> "时代"', xml },
    { type: "text", text: "; no mosaic.\n" },
  ]);
  expect(parts.map((part) => (part.type === "text" ? part.text : part.xml)).join("")).toBe(prompt);
});

it.each([
  "Vintage Rubber Hose Animation style-140, not Manga.",
  '<style id="style-140">Unclosed',
  "<style>Missing ID</style>",
  '<style id="">Empty ID</style>',
  '<style id="style-140"><script>nested</script></style>',
  '<style id="style-140" unexpected="yes">Other attributes</style>',
  '<style id="style-140">A & B</style>',
])("leaves ordinary prose or invalid explicit mention markup untouched: %s", (prompt) => {
  expect(parseStyleMentions(prompt)).toEqual([{ type: "text", text: prompt }]);
});

it("does not drop invalid markup before a valid mention", () => {
  const xml = styleMentionXml({ id: "style-140", name_en: "Vintage Rubber Hose Animation" });
  const prompt = `<style>Missing ID</style> ${xml}`;
  expect(parseStyleMentions(prompt)).toEqual([
    { type: "text", text: "<style>Missing ID</style> " },
    { type: "style", id: "style-140", name: "Vintage Rubber Hose Animation", xml },
  ]);
});

it.each([
  ["@", ""],
  ["Act 1 uses @rubber hose", "rubber hose"],
  ["Line 1\n@style-140", "style-140"],
  ["hi@example.com", undefined],
  ["@rubber\nNext line", undefined],
  ["No mention here", undefined],
])("detects the active query before the caret: %s", (text, expected) => {
  expect(styleMentionQuery(text!)).toBe(expected);
});
