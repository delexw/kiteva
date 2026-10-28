import { LoadingStatus } from "../components/loading-status";
import { uiLanguage, translateUi, useUiLanguage } from "../i18n";
import { PromptText } from "../components/style-mention";
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
      title: translateUi("{{value0}} · {{value1}} prompts", {
        value0: model,
        value1: calls.length,
      }),
      children: [...new Set(calls.map((call) => call.purpose))].map((purpose) => ({
        key: `purpose:${JSON.stringify([model, purpose])}`,
        selectable: false,
        title: translateUi(purpose),
        children: calls
          .filter((call) => call.purpose === purpose)
          .map((call, index) => ({
            key: call.id,
            isLeaf: true,
            title: (
              <span>
                {translateUi("Prompt") + " "}
                {index + 1} · {uiLanguage.date(call.time)}{" "}
                <span className="governance-prompt-source">
                  {call.source === "historical"
                    ? translateUi("Historical")
                    : translateUi("Recorded")}
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
  useUiLanguage();
  return (
    <div className="governance-ant-prompt-tree">
      {!prompts.length ? (
        <p>{translateUi("No invocation prompts were recorded for this project.")}</p>
      ) : (
        <Tree
          virtual={false}
          motion={{ motionAppear: false, motionEnter: false, motionLeave: false }}
          aria-label={translateUi("Invocation prompts")}
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
  useUiLanguage();
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
        if (!response.ok) throw Error(translateUi("Unable to load this prompt."));
        const prompt = (await response.json()) as ModelPromptRecord;
        if (!controller.signal.aborted) setRecord(prompt);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [projectId, selected]);
  return (
    <section className="governance-model-prompts" aria-label={translateUi("Model prompts")}>
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
        title={`${selected?.model || ""} · ${translateUi(selected?.purpose || "")}`}
        footer={null}
        width="min(1100px, calc(100vw - 32px))"
        className="governance-ant-prompt-modal"
        destroyOnHidden
        focusable={{ trap: true, focusTriggerAfterClose: true }}
      >
        <p className="governance-modal-description">
          {translateUi(
            "Full invocation prompt. Secrets are redacted; historical gaps are identified explicitly.",
          )}
        </p>
        <div className="governance-prompt-body">
          {!record &&
            (error ? (
              <p role="status">{error}</p>
            ) : (
              <LoadingStatus text={translateUi("Loading full prompt…")} />
            ))}
          {record && (
            <>
              {record.note && <Alert title={translateUi(record.note)} type="info" />}
              {record.reasoningEffort && (
                <p>
                  {translateUi("Reasoning effort:") + " "}
                  {translateUi(record.reasoningEffort)}
                </p>
              )}
              <h3>{translateUi("System instructions")}</h3>
              <pre>
                <PromptText>
                  {record.system || translateUi("Not recorded for this historical invocation.")}
                </PromptText>
              </pre>
              <h3>{translateUi("User prompt")}</h3>
              <pre>
                <PromptText>
                  {record.user
                    ? formatModelPrompt(record.user)
                    : translateUi("The original prompt is unavailable.")}
                </PromptText>
              </pre>
              {record.outputSchema != null && (
                <Collapse
                  items={[
                    {
                      key: "schema",
                      label: translateUi("Structured output schema"),
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
