import { expect, it } from "vitest";
import { customerErrorMessage } from "../src/client/customer-messages";
import { activityItems } from "../src/client/agent-activity-model";
it("maps stable codes to customer messages", () => {
  expect(customerErrorMessage("PREPARATION_FAILED")).toBe(
    "We couldn't prepare your creative directions. Please try again.",
  );
  expect(customerErrorMessage("FILE_REQUIRED")).toBe("Please choose a file to attach.");
});
it("hides internal selection narration and keeps useful creative progress", () => {
  const items = activityItems([
    {
      id: 1,
      runId: "project",
      type: "ranking",
      time: "2026-10-11T00:00:00Z",
      message: "Shortlisted 12 styles with jev-latest",
    },
  ]);
  expect(items[0]?.text).toBe("Finding visual styles for your idea…");
});
it("never exposes unknown SDK diagnostics or error codes", () => {
  for (const diagnostic of [
    "[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use",
    "EACCES: permission denied, open /private/tmp/example",
    'Unexpected provider response: {"code":500}',
    "Unknown implementation detail",
    "constructor",
    "__proto__",
  ]) {
    expect(customerErrorMessage(diagnostic)).toBe("Something went wrong. Please try again.");
    expect(customerErrorMessage(diagnostic, "VIDEO_GENERATION_FAILED")).toBe(
      "We couldn't finish your video. Please try again.",
    );
    expect(customerErrorMessage(diagnostic, "PAGE_GENERATION_FAILED")).toBe(
      "We couldn't finish your page. Please try again.",
    );
  }
});
it("gives actionable messages for file and missing-project errors", () => {
  expect(customerErrorMessage("FILE_TOO_LARGE")).toBe(
    "Images and documents: up to 10 MB each. Audio: up to 25 MB each.",
  );
  expect(customerErrorMessage("PROJECT_NOT_FOUND")).toBe(
    "This project is no longer available. Open another project or start a new one.",
  );
});

it("does not infer a code by matching diagnostic text", () => {
  expect(customerErrorMessage("Run not found")).toBe("Something went wrong. Please try again.");
  expect(customerErrorMessage("Jev is unavailable")).toBe(
    "Something went wrong. Please try again.",
  );
});

it("shows screenshot preparation without exposing capture implementation details", () => {
  const items = activityItems([
    {
      id: 1,
      runId: "project",
      type: "reference_capture",
      time: "2026-10-12T00:00:00Z",
      message: "Internal browser details",
    },
    {
      id: 2,
      runId: "project",
      type: "reference_ready",
      time: "2026-10-12T00:00:01Z",
      message: "Internal image path",
    },
  ]);
  expect(items.map((item) => item.text)).toEqual([
    "Capturing your website reference…",
    "Website screenshot ready",
  ]);
  expect(customerErrorMessage("REFERENCE_CAPTURE_FAILED")).toContain("attach screenshots");
});
