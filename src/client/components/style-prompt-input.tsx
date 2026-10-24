import { parsePromptParts } from "../../shared/prompt-parts";
import { ColorChip } from "./color-chip";
import { nanoid } from "nanoid";
import { Sender, Suggestion, type SenderProps } from "@ant-design/x";
import type { SenderRef, SlotConfigType } from "@ant-design/x/es/sender/interface";
import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  styleMentionQuery,
  styleMentionXml,
  type MentionVariant,
} from "../../shared/style-mentions";
import { translateUi, useUiLanguage } from "../i18n";
import { StylePickerPreview, MotionMentionsContext } from "./style-picker";
import { StyleMention } from "./style-mention";
import "./style-prompt-input.css";

type MentionStyle = { id: string; name_en: string };

function mentionSlot(
  id: string,
  name: string,
  xml: string,
  key: string,
  variant: MentionVariant = "style",
): SlotConfigType {
  return {
    type: "tag",
    key,
    props: {
      label: <StyleMention id={id} name={name} variant={variant} />,
      value: xml,
    },
    formatResult: () => xml,
  };
}

function promptSlots(value: string): SlotConfigType[] {
  return parsePromptParts(value).map((part) =>
    part.type === "text"
      ? { type: "text", value: part.text }
      : part.type === "color"
        ? {
            type: "custom",
            key: nanoid(),
            props: { defaultValue: part.value },
            customRender: (color, onChange, props) => (
              <ColorChip
                value={color}
                onChange={props.readOnly ? undefined : onChange}
                disabled={props.disabled}
              />
            ),
            formatResult: (color) => color,
          }
        : mentionSlot(part.id, part.name, part.xml, nanoid(), part.type),
  );
}

export function StylePromptInput({
  value,
  onChange,
  styles,
  name,
  ...senderProps
}: Omit<SenderProps, "value" | "onChange" | "slotConfig"> & {
  value: string;
  onChange: (value: string) => void;
  styles: MentionStyle[];
  name?: string;
  "aria-label"?: string;
}) {
  const { language } = useUiLanguage();
  const motions = useContext(MotionMentionsContext);
  const entries = useMemo(
    () => [
      ...styles.map((style) => ({ ...style, variant: "style" as const })),
      ...motions.map((motion) => ({ ...motion, variant: "motion" as const })),
    ],
    [styles, motions],
  );
  const sender = useRef<SenderRef>(null);
  const lastValue = useRef(value);
  const [slots, setSlots] = useState(() => promptSlots(value));
  const [query, setQuery] = useState<string>();
  // Keep the native editor/caret intact for local changes; rebuild only for external draft updates.
  useLayoutEffect(() => {
    if (value === lastValue.current) return;
    lastValue.current = value;
    setSlots(promptSlots(value));
    setQuery(undefined);
  }, [value]);
  const matches = useMemo(() => {
    const words = (query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((style) =>
      words.every((word) =>
        `${style.id} ${style.name_en} ${translateUi(style.name_en)}`
          .toLocaleLowerCase()
          .includes(word),
      ),
    );
  }, [entries, query, language]);
  const items = useMemo(
    () =>
      matches.map((style) => ({
        value: style.id,
        label: <StylePickerPreview compact style={style} variant={style.variant} />,
        extra: (
          <small>
            {translateUi(style.variant === "motion" ? "Motion clip" : "Motion Graphic")} ·{" "}
            {style.id}
          </small>
        ),
      })),
    [matches],
  );

  const updateValue = (next: string) => {
    if (next === lastValue.current) return;
    lastValue.current = next;
    onChange(next);
  };
  const insertSlots = (config: SlotConfigType[], replaceCharacters?: string) => {
    const editor = sender.current;
    if (!editor) return;
    editor.insert(config, "cursor", replaceCharacters);
    // Sender notifies asynchronously after insert. Persist its native value now so
    // a parent rerender cannot restore the previous query over the inserted chip.
    updateValue(editor.getValue().value);
    setQuery(undefined);
  };

  const readQuery = () => {
    if (!entries.length) {
      setQuery(undefined);
      return;
    }
    const editor = sender.current?.inputElement;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      setQuery(undefined);
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(selection.anchorNode!, selection.anchorOffset);
    const beforeCaret = range.cloneContents();
    // An existing chip's visible @label is not a new query. Treat atomic slots and
    // line breaks as boundaries while leaving the editor and its selection untouched.
    beforeCaret.querySelectorAll('[contenteditable="false"], br').forEach((node) => {
      node.replaceWith(document.createTextNode("\n"));
    });
    setQuery(styleMentionQuery(beforeCaret.textContent || ""));
  };

  return (
    <div
      className="style-prompt-input"
      onPasteCapture={(event) => {
        const text = event.clipboardData.getData("text/plain");
        if (parsePromptParts(text).some((part) => part.type !== "text")) {
          event.preventDefault();
          event.stopPropagation();
          insertSlots(promptSlots(text));
        }
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <Suggestion
        classNames={{ popup: "style-prompt-suggestions" }}
        block
        items={items}
        open={query !== undefined}
        onOpenChange={(open) => {
          if (!open) setQuery(undefined);
        }}
        notFoundContent={translateUi("No matching Motion Graphics or motion clips")}
        onSelect={(id) => {
          const style = entries.find((item) => item.id === id);
          if (!style || query === undefined) return;
          insertSlots(
            [
              mentionSlot(
                style.id,
                style.name_en,
                styleMentionXml(style, style.variant),
                nanoid(),
                style.variant,
              ),
              { type: "text", value: " " },
            ],
            `@${query}`,
          );
          setQuery(undefined);
        }}
      >
        {({ onKeyDown }) => (
          <Sender
            {...senderProps}
            ref={sender}
            slotConfig={slots}
            autoSize={false}
            aria-autocomplete="list"
            aria-expanded={query !== undefined}
            onSubmit={(message, config, skill) => {
              if (senderProps.onSubmit) {
                senderProps.onSubmit(message, config, skill);
                return;
              }
              const form = sender.current?.nativeElement.closest("form");
              const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
              if (!submit?.disabled) form?.requestSubmit();
            }}
            onChange={(next) => {
              updateValue(next);
              readQuery();
            }}
            onKeyDown={(event) => {
              if (!event.nativeEvent.isComposing && query !== undefined && items.length) {
                onKeyDown(event);
                if (event.defaultPrevented) return false;
              }
              if (event.key === "Escape") setQuery(undefined);
              // Cascader treats Space as selection. Ordinary editing keys belong to
              // Sender; only suggestion navigation should reach the popup trigger.
              event.stopPropagation();
              return senderProps.onKeyDown?.(event);
            }}
            onKeyUp={(event) => {
              senderProps.onKeyUp?.(event);
              if (!event.nativeEvent.isComposing && !["Escape", "Enter"].includes(event.key))
                readQuery();
            }}
          />
        )}
      </Suggestion>
      {entries.length > 0 && (
        <div className="style-prompt-hint">
          {translateUi("Type @ to mention a Motion Graphic or motion clip")}
        </div>
      )}
    </div>
  );
}
