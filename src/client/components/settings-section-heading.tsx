import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import "./settings-section-heading.css";

export function SettingsSectionHeading({
  title,
  description,
  icon = <Settings2 size={18} />,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-heading-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
