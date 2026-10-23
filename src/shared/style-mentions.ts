import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";

export type MentionVariant = "style" | "motion";

export type StyleMentionPart =
  | { type: "text"; text: string }
  | { type: MentionVariant; id: string; name: string; xml: string };

const builder = new XMLBuilder({ ignoreAttributes: false });
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

export function styleMentionXml(
  style: { id: string; name_en: string },
  variant: MentionVariant = "style",
): string {
  return builder.build({ [variant]: { "@_id": style.id, "#text": style.name_en } });
}

/** Read explicit mention markup only. Ordinary style names in prose remain untouched. */
export function parseStyleMentions(prompt: string): StyleMentionPart[] {
  const parts: StyleMentionPart[] = [];
  let offset = 0;
  for (const match of prompt.matchAll(/<(style|motion)\b[^>]*>[\s\S]*?<\/\1>/g)) {
    const xml = match[0];
    if (XMLValidator.validate(xml) !== true) continue;
    const variant = match[1] as MentionVariant;
    const entry = parser.parse(xml)[variant];
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
    parts.push({ type: variant, id: entry["@_id"], name: entry["#text"], xml });
    offset = start + xml.length;
  }
  if (offset < prompt.length) parts.push({ type: "text", text: prompt.slice(offset) });
  return parts;
}

/** Text before the caret, supplied by the editor; do not treat email addresses as mentions. */
export function styleMentionQuery(beforeCaret: string): string | undefined {
  return /(?:^|\s)@([^@\n\r]*)$/.exec(beforeCaret)?.[1];
}
