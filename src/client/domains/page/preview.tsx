import { useEffect, useRef, useState } from "react";
import type { PageGenerationJob } from "../../../shared/domains/page";
export function InteractivePagePreview({
  job,
  title,
  viewport,
}: {
  job: PageGenerationJob;
  title: string;
  viewport: "desktop" | "mobile";
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = viewport === "mobile" ? 390 : 1280;
  const height = viewport === "mobile" ? 844 : 1000;
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div
      ref={host}
      className={`page-preview-frame ${viewport === "mobile" ? "page-preview-mobile" : ""}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <iframe
        title={`Interactive preview: ${title}`}
        src={`/api/pages/${job.runId}/${job.id}/index.html`}
        sandbox="allow-scripts"
        className="page-preview"
        style={{ width, height, transform: `scale(${scale})` }}
      />
    </div>
  );
}
