export const contentRevealRule =
  'When a window, card, speech bubble, or diagram frame is drawn or revealed, keep its internal labels hidden until the container is complete. Group content with its container or annotate labels with data-reveal-after="container-id". Do not leave floating labels visible before their owning object exists. Standalone headings have independent timing.';

// Executes inside the composition browser, using the authored GSAP timeline.
function installContentReveal() {
  const host = window as unknown as {
    gsap?: typeof import("gsap").gsap;
    __timelines?: Record<string, gsap.core.Timeline>;
  };
  if (!host.gsap || !host.__timelines) return;
  const gsap = host.gsap;
  const bounds = (element: SVGGraphicsElement) => {
    const box = element.getBBox(),
      matrix = element.getCTM();
    if (!matrix) return null;
    const points = [
      new DOMPoint(box.x, box.y),
      new DOMPoint(box.x + box.width, box.y),
      new DOMPoint(box.x, box.y + box.height),
      new DOMPoint(box.x + box.width, box.y + box.height),
    ].map((point) => point.matrixTransform(matrix));
    return {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    };
  };
  for (const timeline of Object.values(host.__timelines)) {
    const tweens = timeline.getChildren(true, true, false) as gsap.core.Tween[];
    const animated = tweens
      .flatMap((tween) => tween.targets())
      .filter((target) => target instanceof SVGGraphicsElement) as SVGGraphicsElement[];
    const originalTime = timeline.time();
    timeline.seek(timeline.duration(), true);
    const reveals = new Map<SVGGraphicsElement, number>();
    for (const tween of tweens) {
      if (tween.vars.opacity === undefined && tween.vars.strokeDashoffset === undefined) continue;
      let end = tween.endTime(),
        parent = tween.parent;
      while (parent && parent !== timeline) {
        end = parent.startTime() + end / Math.abs(parent.timeScale() || 1);
        parent = parent.parent;
      }
      for (const target of tween.targets()) {
        if (!(target instanceof SVGGraphicsElement)) continue;
        const shape = target.matches("rect,use,circle,ellipse,polygon,path")
          ? target
          : target.querySelector("rect,use,circle,ellipse,polygon,path");
        if (!(shape instanceof SVGGraphicsElement)) continue;
        if (shape.localName === "path" && !/[zZ]\s*$/.test(shape.getAttribute("d") || "")) continue;
        const box = bounds(shape);
        if (!box || box.right - box.left > 1000 || box.bottom - box.top > 600) continue;
        for (const label of shape.ownerSVGElement!.querySelectorAll<SVGGraphicsElement>("text")) {
          if (
            target.contains(label) ||
            animated.some((actor) => actor === label || actor.contains(label))
          )
            continue;
          const ownership = label.getAttribute("data-reveal-after");
          const textBox = bounds(label);
          const contained =
            textBox &&
            textBox.left >= box.left - 1 &&
            textBox.right <= box.right + 1 &&
            textBox.top >= box.top - 1 &&
            textBox.bottom <= box.bottom + 1;
          if (ownership ? ownership === shape.id || ownership === target.id : contained)
            reveals.set(label, Math.max(reveals.get(label) || 0, end));
        }
      }
    }
    timeline.seek(originalTime, true);
    for (const [label, end] of reveals) {
      const opacity = Number(getComputedStyle(label).opacity);
      gsap.set(label, { opacity: 0 });
      timeline.fromTo(
        label,
        { opacity: 0 },
        { opacity, duration: 0.001, ease: "none", immediateRender: false },
        end,
      );
    }
  }
}
export function withContentReveal(html: string) {
  const cleaned = html.replace(/<script id="content-reveal-runtime">[\s\S]*?<\/script>/g, "");
  const script = `<script id="content-reveal-runtime">(()=>{const __name=(value)=>value;const install=${installContentReveal.toString()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();})();</script>`;
  return cleaned.replace(/<\/body>/i, script + "</body>");
}
