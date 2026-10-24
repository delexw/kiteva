import { parseStyleMentions, type StyleMentionPart } from "./style-mentions";

export type PromptPart = StyleMentionPart | { type: "color"; value: string };

/** Recognize CSS hex colors in prose while keeping explicit style/motion markup intact. */
export function parsePromptParts(value: string): PromptPart[] {
  return parseStyleMentions(value).flatMap((part): PromptPart[] => {
    if (part.type !== "text") return [part];
    const parts: PromptPart[] = [];
    let offset = 0;
    for (const match of part.text.matchAll(
      /(?<![\w/#])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])/gi,
    )) {
      const start = match.index;
      if (start > offset) parts.push({ type: "text", text: part.text.slice(offset, start) });
      parts.push({ type: "color", value: match[0] });
      offset = start + match[0].length;
    }
    if (offset < part.text.length) parts.push({ type: "text", text: part.text.slice(offset) });
    return parts;
  });
}
