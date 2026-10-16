import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bubble, Sender } from "@ant-design/x";
import { RoomChosenFile, RoomFilePick } from "./room-file-card";
import { Alert, Button, Input, InputNumber, Select, Switch, Tag, Upload } from "antd";
import { ZodError } from "zod";
import type { CreativeRequest, Run, StyleExample } from "../../shared/contracts";
import type { RoomDraft, RoomLibraryAsset } from "../../shared/room";
import {
  attachRoomStepUploads,
  roomDraftRequest,
  roomMaterialIntake,
  roomMaterialSection,
  roomMaterialSteps,
  roomQuestions,
  roomSubmission,
  roomStepMaterialCounts,
  switchRoomOutputType,
  toggleRoomDraftAsset,
} from "./onboarding";
import { StylePicker } from "../components/style-picker";
import { manualStyleLimit, trimStylesForDuration } from "../../shared/style-selection";
import { lyricsFromInput } from "../../shared/domains/video";
import { providerDisplayName } from "../../shared/model-display-name";
import { api } from "../lib/api";
import { RendererChoice } from "./renderer-choice";
import { SpeechSettings } from "../components/speech-settings";
import { ensureSpeechGenerationReady } from "../lib/speech";
import { activeSpeech } from "../../shared/speech";
import { videoRendererOf, videoRenderers } from "../../shared/video-renderers";

const assistantAvatar = <img className="room-avatar" src="/kiteva-mark.svg" alt="" />;
function errorMessage(error: unknown) {
  return error instanceof ZodError
    ? error.issues.map((issue) => issue.message).join(" ")
    : (error as Error).message;
}
function AssistantSays({ children }: { children: ReactNode }) {
  return <Bubble placement="start" avatar={assistantAvatar} content={children} />;
}
function UserSays({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Bubble
      placement="end"
      className={muted ? "room-bubble-user is-skipped" : "room-bubble-user"}
      content={children}
    />
  );
}
function settingsSummary(request: CreativeRequest) {
  const format =
    request.outputType === "page"
      ? `Interactive page · ${request.viewport}`
      : `Video · ${request.duration === "auto" ? "auto length" : `${request.duration}s`} · ${request.aspectRatio} · ${request.resolution || "1080p"} · ${request.frameRate || 30} fps${videoRendererOf(request) === "multiplane" ? ` · ${videoRenderers.multiplane.label}` : ""}`;
  const direction = request.selectedStyleIds?.length
    ? `${request.selectedStyleIds.length} chosen style${request.selectedStyleIds.length === 1 ? "" : "s"}, built directly`
    : `${request.candidateCount || 5} preview directions`;
  const speech = request.outputType === "video" ? activeSpeech(request) : undefined;
  return `${providerDisplayName(request.provider)} · ${format} · ${direction} · ${request.preference === "creative" ? "explore creative ideas" : "follow my brief"}${speech ? ` · ${speech.mode === "narration" ? "Narration" : "Uploaded vocals"}` : ""}`;
}

