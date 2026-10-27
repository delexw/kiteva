import path from "node:path";
import { createReferenceBrowser } from "../../../jobs/subworkflows/website-reference";
import { validateReferenceUrl } from "../../../requests/reference-url";
import { agentMode } from "../../../runtime/config";
import { CodedError } from "../../../../shared/errors";

export async function captureReferencePage(
  value: string,
  screenshotPath: string,
  signal: AbortSignal,
  mode: "local" | "hosted" = agentMode,
) {
  await validateReferenceUrl(value, mode);
  signal.throwIfAborted();
  const browser = await createReferenceBrowser(
    [value],
    AbortSignal.any([signal, AbortSignal.timeout(mode === "local" ? 600000 : 30000)]),
    mode,
    false,
    path.dirname(screenshotPath),
  );
  try {
    await browser.inspect(value);
    return await browser.capture(screenshotPath);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof CodedError) throw error;
    throw new CodedError(
      "REFERENCE_CAPTURE_FAILED",
      error instanceof Error ? error.message : "Capture failed",
    );
  } finally {
    await browser.close();
  }
}
