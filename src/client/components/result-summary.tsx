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
  if (job.phase !== "ready") return null;
  const review = job.resultReview;
  return (
    <section className="production-summary" aria-label="Result summary">
      <strong>Result summary</strong>
      <p>Motion Graphic: {styleNames.join(" + ") || "Your chosen direction"}</p>
      {review?.styleMatch === "matched" && <p>Chosen Motion Graphic matched</p>}
      {review?.styleMatch === "needs_review" && <p>Motion Graphic match needs a review</p>}
      {(!review || review.styleMatch === "not_verified") && (
        <p>Motion Graphic match hasn’t been verified</p>
      )}
      {job.outputType === "video" && request.outputType === "video" && (
        <>
          <p>Aspect ratio: {request.aspectRatio} · matched</p>
          <p>
            {request.duration === "auto" ? "Auto duration" : "Duration"}: {job.duration}s
          </p>
        </>
      )}
      {job.outputType === "page" && request.outputType === "page" && (
        <p>Layout: {request.viewport === "mobile" ? "Mobile" : "Desktop"}</p>
      )}
      {review?.narration === "not_added" && review.sungVocals === "not_added" ? (
        <p>No narration or sung vocals added</p>
      ) : (
        <>
          {review?.narration === "added" && <p>Narration added</p>}
          {review?.narration === "not_added" && <p>No narration added</p>}
          {review?.sungVocals === "added" && <p>Sung vocals added</p>}
          {review?.sungVocals === "not_added" && <p>No sung vocals added</p>}
        </>
      )}
      {review?.music === "added" && <p>Music added</p>}
      {review?.music === "not_added" && <p>No music added</p>}
      {(!review ||
        [review.narration, review.sungVocals, review.music].includes("not_verified")) && (
        <p>Audio details haven’t been verified</p>
      )}
      <p>Main model: {modelDisplayName(job.model, "Not recorded")}</p>
    </section>
  );
}
