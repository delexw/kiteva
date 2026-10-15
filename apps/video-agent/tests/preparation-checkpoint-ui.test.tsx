import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PreparationCheckpoints } from "../src/client/components/preparation-checkpoints";
it("clearly distinguishes reusable completed checkpoints from incomplete work", () => {
  const html = renderToStaticMarkup(
    <PreparationCheckpoints
      preparation={{
        fingerprint: "inputs",
        checkpoints: {
          inputs: { state: "completed", completedAt: "earlier", output: {} },
          brief: { state: "completed", completedAt: "earlier", output: {} },
          proposals: { state: "failed", finishedAt: "now", errorCode: "PREPARATION_FAILED" },
          selection: {
            state: "interrupted",
            finishedAt: "now",
            errorCode: "GENERATION_INTERRUPTED",
          },
        },
      }}
    />,
  );
  expect(html).toContain("Brief · Complete");
  expect(html).toContain("Creative directions · Needs retry");
  expect(html).toContain("Direction selection · Interrupted");
  expect(html).not.toContain("Direction selection · Complete");
});
