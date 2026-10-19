import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";
import type { ComponentProps } from "react";

const plugins = { cjk, code, math, mermaid };

/** Load diagram, math and highlighting engines only when a message is displayed. */
export default function RichMessageResponse(props: ComponentProps<typeof Streamdown>) {
  return <Streamdown plugins={plugins} {...props} />;
}
