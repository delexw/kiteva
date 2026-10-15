import type { MotionPattern } from "../shared/contracts";
import { StyleCard } from "./style-card";
import { MotionPreview } from "./motion-preview";

export function MotionCard({
  motion,
  variant = "explorer",
  description,
  playbackEnabled = true,
  onSelect,
}: {
  motion: MotionPattern;
  variant?: "explorer" | "compact";
  description?: string;
  playbackEnabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <StyleCard
      style={{
        id: motion.id,
        name_en: motion.name,
        category: motion.category.replaceAll("_", " "),
        visual_cues: description ?? motion.description,
        palette: { tokens: {}, constraints: [] },
      }}
      variant={variant}
      showCategory
      showDescription
      showPalette={false}
      onSelect={onSelect}
      media={
        <MotionPreview motionId={motion.id} name={motion.name} playbackEnabled={playbackEnabled} />
      }
    />
  );
}
