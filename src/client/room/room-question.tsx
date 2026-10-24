import { PromptText } from "../components/style-mention";
import { translateUi, useUiLanguage } from "../i18n";
import { Bubble, Sender } from "@ant-design/x";
import { RoomFilePick } from "./room-file-card";
import { Button, Alert, Tag } from "antd";
import { useState } from "react";
import type { Run } from "../../shared/contracts";
import type { RoomLibraryAsset } from "../../shared/room";
import type { AssetQuestion } from "../../shared/asset-requirements-policy";
import { assetRequirementsPolicy } from "../../shared/asset-requirements-policy";
import { acceptsBriefAttachment } from "../../shared/brief-sections";
import { validateAssetLimits } from "../../shared/asset-limits";
import { api } from "../lib/api";
import { roomQuestionScope } from "./question-scope";

export function RoomQuestion({
  run,
  question,
  draft,
  onDraft,
  materials,
  onUpdated,
}: {
  run: Run;
  question: AssetQuestion;
  draft: string;
  onDraft: (text: string) => void;
  materials: RoomLibraryAsset[];
  onUpdated: (run: Run) => void;
}) {
  useUiLanguage();
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const job = run.jobs.find((j) => j.id === question.jobId);
  const scope = roomQuestionScope(run, question.jobId);
  const section = assetRequirementsPolicy.requirements[question.kind].section;
  const choices = materials.filter(
    (asset) =>
      acceptsBriefAttachment(section, asset.originalName) &&
      !run.request.assetIds.includes(asset.id),
  );
  async function answer(text: string, assetIds: string[]) {
    setBusy(true);
    setError("");
    try {
      if (assetIds.length) {
        const current = await api<{
          assets: Array<{
            id: string;
            originalName: string;
            bytes?: number;
            durationSeconds?: number;
            documentPages?: number;
          }>;
        }>(`/api/runs/${run.id}/assets`);
        validateAssetLimits(
          [...current.assets, ...materials.filter((asset) => assetIds.includes(asset.id))].map(
            (asset) => ({ ...asset, name: asset.originalName, bytes: asset.bytes || 0 }),
          ),
        );
      }
      onUpdated(
        await api<Run>(`/api/runs/${run.id}/asset-questions/${question.id}`, {
          method: "POST",
          body: JSON.stringify({ answer: text, assetIds }),
        }),
      );
      onDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="room-question">
      <div className="room-question-scroll">
        <div className="room-question-scope">
          <Tag bordered={false} className="is-blocking">
            {translateUi("Paused for you")}
          </Tag>
          <span className="room-scope">{scope}</span>
        </div>
        {job?.poster && (
          <img
            className="room-question-thumbnail"
            alt={translateUi("{{value0}} still", { value0: scope })}
            src={`/api/artifacts/${run.id}/${job.id}/${job.poster}`}
          />
        )}
        <Bubble
          placement="start"
          avatar={<img className="room-avatar" src="/kiteva-mark.svg" alt="" />}
          content={<PromptText>{question.question}</PromptText>}
          footer={
            <span className="room-hint">
              <PromptText>{question.reason}</PromptText>
            </span>
          }
        />
        <p className="room-hint">
          {translateUi("This part is paused until you answer. Everything else keeps going.")}
        </p>
        {choices.length > 0 && (
          <div className="room-shelf-picks" aria-label={translateUi("Add from your shelf")}>
            <span>{translateUi("Add from your shelf")}</span>
            <div>
              {choices.map((asset) => (
                <RoomFilePick
                  key={asset.id}
                  asset={asset}
                  picked={ids.includes(asset.id)}
                  onToggle={() =>
                    setIds((previous) =>
                      previous.includes(asset.id)
                        ? previous.filter((id) => id !== asset.id)
                        : [...previous, asset.id],
                    )
                  }
                />
              ))}
            </div>
          </div>
        )}
        <div className="room-question-alternative">
          <Button disabled={busy} onClick={() => void answer(question.fallback, [])}>
            {translateUi("Use the alternative")}
          </Button>
          <small>
            <PromptText>{question.fallback}</PromptText>
          </small>
        </div>
        {error && <Alert type="error" showIcon title={error} />}
      </div>
      <Sender
        aria-label={translateUi("Reply about {{value0}}", { value0: scope })}
        value={draft}
        onChange={onDraft}
        onSubmit={(text) => void answer(text, ids)}
        loading={busy}
        placeholder={translateUi("Type your answer…")}
      />
    </div>
  );
}
