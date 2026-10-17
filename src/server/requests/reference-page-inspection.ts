export function inspectReferenceDocument() {
  const controls = Array.from(
    document.querySelectorAll(
      'a,button,input:not([type="hidden"]),textarea,select,[role="button"],[role="tab"],summary',
    ),
  )
    .filter((element) => element.getBoundingClientRect().width > 0)
    .slice(0, 80)
    .map((element, index) => {
      const id = String(index + 1);
      element.setAttribute("data-reference-control", id);
      return {
        id,
        name: (
          element.getAttribute("aria-label") ||
          (element as HTMLInputElement).labels?.[0]?.textContent ||
          element.getAttribute("placeholder") ||
          element.textContent ||
          ""
        )
          .trim()
          .slice(0, 180),
        role: element.getAttribute("role") || element.tagName.toLowerCase(),
        url: element instanceof HTMLAnchorElement ? element.href : undefined,
      };
    });
  for (const element of document.querySelectorAll("[data-reference-section]"))
    element.removeAttribute("data-reference-section");
  const sectionIds = new Map<Element, string>();
  const sections = Array.from(document.querySelectorAll("h1,h2,h3"))
    .slice(0, 30)
    .map((element) => {
      const parent = element.closest("section,article,form") || element.parentElement || element;
      let id = sectionIds.get(parent);
      if (!id) {
        id = String(sectionIds.size + 1);
        sectionIds.set(parent, id);
        parent.setAttribute("data-reference-section", id);
      }
      return {
        heading: element.textContent?.trim(),
        selector: `[data-reference-section="${id}"]`,
      };
    });
  return {
    title: document.title,
    text: document.body.innerText.slice(0, 16000),
    url: location.href,
    controls,
    sections,
  };
}

/** Executed in the reference page, not in the Node.js host. */
export function referencePageHasContent() {
  return Boolean(
    document.body?.innerText.trim() ||
    [...document.querySelectorAll("canvas, svg, img, video")].some((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.opacity !== "0"
      );
    }),
  );
}
