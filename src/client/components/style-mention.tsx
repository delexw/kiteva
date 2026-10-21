import { Fragment } from "react";
import { Popover } from "antd";
import { parseStyleMentions } from "../../shared/style-mentions";
import { translateUi, useUiLanguage } from "../i18n";
import { StylePickerPreview } from "./style-picker";
import "./style-mention.css";

/** One visual identity for mentions in both the native editor and saved prompt displays. */
export function StyleMention({ id, name }: { id: string; name: string }) {
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
          <StylePickerPreview style={{ id: encodeURIComponent(id), name_en: name }} />
        </div>
      }
    >
      <span
        className="style-prompt-mention"
        tabIndex={0}
        aria-label={translateUi("Preview {{value0}}", { value0: label })}
      >
        @{label} <small>{id}</small>
      </span>
    </Popover>
  );
}

/** Interpret explicit style markup for display only; never rewrite the stored prompt. */
export function PromptText({ children }: { children: string }) {
  return (
    <span className="prompt-text">
      {parseStyleMentions(children).map((part, index) => (
        <Fragment key={index}>
          {part.type === "style" ? <StyleMention id={part.id} name={part.name} /> : part.text}
        </Fragment>
      ))}
    </span>
  );
}
