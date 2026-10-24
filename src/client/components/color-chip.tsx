import { ColorPicker } from "antd";
import { translateUi } from "../i18n";
import "./color-chip.css";

/** Shared prompt swatch; readers keep source text, editors use the native color picker. */
export function ColorChip({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className="prompt-color-swatch" style={{ backgroundColor: value }} aria-hidden="true" />
      <span>{value}</span>
    </>
  );
  return onChange ? (
    <ColorPicker
      value={value}
      disabled={disabled}
      onChangeComplete={(color) => onChange(color.toHexString())}
      panelRender={(panel) => (
        // Picker inputs live in a portal; keep their editing events out of the prompt editor.
        <div
          onKeyDown={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onInput={(event) => event.stopPropagation()}
          onPaste={(event) => event.stopPropagation()}
        >
          {panel}
        </div>
      )}
    >
      <button
        type="button"
        className="prompt-color-chip"
        disabled={disabled}
        aria-label={translateUi("Edit color {{color}}", { color: value })}
      >
        {content}
      </button>
    </ColorPicker>
  ) : (
    <span className="prompt-color-chip">{content}</span>
  );
}
