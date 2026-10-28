import { AttachmentImage } from "./attachment-image";
import type { GenerationJob } from "../../shared/contracts";
import { translateUi, useUiLanguage } from "../i18n";
import { PromptText } from "./style-mention";
import "./refinement-message.css";

/** The saved user request, shared by both conversation presentations. */
export function RefinementMessage({ job }: { job: GenerationJob }) {
  useUiLanguage();
  return (
    <div className="refinement-message">
      <PromptText>{job.refinementPrompt || ""}</PromptText>
      {job.outputType !== "page" && Boolean(job.refinementAssetIds?.length) && (
        <div className="refinement-message-images">
          {job.refinementAssetIds?.map((id, index) => (
            <AttachmentImage
              key={id}
              assetId={id}
              label={translateUi("Refinement reference {{value0}}", { value0: index + 1 })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
