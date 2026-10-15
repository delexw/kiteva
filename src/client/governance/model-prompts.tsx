import { useEffect, useState } from "react";
import { Modal, Tree, Collapse, Alert, type TreeDataNode } from "antd";
import {
  formatModelPrompt,
  type ModelPromptSummary,
  type ModelPromptRecord,
} from "../../shared/model-prompts";

export function modelPromptTreeData(prompts: ModelPromptSummary[]): TreeDataNode[] {
  return [...new Set(prompts.map((prompt) => prompt.model))].map((model) => {
    const calls = prompts.filter((prompt) => prompt.model === model);
    return {
      key: `model:${model}`,
      selectable: false,
      title: `${model} · ${calls.length} prompts`,
      children: [...new Set(calls.map((call) => call.purpose))].map((purpose) => ({
        key: `purpose:${JSON.stringify([model, purpose])}`,
        selectable: false,
        title: purpose,
        children: calls
          .filter((call) => call.purpose === purpose)
          .map((call, index) => ({
            key: call.id,
            isLeaf: true,
            title: (
              <span>
                Prompt {index + 1} · {new Date(call.time).toLocaleString()}{" "}
                <span className="governance-prompt-source">
                  {call.source === "historical" ? "Historical" : "Recorded"}
                </span>
              </span>
            ),
          })),
      })),
    };
  });
}
export function ModelPromptTree({
  prompts,
  onSelect,
}: {
  prompts: ModelPromptSummary[];
  onSelect: (prompt: ModelPromptSummary) => void;
}) {
  return (
    <div className="governance-ant-prompt-tree">
      {!prompts.length ? (
        <p>No invocation prompts were recorded for this project.</p>
      ) : (
        <Tree
          virtual={false}
          motion={{ motionAppear: false, motionEnter: false, motionLeave: false }}
          aria-label="Invocation prompts"
          treeData={modelPromptTreeData(prompts)}
          showLine
          blockNode
          onSelect={(_keys, info) => {
            const prompt = prompts.find((prompt) => prompt.id === info.node.key);
            if (prompt) onSelect(prompt);
          }}
        />
      )}
    </div>
  );
}

export function ModelPromptBrowser({
  projectId,
  prompts,
}: {
  projectId: string;
  prompts: ModelPromptSummary[];
}) {
  const [selected, setSelected] = useState<ModelPromptSummary>();
  const [record, setRecord] = useState<ModelPromptRecord>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setRecord(undefined);
    setError("");
    void fetch(
      `/api/admin/governance/${encodeURIComponent(projectId)}/prompts/${encodeURIComponent(selected.id)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw Error("Unable to load this prompt.");
        const prompt = (await response.json()) as ModelPromptRecord;
        if (!controller.signal.aborted) setRecord(prompt);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [projectId, selected]);
  return (
    <section className="governance-model-prompts" aria-label="Model prompts">
      <ModelPromptTree
        prompts={prompts}
        onSelect={(prompt) => {
          setRecord(undefined);
          setError("");
          setSelected(prompt);
        }}
      />
      <Modal
        open={Boolean(selected)}
        onCancel={() => setSelected(undefined)}
        title={`${selected?.model || ""} · ${selected?.purpose || ""}`}
        footer={null}
        width="min(1100px, calc(100vw - 32px))"
        className="governance-ant-prompt-modal"
        destroyOnHidden
        focusable={{ trap: true, focusTriggerAfterClose: true }}
      >
        <p className="governance-modal-description">
          Full invocation prompt. Secrets are redacted; historical gaps are identified explicitly.
        </p>
        <div className="governance-prompt-body">
          {!record && <p role="status">{error || "Loading full prompt…"}</p>}
          {record && (
            <>
              {record.note && <Alert title={record.note} type="info" />}
              {record.reasoningEffort && <p>Reasoning effort: {record.reasoningEffort}</p>}
              <h3>System instructions</h3>
              <pre>{record.system || "Not recorded for this historical invocation."}</pre>
              <h3>User prompt</h3>
              <pre>
                {record.user
                  ? formatModelPrompt(record.user)
                  : "The original prompt is unavailable."}
              </pre>
              {record.outputSchema != null && (
                <Collapse
                  items={[
                    {
                      key: "schema",
                      label: "Structured output schema",
                      children: <pre>{JSON.stringify(record.outputSchema, null, 2)}</pre>,
                    },
                  ]}
                />
              )}
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}
