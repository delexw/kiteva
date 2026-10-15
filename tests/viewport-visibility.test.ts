import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useViewportVisibility } from "../src/client/use-viewport-visibility";
const state = vi.hoisted(() => ({
  setVisible: vi.fn(),
  cleanup: undefined as undefined | (() => void),
}));
vi.mock("react", () => ({
  useState: () => [false, state.setVisible],
  useEffect: (effect: () => () => void) => {
    state.cleanup = effect();
  },
}));
let notify: (entries: Partial<IntersectionObserverEntry>[]) => void;
const disconnect = vi.fn();
beforeEach(() => {
  state.setVisible.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  state.cleanup?.();
  vi.unstubAllGlobals();
});
it("loads on first intersection and disconnects in once mode", () => {
  useViewportVisibility({ current: {} as Element }, 0, true);
  notify([{ isIntersecting: false, intersectionRatio: 0 }]);
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  expect(disconnect).not.toHaveBeenCalled();
  notify([{ isIntersecting: true, intersectionRatio: 0.01 }]);
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  expect(disconnect).toHaveBeenCalledOnce();
});
it("preserves continuous visibility tracking for existing consumers", () => {
  useViewportVisibility({ current: {} as Element });
  notify([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  notify([{ isIntersecting: true, intersectionRatio: 0.1 }]);
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  expect(disconnect).not.toHaveBeenCalled();
});
