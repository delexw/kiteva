import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

export type StyleMentionPart =
  | { type: "text"; text: string }
  | { type: "style"; id: string; name: string; xml: string };

const builder = new XMLBuilder({ ignoreAttributes: false });
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

export function styleMentionXml(style: { id: string; name_en: string }): string {
  return builder.build({ style: { "@_id": style.id, "#text": style.name_en } });
}

/** Read explicit mention markup only. Ordinary style names in prose remain untouched. */
export function parseStyleMentions(prompt: string): StyleMentionPart[] {
  const parts: StyleMentionPart[] = [];
  let offset = 0;
  for (const match of prompt.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)) {
    const xml = match[0];
    if (XMLValidator.validate(xml) !== true) continue;
    const entry = parser.parse(xml).style;
    if (
      !entry ||
      typeof entry["@_id"] !== "string" ||
      typeof entry["#text"] !== "string" ||
      !entry["@_id"].trim() ||
      !entry["#text"].trim() ||
      Object.keys(entry).some((key) => key !== "@_id" && key !== "#text")
    )
      continue;
    const start = match.index!;
    if (start > offset) parts.push({ type: "text", text: prompt.slice(offset, start) });
    parts.push({ type: "style", id: entry["@_id"], name: entry["#text"], xml });
    offset = start + xml.length;
  }
  if (offset < prompt.length) parts.push({ type: "text", text: prompt.slice(offset) });
  return parts;
}

/** Text before the caret, supplied by the editor; do not treat email addresses as mentions. */
export function styleMentionQuery(beforeCaret: string): string | undefined {
  return /(?:^|\s)@([^@\n\r]*)$/.exec(beforeCaret)?.[1];
}
