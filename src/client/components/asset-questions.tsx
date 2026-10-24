import { PromptText } from "./style-mention";
import { translateUi, useUiLanguage } from "../i18n";
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
  useUiLanguage();
  const attachments = usePromptInputAttachments();
  return (
    <>
      <ComposerAttachments />
      <Button htmlType="button" disabled={disabled} onClick={attachments.openFileDialog}>
        {translateUi("Attach reference")}
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
  useUiLanguage();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(text: string, files: PromptInputMessage["files"]) {
    setBusy(true);
    setError("");
    try {
      await onAnswer(text, files);
    } catch {
      setError(translateUi("We couldn't save your reply. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Message from="assistant" className="asset-question-card">
      <MessageContent>
        <p>
          <PromptText>{question.question}</PromptText>
        </p>
        <p className="asset-question-fallback">
          {translateUi("Alternative:") + " "}
          <PromptText>{question.fallback}</PromptText>
        </p>
        <p className="asset-question-note">
          {translateUi("This part is paused until you answer. Everything else keeps going.")}{" "}
          {question.jobId
            ? translateUi("Your reply and references apply before this result continues.")
            : translateUi("Your reply and references apply to the project.")}
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
            aria-label={translateUi("Your reply")}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={translateUi("Add a preference or attach a reference…")}
            disabled={busy}
          />
          <PromptInputFooter className="asset-question-actions">
            <ReferenceUpload disabled={busy} />
            <Button htmlType="submit" type="primary" disabled={busy}>
              {translateUi("Send reply")}
            </Button>
            <Button
              htmlType="button"
              disabled={busy}
              onClick={() => void submit(question.fallback, [])}
            >
              {translateUi("Continue with alternative")}
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
  useUiLanguage();
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
      if (!response.ok) throw Error(translateUi("Could not read attachment"));
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
      aria-label={
        jobId ? translateUi("Questions for this result") : translateUi("Project questions")
      }
    >
      <h4>
        {jobId ? translateUi("Question for this result") : translateUi("Main progress questions")}
      </h4>
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
