import { translateUi, useUiLanguage } from "../i18n";
import { createContext, useContext, type ReactNode } from "react";
import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, Renderer, JSONUIProvider } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { LoaderCircle } from "lucide-react";

export const previewCatalog = defineCatalog(schema, {
  components: {
    PreviewWorkspace: {
      props: z.object({}),
      slots: ["default"],
      description: "Inline preview selection workspace",
    },
    PreviewControls: {
      props: z.object({}),
      description: "Duration, feedback and synchronized playback controls",
    },
    PreviewGrid: {
      props: z.object({}),
      slots: ["default"],
      description: "Preview candidates, including progress and failures",
    },
    PreviewPlaceholder: {
      props: z.object({ index: z.number(), status: z.string() }),
      description: "A pending preview with an explicit loading status",
    },
    PreviewCard: {
      props: z.object({ jobId: z.string() }),
      description: "Playable candidate with a build action",
    },
  },
  actions: {},
});

export function buildPreviewSpec(
  jobIds: string[],
  pendingCount = 0,
  pendingStatus = "Preparing your preview",
): Spec {
  const placeholders = jobIds.length
    ? []
    : Array.from({ length: pendingCount }, (_, index) => `pending-${index}`);
  return {
    root: "previews",
    elements: {
      previews: { type: "PreviewWorkspace", props: {}, children: ["controls", "grid"] },
      controls: { type: "PreviewControls", props: {}, children: [] },
      grid: {
        type: "PreviewGrid",
        props: {},
        children: [...jobIds.map((id) => `job-${id}`), ...placeholders],
      },
      ...Object.fromEntries(
        placeholders.map((id, index) => [
          id,
          {
            type: "PreviewPlaceholder",
            props: { index: index + 1, status: pendingStatus },
            children: [],
          },
        ]),
      ),
      ...Object.fromEntries(
        jobIds.map((id) => [
          `job-${id}`,
          { type: "PreviewCard", props: { jobId: id }, children: [] },
        ]),
      ),
    },
  };
}

export function PreviewLoadingMedia({
  status,
  loading = true,
}: {
  status: string;
  loading?: boolean;
}) {
  useUiLanguage();
  return (
    <div className="preview-loading-media" role="status">
      {loading && <LoaderCircle className="spin" size={24} />}
      <span>{status}</span>
    </div>
  );
}

interface PreviewContextValue {
  controls: ReactNode;
  renderCard: (jobId: string) => ReactNode;
}
const PreviewContext = createContext<PreviewContextValue | undefined>(undefined);
function usePreviewContext() {
  const context = useContext(PreviewContext);
  if (!context) throw Error(translateUi("Preview components require their workspace provider"));
  return context;
}
const { registry } = defineRegistry(previewCatalog, {
  components: {
    PreviewWorkspace: ({ children }) => (
      <div className="inline-preview-workspace" aria-label={translateUi("Preview selection")}>
        {children}
      </div>
    ),
    PreviewControls: () => <>{usePreviewContext().controls}</>,
    PreviewGrid: ({ children }) => <div className="candidate-grid">{children}</div>,
    PreviewPlaceholder: ({ props }) => (
      <article className="candidate" aria-busy="true">
        <PreviewLoadingMedia status={props.status} />
        <div className="candidate-body">
          <h3>
            {translateUi("Direction") + " "}
            {props.index}
          </h3>
          <p>{translateUi("Your preview will appear here when it is ready.")}</p>
        </div>
      </article>
    ),
    PreviewCard: ({ props }) => <>{usePreviewContext().renderCard(props.jobId)}</>,
  },
});

export function PreviewWorkspace({
  jobIds,
  controls,
  renderCard,
  pendingCount = 0,
  pendingStatus,
}: PreviewContextValue & { jobIds: string[]; pendingCount?: number; pendingStatus?: string }) {
  useUiLanguage();
  return (
    <PreviewContext.Provider value={{ controls, renderCard }}>
      <JSONUIProvider registry={registry}>
        <Renderer
          spec={buildPreviewSpec(jobIds, pendingCount, pendingStatus)}
          registry={registry}
        />
      </JSONUIProvider>
    </PreviewContext.Provider>
  );
}
