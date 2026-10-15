import { useState } from "react";
import { Button, Select } from "antd";
import type { Run } from "../../shared/contracts";
import { terminalPhases } from "../../shared/contracts";
import { candidateDisplayTitle } from "../../shared/candidate-copy";
import { customerErrorMessage } from "../customer-messages";
import { errorCode } from "../../shared/errors";
import { api } from "../lib/api";
import { PromptInput, PromptInputTextarea, PromptInputFooter } from "./ai-elements/prompt-input";

export function VideoRefinement({ run, onUpdated }: { run: Run; onUpdated: (run: Run) => void }) {
  const completed = run.jobs.filter(
    (job) =>
      job.kind === "full" && job.phase === "ready" && job.outputType !== "page" && job.sessionId,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!completed.length) return null;
  const selected = completed.find((job) => job.id === selectedId) || completed.at(-1)!;
  const active =
    busy ||
    !terminalPhases.has(run.phase) ||
    run.jobs.some((job) => !terminalPhases.has(job.phase));
  return (
    <section className="video-refinement" aria-label="Fine-tune your video">
      <h3>Fine-tune your video</h3>
      <p>Describe what to change. Your current video stays saved as a separate version.</p>
      <Select
        aria-label="Video to fine-tune"
        value={selected.id}
        disabled={active}
        onChange={setSelectedId}
        options={completed.map((job, index) => ({
          value: job.id,
          label: `${candidateDisplayTitle(
            run.candidates.find((entry) => entry.id === job.candidateId),
            index + 1,
          )} · version ${index + 1}`,
        }))}
      />
      <PromptInput
        onSubmit={async (message) => {
          if (active || !message.text.trim()) return;
          setBusy(true);
          setError("");
          try {
            await api(`/api/runs/${run.id}/refine`, {
              method: "POST",
              body: JSON.stringify({ jobId: selected.id, prompt: message.text }),
            });
            onUpdated(await api<Run>(`/api/runs/${run.id}`));
            setPrompt("");
          } catch (issue) {
            setError(customerErrorMessage(errorCode(issue)));
          } finally {
            setBusy(false);
          }
        }}
      >
        <PromptInputTextarea
          aria-label="Fine-tune instructions"
          placeholder="For example: slow the opening and make the captions larger…"
          maxLength={6000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={active}
        />
        <PromptInputFooter>
          <Button
            htmlType="submit"
            type="primary"
            loading={busy}
            disabled={active || !prompt.trim()}
          >
            Apply changes
          </Button>
        </PromptInputFooter>
      </PromptInput>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
