import type { CrewRole } from "./storyboard-crew-plan";
export function StoryboardCrew({
  role,
  reaction = false,
  bodyTilt = 0,
}: {
  role: "director" | CrewRole;
  reaction?: boolean;
  bodyTilt?: number;
}) {
  return (
    <div
      className={`manga-crew manga-crew-${role}`}
      role="img"
      aria-label={
        role === "director"
          ? "Stick-figure director with a clapperboard"
          : role === "camera"
            ? "Stick-figure camera operator"
            : role === "stage"
              ? "Stick-figure stagehand carrying a prop"
              : role === "lighting"
                ? "Stick-figure lighting technician"
                : role === "art"
                  ? "Stick-figure lettering artist"
                  : "Stick-figure sound technician"
      }
    >
      <i className="manga-head" />
      <i
        className="manga-body"
        style={{ transform: `rotate(${bodyTilt}deg)`, transformOrigin: "50% 15%" }}
      />
      {reaction && (
        <i className="manga-reaction">
          <i />
          <i />
          <i />
        </i>
      )}
      {role === "director" ? (
        <i className="manga-clapper">
          <i />
        </i>
      ) : role === "stage" ? (
        <i className="manga-stage-box" />
      ) : role === "lighting" ? (
        <i className="manga-light-prop">
          <i className="manga-light-stand" />
          <i className="manga-light-head" />
          <i className="manga-light-beam" />
        </i>
      ) : role === "art" ? (
        <i className="manga-pencil-prop" />
      ) : role === "sound" ? (
        <>
          <i className="manga-headphones-prop" />
          <i className="manga-sound-prop">
            <i />
            <i />
            <i />
          </i>
        </>
      ) : (
        <i className="manga-camera-prop">
          <i className="manga-reel manga-reel-left" />
          <i className="manga-reel manga-reel-right" />
          <i className="manga-camera-lens" />
          <i className="manga-tripod" />
        </i>
      )}
    </div>
  );
}
