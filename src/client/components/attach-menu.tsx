import { translateUi, useUiLanguage } from "../i18n";
import { useRef, useState } from "react";
import { Paperclip, FileText, Image, Music, ChevronDown, Link, X } from "lucide-react";
import { Textarea } from "./ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

export function AttachMenu({
  uploading,
  onUpload,
  urls,
  onUrlsChange,
}: {
  uploading: boolean;
  onUpload: (files: FileList | null) => Promise<void>;
  urls: string;
  onUrlsChange: (value: string) => void;
}) {
  useUiLanguage();
  const [showUrls, setShowUrls] = useState(Boolean(urls.trim()));
  const filesInput = useRef<HTMLInputElement>(null);
  const imagesInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="asset-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="upload-button" disabled={uploading}>
              <Paperclip size={16} />{" "}
              {uploading ? translateUi("Uploading…") : translateUi("Attach")}
              <ChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="attach-menu">
            <DropdownMenuItem onSelect={() => filesInput.current?.click()}>
              <FileText size={16} />
              {" " + translateUi("Files")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => imagesInput.current?.click()}>
              <Image size={16} />
              {" " + translateUi("Images")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => audioInput.current?.click()}>
              <Music size={16} />
              {" " + translateUi("Audio")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowUrls(true)}>
              <Link size={16} />
              {" " + translateUi("URLs")}
              {urls.trim() ? translateUi(" · added") : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {[
          { ref: filesInput, label: translateUi("Upload reference files"), accept: undefined },
          { ref: imagesInput, label: translateUi("Upload images"), accept: "image/*" },
          { ref: audioInput, label: translateUi("Upload audio"), accept: "audio/*" },
        ].map(({ ref, label, accept }) => (
          <input
            key={label}
            ref={ref}
            type="file"
            hidden
            multiple
            aria-label={label}
            accept={accept}
            disabled={uploading}
            onChange={async (event) => {
              const input = event.currentTarget;
              await onUpload(input.files);
              input.value = "";
            }}
          />
        ))}
      </div>
      {showUrls && (
        <div className="composer-urls">
          <label className="field-label">
            {translateUi("Website URLs")}
            <Textarea
              className="url-input"
              placeholder="https://example.com — one URL per line"
              value={urls}
              onChange={(event) => onUrlsChange(event.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label={translateUi("Close URL editor")}
            onClick={() => setShowUrls(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
