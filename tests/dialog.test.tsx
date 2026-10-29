import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog } from "../src/client/dialog";
describe("Ant Design dialog", () => {
  it("delegates focus, close and footer handling while scrolling only the content", () => {
    const onClose = vi.fn();
    const modal = Dialog({
      title: "Motion Graphic details",
      onClose,
      footer: <button>Use this Motion Graphic</button>,
      children: <p>Scrollable content</p>,
      wide: true,
    });
    expect(modal.props).toMatchObject({
      open: true,
      title: "Motion Graphic details",
      focusable: { trap: true, focusTriggerAfterClose: true },
      width: "calc(100vw - 32px)",
      centered: true,
      styles: {
        container: { height: "calc(100dvh - 32px)", display: "flex", flexDirection: "column" },
        body: { flex: 1, minHeight: 0 },
      },
    });
    expect(renderToStaticMarkup(modal.props.children)).toBe(
      '<div class="dialog-body"><p>Scrollable content</p></div>',
    );
    expect(renderToStaticMarkup(modal.props.footer)).toContain("Use this Motion Graphic");
    modal.props.onCancel();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("omits default confirmation buttons when no footer is supplied", () => {
    expect(
      Dialog({ title: "Preview", onClose: () => {}, children: "Content" }).props.footer,
    ).toBeNull();
  });
});
