import { Spin } from "antd";
import "./loading-status.css";

/** Shared loading indicator with a visible, politely announced status message. */
export function LoadingStatus({ text }: { text: string }) {
  return (
    <div className="loading-status" role="status" aria-live="polite" aria-label={text}>
      <Spin aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
