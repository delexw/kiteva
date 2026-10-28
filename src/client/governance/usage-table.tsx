import { translateUi, useUiLanguage } from "../i18n";
import { Table, Typography, type TableColumnsType } from "antd";
import type { ModelActivity } from "../../shared/governance";
const tokens = (value: number | null | undefined) =>
  value == null ? translateUi("Not recorded") : value.toLocaleString();
const probability = (value: number | null) =>
  value === null ? translateUi("Not recorded") : `${Math.round(value * 100)}%`;
const money = (row: ModelActivity) =>
  row.costLow === null
    ? translateUi("Unavailable")
    : row.costHigh !== row.costLow
      ? `$${row.costLow.toFixed(4)}–$${row.costHigh!.toFixed(4)}`
      : `$${row.costLow.toFixed(4)}`;
export function GovernanceUsageTable({
  rows,
  byFunction = false,
}: {
  rows: ModelActivity[];
  byFunction?: boolean;
}) {
  useUiLanguage();
  const columns: TableColumnsType<ModelActivity> = [
    {
      title: byFunction ? translateUi("Model / function") : translateUi("Model"),
      dataIndex: "model",
      key: "model",
      width: 230,
      render: (_, row) => (
        <>
          <strong>{row.model}</strong>
          {byFunction && (
            <div className="governance-table-detail">
              {row.purpose && translateUi(row.purpose)}
              {row.cacheHits
                ? translateUi(" · {{value0}} cached summaries reused", { value0: row.cacheHits })
                : ""}
            </div>
          )}
          {byFunction &&
            row.authoringSelections?.map((selection) => (
              <div key={selection.jobId} className="governance-table-detail">
                <div>
                  {translateUi(selection.kind === "preview" ? "Preview" : "Full film")}
                  {selection.direction && ` · ${selection.direction}`}
                </div>
                {selection.resources
                  .filter((resource) => resource.selected)
                  .map((resource) => (
                    <div key={resource.id}>
                      {translateUi("Selected authoring resource")}: {translateUi(resource.name)} (
                      {probability(resource.probability)})
                    </div>
                  ))}
              </div>
            ))}
        </>
      ),
    },
    {
      title: translateUi("Invocations"),
      dataIndex: "calls",
      key: "calls",
      width: 100,
      sorter: (a, b) => a.calls - b.calls,
    },
    {
      title: translateUi("Tools"),
      dataIndex: "tools",
      key: "tools",
      width: 70,
      sorter: (a, b) => a.tools - b.tools,
    },
    {
      title: translateUi("Total input tokens"),
      dataIndex: "inputTokens",
      key: "inputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Output tokens"),
      dataIndex: "outputTokens",
      key: "outputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Uncached input"),
      dataIndex: "uncachedInputTokens",
      key: "uncachedInputTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cache reads"),
      dataIndex: "cachedTokens",
      key: "cachedTokens",
      width: 110,
      render: tokens,
    },
    {
      title: translateUi("Cache writes"),
      key: "cacheWriteTokens",
      width: 150,
      render: (_, row) => (
        <>
          {tokens(row.cacheWriteTokens)}
          {(row.cacheWrite5mTokens != null || row.cacheWrite1hTokens != null) && (
            <div className="governance-table-detail">
              5m: {tokens(row.cacheWrite5mTokens)} · 1h: {tokens(row.cacheWrite1hTokens)}
            </div>
          )}
        </>
      ),
    },
    {
      title: translateUi("Estimated USD"),
      key: "cost",
      width: 160,
      fixed: "right",
      render: (_, row) => (
        <>
          {money(row)}
          <div>
            <Typography.Text type="secondary" className="governance-table-detail">
              {translateUi(byFunction ? row.costBasis : "Known subtotal")}
            </Typography.Text>
          </div>
        </>
      ),
    },
  ];
  return (
    <Table<ModelActivity>
      expandable={
        byFunction
          ? {
              rowExpandable: (row) =>
                Boolean(
                  row.authoringSelections?.length ||
                  row.combinationEvaluation ||
                  row.renderCacheReviews?.length,
                ),
              expandedRowRender: (row) => (
                <div>
                  {row.renderCacheReviews?.map((review) => (
                    <section key={review.id} aria-label={translateUi("Render cache review")}>
                      <strong>{review.shot || translateUi("Not recorded")}</strong>
                      {review.direction && (
                        <div>
                          {review.direction} ·{" "}
                          {translateUi("Version {{value0}}", { value0: review.version })}
                        </div>
                      )}
                      <div>
                        {translateUi("JEV decision")}:{" "}
                        {review.choice === null
                          ? translateUi("Not recorded")
                          : translateUi(
                              review.choice === "reuse" ? "Reuse cached shot" : "Rebuild shot",
                            )}
                      </div>
                      <div>
                        {translateUi("Choice certainty")}: {probability(review.confidence)}
                      </div>
                      <ul>
                        <li>
                          {translateUi("Reuse cached shot")}:{" "}
                          {probability(review.probabilities.reuse)}
                        </li>
                        <li>
                          {translateUi("Rebuild shot")}: {probability(review.probabilities.refresh)}
                        </li>
                      </ul>
                      {review.summary && <p>{review.summary}</p>}
                      {review.renderImpact && <p>{review.renderImpact}</p>}
                      {review.uncertain && (
                        <p>
                          {translateUi(
                            "The change brief is uncertain; cached footage cannot be reused.",
                          )}
                        </p>
                      )}
                      <a href={review.promptUrl} target="_blank" rel="noreferrer">
                        {translateUi("Recorded review input")} · {review.time}
                      </a>
                    </section>
                  ))}
                  {row.combinationEvaluation && (
                    <section aria-label={translateUi("Combination evaluation")}>
                      {row.combinationEvaluation.selected.map((candidate) => (
                        <section key={candidate.id}>
                          <strong>{candidate.title || candidate.id}</strong>
                          <div>{candidate.styles.join(" · ")}</div>
                          <p>{candidate.rationale}</p>
                          <div>
                            {translateUi("Evaluation score")}: {candidate.score.toFixed(1)} / 100
                          </div>
                          {candidate.evaluationConfidence != null && (
                            <div>
                              {translateUi("Evaluation certainty")}:{" "}
                              {probability(candidate.evaluationConfidence)}
                            </div>
                          )}
                          <div>
                            {translateUi("Choice certainty in final comparison")}:{" "}
                            {probability(candidate.confidence)}
                          </div>
                          <p>
                            {translateUi(
                              "Choice certainty measures how strongly JEV preferred one option over the others. Near zero means a near tie; it is not the quality score or a success probability.",
                            )}
                          </p>
                          <div>
                            {candidate.selectionDecision ? (
                              <>
                                {translateUi("Selection round")}:{" "}
                                {candidate.selectionDecision.round}
                                <ul>
                                  {candidate.selectionDecision.comparedIds.map((id) => (
                                    <li key={id}>
                                      {id}:{" "}
                                      {probability(
                                        candidate.selectionDecision!.probabilities[id] ?? null,
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              translateUi(
                                "Original choice probabilities were not recorded for this run.",
                              )
                            )}
                          </div>
                          <ul>
                            {Object.entries(candidate.dimensions).map(([name, value]) => (
                              <li key={name}>
                                {translateUi(name)}: {probability(value)}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                      <strong>{translateUi("Recorded evaluation calls")}</strong>
                      <ol>
                        {row.combinationEvaluation.calls.map((call) => (
                          <li key={call.id}>
                            <a href={call.promptUrl} target="_blank" rel="noreferrer">
                              {call.time}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                  {row.authoringSelections?.map((selection) => (
                    <section key={selection.jobId} aria-label={translateUi("Authoring comparison")}>
                      <strong>
                        {translateUi(selection.kind === "preview" ? "Preview" : "Full film")}
                        {selection.direction && ` · ${selection.direction}`}
                      </strong>
                      <ul>
                        {selection.resources.map((resource) => (
                          <li key={resource.id}>
                            {translateUi(resource.name)} · {probability(resource.probability)}
                            {resource.selected && ` · ${translateUi("Selected")}`}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ),
            }
          : undefined
      }
      className="governance-ant-table"
      columns={columns}
      dataSource={rows}
      rowKey={(row) => `${row.model}|${row.purpose}`}
      pagination={false}
      tableLayout="fixed"
      scroll={{ x: 1300 }}
      size="small"
      locale={{ emptyText: translateUi("No model activity recorded.") }}
    />
  );
}
