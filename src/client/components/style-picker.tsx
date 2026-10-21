import { translateUi, useUiLanguage } from "../i18n";
import { Select } from "antd";
import { Layers } from "lucide-react";
import type { StyleExample } from "../../shared/contracts";
import { StyleExampleMedia } from "../style-card";
import { createContext, useContext } from "react";

/** The application's already-loaded preview metadata; no per-mention fetches. */
export const StyleExamplesContext = createContext<readonly StyleExample[]>([]);

type PickerStyle = { id: string; name_en: string };
export function StylePickerPreview({
  style,
  example,
  compact = false,
}: {
  style: PickerStyle;
  example?: StyleExample;
  compact?: boolean;
}) {
  useUiLanguage();
  const examples = useContext(StyleExamplesContext);
  const preview = example ?? examples.find((entry) => entry.styleId === style.id);
  return (
    <div className={compact ? "style-picker-option" : "style-picker-preview"}>
      {compact ? (
        <img src={`/api/examples/${style.id}`} alt="" loading="lazy" />
      ) : (
        <StyleExampleMedia
          styleId={style.id}
          version={preview?.generatedAt}
          video={preview?.video}
          videoVersion={preview?.videoGeneratedAt}
          motionStatus={preview?.motionStatus}
        />
      )}
      <span>{translateUi(style.name_en)}</span>
    </div>
  );
}
export function StylePicker({
  styles,
  examples,
  selectedIds,
  limit,
  onChange,
}: {
  styles: PickerStyle[];
  examples: StyleExample[];
  selectedIds: string[];
  limit: number;
  onChange: (ids: string[]) => void;
}) {
  useUiLanguage();
  return (
    <>
      <Select
        mode="multiple"
        prefix={<Layers size={16} aria-hidden="true" />}
        aria-label={translateUi("Choose your own Motion Graphics")}
        placeholder={translateUi("Browse Motion Graphic previews or search by name")}
        value={selectedIds}
        maxCount={limit}
        optionFilterProp="label"
        listHeight={360}
        options={styles.map((style) => ({ value: style.id, label: translateUi(style.name_en) }))}
        optionRender={(option) => (
          <StylePickerPreview
            compact
            style={{ id: String(option.value), name_en: String(option.label) }}
          />
        )}
        onChange={onChange}
      />
      {selectedIds.length > 0 && (
        <div
          className="style-picker-previews"
          aria-label={translateUi("Selected Motion Graphic previews")}
        >
          {selectedIds.map((id) => {
            const style = styles.find((entry) => entry.id === id);
            return style ? (
              <StylePickerPreview
                key={id}
                style={style}
                example={examples.find((entry) => entry.styleId === id)}
              />
            ) : null;
          })}
        </div>
      )}
    </>
  );
}
