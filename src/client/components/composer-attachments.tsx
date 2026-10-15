import { X } from "lucide-react";
import { usePromptInputAttachments } from "./ai-elements/prompt-input";

export function ComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (!attachments.files.length) return null;
  return (
    <div className="asset-chips" aria-label="Attached references">
      {attachments.files.map((file) => (
        <span key={file.id}>
          {file.filename || "Reference file"}
          <button
            type="button"
            aria-label={`Remove ${file.filename || "reference file"}`}
            onClick={() => attachments.remove(file.id)}
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}
