import { translateUi, useUiLanguage } from "../i18n";
import type { ReactNode } from "react";

export function PageTemplate({
  title,
  eyebrow,
  description,
  actions,
  controls,
  className = "",
  children,
}: {
  title: string;
  eyebrow: string;
  description?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  useUiLanguage();
  return (
    <section className={`page-template ${className}`.trim()}>
      <header className="page-template-header">
        <div className="page-heading">
          <div className="page-template-title">
            <div className="eyebrow">{translateUi(eyebrow)}</div>
            <h1>{title}</h1>
            {description && <div className="page-template-description">{description}</div>}
          </div>
          {actions && <div className="heading-actions">{actions}</div>}
        </div>
        {controls && <div className="page-template-controls">{controls}</div>}
      </header>
      <div className="page-template-content">{children}</div>
    </section>
  );
}
