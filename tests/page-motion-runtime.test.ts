import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function setup() {
  let observe: (entries: unknown[]) => void = () => {};
  const media = {
    matches: false,
    addEventListener: (_: string, callback: () => void) => {
      media.change = callback;
    },
    change: () => {},
  };
  const document = { hidden: false, documentElement: { dataset: {} }, addEventListener: () => {} };
  class Element {
    dataset: Record<string, string> = {};
    top = 0;
    animations = [
      {
        playState: "paused",
        play() {
          this.playState = "running";
        },
        pause() {
          this.playState = "paused";
        },
      },
    ];
    getAnimations() {
      return this.animations;
    }
    getBoundingClientRect() {
      return { top: this.top, height: 200 };
    }
  }
  const context = {
    window: {} as {
      KitevaMotion: {
        register: (element: Element, options?: Record<string, unknown>) => () => void;
        refresh: () => void;
      };
    },
    document,
    Element,
    innerHeight: 800,
    matchMedia: () => media,
    addEventListener: () => {},
    IntersectionObserver: class {
      constructor(callback: typeof observe) {
        observe = callback;
      }
      observe() {}
      unobserve() {}
    },
  };
  vm.runInNewContext(readFileSync("src/browser/page/motion-runtime.js", "utf8"), context);
  return {
    context,
    media,
    Element,
    visibility: (target: Element, visible: boolean) =>
      observe([{ target, isIntersecting: visible }]),
    runtime: context.window.KitevaMotion,
  };
}
describe("HTML motion lifecycle", () => {
  it("pauses offscreen, resumes without resetting, and reacts to reduced motion", () => {
    const s = setup(),
      element = new s.Element(),
      activity: boolean[] = [];
    s.runtime.register(element, { onActive: (active: boolean) => activity.push(active) });
    expect(element.animations[0].playState).toBe("paused");
    s.visibility(element, true);
    expect(element.animations[0].playState).toBe("running");
    s.visibility(element, false);
    expect(element.animations[0].playState).toBe("paused");
    s.visibility(element, true);
    s.media.matches = true;
    s.media.change();
    expect(element.animations[0].playState).toBe("paused");
    expect(activity).toEqual([false, true, false, true, false]);
  });
  it("triggers entrance once and computes reversible scroll progress", () => {
    const s = setup(),
      element = new s.Element();
    let enters = 0;
    const progress: number[] = [];
    const cleanup = s.runtime.register(element, { mode: "entrance", onEnter: () => enters++ });
    s.visibility(element, true);
    s.visibility(element, false);
    s.visibility(element, true);
    expect(enters).toBe(1);
    cleanup();
    s.runtime.register(element, {
      mode: "scroll",
      onProgress: (value: number) => progress.push(value),
    });
    s.visibility(element, true);
    element.top = 400;
    s.runtime.refresh();
    expect(progress).toEqual([0.8, 0.4]);
  });
  it("stops custom activity in hidden tabs without hijacking interaction animations", () => {
    const s = setup(),
      element = new s.Element(),
      activity: boolean[] = [];
    s.runtime.register(element, {
      mode: "interaction",
      onActive: (active: boolean) => activity.push(active),
    });
    s.visibility(element, true);
    s.context.document.hidden = true;
    s.runtime.refresh();
    expect(activity).toEqual([false, true, false]);
    expect(() => s.runtime.register(element)).toThrow("already registered");
  });
});