export function RoomOnboarding({
  draft,
  onChange,
  materials,
  styles,
  examples,
  onCreated,
  onUpload,
}: {
  draft: RoomDraft;
  onChange: (next: RoomDraft) => void;
  materials: RoomLibraryAsset[];
  styles: Parameters<typeof StylePicker>[0]["styles"];
  examples: StyleExample[];
  onCreated: (run: Run) => void;
  onUpload: (files: File[]) => Promise<RoomLibraryAsset[]>;
}) {
  const request = roomDraftRequest(draft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const step = draft.step;
  const section = roomMaterialSteps[step as keyof typeof roomMaterialSteps];
  const selected = (draft.assets || []).filter((asset) => request.assetIds.includes(asset.id));
  const ideaReady = request.instructions.trim().length >= 8;
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [step]);
  const patch = (change: Partial<CreativeRequest>) =>
    onChange({ ...draft, request: { ...request, ...change } as CreativeRequest });
  const requirements = request.requirements || {
    main: { instructions: "", assetIds: [] },
    images: { instructions: "", assetIds: [] },
    music: { instructions: "", assetIds: [] },
    urls: { instructions: "" },
  };
  const text =
    step === 0
      ? request.instructions
      : step === 3
        ? request.urls.join("\n")
        : section
          ? requirements[section].instructions
          : "";
  const setText = (value: string) => {
    if (step === 0) patch({ instructions: value });
    else if (step === 3) patch({ urls: value.split("\n") });
    else if (section)
      patch({
        requirements: {
          ...requirements,
          [section]: { ...requirements[section], instructions: value },
        },
      });
  };
  const go = (next: number) => {
    setError("");
    onChange({ ...draft, step: next });
  };
  const advance = () => {
    if (step === 0 && !ideaReady) {
      setError("Tell me a little more — at least a short sentence.");
      return;
    }
    if (step === 3) {
      const urls = request.urls.map((url) => url.trim()).filter(Boolean);
      if (urls.length > 5 || urls.some((url) => !URL.canParse(url))) {
        setError("Use up to five full links (starting with https://), one per line.");
        return;
      }
      setError("");
      onChange({ ...draft, step: step + 1, request: { ...request, urls } });
      return;
    }
    go(step + 1);
  };
  const toggle = (asset: RoomLibraryAsset) => {
    try {
      onChange(toggleRoomDraftAsset(draft, asset));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  async function uploadHere(files: File[]) {
    if (!section) return;
    try {
      const result = attachRoomStepUploads(draft, section, await onUpload(files));
      onChange(result.draft);
      setError(result.skipped.join(" · "));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const answers: Array<{ text: string; skipped: boolean }> = roomQuestions.map((_, index) => {
    const names = (name: RoomLibraryAsset[]) => name.map((asset) => asset.originalName).join(", ");
    const sectionOf = roomMaterialSteps[index as keyof typeof roomMaterialSteps];
    if (index === 0) return { text: request.instructions, skipped: false };
    if (index === 3)
      return {
        text: request.urls.filter(Boolean).join("\n") || "No websites",
        skipped: !request.urls.some(Boolean),
      };
    if (index === 5) return { text: settingsSummary(request), skipped: false };
    if (!sectionOf) return { text: "", skipped: true };
    const files = selected.filter((asset) => roomMaterialSection(asset.originalName) === sectionOf);
    const lyrics =
      index === 4 && request.outputType === "video" && request.lyrics?.mode !== "off"
        ? request.lyrics?.mode === "provided"
          ? "Show my lyrics on screen."
          : "Write lyrics for the screen."
        : "";
    const parts = [requirements[sectionOf].instructions, files.length ? names(files) : "", lyrics];
    const joined = parts.filter(Boolean).join("\n");
    return { text: joined || "Skipped", skipped: !joined };
  });
  const counts = section ? roomStepMaterialCounts(section, selected) : [];
  const shelf = section
    ? materials.filter(
        (asset) =>
          roomMaterialSection(asset.originalName) === section &&
          !request.assetIds.includes(asset.id),
      )
    : [];
  const sectionSelected = section
    ? selected.filter((asset) => roomMaterialSection(asset.originalName) === section)
    : [];
  const actions = (
    <div className="room-onboarding-actions">
      {step > 0 && (
        <Button type="text" onClick={() => go(step - 1)}>
          Back
        </Button>
      )}
      {step < 6 && (
        <Button type={step === 5 ? "primary" : "default"} onClick={advance}>
          {step === 0 || step === 5 || text.trim() || sectionSelected.length ? "Continue" : "Skip"}
        </Button>
      )}
    </div>
  );
  return (
    <div className="room-onboarding">
      <nav className="room-step-tabs" aria-label="Brief steps">
        {roomQuestions.map((question, index) => (
          <button
            type="button"
            key={question.label}
            className={index === step ? "is-current" : index < step ? "is-done" : ""}
            aria-current={index === step ? "step" : undefined}
            disabled={index !== 0 && !ideaReady}
            title={index !== 0 && !ideaReady ? "Describe your idea first" : undefined}
            onClick={() => go(index)}
          >
            {question.label}
          </button>
        ))}
      </nav>
      <div className="room-chat-log" ref={log} aria-live="polite">
        {step === 0 && (
          <AssistantSays>
            Welcome to your room. Let’s turn an idea into something moving.
          </AssistantSays>
        )}
        {roomQuestions.slice(0, step).map((question, index) => (
          <div className="room-chat-turn" key={question.label}>
            <AssistantSays>{question.question}</AssistantSays>
            <UserSays muted={answers[index].skipped}>{answers[index].text}</UserSays>
          </div>
        ))}
        <AssistantSays>{roomQuestions[step].question}</AssistantSays>
        {section && (
          <section className="room-materials" aria-label="Materials for this step">
            {sectionSelected.length > 0 && (
              <div className="room-chosen-files" aria-label="Chosen for this step">
                {sectionSelected.map((asset) => (
                  <RoomChosenFile key={asset.id} asset={asset} onRemove={() => toggle(asset)} />
                ))}
              </div>
            )}
            {shelf.length > 0 ? (
              <div className="room-shelf-picks">
                <span>On your shelf — choose to add</span>
                <div>
                  {shelf.map((asset) => (
                    <RoomFilePick
                      key={asset.id}
                      asset={asset}
                      picked={false}
                      onToggle={() => toggle(asset)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              !sectionSelected.length && (
                <p className="room-hint">Nothing for this step on your shelf yet.</p>
              )
            )}
            <div className="room-material-footer">
              <Upload
                accept={roomMaterialIntake[section].accept}
                multiple
                showUploadList={false}
                beforeUpload={(file, files) => {
                  if (file === files[0]) void uploadHere(files);
                  return false;
                }}
              >
                <Button size="small">{roomMaterialIntake[section].upload}</Button>
              </Upload>
              <span className="room-limit-counts" aria-label="Selected material counts">
                {counts.map((count) => (
                  <Tag
                    key={count.key}
                    bordered={false}
                    className={count.full ? "is-full" : undefined}
                  >
                    {count.label}
                  </Tag>
                ))}
              </span>
            </div>
          </section>
        )}
        {step === 4 && request.outputType === "video" && (
          <div className="room-inline-field">
            <label>
              <Switch
                size="small"
                checked={request.lyrics?.mode !== "off" && Boolean(request.lyrics)}
                onChange={(enabled) =>
                  patch({
                    lyrics: lyricsFromInput(
                      enabled,
                      request.lyrics?.mode === "provided" ? request.lyrics.text : "",
                    ),
                  })
                }
              />{" "}
              Show lyrics on screen
            </label>
            {request.lyrics && request.lyrics.mode !== "off" && (
              <>
                <Input.TextArea
                  aria-label="Your lyrics"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder="Paste your lyrics, or leave empty and I’ll write them"
                  value={request.lyrics.mode === "provided" ? request.lyrics.text : ""}
                  onChange={(e) => patch({ lyrics: lyricsFromInput(true, e.target.value) })}
                />
                <SpeechSettings
                  value={request.speech}
                  onChange={(speech) => patch({ speech })}
                  audioAssets={selected
                    .filter((asset) => requirements.music.assetIds.includes(asset.id))
                    .map((asset) => ({ id: asset.id, name: asset.originalName }))}
                />
              </>
            )}
          </div>
        )}
        {step === 5 && (
          <div className="room-settings">
            {request.outputType === "video" && request.lyrics && request.lyrics.mode !== "off" && (
              <SpeechSettings
                value={request.speech}
                onChange={(speech) => patch({ speech })}
                audioAssets={selected
                  .filter((asset) => requirements.music.assetIds.includes(asset.id))
                  .map((asset) => ({ id: asset.id, name: asset.originalName }))}
              />
            )}
            <label>
              Make a
              <Select
                aria-label="Output type"
                value={request.outputType}
                options={[
                  { value: "video", label: "Video" },
                  { value: "page", label: "Interactive page" },
                ]}
                onChange={(outputType) =>
                  onChange({ ...draft, request: switchRoomOutputType(request, outputType) })
                }
              />
            </label>
            <label>
              Model
              <Select
                aria-label="Model"
                value={request.provider}
                options={(["codex", "claude"] as const).map((value) => ({
                  value,
                  label: providerDisplayName(value),
                }))}
                onChange={(provider) => patch({ provider })}
              />
            </label>
            <label>
              Preview directions
              <Select
                aria-label="Preview directions"
                value={request.candidateCount || 5}
                disabled={Boolean(request.selectedStyleIds?.length)}
                options={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))}
                onChange={(candidateCount) => patch({ candidateCount })}
              />
            </label>
            <label>
              Creative approach
              <Select
                aria-label="Creative approach"
                value={request.preference}
                options={[
                  { value: "context", label: "Follow my brief" },
                  { value: "creative", label: "Explore creative ideas" },
                ]}
                onChange={(preference) => patch({ preference })}
              />
            </label>
            {request.outputType === "video" ? (
              <>
                <label>
                  Length
                  <span className="room-duration">
                    <Select
                      aria-label="Full video duration"
                      value={request.duration === "auto" ? "auto" : "custom"}
                      options={[
                        { value: "auto", label: "Auto" },
                        { value: "custom", label: "Seconds" },
                      ]}
                      onChange={(value) => {
                        const duration = value === "auto" ? ("auto" as const) : 60;
                        patch({
                          duration,
                          selectedStyleIds: trimStylesForDuration(
                            request.selectedStyleIds || [],
                            "video",
                            duration,
                          ),
                        });
                      }}
                    />
                    {request.duration !== "auto" && (
                      <InputNumber
                        aria-label="Custom duration seconds"
                        min={3}
                        max={300}
                        value={request.duration}
                        onChange={(value) => {
                          const duration = Math.round(value || 3);
                          patch({
                            duration,
                            selectedStyleIds: trimStylesForDuration(
                              request.selectedStyleIds || [],
                              "video",
                              duration,
                            ),
                          });
                        }}
                      />
                    )}
                  </span>
                </label>
                <label>
                  Aspect ratio
                  <Select
                    aria-label="Aspect ratio"
                    value={request.aspectRatio}
                    options={(["16:9", "9:16", "1:1"] as const).map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(aspectRatio) => patch({ aspectRatio })}
                  />
                </label>
                <label>
                  Resolution
                  <Select
                    aria-label="Video resolution"
                    value={request.resolution || "1080p"}
                    options={[
                      { value: "1080p", label: "1080p" },
                      { value: "1440p", label: "2K · 1440p" },
                    ]}
                    onChange={(resolution) => patch({ resolution })}
                  />
                </label>
                <label>
                  Frame rate
                  <Select
                    aria-label="Frame rate"
                    value={request.frameRate || 30}
                    options={([30, 60] as const).map((value) => ({
                      value,
                      label: `${value} fps`,
                    }))}
                    onChange={(frameRate) => patch({ frameRate })}
                  />
                </label>
                <RendererChoice
                  value={videoRendererOf(request)}
                  onChange={(renderer) => patch({ renderer })}
                />
              </>
            ) : (
              <label>
                Preview on
                <Select
                  aria-label="Preview viewport"
                  value={request.viewport}
                  options={[
                    { value: "desktop", label: "Desktop" },
                    { value: "mobile", label: "Mobile" },
                  ]}
                  onChange={(viewport) => patch({ viewport })}
                />
              </label>
            )}
            <div className="room-settings-styles">
              <span>Pick styles yourself (optional — skips preview directions)</span>
              <StylePicker
                styles={styles}
                examples={examples}
                selectedIds={request.selectedStyleIds || []}
                limit={manualStyleLimit(
                  request.outputType,
                  request.outputType === "page" ? "auto" : request.duration,
                )}
                onChange={(selectedStyleIds) => patch({ selectedStyleIds })}
              />
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="room-review">
            {selected.length > 0 && (
              <div className="room-chosen-files" aria-label="Chosen materials">
                {selected.map((asset) => (
                  <RoomChosenFile key={asset.id} asset={asset} />
                ))}
              </div>
            )}
            <Button
              type="primary"
              size="large"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  if (request.outputType === "video") await ensureSpeechGenerationReady(request);
                  const run = await api<Run>("/api/runs", {
                    method: "POST",
                    body: JSON.stringify(roomSubmission(request)),
                  });
                  onCreated(run);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {request.selectedStyleIds?.length ? "Create my project" : "Create previews"}
            </Button>
          </div>
        )}
        {error && (
          <Alert title={error} type="error" showIcon closable onClose={() => setError("")} />
        )}
      </div>
      {step < 5 ? (
        <Sender
          aria-label="Answer the assistant"
          value={text}
          onChange={setText}
          onSubmit={advance}
          autoSize={{ minRows: 1, maxRows: 6 }}
          placeholder={
            step === 0
              ? "Tell me your idea…"
              : step === 3
                ? "https://… (Shift+Enter for a new line)"
                : "Add a note, or skip…"
          }
          footer={actions}
        />
      ) : (
        actions
      )}
    </div>
  );
}
