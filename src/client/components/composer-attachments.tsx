import { translateUi, useUiLanguage } from "../i18n";
import { X } from "lucide-react";
import { usePromptInputAttachments } from "./ai-elements/prompt-input";

export function ComposerAttachments() {
  useUiLanguage();
  const attachments = usePromptInputAttachments();
  if (!attachments.files.length) return null;
  return (
    <div className="asset-chips" aria-label={translateUi("Attached references")}>
      {attachments.files.map((file) => (
        <span key={file.id}>
          {file.filename || translateUi("Reference file")}
          <button
            type="button"
            aria-label={translateUi("Remove {{value0}}", {
              value0: file.filename || "reference file",
            })}
            onClick={() => attachments.remove(file.id)}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
