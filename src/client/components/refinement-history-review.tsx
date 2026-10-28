import { Checkbox, Collapse, Typography } from "antd";
import { useEffect, useState } from "react";
import type { Run } from "../../shared/contracts";
import { availableRefinementInstructions } from "../../shared/refinement-history";
import { jobVersions } from "../../shared/job-versions";
import { translateUi, useUiLanguage } from "../i18n";

export function useRefinementExclusions(run: Run) {
  const [discarded, setDiscarded] = useState(run.discardedRefinementJobIds || []);
  const saved = JSON.stringify(run.discardedRefinementJobIds || []);
  useEffect(() => setDiscarded(JSON.parse(saved)), [run.id, saved]);
  return [discarded, setDiscarded] as const;
}

/** Review requests, rather than partial implementation artifacts from stopped jobs. */
export function RefinementHistoryReview({
  run,
  sourceJobId,
  discarded,
  onChange,
  disabled = false,
}: {
  run: Run;
  sourceJobId?: string;
  discarded: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  useUiLanguage();
  const source = run.jobs.find((job) => job.id === sourceJobId);
  if (!source) return null;
  const entries = availableRefinementInstructions(run, source.candidateId);
  if (!entries.length) return null;
  const versions = jobVersions(run.jobs);
  return (
    <Collapse
      size="small"
      className="refinement-history-review"
      items={[
        {
          key: "requests",
          label: translateUi("Earlier refinement requests ({{count}})", { count: entries.length }),
          children: (
            <>
              <Typography.Paragraph type="secondary">
                {translateUi(
                  "Keep checked requests. Unchecking excludes instructions from the next refinement; it does not undo edits already in the selected video.",
                )}
              </Typography.Paragraph>
              {entries.map((entry) => {
                const included = !discarded.includes(entry.jobId);
                return (
                  <div key={entry.jobId} style={{ marginBottom: 12 }}>
                    <Checkbox
                      checked={included}
                      disabled={disabled}
                      aria-label={translateUi("Keep request from version {{value0}}", {
                        value0: versions.get(entry.jobId) || "?",
                      })}
                      onChange={() =>
                        onChange(
                          included
                            ? [...discarded, entry.jobId]
                            : discarded.filter((id) => id !== entry.jobId),
                        )
                      }
                    >
                      {translateUi("Version {{value0}}", {
                        value0: versions.get(entry.jobId) || "?",
                      })}
                    </Checkbox>
                    <Typography.Paragraph
                      ellipsis={{ rows: 2, expandable: true }}
                      style={{ marginBlock: 4, whiteSpace: "pre-wrap" }}
                    >
                      {entry.prompt}
                    </Typography.Paragraph>
                  </div>
                );
              })}
            </>
          ),
        },
      ]}
    />
  );
}
