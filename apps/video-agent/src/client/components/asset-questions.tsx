import { scopedAssetQuestions } from "../../shared/asset-question-scopes";
import { validateAssetLimits } from "../../shared/asset-limits";
import { useState } from "react";
import { Button } from "antd";
import type { Run } from "../../shared/contracts";
import {
  assetRequirementsPolicy,
  type AssetQuestion,
} from "../../shared/asset-requirements-policy";
import { api } from "../lib/api";
import { Message, MessageContent } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  type PromptInputMessage,
  usePromptInputAttachments,
} from "./ai-elements/prompt-input";
import { ComposerAttachments } from "./composer-attachments";

function ReferenceUpload({ disabled }: { disabled: boolean }) {
  const attachments = usePromptInputAttachments();
  return (
    <>
      <ComposerAttachments />
      <Button htmlType="button" disabled={disabled} onClick={attachments.openFileDialog}>
        Attach reference
      </Button>
    </>
  );
}

export function AssetQuestionCard({
  question,
  onAnswer,
}: {
  question: AssetQuestion;
  onAnswer: (answer: string, files: PromptInputMessage["files"]) => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(text: string, files: PromptInputMessage["files"]) {
    setBusy(true);
    setError("");
    try {
      await onAnswer(text, files);
    } catch {
      setError("We couldn't save your reply. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Message from="assistant" className="asset-question-card">
      <MessageContent>
        <p>{question.question}</p>
        <p className="asset-question-fallback">Alternative: {question.fallback}</p>
        <p className="asset-question-note">
          Work continues while you decide.{" "}
          {question.jobId
            ? "Your reply and references apply to this result’s next build."
            : "Your reply and references apply to the project."}
        </p>
        <PromptInput
          multiple
          maxFiles={20}
          maxFileSize={25 * 1024 * 1024}
          accept={assetRequirementsPolicy.requirements[question.kind].accept}
          onError={(issue) => setError(issue.message)}
          onSubmit={(message) => submit(message.text, message.files)}
        >
          <PromptInputTextarea
            aria-label="Your reply"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Add a preference or attach a reference…"
            disabled={busy}
          />
          <PromptInputFooter className="asset-question-actions">
            <ReferenceUpload disabled={busy} />
            <Button htmlType="submit" type="primary" disabled={busy}>
              Send reply
            </Button>
            <Button
              htmlType="button"
              disabled={busy}
              onClick={() => void submit(question.fallback, [])}
            >
              Continue with alternative
            </Button>
          </PromptInputFooter>
        </PromptInput>
        {error && <p role="alert">{error}</p>}
      </MessageContent>
    </Message>
  );
}

export function AssetQuestions({
  run,
  onUpdated,
  jobId,
}: {
  run: Run;
  onUpdated: (run: Run) => void;
  jobId?: string;
}) {
  const questions =
    scopedAssetQuestions(run).filter(
      (question) => question.state === "open" && question.jobId === jobId,
    ) || [];
  async function answer(question: AssetQuestion, text: string, files: PromptInputMessage["files"]) {
    const assetIds: string[] = [];
    const references = files.length
      ? (
          await api<{ assets: Array<{ id: string; originalName: string; bytes?: number }> }>(
            `/api/runs/${run.id}/assets`,
          )
        ).assets.map((asset) => ({ name: asset.originalName, bytes: asset.bytes ?? 0 }))
      : [];
    for (const file of files) {
      const response = await fetch(file.url);
      if (!response.ok) throw Error("Could not read attachment");
      const form = new FormData();
      const blob = await response.blob();
      const name = file.filename || "reference";
      validateAssetLimits([...references, { name, bytes: blob.size }]);
      form.append("assetIds", JSON.stringify([...new Set([...run.request.assetIds, ...assetIds])]));
      form.append("file", blob, name);
      const asset = await api<{ id: string }>("/api/assets", { method: "POST", body: form });
      assetIds.push(asset.id);
      references.push({ name, bytes: blob.size });
    }
    onUpdated(
      await api<Run>(`/api/runs/${run.id}/asset-questions/${question.id}`, {
        method: "POST",
        body: JSON.stringify({ answer: text, assetIds }),
      }),
    );
  }
  if (!questions.length) return null;
  return (
    <section
      className="asset-questions"
      aria-label={jobId ? "Questions for this result" : "Project questions"}
    >
      <h4>{jobId ? "Question for this result" : "Main progress questions"}</h4>
      {questions.map((question) => (
        <AssetQuestionCard
          key={question.id}
          question={question}
          onAnswer={(text, files) => answer(question, text, files)}
        />
      ))}
    </section>
  );
}
