import { creativeApproaches } from "../../shared/creative-approach";
import { uiLanguage, translateUi, useUiLanguage } from "../i18n";
import { PageTemplate } from "../components/page-template";
import { Button, Card, Collapse, Select, Statistic, Table, Tag, Alert } from "antd";
import { GovernanceUsageTable } from "./usage-table";
import { ModelPromptBrowser } from "./model-prompts";
import { aggregateModels } from "../../shared/governance";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { GovernanceReport } from "../../shared/governance";

const date = (value: string | null) =>
  value ? uiLanguage.date(value) : translateUi("Not finished / not recorded");
const duration = (ms: number) =>
  translateUi("{{hours}}h {{minutes}}m {{seconds}}s", {
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor(ms / 60000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  });

export function GovernancePage() {
  useUiLanguage();
  const [report, setReport] = useState<GovernanceReport>();
  const [selected, setSelected] = useState("all");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/admin/governance", { signal: controller.signal });
        if (!response.ok) throw Error(translateUi("Unable to load governance data."));
        setReport(await response.json());
        setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(load, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [revision]);
  if (!report)
    return (
      <PageTemplate
        eyebrow="Admin / AI governance"
        title={translateUi("AI governance")}
        description={<p>{translateUi("Project inputs, responsibilities, usage and spend.")}</p>}
      >
        <div role="status">{error || translateUi("Loading governance…")}</div>
      </PageTemplate>
    );
  const projects = report.projects.filter(
    (project) => selected === "all" || project.id === selected,
  );
  const activity = projects.flatMap((project) => project.activity);
  const totalTools = activity.reduce((sum, row) => sum + row.tools, 0);
  const totalTokens = activity.reduce(
    (sum, row) => sum + (row.inputTokens || 0) + (row.outputTokens || 0),
    0,
  );
  const totalCost = activity.reduce((sum, row) => sum + (row.costLow || 0), 0);
  return (
    <PageTemplate
      className="governance-page governance-ant"
      eyebrow="Admin / AI governance"
      title={translateUi("AI governance")}
      description={<p>{translateUi("Project inputs, responsibilities, usage and spend.")}</p>}
      actions={
        <Button icon={<RefreshCw size={16} />} onClick={() => setRevision((n) => n + 1)}>
          {translateUi("Refresh")}
        </Button>
      }
      controls={
        <div className="governance-filter">
          <Select
            aria-label={translateUi("Governance project")}
            className="governance-ant-select"
            styles={{ popup: { root: { maxWidth: "calc(100vw - 32px)", minWidth: 0 } } }}
            value={selected}
            onChange={setSelected}
            showSearch={{ optionFilterProp: "label" }}
            options={[
              { value: "all", label: translateUi("All projects"), description: "" },
              ...report.projects.map((project) => ({
                value: project.id,
                label: project.name,
                description: `${project.request.outputType === "page" ? translateUi("HTML") : translateUi("Video")} · ${project.request.provider === "claude" ? translateUi("Claude") : translateUi("GPT")} · ${date(project.started)} · ${project.id}`,
              })),
            ]}
            optionRender={(option) => (
              <div className="governance-ant-option" data-project-id={option.value}>
                <div className="governance-ant-option-name" title={option.data.label}>
                  {option.data.label}
                </div>
                {option.data.description && <small>{option.data.description}</small>}
              </div>
            )}
          />
          <span>
            {translateUi("Updated") + " "}
            {date(report.generatedAt)}
            {" " + translateUi("· refreshes every 10s")}
          </span>
        </div>
      }
    >
      {error && <Alert type="error" title={error} showIcon />}
      <div className="governance-stats">
        <Card size="small">
          <Statistic title={translateUi("Projects")} value={projects.length} />
        </Card>
        <Card size="small">
          <Statistic title={translateUi("Recorded tool calls")} value={totalTools} />
        </Card>
        <Card size="small">
          <Statistic title={translateUi("Recorded tokens")} value={totalTokens} />
        </Card>
        <Card size="small">
          <Statistic
            title={translateUi("Known cost subtotal · USD")}
            value={totalCost}
            precision={4}
            prefix="$"
            suffix="+"
          />
        </Card>
      </div>
      <Card title={translateUi("Model responsibilities")} className="governance-ant-card">
        <Table
          dataSource={report.models}
          rowKey="function"
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
          columns={[
            {
              title: translateUi("Function"),
              dataIndex: "function",
              render: (value: string) => translateUi(value),
            },
            {
              title: translateUi("Claude selection"),
              dataIndex: "claude",
              render: (value: string) => translateUi(value),
            },
            {
              title: translateUi("GPT selection"),
              dataIndex: "codex",
              render: (value: string) => translateUi(value),
            },
          ]}
        />
        <p className="governance-table-note">
          {translateUi(
            "Configured routing above; actual model IDs appear in each project's activity below. Render/export runs locally without an AI model.",
          )}
        </p>
      </Card>
      <Card
        title={translateUi("Usage by model · selected projects")}
        className="governance-ant-card"
      >
        <GovernanceUsageTable rows={aggregateModels(activity)} />
      </Card>
      {projects.length === 0 && <p>{translateUi("No projects recorded yet.")}</p>}
      {projects.map((project) => (
        <Card
          key={project.id}
          data-project-id={project.id}
          className="governance-panel governance-ant-card"
          title={
            <span className="governance-ant-project-title" title={project.name}>
              {project.name}
            </span>
          }
          extra={
            <Tag
              color={
                project.status === "ready"
                  ? "success"
                  : project.status === "failed"
                    ? "error"
                    : "processing"
              }
            >
              {translateUi(project.status)}
            </Tag>
          }
        >
          <dl className="governance-timing">
            <div>
              <dt>{translateUi("Started")}</dt>
              <dd>{date(project.started)}</dd>
            </div>
            <div>
              <dt>{translateUi("Finished")}</dt>
              <dd>{date(project.finished)}</dd>
            </div>
            <div>
              <dt>{translateUi("Total duration")}</dt>
              <dd>
                {project.durationMs === null
                  ? translateUi("Not recorded")
                  : duration(project.durationMs)}
                {project.finished
                  ? ""
                  : ["ready", "failed", "cancelled", "interrupted"].includes(project.status)
                    ? translateUi(" · incomplete timing")
                    : translateUi(" · elapsed")}
              </dd>
            </div>
          </dl>
          {project.incompleteHistory && (
            <p className="governance-note">
              {translateUi(
                "Historical record: some function/model attribution or usage was not captured. Counts cover recorded activity only.",
              )}
            </p>
          )}
          <Collapse
            className="governance-ant-sections"
            defaultActiveKey={projects.length === 1 ? ["inputs", "usage"] : ["usage"]}
            items={[
              {
                key: "inputs",
                label: translateUi("User input and settings"),
                children: (
                  <div className="governance-subsection-body">
                    <h3>{translateUi("Instructions")}</h3>
                    <p className="governance-copy">{project.request.instructions}</p>
                    {project.request.requirements && (
                      <>
                        <h3>{translateUi("Music / instrumental requirements")}</h3>
                        <p className="governance-copy">
                          {project.request.requirements.music.instructions || translateUi("None")}
                        </p>
                        <h3>{translateUi("Image requirements")}</h3>
                        <p className="governance-copy">
                          {project.request.requirements.images.instructions || translateUi("None")}
                        </p>
                        <h3>{translateUi("URL requirements")}</h3>
                        <p className="governance-copy">
                          {project.request.requirements.urls.instructions || translateUi("None")}
                        </p>
                      </>
                    )}
                    <dl className="governance-settings">
                      <div>
                        <dt>{translateUi("Output")}</dt>
                        <dd>
                          {project.request.outputType === "page"
                            ? translateUi("Interactive HTML")
                            : translateUi("Video")}
                        </dd>
                      </div>
                      <div>
                        <dt>{translateUi("Provider")}</dt>
                        <dd>{project.request.provider}</dd>
                      </div>
                      <div>
                        <dt>{translateUi("Creative approach")}</dt>
                        <dd>
                          {project.request.pinnedStyleId
                            ? translateUi("Using selected Motion Graphic")
                            : translateUi(creativeApproaches[project.request.preference].label)}
                        </dd>
                      </div>
                      <div>
                        <dt>{translateUi("Preview options")}</dt>
                        <dd>{project.request.candidateCount}</dd>
                      </div>
                      <div>
                        <dt>{translateUi("Primary Motion Graphic")}</dt>
                        <dd>{project.request.pinnedStyleId || translateUi("Automatic")}</dd>
                      </div>
                      {project.request.outputType === "page" ? (
                        <div>
                          <dt>{translateUi("Viewport")}</dt>
                          <dd>{project.request.viewport}</dd>
                        </div>
                      ) : (
                        <>
                          <div>
                            <dt>{translateUi("Duration")}</dt>
                            <dd>
                              {project.request.duration === "auto"
                                ? translateUi("Auto")
                                : `${project.request.duration}s`}
                            </dd>
                          </div>
                          <div>
                            <dt>{translateUi("Aspect ratio")}</dt>
                            <dd>{project.request.aspectRatio}</dd>
                          </div>
                          <div>
                            <dt>{translateUi("Lyrics")}</dt>
                            <dd>
                              {project.request.lyrics?.mode === "provided"
                                ? translateUi("User supplied")
                                : project.request.lyrics?.mode === "write"
                                  ? translateUi("Generate")
                                  : translateUi("Off")}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    {project.request.outputType !== "page" &&
                      project.request.lyrics?.mode === "provided" && (
                        <>
                          <h3>{translateUi("Supplied lyrics")}</h3>
                          <p className="governance-copy">{project.request.lyrics.text}</p>
                        </>
                      )}
                    <h3>{translateUi("URLs")}</h3>
                    {project.request.urls.length ? (
                      <ul>
                        {project.request.urls.map((url) => (
                          <li key={url}>{url}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{translateUi("None")}</p>
                    )}
                    <h3>{translateUi("Attachments")}</h3>
                    {project.attachments.length ? (
                      <ul>
                        {project.attachments.map((asset, i) => (
                          <li key={i}>
                            {asset.name} · {translateUi(asset.kind)} ·{" "}
                            {asset.bytes.toLocaleString()}
                            {" " + translateUi("bytes")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{translateUi("None")}</p>
                    )}
                    <h3>{translateUi("Candidate Motion Graphics")}</h3>
                    <p>
                      {project.selectedStyles.map((name) => translateUi(name)).join(" · ") ||
                        translateUi("Not selected yet")}
                    </p>
                  </div>
                ),
              },
              {
                key: "prompts",
                label: translateUi("Model prompts · {{value0}} prompts", {
                  value0: (project.prompts || []).length,
                }),
                children: (
                  <div className="governance-subsection-body">
                    <ModelPromptBrowser projectId={project.id} prompts={project.prompts || []} />
                  </div>
                ),
              },
              {
                key: "usage",
                label: translateUi("Usage by model and function"),
                children: (
                  <div className="governance-subsection-body">
                    <GovernanceUsageTable rows={project.activity} byFunction />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ))}
      <Card title={translateUi("Accounting notes")} className="governance-ant-card">
        <p>
          {translateUi(
            "Duration is wall-clock time from project creation to the latest completed phase, including waits and retries. Input totals include cache reads/writes; cached input is a subset. Tool starts, updates and results count once per unique tool ID. Invocations are SDK turns, not individual API requests. Failed or cancelled invocations may lack a final usage report. The connected providers report cached input, but no separate cached-output token count. Cached output therefore appears as “Not reported”, rather than zero.",
          )}
        </p>
        <p>
          {translateUi(
            "Costs are estimates, not invoices. Claude SDK estimates and cumulative Codex token counters are differenced across continued sessions, so earlier turns are counted once. GPT costs show standard short/long-context API-equivalent bounds; subscriptions, fast tiers, discounts and infrastructure costs are excluded. Unpriced models remain unavailable. Cached summaries add no new model spend. Older extraction and ranking usage cannot be reconstructed. Totals include retained project records only, excluding deleted projects and separate catalog demo generation.",
          )}
        </p>
        <p>
          {translateUi("Rates checked") + " "}
          {report.pricingDate}:{" "}
          {report.pricingSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {translateUi(source.label)}
            </a>
          ))}
        </p>
      </Card>
    </PageTemplate>
  );
}
