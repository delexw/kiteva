/** Runs in the page after scrolling; include associated labels in the native zoom's safe area. */
export function captureInputBounds(element: Element) {
  const labels = Array.from((element as HTMLInputElement | HTMLTextAreaElement).labels ?? []);
  const labelledBy = (element.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((label): label is HTMLElement => Boolean(label));
  const rectangles = [element, ...labels, ...labelledBy].map((item) =>
    item.getBoundingClientRect(),
  );
  const x = Math.min(...rectangles.map((box) => box.left));
  const y = Math.min(...rectangles.map((box) => box.top));
  return {
    x,
    y,
    width: Math.max(...rectangles.map((box) => box.right)) - x,
    height: Math.max(...rectangles.map((box) => box.bottom)) - y,
  };
}

/** Runs in the page: preserve a visible native scroll before pointer movement and typing. */
export async function scrollControlForCapture(
  element: Element,
  centerInput: boolean,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const pendingScrolls = new Set<EventTarget>();
    const supportsScrollEnd = "onscrollend" in document;
    const timeout = AbortSignal.timeout(10000);
    let frame = 0;
    let stableFrames = 0;
    let previous = element.getBoundingClientRect();
    // Object methods remain self-contained when tsx preserves function names.
    // Named nested functions acquire a server-only __name helper when serialized by Puppeteer.
    const handlers = {
      onScroll(event: Event) {
        if (event.target) pendingScrolls.add(event.target);
        stableFrames = 0;
      },
      onScrollEnd(event: Event) {
        if (event.target) pendingScrolls.delete(event.target);
      },
      cleanup() {
        cancelAnimationFrame(frame);
        document.removeEventListener("scroll", handlers.onScroll, true);
        document.removeEventListener("scrollend", handlers.onScrollEnd, true);
        timeout.removeEventListener("abort", handlers.onTimeout);
      },
      onTimeout() {
        handlers.cleanup();
        reject(Error("Control scrolling did not finish before interaction"));
      },
      observeFrame() {
        const current = element.getBoundingClientRect();
        const stationary =
          Math.abs(current.top - previous.top) < 0.5 &&
          Math.abs(current.left - previous.left) < 0.5;
        stableFrames = stationary ? stableFrames + 1 : 0;
        previous = current;
        if (stableFrames >= 4 && (!supportsScrollEnd || pendingScrolls.size === 0)) {
          handlers.cleanup();
          resolve();
        } else frame = requestAnimationFrame(handlers.observeFrame);
      },
    };
    document.addEventListener("scroll", handlers.onScroll, true);
    document.addEventListener("scrollend", handlers.onScrollEnd, true);
    timeout.addEventListener("abort", handlers.onTimeout, { once: true });
    element.scrollIntoView({
      block: centerInput ? "center" : "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
    frame = requestAnimationFrame(handlers.observeFrame);
  });
}
