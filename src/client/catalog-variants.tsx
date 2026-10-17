import type { MotionGraphicVariant, MotionVariant } from "../shared/contracts";
import { motionGraphicVariantPolicy, motionVariantPolicy } from "../shared/catalog-variants";

/** Optional named looks shown in a Motion Graphic's details; renders nothing when absent. */
export function MotionGraphicVariants({ variants }: { variants?: MotionGraphicVariant[] }) {
  if (!variants?.length) return null;
  return (
    <section className="motion-graphic-variants" aria-label="Optional Motion Graphic variants">
      <h3>Optional variants</h3>
      <p className="example-disclaimer">{motionGraphicVariantPolicy}</p>
      {variants.map((variant) => (
        <article className="motion-graphic-variant" key={variant.id} data-variant-id={variant.id}>
          <h4>{variant.name}</h4>
          <p>{variant.summary}</p>
          {variant.illustrative_swatches.length > 0 && (
            <div
              className="motion-graphic-variant-swatches"
              role="list"
              aria-label={`${variant.name} illustrative swatches`}
              style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}
            >
              {variant.illustrative_swatches.map((swatch) => (
                <span
                  key={`${swatch.role}-${swatch.hex}`}
                  role="listitem"
                  title={`${swatch.role} ${swatch.hex} (illustrative)`}
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
                  {swatch.role}
                </span>
              ))}
            </div>
          )}
          <p>
            <strong>Use when:</strong> {variant.use_when}
          </p>
          <h5>Visual</h5>
          <ul>
            {variant.visual_guidance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h5>Animation</h5>
          <ul>
            {variant.animation_guidance.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            <strong>Palette:</strong> {variant.palette_guidance}
          </p>
          {variant.paired_motion_ids.length > 0 && (
            <p>
              <strong>Pairs with:</strong> {variant.paired_motion_ids.join(", ")}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}

/** Optional source-observed mechanisms of a motion, with the preview window that shows each. */
export function MotionVariantList({ variants }: { variants?: MotionVariant[] }) {
  if (!variants?.length) return null;
  return (
    <section className="motion-variants" aria-label="Optional motion variants">
      <h3>Optional variants</h3>
      <p className="example-disclaimer">{motionVariantPolicy}</p>
      {variants.map((variant) => (
        <article key={variant.id} data-variant-id={variant.id}>
          <h4>{variant.name}</h4>
          <p>{variant.summary}</p>
          <p className="example-disclaimer">
            Shown in the preview from {variant.preview_window_seconds[0].toFixed(1)}s to{" "}
            {variant.preview_window_seconds[1].toFixed(1)}s.
          </p>
          <ol>
            {variant.motion_sequence.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
