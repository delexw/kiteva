import { translateUi, useUiLanguage } from "./i18n";
import type { MotionGraphicVariant, MotionVariant } from "../shared/contracts";
import { motionGraphicVariantPolicy, motionVariantPolicy } from "../shared/catalog-variants";

/** Optional named looks shown in a Motion Graphic's details; renders nothing when absent. */
export function MotionGraphicVariants({ variants }: { variants?: MotionGraphicVariant[] }) {
  useUiLanguage();
  if (!variants?.length) return null;
  return (
    <section
      className="motion-graphic-variants"
      aria-label={translateUi("Optional Motion Graphic variants")}
    >
      <h3>{translateUi("Optional variants")}</h3>
      <p className="example-disclaimer">{translateUi(motionGraphicVariantPolicy)}</p>
      {variants.map((variant) => (
        <article className="motion-graphic-variant" key={variant.id} data-variant-id={variant.id}>
          <h4>{translateUi(variant.name)}</h4>
          <p>{translateUi(variant.summary)}</p>
          {variant.illustrative_swatches.length > 0 && (
            <div
              className="motion-graphic-variant-swatches"
              role="list"
              aria-label={translateUi("{{value0}} illustrative swatches", {
                value0: translateUi(variant.name),
              })}
              style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}
            >
              {variant.illustrative_swatches.map((swatch) => (
                <span
                  key={`${swatch.role}-${swatch.hex}`}
                  role="listitem"
                  title={translateUi("{{value0}} {{value1}} (illustrative)", {
                    value0: translateUi(swatch.role),
                    value1: swatch.hex,
                  })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: "1px solid rgba(127,127,127,0.5)",
                      background: swatch.hex,
                    }}
                  />
                  {translateUi(swatch.role)}
                </span>
              ))}
            </div>
          )}
          <p>
            <strong>{translateUi("Use when:")}</strong> {translateUi(variant.use_when)}
          </p>
          <h5>{translateUi("Visual")}</h5>
          <ul>
            {variant.visual_guidance.map((line) => (
              <li key={line}>{translateUi(line)}</li>
            ))}
          </ul>
          <h5>{translateUi("Animation")}</h5>
          <ul>
            {variant.animation_guidance.map((line) => (
              <li key={line}>{translateUi(line)}</li>
            ))}
          </ul>
          <p>
            <strong>{translateUi("Palette:")}</strong> {translateUi(variant.palette_guidance)}
          </p>
          {variant.paired_motion_ids.length > 0 && (
            <p>
              <strong>{translateUi("Pairs with:")}</strong> {variant.paired_motion_ids.join(", ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

/** Optional source-observed mechanisms of a motion, with the preview window that shows each. */
export function MotionVariantList({ variants }: { variants?: MotionVariant[] }) {
  useUiLanguage();
  if (!variants?.length) return null;
  return (
    <section className="motion-variants" aria-label={translateUi("Optional motion variants")}>
      <h3>{translateUi("Optional variants")}</h3>
      <p className="example-disclaimer">{translateUi(motionVariantPolicy)}</p>
      {variants.map((variant) => (
        <article key={variant.id} data-variant-id={variant.id}>
          <h4>{translateUi(variant.name)}</h4>
          <p>{translateUi(variant.summary)}</p>
          <p className="example-disclaimer">
            {translateUi("Shown in the preview from") + " "}
            {variant.preview_window_seconds[0].toFixed(1)}
            {translateUi("s to")} {variant.preview_window_seconds[1].toFixed(1)}s.
          </p>
          <ol>
            {variant.motion_sequence.map((step) => (
              <li key={step}>{translateUi(step)}</li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
