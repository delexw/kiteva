import { useEffect, useState } from "react";
import type { MotionPattern, Style } from "../shared/contracts";
import { loadMotionCatalog } from "./motion-catalog";
import { MotionCard } from "./motion-card";

export function MotionReferenceList({
  references,
  motions,
}: {
  references: Style["motion_references"];
  motions: MotionPattern[];
}) {
  const [expandedMotionId, setExpandedMotionId] = useState<string>();
  return (
    <div className="motion-reference-list">
      <p>{references.required ? "Required motion references" : "Optional motion suggestions"}</p>
      {references.selection_policy && <p>{references.selection_policy}</p>}
      {references.candidates.length === 0 && (
        <p>No motion references suggested. Use this style’s own motion direction.</p>
      )}
      {references.candidates.map((reference) => {
        const motion = motions.find((item) => item.id === reference.motion_id);
        return (
          <article className="motion-reference-card" key={reference.motion_id}>
            {motion ? (
              <MotionCard
                motion={motion}
                variant="compact"
                description={reference.usage_guidance}
                onSelect={() =>
                  setExpandedMotionId((current) => (current === motion.id ? undefined : motion.id))
                }
              />
            ) : (
              <>
                <h4>Motion reference unavailable</h4>
                <p>{reference.usage_guidance}</p>
              </>
            )}
            {motion && (
              <details open={expandedMotionId === motion.id}>
                <summary>Motion sequence and video adaptation</summary>
                <p>{motion.description}</p>
                <ol>
                  {motion.motion_sequence.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
                <h4>Adaptation for video</h4>
                <p>{motion.video_adaptation}</p>
              </details>
            )}
          </article>
        );
      })}
      {references.agent_instruction && (
        <details>
          <summary>Selection guidance</summary>
          <p>{references.agent_instruction}</p>
        </details>
      )}
    </div>
  );
}

export function MotionReferences({ references }: { references: Style["motion_references"] }) {
  const [motions, setMotions] = useState<MotionPattern[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void loadMotionCatalog(controller.signal)
      .then(setMotions)
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!motions) return <p role="status">Loading motion references…</p>;
  return <MotionReferenceList references={references} motions={motions} />;
}
