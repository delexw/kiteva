import { useState } from "react";
import { Alert, Button, Input } from "antd";
import { Check, Copy } from "lucide-react";
import type { Style } from "../../shared/contracts";
import { styleMetadataMarkdown } from "../../shared/style-metadata";
import { translateUi, useUiLanguage } from "../i18n";

export function StyleMetadataCopy({ style }: { style: Style }) {
  useUiLanguage();
  const text = styleMetadataMarkdown(style, translateUi);
  const [copiedText, setCopiedText] = useState<string>();
  const [failedText, setFailedText] = useState<string>();
  const copied = copiedText === text;
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setFailedText(undefined);
    } catch {
      setCopiedText(undefined);
      setFailedText(text);
    }
  }
  return (
    <>
      <Button
        aria-label={translateUi("Copy style metadata")}
        icon={copied ? <Check size={16} /> : <Copy size={16} />}
        onClick={() => void copy()}
      >
        {translateUi(copied ? "Copied" : "Copy")}
      </Button>
      {failedText === text && (
        <>
          <Alert
            type="error"
            title={translateUi("Couldn’t copy. Select the text below to copy it.")}
          />
          <Input.TextArea
            aria-label={translateUi("Style metadata to copy")}
            readOnly
            value={text}
            autoSize={{ minRows: 3, maxRows: 8 }}
          />
        </>
      )}
    </>
  );
}
