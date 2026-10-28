import type { JobState } from "../../shared/domains/common";
import type { ProviderEvent } from "../agents/agent";

/** Only a generation caller may bind this callback; helpers receive the plain event recorder. */
export function generationSessionEvents(
  job: JobState,
  record: (event: ProviderEvent) => void,
  update: () => void,
) {
  return (event: ProviderEvent) => {
    const sessionId = (event.data as { sessionId?: unknown } | undefined)?.sessionId;
    if (event.type === "session" && typeof sessionId === "string" && sessionId) {
      job.sessionId = sessionId;
      update();
    }
    record(event);
  };
}
