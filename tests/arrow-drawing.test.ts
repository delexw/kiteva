import { expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { gsap } from "gsap";
import { withArrowDrawing } from "../src/server/motion/arrow-drawing";

class Shape {
  opacity = 1;
  strokeDashoffset = 0;
  id = "shaft";
  localName = "path";
  style: Record<string, string> = {};
  ownerSVGElement?: { querySelectorAll: () => Shape[] };
  constructor(
    public attributes: Record<string, string> = {},
    public box = { x: 90, y: -5, width: 10, height: 10 },
  ) {}
  getAttribute(name: string) {
    return this.attributes[name] || null;
  }
  getTotalLength() {
    return 100;
  }
  getPointAtLength() {
    return { x: 100, y: 0 };
  }
  getCTM() {
    return {};
  }
  getBBox() {
    return this.box;
  }
  closest() {
    return null;
  }
}
class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
  matrixTransform() {
    return this;
  }
}
function execute(html: string, host: unknown, marker?: unknown, groups: Shape[] = []) {
  const script = html.match(/<script id="arrow-drawing-runtime">([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, {
    window: host,
    SVGGeometryElement: Shape,
    DOMPoint: Point,
    document: {
      readyState: "complete",
      getElementById: () => marker,
      createElementNS: () => {
        const g = new Shape();
        groups.push(g);
        return g;
      },
    },
    getComputedStyle: (shape: Shape) => ({
      opacity: String(shape.opacity),
      stroke: "black",
      fill: "none",
      markerEnd: "none",
    }),
  });
}
it("holds a separate arrowhead until the line completes, including backward and direct seeks", () => {
  const shaft = new Shape(),
    head = new Shape({ d: "M90 -5L100 0L90 5" });
  shaft.ownerSVGElement = { querySelectorAll: () => [shaft, head] };
  head.ownerSVGElement = shaft.ownerSVGElement;
  const timeline = gsap
    .timeline({ paused: true })
    .fromTo(
      shaft,
      { strokeDashoffset: 100 },
      { strokeDashoffset: 0, duration: 1, ease: "none" },
      0.5,
    );
  timeline.to({}, { duration: 0.01 }, 2);
  execute(withArrowDrawing("<body></body>"), { gsap, __timelines: { video: timeline } });
  for (const t of [0, 0.5, 1, 1.49]) {
    timeline.seek(t, true);
    expect(head.opacity).toBe(0);
  }
  timeline.seek(1.6, true);
  expect(head.opacity).toBe(1);
  timeline.seek(0.8, true);
  expect(head.opacity).toBe(0);
  timeline.seek(2, true);
  expect(head.opacity).toBe(1);
  timeline.kill();
});
it("gives shared SVG markers independent per-arrow timing and leaves non-head shapes alone", () => {
  const a = new Shape({ "marker-end": "url(#head)" }),
    b = new Shape({ "marker-end": "url(#head)" });
  const marker = {
    localName: "marker",
    parentNode: { appendChild: () => {} },
    cloneNode: () => ({ firstChild: null, appendChild: () => {} }),
  };
  const timeline = gsap
    .timeline({ paused: true })
    .to(a, { strokeDashoffset: 0, duration: 0.5 }, 0)
    .to(b, { strokeDashoffset: 0, duration: 0.5 }, 1);
  const groups: Shape[] = [];
  execute(
    withArrowDrawing("<body></body>"),
    { gsap, __timelines: { video: timeline } },
    marker,
    groups,
  );
  expect(groups).toHaveLength(2);
  expect(a.style.markerEnd).not.toBe(b.style.markerEnd);
  timeline.seek(0.8, true);
  expect(groups.map((g) => g.opacity)).toEqual([1, 0]);
  timeline.seek(1.6, true);
  expect(groups.map((g) => g.opacity)).toEqual([1, 1]);
  timeline.seek(0, true);
  expect(groups.map((g) => g.opacity)).toEqual([0, 0]);
  timeline.kill();
});
it("injects the shared rule once while preserving authored composition content", () => {
  const original = "<body><svg id='art'></svg><script>window.__timelines={};</script></body>";
  const result = withArrowDrawing(original);
  expect(withArrowDrawing(result)).toBe(result);
  expect(result.match(/id="arrow-drawing-runtime"/g)).toHaveLength(1);
  expect(result).toContain("<svg id='art'></svg>");
});

it("respects explicit ownership for short arrows without treating unrelated triangles as heads", () => {
  const shaft = new Shape(),
    head = new Shape({ "data-arrowhead-for": "shaft" }),
    unrelated = new Shape({ d: "M90 -5L100 0L90 5" });
  shaft.getTotalLength = () => 20;
  shaft.ownerSVGElement = { querySelectorAll: () => [shaft, head, unrelated] };
  const timeline = gsap.timeline({ paused: true }).to(shaft, { strokeDashoffset: 0, duration: 1 });
  timeline.to({}, { duration: 0.01 }, 2);
  execute(withArrowDrawing("<body></body>"), { gsap, __timelines: { video: timeline } });
  timeline.seek(0.5, true);
  expect(head.opacity).toBe(0);
  expect(unrelated.opacity).toBe(1);
  timeline.seek(1.2, true);
  expect(head.opacity).toBe(1);
  timeline.seek(0, true);
  expect(head.opacity).toBe(0);
  timeline.kill();
});
