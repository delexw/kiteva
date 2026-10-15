export const arrowDrawingRule =
  'When drawing any arrow, hide its arrowhead until the shaft reaches that endpoint. Never leave a static arrowhead visible while the shaft draws. Use SVG marker-end or annotate a separate head with data-arrowhead-for="shaft-id"; keep head timing on the same seekable timeline and verify forward, backward and direct seeks. Apply the same endpoint rule to Canvas and 3D arrows.';

// Runs in the composition browser, without application or Node APIs.
function installArrowDrawing() {
  const host = window as unknown as {
    gsap?: typeof import("gsap").gsap;
    __timelines?: Record<string, gsap.core.Timeline & { __arrowDrawingInstalled?: boolean }>;
    __arrowDrawingCount?: number;
  };
  if (!host.gsap || !host.__timelines) return;
  const gsap = host.gsap;
  let count = 0;
  const ns = "http://www.w3.org/2000/svg";
  for (const timeline of Object.values(host.__timelines)) {
    if (timeline.__arrowDrawingInstalled) continue;
    timeline.__arrowDrawingInstalled = true;
    const children = timeline.getChildren(true, true, false) as gsap.core.Tween[];
    const shafts = new Map<SVGGeometryElement, number>();
    for (const tween of children) {
      if (tween.vars.strokeDashoffset === undefined) continue;
      let end = tween.endTime();
      let parent = tween.parent;
      while (parent && parent !== timeline) {
        end = parent.startTime() + end / Math.abs(parent.timeScale() || 1);
        parent = parent.parent;
      }
      for (const target of tween.targets()) {
        if (target instanceof SVGGeometryElement && typeof target.getTotalLength === "function")
          shafts.set(target, Math.max(shafts.get(target) || 0, end));
      }
    }
    const claimed = new Set<Element>();
    const gate = (head: Element, end: number) => {
      if (claimed.has(head)) return;
      claimed.add(head);
      const opacity = Number(getComputedStyle(head).opacity) || 1;
      gsap.set(head, { opacity: 0 });
      timeline.fromTo(
        head,
        { opacity: 0 },
        { opacity, duration: 0.001, ease: "none", immediateRender: false },
        end,
      );
      count++;
    };
    for (const [shaft, end] of shafts) {
      const markerUrl = shaft.getAttribute("marker-end") || getComputedStyle(shaft).markerEnd;
      const markerId = markerUrl?.match(/#([^"')\s]+)/)?.[1];
      const marker = markerId ? document.getElementById(markerId) : null;
      if (marker?.localName === "marker") {
        const clone = marker.cloneNode(true) as SVGMarkerElement;
        clone.id = "arrow-drawing-marker-" + count;
        const group = document.createElementNS(ns, "g");
        while (clone.firstChild) group.appendChild(clone.firstChild);
        clone.appendChild(group);
        marker.parentNode!.appendChild(clone);
        shaft.style.markerEnd = "url(#" + clone.id + ")";
        gate(group, end);
      }
      // Explicit ownership is preferred; legacy illustrations also use tiny V/triangle heads.
      const svg = shaft.ownerSVGElement;
      const matrix = shaft.getCTM();
      if (!svg || !matrix) continue;
      const point = shaft.getPointAtLength(shaft.getTotalLength());
      const endpoint = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      for (const head of svg.querySelectorAll<SVGGeometryElement>("path,polyline,polygon")) {
        if (head === shaft || head.closest("defs,marker,clipPath,mask")) continue;
        const explicit = head.getAttribute("data-arrowhead-for");
        if (explicit) {
          if (explicit === shaft.id) gate(head, end);
          continue;
        }
        if (shaft.getTotalLength() < 40) continue;
        if (
          head.localName === "path" &&
          !/^mllz?$/i.test((head.getAttribute("d") || "").match(/[a-df-z]/gi)?.join("") || "")
        )
          continue;
        if (
          (head.localName === "polygon" || head.localName === "polyline") &&
          (head as SVGPolygonElement).points.numberOfItems !== 3
        )
          continue;
        const box = head.getBBox(),
          transform = head.getCTM();
        if (!transform || box.width > 64 || box.height > 64 || box.width < 2 || box.height < 2)
          continue;
        const style = getComputedStyle(head),
          shaftStyle = getComputedStyle(shaft);
        if (style.stroke !== shaftStyle.stroke && style.fill !== shaftStyle.stroke) continue;
        const corners = [
          new DOMPoint(box.x, box.y),
          new DOMPoint(box.x + box.width, box.y),
          new DOMPoint(box.x, box.y + box.height),
          new DOMPoint(box.x + box.width, box.y + box.height),
        ].map((p) => p.matrixTransform(transform));
        const xs = corners.map((p) => p.x),
          ys = corners.map((p) => p.y);
        if (
          endpoint.x >= Math.min(...xs) - 2 &&
          endpoint.x <= Math.max(...xs) + 2 &&
          endpoint.y >= Math.min(...ys) - 2 &&
          endpoint.y <= Math.max(...ys) + 2
        )
          gate(head, end);
      }
    }
  }
  host.__arrowDrawingCount = count;
}

export function withArrowDrawing(html: string): string {
  const cleaned = html.replace(/<script id="arrow-drawing-runtime">[\s\S]*?<\/script>/g, "");
  const script = `<script id="arrow-drawing-runtime">(()=>{const __name=(value)=>value;const installArrowDrawing=${installArrowDrawing.toString()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installArrowDrawing,{once:true});else installArrowDrawing();})();</script>`;
  return cleaned.replace(/<\/body>/i, script + "</body>");
}
