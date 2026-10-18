import { translateUi, useUiLanguage } from "../i18n";
import type { CreativeRequest, GenerationJob } from "../../shared/contracts";

import { modelDisplayName } from "../../shared/model-display-name";

export function ResultSummary({
  job,
  request,
  styleNames,
}: {
  job: GenerationJob;
  request: CreativeRequest;
  styleNames: string[];
}) {
  useUiLanguage();
  if (job.phase !== "ready") return null;
  const review = job.resultReview;
  return (
    <section className="production-summary" aria-label={translateUi("Result summary")}>
      <strong>{translateUi("Result summary")}</strong>
      <p>
        {translateUi("Motion Graphic:") + " "}
        {styleNames.map((name) => translateUi(name)).join(" + ") ||
          translateUi("Your chosen direction")}
      </p>
      {review?.styleMatch === "matched" && <p>{translateUi("Chosen Motion Graphic matched")}</p>}
      {review?.styleMatch === "needs_review" && (
        <p>{translateUi("Motion Graphic match needs a review")}</p>
      )}
      {(!review || review.styleMatch === "not_verified") && (
        <p>{translateUi("Motion Graphic match hasn’t been verified")}</p>
      )}
      {job.outputType === "video" && request.outputType === "video" && (
        <>
          <p>
            {translateUi("Aspect ratio:") + " "}
            {request.aspectRatio}
            {" " + translateUi("· matched")}
          </p>
          <p>
            {request.duration === "auto" ? translateUi("Auto duration") : translateUi("Duration")}:{" "}
            {job.duration}s
          </p>
        </>
      )}
      {job.outputType === "page" && request.outputType === "page" && (
        <p>
          {translateUi("Layout:") + " "}
          {request.viewport === "mobile" ? translateUi("Mobile") : translateUi("Desktop")}
        </p>
      )}
      {review?.narration === "not_added" && review.sungVocals === "not_added" ? (
        <p>{translateUi("No narration or sung vocals added")}</p>
      ) : (
        <>
          {review?.narration === "added" && <p>{translateUi("Narration added")}</p>}
          {review?.narration === "not_added" && <p>{translateUi("No narration added")}</p>}
          {review?.sungVocals === "added" && <p>{translateUi("Sung vocals added")}</p>}
          {review?.sungVocals === "not_added" && <p>{translateUi("No sung vocals added")}</p>}
        </>
      )}
      {review?.music === "added" && <p>{translateUi("Music added")}</p>}
      {review?.music === "not_added" && <p>{translateUi("No music added")}</p>}
      {(!review ||
        [review.narration, review.sungVocals, review.music].includes("not_verified")) && (
        <p>{translateUi("Audio details haven’t been verified")}</p>
      )}
      <p>
        {translateUi("Main model:") + " "}
        {modelDisplayName(job.model, "Not recorded")}
      </p>
    </section>
  );
}
