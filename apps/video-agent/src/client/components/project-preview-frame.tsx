import { type ReactNode, type Ref } from "react";

type ProjectPreviewFrameProps = {
  variant: "progress" | "video" | "page" | "placeholder";
  label: string;
  carousel: boolean;
  ref: Ref<HTMLDivElement>;
  children: ReactNode;
};

export function ProjectPreviewFrame({
  variant,
  label,
  carousel,
  ref,
  children,
}: ProjectPreviewFrameProps) {
  return (
    <div
      ref={ref}
      className="recent-project-media project-preview-frame"
      data-variant={variant}
      role="group"
      aria-label={label}
      aria-roledescription={carousel ? "carousel" : undefined}
    >
      {children}
    </div>
  );
}
