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
  const combinations = style.suggested_combinations;
  if (!combinations) return null;
  return (
    <section className="suggested-combinations" aria-label="Suggested Motion Graphic combinations">
      <h3>Suggested combinations</h3>
      <p>{combinations.selection_guidance}</p>
      {!combinations.suggestions.length && <p>This Motion Graphic works best on its own.</p>}
      {combinations.suggestions.map((suggestion) => {
        const supportingStyles = suggestion.supporting_styles.flatMap((supporting) => {
          const match = styles.find((item) => item.id === supporting.style_id);
          return match ? [match] : [];
        });
        const title = [style.name_en, ...supportingStyles.map((item) => item.name_en)].join(" + ");
        return (
          <Card
            className="combination-preview-card"
            key={suggestion.supporting_styles.map((item) => item.style_id).join("|")}
            title={title}
          >
            <p className="example-disclaimer">
              Individual Motion Graphic previews · shown together for comparison
            </p>
            <div className="combination-preview-grid">
              {[style, ...supportingStyles].map((previewStyle, index) => (
                <div key={previewStyle.id}>
                  <p className="combination-preview-role">
                    {index === 0 ? "Primary Motion Graphic" : "Supporting Motion Graphic"}
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
                  label: "Combination guidance",
                  children: (
                    <div className="combination-guidance">
                      <p>
                        <strong>{style.name_en}</strong> leads the visual direction.
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
                                {supportingStyle.name_en}
                              </Button>
                            )}
                            {" · "}
                            {supporting.role}
                          </p>
                        );
                      })}
                      <p>{suggestion.rationale}</p>
                      <p>
                        <strong>Best for:</strong> {suggestion.best_for}
                      </p>
                      <p>
                        <strong>Video:</strong> {suggestion.video_application}
                      </p>
                      <p>
                        <strong>HTML:</strong> {suggestion.html_application}
                      </p>
                      <h4>Keep consistent</h4>
                      <ul>
                        {suggestion.consistency_rules.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                      <h4>Avoid</h4>
                      <ul>
                        {suggestion.avoid.map((rule) => (
                          <li key={rule}>{rule}</li>
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
          ? "Application-authored compatibility guidance."
          : "Creative recommendations analyzed by Claude Opus 5.5."}{" "}
        Choose a combination only when it helps your idea.
      </p>
    </section>
  );
}
