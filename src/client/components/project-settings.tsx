import { hasOnScreenLyrics } from "../../shared/script-items";
import { creativeApproachLabel } from "../../shared/creative-approach";
import { translateUi, useUiLanguage } from "../i18n";
import { videoLanguageLabel } from "../../shared/video-language";
import { Popover } from "antd";
import { videoRendererOf, videoRenderers } from "../../shared/video-renderers";
import { Fragment } from "react";
import { StyleExampleMedia } from "../style-card";
import type { Run, Style, StyleExample } from "../../shared/contracts";
import { modelDisplayName } from "../../shared/model-display-name";

export function ProjectSettings({
  run,
  styles = [],
  examples = [],
}: {
  run: Run;
  styles?: Pick<Style, "id" | "name_en">[];
  examples?: StyleExample[];
}) {
  useUiLanguage();
  const request = run.request;
  const styleIds = request.selectedStyleIds || [];
  const selectedStyles = styleIds.flatMap((id) => styles.filter((style) => style.id === id));
  const settings = [
    request.outputType === "page" ? "Interactive page" : "Video",
    modelDisplayName(
      request.mainModel || (request.provider === "claude" ? "claude-opus-5-5" : "gpt-6.1-sol"),
    ),
    ...(request.outputType === "video"
      ? [
          request.duration === "auto" ? "Auto duration" : `${request.duration}s`,
          ...(request.outputLanguage ? [videoLanguageLabel(request.outputLanguage)] : []),
          request.aspectRatio,
          request.resolution === "1440p" ? "2K · 1440p" : "1080p",
          translateUi("{{value0}} fps", { value0: request.frameRate || 30 }),
          videoRenderers[videoRendererOf(request)].label,
          hasOnScreenLyrics(request) ? "Lyrics on" : "No lyrics",
        ]
      : [request.viewport === "mobile" ? "Mobile layout" : "Desktop layout"]),
    request.candidateCount === 0
      ? "Manual Motion Graphics"
      : translateUi("{{count}} directions", { count: request.candidateCount }),
    ...(request.candidateCount > 0 ? [creativeApproachLabel(request)] : []),
  ];
  return (
    <div
      className="project-selected-settings"
      aria-label={translateUi("Selected project settings")}
    >
      <div className="project-setting-values">
        {settings.map((setting) => (
          <span key={setting}>{translateUi(setting)}</span>
        ))}
      </div>
      {selectedStyles.length > 0 && (
        <p>
          {translateUi("Motion Graphics:")}{" "}
          {selectedStyles.map((style, index) => {
            const example = examples.find((entry) => entry.styleId === style.id);
            return (
              <Fragment key={style.id}>
                {index > 0 && " + "}
                <Popover
                  trigger={["hover", "focus"]}
                  placement="bottom"
                  mouseEnterDelay={0.1}
                  mouseLeaveDelay={0}
                  destroyOnHidden
                  title={translateUi(style.name_en)}
                  content={
                    <div className="project-style-hover-preview">
                      <StyleExampleMedia
                        styleId={style.id}
                        version={example?.generatedAt}
                        video={example?.video}
                        videoVersion={example?.videoGeneratedAt}
                        motionStatus={example?.motionStatus}
                        playOnOpen
                      />
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="project-style-preview-trigger"
                    aria-label={translateUi("Preview {{value0}}", {
                      value0: translateUi(style.name_en),
                    })}
                  >
                    {translateUi(style.name_en)}
                  </button>
                </Popover>
              </Fragment>
            );
          })}
        </p>
      )}
    </div>
  );
}
