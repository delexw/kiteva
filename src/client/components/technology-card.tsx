import { useState } from "react";
import { Alert, Button, Collapse, Input } from "antd";
import { Copy } from "lucide-react";
import { RecommendedStack } from "../recommended-stack";
import { technologyCardPath, type TechnologyEntry } from "../technology-pool-model";

export function TechnologyCard({ entry }: { entry: TechnologyEntry }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  async function copyLink() {
    const url = new URL(technologyCardPath(entry.key), window.location.origin).href;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
      setCopied(false);
    }
  }
  return (
    <div className="technology-pool-detail">
      <div className="technology-card-actions">
        <code>{entry.key}</code>
        <Button icon={<Copy size={14} />} onClick={() => void copyLink()}>
          {copied ? "Link copied" : "Copy link"}
        </Button>
      </div>
      {copyError && (
        <>
          <Alert type="error" title="Couldn’t copy the link. Select it below to copy." />
          <Input aria-label="Tool card link" readOnly value={shareUrl} />
        </>
      )}
      <RecommendedStack libraries={[entry.definition]} />
      <Collapse
        size="small"
        items={[
          {
            key: "definition",
            label: "Full technology definition",
            children: <pre>{JSON.stringify(entry.definition, null, 2)}</pre>,
          },
        ]}
      />
    </div>
  );
}
