import { PromptText } from "./components/style-mention";
import { translateUi, useUiLanguage } from "./i18n";
import { Button, Card, Collapse } from "antd";
import type { Style, StyleExample } from "../shared/contracts";
import { StyleCard, type StyleCardData } from "./style-card";

export function SuggestedCombinations({
  style,
  styles,
  onSelect,
  examples = [],
}: {
  style: Style;
  styles: StyleCardData[];
  examples?: StyleExample[];
  onSelect: (styleId: string) => void;
}) {
  useUiLanguage();
  const combinations = style.suggested_combinations;
  if (!combinations) return null;
  return (
    <section
      className="suggested-combinations"
      aria-label={translateUi("Suggested Motion Graphic combinations")}
    >
      <h3>{translateUi("Suggested combinations")}</h3>
      <p>
        <PromptText>{translateUi(combinations.selection_guidance)}</PromptText>
      </p>
      {!combinations.suggestions.length && (
        <p>{translateUi("This Motion Graphic works best on its own.")}</p>
      )}
      {combinations.suggestions.map((suggestion) => {
        const supportingStyles = suggestion.supporting_styles.flatMap((supporting) => {
          const match = styles.find((item) => item.id === supporting.style_id);
          return match ? [match] : [];
        });
        const title = [
          translateUi(style.name_en),
          ...supportingStyles.map((item) => translateUi(item.name_en)),
        ].join(" + ");
        return (
          <Card
            className="combination-preview-card"
            key={suggestion.supporting_styles.map((item) => item.style_id).join("|")}
            title={title}
          >
            <p className="example-disclaimer">
              {translateUi("Individual Motion Graphic previews · shown together for comparison")}
            </p>
            <div className="combination-preview-grid">
              {[style, ...supportingStyles].map((previewStyle, index) => (
                <div key={previewStyle.id}>
                  <p className="combination-preview-role">
                    {index === 0
                      ? translateUi("Primary Motion Graphic")
                      : translateUi("Supporting Motion Graphic")}
                  </p>
                  <StyleCard
                    style={previewStyle}
                    example={examples.find((example) => example.styleId === previewStyle.id)}
                    variant="compact"
                    onSelect={onSelect}
                  />
                </div>
              ))}
            </div>
            <Collapse
              destroyOnHidden
              className="combination-accordion"
              items={[
                {
                  key: "guidance",
                  label: translateUi("Combination guidance"),
                  children: (
                    <div className="combination-guidance">
                      <p>
                        <strong>{translateUi(style.name_en)}</strong>
                        {" " + translateUi("leads the visual direction.")}
                      </p>
                      {suggestion.supporting_styles.map((supporting) => {
                        const supportingStyle = styles.find(
                          (item) => item.id === supporting.style_id,
                        );
                        return (
                          <p key={supporting.style_id}>
                            {supportingStyle && (
                              <Button
                                type="link"
                                className="combination-style-link"
                                onClick={() => onSelect(supportingStyle.id)}
                              >
                                {translateUi(supportingStyle.name_en)}
                              </Button>
                            )}
                            {" · "}
                            <PromptText>{translateUi(supporting.role)}</PromptText>
                          </p>
                        );
                      })}
                      <p>
                        <PromptText>{translateUi(suggestion.rationale)}</PromptText>
                      </p>
                      <p>
                        <strong>{translateUi("Best for:")}</strong>{" "}
                        <PromptText>{translateUi(suggestion.best_for)}</PromptText>
                      </p>
                      <p>
                        <strong>{translateUi("Video:")}</strong>{" "}
                        <PromptText>{translateUi(suggestion.video_application)}</PromptText>
                      </p>
                      <p>
                        <strong>{translateUi("HTML:")}</strong>{" "}
                        <PromptText>{translateUi(suggestion.html_application)}</PromptText>
                      </p>
                      <h4>{translateUi("Keep consistent")}</h4>
                      <ul>
                        {suggestion.consistency_rules.map((rule) => (
                          <li key={rule}>{translateUi(rule)}</li>
                        ))}
                      </ul>
                      <h4>{translateUi("Avoid")}</h4>
                      <ul>
                        {suggestion.avoid.map((rule) => (
                          <li key={rule}>{translateUi(rule)}</li>
                        ))}
                      </ul>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        );
      })}
      <p className="example-disclaimer">
        {style.combination_guidance_provenance === "application_authored"
          ? translateUi("Application-authored compatibility guidance.")
          : translateUi("Creative recommendations analyzed by Claude Opus 5.5.")}{" "}
        {translateUi("Choose a combination only when it helps your idea.")}
      </p>
    </section>
  );
}
