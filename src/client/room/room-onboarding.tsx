import { ScriptItems } from "../components/script-items";
import { legacyScriptItems } from "../../shared/script-items";
import { StylePromptInput } from "../components/style-prompt-input";
import { PromptText } from "../components/style-mention";
import { creativeApproaches } from "../../shared/creative-approach";
import { buildRouteLabel, buildRouteOf } from "../../shared/build-route";
import { translateUi, useUiLanguage } from "../i18n";
import {
  deliverySpeech,
  editSharedVideoScript,
  sharedVideoScript,
  type VideoLanguage,
} from "../../shared/video-language";
import { VideoLanguageControl } from "../components/video-language-control";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bubble, Sender } from "@ant-design/x";
import { roomOnboardingReplies } from "./onboarding-replies";
import { RoomChosenFile, RoomFilePick } from "./room-file-card";
import { Alert, Button, Input, InputNumber, Select, Splitter, Switch, Tag, Upload } from "antd";
import { ZodError } from "zod";
import {
  PencilLine,
  Plus,
  Trash2,
  FileText,
  Image as ImageIcon,
  Link,
  Music2,
  Captions,
  GripHorizontal,
  ClipboardCheck,
} from "lucide-react";
import type { CreativeRequest, Run, StyleExample } from "../../shared/contracts";
import type { RoomDraft, RoomLibraryAsset } from "../../shared/room";
import {
  attachRoomStepUploads,
  roomDraftRequest,
  roomDraftStep,
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
  useUiLanguage();
  return (
    <Bubble
      placement="start"
      className="room-bubble-assistant"
      header={`Assistant${step ? ` · ${step}` : ""}`}
      avatar={assistantAvatar}
      content={typeof children === "string" ? <PromptText>{children}</PromptText> : children}
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
  useUiLanguage();
  return (
    <Bubble
      placement="end"
      header={`You · ${step}`}
      className={muted ? "room-bubble-user is-skipped" : "room-bubble-user"}
      content={typeof children === "string" ? <PromptText>{children}</PromptText> : children}
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
  useUiLanguage();
  const request = roomDraftRequest(draft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string>();
  const deleting = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const log = useRef<HTMLDivElement>(null);
  const currentStep = useRef<HTMLDivElement>(null);
  const step = roomDraftStep(draft);
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
  const patch = (change: Partial<CreativeRequest>) => {
    onChange({ ...draft, request: { ...request, ...change } as CreativeRequest });
  };
  const changeLanguage = (outputLanguage: VideoLanguage) => patch({ outputLanguage });
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
        ? requirements.urls.instructions
        : section
          ? requirements[section].instructions
          : "";
  const setText = (value: string) => {
    if (step === 0) patch({ instructions: value });
    else if (step === 3)
      patch({ requirements: { ...requirements, urls: { instructions: value } } });
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
    onChange({ ...draft, step: next, stepLayout: "separate-speech" });
  };
  const advance = () => {
    if (step === 0 && !ideaReady) {
      setError(translateUi("Tell me a little more — at least a short sentence."));
      return;
    }
    if (step === 3) {
      const urls = request.urls.map((url) => url.trim()).filter(Boolean);
      if (urls.length > 5 || urls.some((url) => !URL.canParse(url))) {
        setError(translateUi("Use up to five full links (starting with https://), one per line."));
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
          {translateUi("Back")}
        </Button>
      )}
      {step === 7 && (
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
          {request.candidateCount === 0
            ? translateUi("Create my project")
            : translateUi("Create previews")}
        </Button>
      )}
      {step < 7 && (
        <Button type={step === 6 ? "primary" : "default"} onClick={advance}>
          {step === 0 ||
          step === 6 ||
          text.trim() ||
          (step === 3 && request.urls.some((url) => url.trim())) ||
          sectionSelected.length ||
          step === 5
            ? translateUi("Continue")
            : translateUi("Skip")}
        </Button>
      )}
    </div>
  );
  const replyProps = {
    "aria-label": translateUi("Answer the assistant"),
    header: (
      <div className="room-reply-label">
        <PencilLine size={14} aria-hidden="true" />
        <strong>
          {translateUi("Your reply ·") + " "}
          {translateUi(roomQuestions[step].label)}
        </strong>
        <span>{translateUi("Editable")}</span>
      </div>
    ),
    value: text,
    onChange: setText,
    onSubmit: advance,
    suffix: false,
    autoSize: { minRows: 1, maxRows: 6 },
    placeholder:
      step === 0 ? translateUi("Tell me your idea…") : translateUi("Add a note, or skip…"),
    footer: actions,
  };
  const chatLog = (
    <div className="room-chat-log" ref={log} aria-live="polite">
      {step === 0 && (
        <AssistantSays>
          {translateUi("Welcome to your room. Let’s turn an idea into something moving.")}
        </AssistantSays>
      )}
      {roomQuestions.slice(0, step).map((question, index) => (
        <div className="room-chat-turn" key={question.label}>
          <AssistantSays step={translateUi(question.label)}>
            {translateUi(question.question)}
          </AssistantSays>
          <UserSays step={translateUi(question.label)} muted={answers[index].skipped}>
            {answers[index].text}
          </UserSays>
        </div>
      ))}
      <div ref={currentStep} className="room-current-step">
        <AssistantSays step={translateUi(roomQuestions[step].label)}>
          {translateUi(roomQuestions[step].question)}
        </AssistantSays>
        {section && (
          <section className="room-materials" aria-label={translateUi("Materials for this step")}>
            <SettingsSectionHeading
              title={
                section === "main"
                  ? translateUi("Documents")
                  : section === "images"
                    ? translateUi("Reference images")
                    : translateUi("Music and audio")
              }
              description={
                section === "main"
                  ? translateUi("Add notes and source documents for your project.")
                  : section === "images"
                    ? translateUi("Choose images to guide the look and story.")
                    : translateUi("Describe the sound and choose reference audio.")
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
            <span className="room-attachment-status">
              {translateUi(
                sectionSelected.length ? "Attached to this idea" : "No files attached to this idea",
              )}
            </span>
            {sectionSelected.length > 0 && (
              <div className="room-chosen-files" aria-label={translateUi("Chosen for this step")}>
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
                <span>
                  {translateUi("Asset pool — not attached. Select Add to use in this idea.")}
                </span>
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
                <p className="room-hint">
                  {translateUi("Nothing for this step on your shelf yet.")}
                </p>
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
                <Button size="small">{translateUi(roomMaterialIntake[section].upload)}</Button>
              </Upload>
              <span
                className="room-limit-counts"
                aria-label={translateUi("Selected material counts")}
              >
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
              title={translateUi("Website references")}
              description={translateUi("Add up to five website links.")}
              icon={<Link size={18} />}
            />
            <div className="room-website-items">
              {request.urls.map((url, index) => (
                <div className="room-website-item" key={index}>
                  <Input
                    aria-label={translateUi("Website URL {{value0}}", { value0: index + 1 })}
                    type="url"
                    value={url}
                    onChange={(event) =>
                      patch({
                        urls: request.urls.map((value, position) =>
                          position === index ? event.target.value : value,
                        ),
                      })
                    }
                    placeholder="https://example.com"
                  />
                  <Button
                    aria-label={translateUi("Remove URL {{value0}}", { value0: index + 1 })}
                    icon={<Trash2 size={16} />}
                    onClick={() =>
                      patch({ urls: request.urls.filter((_, position) => position !== index) })
                    }
                  />
                </div>
              ))}
              <Button
                icon={<Plus size={16} />}
                disabled={request.urls.length >= 5}
                onClick={() => patch({ urls: [...request.urls, ""] })}
              >
                {translateUi("Add URL")}
              </Button>
            </div>
          </section>
        )}
        {step === 5 && request.outputType === "video" && request.scriptItems !== undefined && (
          <ScriptItems
            items={request.scriptItems}
            duration={request.duration}
            onChange={(scriptItems) => patch({ scriptItems })}
          />
        )}
        {step === 5 && request.outputType === "video" && request.scriptItems === undefined && (
          <div className="room-inline-field room-materials">
            <Button
              disabled={request.speech?.mode === "uploaded"}
              onClick={() =>
                patch({
                  scriptItems: legacyScriptItems(request),
                  lyrics: { mode: "off" },
                  speech: { mode: "off" },
                })
              }
            >
              {translateUi("Use timed script items")}
            </Button>
            <SettingsSectionHeading
              title={translateUi("Shared script")}
              description={translateUi("Use one script for narration and on-screen text.")}
              icon={<Captions size={18} />}
            />
            <label>
              <Switch
                size="small"
                checked={request.lyrics?.mode !== "off" && Boolean(request.lyrics)}
                onChange={(enabled) =>
                  onChange({
                    ...draft,
                    request: editSharedVideoScript(
                      {
                        ...request,
                        lyrics: lyricsFromInput(enabled, sharedVideoScript(request)),
                      },
                      sharedVideoScript(request),
                    ),
                  })
                }
              />{" "}
              {translateUi("Show lyrics on screen")}
            </label>
            {((request.lyrics && request.lyrics.mode !== "off") ||
              request.speech?.mode === "narration") && (
              <>
                <Input.TextArea
                  aria-label={translateUi("Shared script")}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder={translateUi("Paste your lyrics, or leave empty and I’ll write them")}
                  value={sharedVideoScript(request)}
                  onChange={(e) => {
                    onChange({
                      ...draft,
                      request: editSharedVideoScript(request, e.target.value),
                    });
                  }}
                />
              </>
            )}
            <SpeechSettings
              value={deliverySpeech(request)}
              videoLanguage={request.outputLanguage}
              sharedScript
              onChange={(speech) =>
                onChange({
                  ...draft,
                  request: editSharedVideoScript(
                    { ...request, speech },
                    sharedVideoScript(request),
                  ),
                })
              }
              audioAssets={selected
                .filter((asset) => requirements.music.assetIds.includes(asset.id))
                .map((asset) => ({ id: asset.id, name: asset.originalName }))}
            />
          </div>
        )}
        {step === 5 && request.outputType === "page" && (
          <p className="room-hint">
            {translateUi("Narration and lyrics are available for video projects.")}
          </p>
        )}
        {step === 6 && (
          <div className="room-settings">
            <SettingsSectionHeading
              title={translateUi("Generation settings")}
              description={translateUi("Choose how your project is made.")}
            />
            {request.outputType === "video" && (
              <VideoLanguageControl value={request.outputLanguage} onChange={changeLanguage} />
            )}
            <label>
              {translateUi("Make a")}
              <Select
                aria-label={translateUi("Output type")}
                value={request.outputType}
                options={[
                  { value: "video", label: translateUi("Video") },
                  { value: "page", label: translateUi("Interactive page") },
                ]}
                onChange={(outputType) =>
                  onChange({ ...draft, request: switchRoomOutputType(request, outputType) })
                }
              />
            </label>
            <label>
              {translateUi("Model")}
              <Select
                aria-label={translateUi("Model")}
                value={request.provider}
                options={(["codex", "claude"] as const).map((value) => ({
                  value,
                  label: providerDisplayName(value),
                }))}
                onChange={(provider) => patch({ provider })}
              />
            </label>
            <label>
              {translateUi("Preview directions")}
              <Select
                aria-label={translateUi("Preview directions")}
                value={request.candidateCount}
                options={(request.selectedStyleIds?.length
                  ? [0, 1, 2, 3, 4, 5]
                  : [1, 2, 3, 4, 5]
                ).map((value) => ({ value, label: String(value) }))}
                onChange={(candidateCount) => patch({ candidateCount })}
              />
            </label>
            <label>
              {translateUi(
                buildRouteOf(request) === "automatic-previews"
                  ? "Creative approach"
                  : "Build route",
              )}
              <Select
                aria-label={translateUi(
                  buildRouteOf(request) === "automatic-previews"
                    ? "Creative approach"
                    : "Build route",
                )}
                disabled={Boolean(request.selectedStyleIds?.length)}
                value={request.preference}
                options={Object.entries(creativeApproaches).map(([value, approach]) => ({
                  value,
                  label: translateUi(
                    request.selectedStyleIds?.length ? buildRouteLabel(request) : approach.label,
                  ),
                }))}
                onChange={(preference) =>
                  patch({
                    preference,
                    ...(preference === "random"
                      ? {
                          selectedStyleIds: undefined,
                          pinnedStyleId: undefined,
                          candidateCount: request.candidateCount || 5,
                        }
                      : {}),
                  })
                }
              />
              <small>
                {translateUi(
                  request.selectedStyleIds?.length
                    ? "Use your chosen Motion Graphics for previews or a direct build. No style proposals or ranking calls."
                    : creativeApproaches[request.preference].description,
                )}
              </small>
            </label>
            {request.outputType === "video" ? (
              <>
                <label>
                  {translateUi("Length")}
                  <span className="room-duration">
                    <Select
                      aria-label={translateUi("Full video duration")}
                      value={request.duration === "auto" ? "auto" : "custom"}
                      options={[
                        { value: "auto", label: translateUi("Auto") },
                        { value: "custom", label: translateUi("Seconds") },
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
                        aria-label={translateUi("Custom duration seconds")}
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
                  {translateUi("Aspect ratio")}
                  <Select
                    aria-label={translateUi("Aspect ratio")}
                    value={request.aspectRatio}
                    options={(["16:9", "9:16", "1:1"] as const).map((value) => ({
                      value,
                      label: value,
                    }))}
                    onChange={(aspectRatio) => patch({ aspectRatio })}
                  />
                </label>
                <label>
                  {translateUi("Resolution")}
                  <Select
                    aria-label={translateUi("Video resolution")}
                    value={request.resolution || "1080p"}
                    options={[
                      { value: "1080p", label: "1080p" },
                      { value: "1440p", label: "2K · 1440p" },
                    ]}
                    onChange={(resolution) => patch({ resolution })}
                  />
                </label>
                <label>
                  {translateUi("Frame rate")}
                  <Select
                    aria-label={translateUi("Frame rate")}
                    value={request.frameRate || 30}
                    options={([30, 60] as const).map((value) => ({
                      value,
                      label: translateUi("{{value0}} fps", { value0: value }),
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
                {translateUi("Preview on")}
                <Select
                  aria-label={translateUi("Preview viewport")}
                  value={request.viewport}
                  options={[
                    { value: "desktop", label: translateUi("Desktop") },
                    { value: "mobile", label: translateUi("Mobile") },
                  ]}
                  onChange={(viewport) => patch({ viewport })}
                />
              </label>
            )}
            <div className="room-settings-styles">
              <span>
                {translateUi("Pick Motion Graphics yourself (optional — skips preview directions)")}
              </span>
              <StylePicker
                styles={styles}
                examples={examples}
                selectedIds={request.selectedStyleIds || []}
                limit={manualStyleLimit(
                  request.outputType,
                  request.outputType === "page" ? "auto" : request.duration,
                )}
                onChange={(selectedStyleIds) =>
                  patch({
                    selectedStyleIds,
                    ...(selectedStyleIds.length && request.preference === "random"
                      ? { preference: "context" }
                      : {}),
                  })
                }
              />
            </div>
          </div>
        )}
        {step === 7 && (
          <div className="room-review">
            <SettingsSectionHeading
              title={translateUi("Review your brief")}
              description={translateUi("Check your replies above before creating the project.")}
              icon={<ClipboardCheck size={18} />}
            />
            {selected.length > 0 && (
              <div className="room-chosen-files" aria-label={translateUi("Chosen materials")}>
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
  );
  return (
    <div className="room-onboarding">
      <nav className="room-step-tabs" aria-label={translateUi("Brief steps")}>
        {roomQuestions.map((question, index) => (
          <button
            type="button"
            key={question.label}
            className={index === step ? "is-current" : index < step ? "is-done" : ""}
            aria-current={index === step ? "step" : undefined}
            disabled={index !== 0 && !ideaReady}
            title={index !== 0 && !ideaReady ? translateUi("Describe your idea first") : undefined}
            onClick={() => go(index)}
          >
            {translateUi(question.label)}
          </button>
        ))}
      </nav>
      {step === 0 ? (
        <Splitter
          className="room-idea-splitter"
          orientation="vertical"
          styles={{ dragger: { default: { height: 18 } } }}
          draggerIcon={
            <GripHorizontal size={24} aria-label={translateUi("Drag to resize idea editor")} />
          }
        >
          <Splitter.Panel defaultSize="35%" min="10%">
            {chatLog}
          </Splitter.Panel>
          <Splitter.Panel min="25%">
            <StylePromptInput {...replyProps} styles={styles} />
          </Splitter.Panel>
        </Splitter>
      ) : (
        <>
          {chatLog}
          {step < 5 ? <Sender {...replyProps} /> : actions}
        </>
      )}
    </div>
  );
}
