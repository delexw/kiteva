import { PageTemplate } from "../components/page-template";
import { Button, Card, Collapse, Select, Statistic, Table, Tag, Alert } from "antd";
import { GovernanceUsageTable } from "./usage-table";
import { ModelPromptBrowser } from "./model-prompts";
import { aggregateModels } from "../../shared/governance";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { GovernanceReport } from "../../shared/governance";

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not finished / not recorded";
const duration = (ms: number) =>
  `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m ${Math.floor(ms / 1000) % 60}s`;

export function GovernancePage() {
  const [report, setReport] = useState<GovernanceReport>();
  const [selected, setSelected] = useState("all");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/admin/governance", { signal: controller.signal });
        if (!response.ok) throw Error("Unable to load governance data.");
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
        title="AI governance"
        description={<p>Project inputs, responsibilities, usage and spend.</p>}
      >
        <div role="status">{error || "Loading governance…"}</div>
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
      title="AI governance"
      description={<p>Project inputs, responsibilities, usage and spend.</p>}
      actions={
        <Button icon={<RefreshCw size={16} />} onClick={() => setRevision((n) => n + 1)}>
          Refresh
        </Button>
      }
      controls={
        <div className="governance-filter">
          <Select
            aria-label="Governance project"
            className="governance-ant-select"
            styles={{ popup: { root: { maxWidth: "calc(100vw - 32px)", minWidth: 0 } } }}
            value={selected}
            onChange={setSelected}
            showSearch={{ optionFilterProp: "label" }}
            options={[
              { value: "all", label: "All projects", description: "" },
              ...report.projects.map((project) => ({
                value: project.id,
                label: project.name,
                description: `${project.request.outputType === "page" ? "HTML" : "Video"} · ${project.request.provider === "claude" ? "Claude" : "GPT"} · ${date(project.started)} · ${project.id}`,
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
          <span>Updated {date(report.generatedAt)} · refreshes every 10s</span>
        </div>
      }
    >
      {error && <Alert type="error" title={error} showIcon />}
      <div className="governance-stats">
        <Card size="small">
          <Statistic title="Projects" value={projects.length} />
        </Card>
        <Card size="small">
          <Statistic title="Recorded tool calls" value={totalTools} />
        </Card>
        <Card size="small">
          <Statistic title="Recorded tokens" value={totalTokens} />
        </Card>
        <Card size="small">
          <Statistic
            title="Known cost subtotal · USD"
            value={totalCost}
            precision={4}
            prefix="$"
            suffix="+"
          />
        </Card>
      </div>
      <Card title="Model responsibilities" className="governance-ant-card">
        <Table
          dataSource={report.models}
          rowKey="function"
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
          columns={[
            { title: "Function", dataIndex: "function" },
            { title: "Claude selection", dataIndex: "claude" },
            { title: "GPT selection", dataIndex: "codex" },
          ]}
        />
        <p className="governance-table-note">
          Configured routing above; actual model IDs appear in each project's activity below.
          Render/export runs locally without an AI model.
        </p>
      </Card>
      <Card title="Usage by model · selected projects" className="governance-ant-card">
        <GovernanceUsageTable rows={aggregateModels(activity)} />
      </Card>
      {projects.length === 0 && <p>No projects recorded yet.</p>}
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
              {project.status}
            </Tag>
          }
        >
          <dl className="governance-timing">
            <div>
              <dt>Started</dt>
              <dd>{date(project.started)}</dd>
            </div>
            <div>
              <dt>Finished</dt>
              <dd>{date(project.finished)}</dd>
            </div>
            <div>
              <dt>Total duration</dt>
              <dd>
                {project.durationMs === null ? "Not recorded" : duration(project.durationMs)}
                {project.finished
                  ? ""
                  : ["ready", "failed", "cancelled", "interrupted"].includes(project.status)
                    ? " · incomplete timing"
                    : " · elapsed"}
              </dd>
            </div>
          </dl>
          {project.incompleteHistory && (
            <p className="governance-note">
              Historical record: some function/model attribution or usage was not captured. Counts
              cover recorded activity only.
            </p>
          )}
          <Collapse
            className="governance-ant-sections"
            defaultActiveKey={projects.length === 1 ? ["inputs", "usage"] : ["usage"]}
            items={[
              {
                key: "inputs",
                label: "User input and settings",
                children: (
                  <div className="governance-subsection-body">
                    <h3>Instructions</h3>
                    <p className="governance-copy">{project.request.instructions}</p>
                    {project.request.requirements && (
                      <>
                        <h3>Music / instrumental requirements</h3>
                        <p className="governance-copy">
                          {project.request.requirements.music.instructions || "None"}
                        </p>
                        <h3>Image requirements</h3>
                        <p className="governance-copy">
                          {project.request.requirements.images.instructions || "None"}
                        </p>
                        <h3>URL requirements</h3>
                        <p className="governance-copy">
                          {project.request.requirements.urls.instructions || "None"}
                        </p>
                      </>
                    )}
                    <dl className="governance-settings">
                      <div>
                        <dt>Output</dt>
                        <dd>
                          {project.request.outputType === "page" ? "Interactive HTML" : "Video"}
                        </dd>
                      </div>
                      <div>
                        <dt>Provider</dt>
                        <dd>{project.request.provider}</dd>
                      </div>
                      <div>
                        <dt>Creative approach</dt>
                        <dd>
                          {project.request.pinnedStyleId
                            ? "Using selected style"
                            : project.request.preference === "creative"
                              ? "Explore creative ideas"
                              : "Follow my brief"}
                        </dd>
                      </div>
                      <div>
                        <dt>Preview options</dt>
                        <dd>{project.request.candidateCount}</dd>
                      </div>
                      <div>
                        <dt>Primary style</dt>
                        <dd>{project.request.pinnedStyleId || "Automatic"}</dd>
                      </div>
                      {project.request.outputType === "page" ? (
                        <div>
                          <dt>Viewport</dt>
                          <dd>{project.request.viewport}</dd>
                        </div>
                      ) : (
                        <>
                          <div>
                            <dt>Duration</dt>
                            <dd>
                              {project.request.duration === "auto"
                                ? "Auto"
                                : `${project.request.duration}s`}
                            </dd>
                          </div>
                          <div>
                            <dt>Aspect ratio</dt>
                            <dd>{project.request.aspectRatio}</dd>
                          </div>
                          <div>
                            <dt>Lyrics</dt>
                            <dd>
                              {project.request.lyrics?.mode === "provided"
                                ? "User supplied"
                                : project.request.lyrics?.mode === "write"
                                  ? "Generate"
                                  : "Off"}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                    {project.request.outputType !== "page" &&
                      project.request.lyrics?.mode === "provided" && (
                        <>
                          <h3>Supplied lyrics</h3>
                          <p className="governance-copy">{project.request.lyrics.text}</p>
                        </>
                      )}
                    <h3>URLs</h3>
                    {project.request.urls.length ? (
                      <ul>
                        {project.request.urls.map((url) => (
                          <li key={url}>{url}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}
                    <h3>Attachments</h3>
                    {project.attachments.length ? (
                      <ul>
                        {project.attachments.map((asset, i) => (
                          <li key={i}>
                            {asset.name} · {asset.kind} · {asset.bytes.toLocaleString()} bytes
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>None</p>
                    )}
                    <h3>Candidate styles</h3>
                    <p>{project.selectedStyles.join(" · ") || "Not selected yet"}</p>
                  </div>
                ),
              },
              {
                key: "prompts",
                label: `Model prompts · ${(project.prompts || []).length} prompts`,
                children: (
                  <div className="governance-subsection-body">
                    <ModelPromptBrowser projectId={project.id} prompts={project.prompts || []} />
                  </div>
                ),
              },
              {
                key: "usage",
                label: "Usage by model and function",
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
      <Card title="Accounting notes" className="governance-ant-card">
        <p>
          Duration is wall-clock time from project creation to the latest completed phase, including
          waits and retries. Input totals include cache reads/writes; cached input is a subset. Tool
          starts, updates and results count once per unique tool ID. Invocations are SDK turns, not
          individual API requests. Failed or cancelled invocations may lack a final usage report.
          The connected providers report cached input, but no separate cached-output token count.
          Cached output therefore appears as “Not reported”, rather than zero.
        </p>
        <p>
          Costs are estimates, not invoices. Claude SDK estimates and cumulative Codex token
          counters are differenced across continued sessions, so earlier turns are counted once. GPT
          costs show standard short/long-context API-equivalent bounds; subscriptions, fast tiers,
          discounts and infrastructure costs are excluded. Unpriced models remain unavailable.
          Cached summaries add no new model spend. Older extraction and ranking usage cannot be
          reconstructed. Totals include retained project records only, excluding deleted projects
          and separate catalog demo generation.
        </p>
        <p>
          Rates checked {report.pricingDate}:{" "}
          {report.pricingSources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.label}
            </a>
          ))}
        </p>
      </Card>
    </PageTemplate>
  );
}
