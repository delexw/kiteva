import { it, expect } from "vitest";
import { runInNewContext } from "node:vm";
import { gsap } from "gsap";
import { withContentReveal } from "../src/server/motion/content-reveal";
class Graphic {
  opacity = 1;
  ownerSVGElement?: { querySelectorAll: () => Graphic[] };
  constructor(
    public localName: string,
    public box: { x: number; y: number; width: number; height: number },
  ) {}
  getBBox() {
    return this.box;
  }
  getCTM() {
    return {};
  }
  matches() {
    return this.localName === "rect";
  }
  querySelector() {
    return null;
  }
  contains(target: unknown) {
    return target === this;
  }
  getAttribute() {
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
it("reveals static labels after their frame, preserves standalone headings, and supports rewinding", () => {
  const frame = new Graphic("rect", { x: 100, y: 100, width: 200, height: 100 });
  const label = new Graphic("text", { x: 120, y: 130, width: 80, height: 20 });
  const heading = new Graphic("text", { x: 10, y: 10, width: 80, height: 20 });
  frame.ownerSVGElement = { querySelectorAll: () => [label, heading] };
  const timeline = gsap
    .timeline({ paused: true })
    .fromTo(frame, { opacity: 0 }, { opacity: 1, duration: 1 }, 0.5);
  timeline.to({}, { duration: 0.01 }, 2);
  const html = withContentReveal("<body></body>");
  runInNewContext(html.match(/<script id="content-reveal-runtime">([\s\S]*?)<\/script>/)![1], {
    window: { gsap, __timelines: { video: timeline } },
    SVGGraphicsElement: Graphic,
    DOMPoint: Point,
    document: { readyState: "complete" },
    getComputedStyle: (element: Graphic) => ({ opacity: String(element.opacity) }),
  });
  timeline.seek(0.8, true);
  expect(label.opacity).toBe(0);
  expect(heading.opacity).toBe(1);
  timeline.seek(1.6, true);
  expect(label.opacity).toBe(1);
  timeline.seek(0, true);
  expect(label.opacity).toBe(0);
  timeline.kill();
});
it("injects once and preserves authored artwork", () => {
  const html = "<body><svg></svg></body>";
  const result = withContentReveal(html);
  expect(withContentReveal(result)).toBe(result);
  expect(result).toContain("<svg></svg>");
});
