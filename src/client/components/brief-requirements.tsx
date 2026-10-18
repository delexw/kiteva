import { translateUi, useUiLanguage } from "../i18n";
import { assetLimitHelp, hasReachedAssetCountLimit } from "../../shared/asset-limits";
import { useRef, type ReactNode } from "react";
import { Paperclip, Link, X } from "lucide-react";
import { briefSectionFileAccept, type BriefSectionName } from "../../shared/brief-sections";
import { Button, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
} from "./ai-elements/attachments";
const Textarea = Input.TextArea;
export interface BriefAttachment {
  bytes?: number;
  durationSeconds?: number;
  documentPages?: number;
  id: string;
  originalName: string;
  section: Exclude<BriefSectionName, "urls">;
}
export function BriefRequirements({
  children,
  instructions,
  onChange,
  assets,
  onRemove,
  uploading,
  onUpload,
  urls,
  onUrlsChange,
}: {
  children: ReactNode;
  instructions: { music: string; images: string; urls: string };
  onChange: (section: "music" | "images" | "urls", value: string) => void;
  assets: BriefAttachment[];
  onRemove: (id: string) => void;
  uploading: boolean;
  onUpload: (files: FileList | null, section: Exclude<BriefSectionName, "urls">) => Promise<void>;
  urls: string;
  onUrlsChange: (value: string) => void;
}) {
  useUiLanguage();
  const fileInputs = useRef<Partial<Record<"main" | "music" | "images", HTMLInputElement | null>>>(
    {},
  );
  const links = useRef<TextAreaRef>(null);
  return (
    <div className="brief-sections">
      <p className="secondary">{assetLimitHelp.total}</p>
      {(["main", "music", "images", "urls"] as const).map((section) => (
        <section
          className={`brief-section${section === "main" ? " brief-section-main" : ""}`}
          key={section}
          aria-label={
            {
              main: "Main prompt",
              music: "Music / instrumental requirements",
              images: "Image requirements",
              urls: "URL requirements",
            }[section]
          }
        >
          <div className="brief-section-heading">
            <h3>
              {
                {
                  main: "Main prompt",
                  music: "Music / instrumental requirements",
                  images: "Image requirements",
                  urls: "URL requirements",
                }[section]
              }
            </h3>
            {section === "urls" ? (
              <Button
                className="upload-button"
                htmlType="button"
                onClick={() => links.current?.focus()}
              >
                <Link size={16} />
                {translateUi("Add links")}
              </Button>
            ) : (
              <div>
                <Button
                  htmlType="button"
                  className="upload-button"
                  disabled={
                    uploading ||
                    hasReachedAssetCountLimit(
                      assets.map((asset) => asset.originalName),
                      section === "music" ? "audio" : section === "images" ? "images" : "documents",
                    )
                  }
                  onClick={() => fileInputs.current[section]?.click()}
                >
                  <Paperclip size={16} />
                  {uploading
                    ? translateUi("Uploading…")
                    : { main: "Attach documents", music: "Attach audio", images: "Attach images" }[
                        section
                      ]}
                </Button>
                <input
                  ref={(element) => {
                    fileInputs.current[section] = element;
                  }}
                  type="file"
                  hidden
                  multiple
                  accept={briefSectionFileAccept[section]}
                  aria-label={
                    {
                      main: "Upload brief documents",
                      music: "Upload music",
                      images: "Upload images",
                    }[section]
                  }
                  disabled={
                    uploading ||
                    hasReachedAssetCountLimit(
                      assets.map((asset) => asset.originalName),
                      section === "music" ? "audio" : section === "images" ? "images" : "documents",
                    )
                  }
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    await onUpload(input.files, section);
                    input.value = "";
                  }}
                />
              </div>
            )}
          </div>
          {section !== "urls" && <p className="secondary">{assetLimitHelp[section]}</p>}
          {section === "main" ? (
            children
          ) : (
            <Textarea
              aria-label={translateUi("{{value0}} requirements", {
                value0:
                  section === "music"
                    ? "Music / instrumental"
                    : section === "images"
                      ? "Image"
                      : "URL",
              })}
              value={instructions[section]}
              maxLength={8000}
              onChange={(event) => onChange(section, event.target.value)}
              placeholder={
                {
                  music: "Describe the soundtrack, instruments, mood, and how to use your audio…",
                  images:
                    "Describe which images to use, what to show, and how they support your story…",
                  urls: "Describe which pages or views to capture and how to use them…",
                }[section]
              }
            />
          )}
          {section === "main" && (
            <span className="brief-section-help">
              {translateUi("Markdown, text, or PDF documents only.")}
            </span>
          )}
          {section === "urls" ? (
            <Textarea
              ref={links}
              aria-label={translateUi("Website URLs")}
              value={urls}
              onChange={(event) => onUrlsChange(event.target.value)}
              placeholder="https://example.com — one URL per line"
            />
          ) : section === "images" ? (
            <Attachments
              variant="grid"
              className="brief-image-attachments"
              aria-label={translateUi("Attached images")}
            >
              {assets
                .filter((asset) => asset.section === "images")
                .map((asset) => (
                  <Attachment
                    key={asset.id}
                    className="brief-image-attachment"
                    title={asset.originalName}
                    data={{
                      type: "file",
                      id: asset.id,
                      filename: asset.originalName,
                      mediaType: "image/webp",
                      url: `/api/assets/${asset.id}/preview`,
                    }}
                    onRemove={() => onRemove(asset.id)}
                  >
                    <AttachmentPreview className="brief-image-preview" />
                    <span className="brief-image-name">{asset.originalName}</span>
                    <AttachmentRemove
                      label={translateUi("Remove {{value0}}", { value0: asset.originalName })}
                      className="brief-image-remove"
                    />
                  </Attachment>
                ))}
            </Attachments>
          ) : (
            <div className="asset-chips">
              {assets
                .filter((asset) => asset.section === section)
                .map((asset) => (
                  <span key={asset.id}>
                    {asset.originalName}
                    <Button
                      htmlType="button"
                      aria-label={translateUi("Remove {{value0}}", { value0: asset.originalName })}
                      onClick={() => onRemove(asset.id)}
                    >
                      <X size={12} />
                    </Button>
                  </span>
                ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
