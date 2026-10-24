import { parsePromptParts } from "../../shared/prompt-parts";
import { ColorChip } from "./color-chip";
import { Fragment } from "react";
import { Popover } from "antd";
import { type MentionVariant } from "../../shared/style-mentions";
import { translateUi, useUiLanguage } from "../i18n";
import { StylePickerPreview } from "./style-picker";
import "./style-mention.css";

/** One visual identity for mentions in both the native editor and saved prompt displays. */
export function StyleMention({
  id,
  name,
  variant = "style",
}: {
  id: string;
  name: string;
  variant?: MentionVariant;
}) {
  useUiLanguage();
  const label = translateUi(name);
  return (
    <Popover
      trigger={["hover", "focus"]}
      placement="top"
      mouseEnterDelay={0.1}
      destroyOnHidden
      getPopupContainer={(trigger) =>
        trigger.closest<HTMLElement>(".creative-room") || trigger.ownerDocument.body
      }
      content={
        <div className="style-mention-preview">
          <StylePickerPreview
            variant={variant}
            style={{ id: encodeURIComponent(id), name_en: name }}
          />
        </div>
      }
    >
      <span
        className="style-prompt-mention"
        data-mention-variant={variant}
        tabIndex={0}
        aria-label={translateUi("Preview {{value0}}", { value0: label })}
      >
        @{label} <small>{id}</small>
      </span>
    </Popover>
  );
}

/** Display style/motion mentions and hex colors without rewriting the stored prompt. */
export function PromptText({ children }: { children: string }) {
  return (
    <span className="prompt-text">
      {parsePromptParts(children).map((part, index) => (
        <Fragment key={index}>
          {part.type === "text" ? (
            part.text
          ) : part.type === "color" ? (
            <ColorChip value={part.value} />
          ) : (
            <StyleMention id={part.id} name={part.name} variant={part.type} />
          )}
        </Fragment>
      ))}
    </span>
  );
}
