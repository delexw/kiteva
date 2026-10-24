import { Children, type ComponentType, type ReactNode } from "react";
import { defaultComponents, type Components, type ExtraProps } from "streamdown";
import { parsePromptParts } from "../../shared/prompt-parts";
import { PromptText } from "./style-mention";

function withPromptColors(Component: ComponentType<{ children?: ReactNode }> | "em" | "del") {
  return function PromptColorText({
    children,
    node,
    ...props
  }: { children?: ReactNode } & ExtraProps) {
    const elementProps = typeof Component === "string" ? props : { ...props, node };
    return (
      <Component {...elementProps}>
        {Children.map(children, (child) =>
          typeof child === "string" &&
          parsePromptParts(child).some((part) => part.type === "color") ? (
            <PromptText>{child}</PromptText>
          ) : (
            child
          ),
        )}
      </Component>
    );
  };
}

/** Keep native Markdown rendering, link safety and code blocks while decorating prose colors. */
export const promptMarkdownComponents = {
  p: withPromptColors(defaultComponents.p),
  li: withPromptColors(defaultComponents.li),
  strong: withPromptColors(defaultComponents.strong),
  em: withPromptColors("em"),
  del: withPromptColors("del"),
  inlineCode: withPromptColors(defaultComponents.code),
  blockquote: withPromptColors(defaultComponents.blockquote),
  h1: withPromptColors(defaultComponents.h1),
  h2: withPromptColors(defaultComponents.h2),
  h3: withPromptColors(defaultComponents.h3),
  h4: withPromptColors(defaultComponents.h4),
  h5: withPromptColors(defaultComponents.h5),
  h6: withPromptColors(defaultComponents.h6),
  td: withPromptColors(defaultComponents.td),
  th: withPromptColors(defaultComponents.th),
  a: withPromptColors(defaultComponents.a),
} satisfies Components;
