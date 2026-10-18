import { translateUi } from "./i18n";
import { Modal } from "antd";
import type { ReactNode } from "react";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      footer={footer ?? null}
      width={wide ? "min(1100px, calc(100vw - 32px))" : "min(620px, calc(100vw - 32px))"}
      className="studio-modal"
      style={{ top: 24 }}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      destroyOnHidden
      closeIcon={<span aria-label={translateUi("Close dialog")}>×</span>}
    >
      <div className="dialog-body">{children}</div>
    </Modal>
  );
}
