import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bubble, Sender } from "@ant-design/x";
import { roomOnboardingReplies } from "./onboarding-replies";
import { RoomChosenFile, RoomFilePick } from "./room-file-card";
import { Alert, Button, Input, InputNumber, Select, Switch, Tag, Upload } from "antd";
import { ZodError } from "zod";
import {
  PencilLine,
  FileText,
  Image as ImageIcon,
  Link,
  Music2,
  Captions,
  ClipboardCheck,
} from "lucide-react";
import type { CreativeRequest, Run, StyleExample } from "../../shared/contracts";
import type { RoomDraft, RoomLibraryAsset } from "../../shared/room";
import {
  attachRoomStepUploads,
  roomDraftRequest,
  removeRoomDraftAsset,
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
import { SettingsSectionHeading } from "../components/settings-section-heading";
import { SpeechSettings } from "../components/speech-settings";
import { ensureSpeechGenerationReady } from "../lib/speech";
import { videoRendererOf } from "../../shared/video-renderers";

const assistantAvatar = <img className="room-avatar" src="/kiteva-mark.svg" alt="" />;
function errorMessage(error: unknown) {
  return error instanceof ZodError
    ? error.issues.map((issue) => issue.message).join(" ")
    : (error as Error).message;
}
function AssistantSays({ children, step }: { children: ReactNode; step?: string }) {
  return (
    <Bubble
      placement="start"
      className="room-bubble-assistant"
      header={`Assistant${step ? ` · ${step}` : ""}`}
      avatar={assistantAvatar}
      content={children}
    />
  );
}
function UserSays({
  children,
  muted,
  step,
}: {
  children: ReactNode;
  muted?: boolean;
  step: string;
}) {
  return (
    <Bubble
      placement="end"
      header={`You · ${step}`}
      className={muted ? "room-bubble-user is-skipped" : "room-bubble-user"}
      content={children}
    />
  );
}
export function RoomOnboarding({
  draft,
  onChange,
  materials,
  styles,
  examples,
  onCreated,
  onUpload,
  onDeleteMaterial,
}: {
  draft: RoomDraft;
  onChange: (next: RoomDraft) => void;
  materials: RoomLibraryAsset[];
  styles: Parameters<typeof StylePicker>[0]["styles"];
  examples: StyleExample[];
  onCreated: (run: Run) => void;
  onUpload: (files: File[]) => Promise<RoomLibraryAsset[]>;
  onDeleteMaterial?: (asset: RoomLibraryAsset) => Promise<void>;
}) {
  const request = roomDraftRequest(draft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const deleting = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const log = useRef<HTMLDivElement>(null);
  const currentStep = useRef<HTMLDivElement>(null);
  const step = draft.step;
  const section = roomMaterialSteps[step as keyof typeof roomMaterialSteps];
  const selected = (draft.assets || []).filter((asset) => request.assetIds.includes(asset.id));
  const ideaReady = request.instructions.trim().length >= 8;
  useLayoutEffect(() => {
    const container = log.current;
    const start = currentStep.current;
    if (!container || !start) return;
    container.scrollTo({
      top:
        container.scrollTop +
        start.getBoundingClientRect().top -
        container.getBoundingClientRect().top,
    });
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
  async function deleteMaterial(asset: RoomLibraryAsset) {
    if (!onDeleteMaterial || deleting.current) return;
    deleting.current = true;
    setDeletingId(asset.id);
    setError("");
    try {
      await onDeleteMaterial(asset);
      const current = latestDraft.current;
      const next = removeRoomDraftAsset(current, asset);
      if (next !== current) onChange(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      deleting.current = false;
      setDeletingId(undefined);
    }
  }
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
  const answers = roomOnboardingReplies(request, draft.assets || [], styles);
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
      {step === 6 && (
        <Button
          type="primary"
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
            <AssistantSays step={question.label}>{question.question}</AssistantSays>
            <UserSays step={question.label} muted={answers[index].skipped}>
              {answers[index].text}
            </UserSays>
          </div>
        ))}
        <div ref={currentStep} className="room-current-step">
          <AssistantSays step={roomQuestions[step].label}>
            {roomQuestions[step].question}
          </AssistantSays>
          {section && (
            <section className="room-materials" aria-label="Materials for this step">
              <SettingsSectionHeading
                title={
                  section === "main"
                    ? "Documents"
                    : section === "images"
                      ? "Reference images"
                      : "Music and audio"
                }
                description={
                  section === "main"
                    ? "Add notes and source documents for your project."
                    : section === "images"
                      ? "Choose images to guide the look and story."
                      : "Describe the sound and choose reference audio."
                }
                icon={
                  section === "main" ? (
                    <FileText size={18} />
                  ) : section === "images" ? (
                    <ImageIcon size={18} />
                  ) : (
                    <Music2 size={18} />
                  )
                }
              />
              {sectionSelected.length > 0 && (
                <div className="room-chosen-files" aria-label="Chosen for this step">
                  {sectionSelected.map((asset) => (
                    <RoomChosenFile
                      key={asset.id}
                      asset={asset}
                      removing={deletingId === asset.id}
                      onRemove={
                        onDeleteMaterial ? () => void deleteMaterial(asset) : () => toggle(asset)
                      }
                    />
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
                        deleting={deletingId === asset.id}
                        onDelete={onDeleteMaterial ? () => void deleteMaterial(asset) : undefined}
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
          {step === 3 && (
            <section className="room-materials">
              <SettingsSectionHeading
                title="Website references"
                description="Add links and instructions in your reply below."
                icon={<Link size={18} />}
              />
            </section>
          )}
          {step === 4 && request.outputType === "video" && (
            <div className="room-inline-field room-materials">
              <SettingsSectionHeading
                title="On-screen lyrics"
                description="Show your own words or let the agent write them."
                icon={<Captions size={18} />}
              />
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
              <SettingsSectionHeading
                title="Generation settings"
                description="Choose how your project is made."
              />
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
                <span>Pick Motion Graphics yourself (optional — skips preview directions)</span>
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
              <SettingsSectionHeading
                title="Review your brief"
                description="Check your replies above before creating the project."
                icon={<ClipboardCheck size={18} />}
              />
              {selected.length > 0 && (
                <div className="room-chosen-files" aria-label="Chosen materials">
                  {selected.map((asset) => (
                    <RoomChosenFile key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          )}
          {error && (
            <Alert title={error} type="error" showIcon closable onClose={() => setError("")} />
          )}
        </div>
      </div>
      {step < 5 ? (
        <Sender
          aria-label="Answer the assistant"
          header={
            <div className="room-reply-label">
              <PencilLine size={14} aria-hidden="true" />
              <strong>Your reply · {roomQuestions[step].label}</strong>
              <span>Editable</span>
            </div>
          }
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
