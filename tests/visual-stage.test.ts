import { expect, it, vi } from "vitest";
import { createVisualStage } from "../src/shared/visual-stage";

it("calculates on every seek but only applies a changed complete visual state", () => {
  const calculate = vi.fn((time) => ({
    inputRevision: "fixture-v1",
    frame: Math.floor(time * 10),
    text: time < 1 ? "Intro" : "Demo",
  }));
  const apply = vi.fn();
  const stage = createVisualStage({ reuse: true, calculate, apply });
  expect(stage.render(0)).toEqual({
    decision: "apply",
    changedKeys: ["inputRevision", "frame", "text"],
  });
  expect(stage.render(0.01).decision).toBe("unchanged");
  expect(stage.render(1).changedKeys).toEqual(["frame", "text"]);
  expect(stage.render(0).decision).toBe("apply");
  expect(stage.render(0).decision).toBe("unchanged");
  expect(calculate).toHaveBeenCalledTimes(5);
  expect(apply).toHaveBeenCalledTimes(3);
  stage.invalidate();
  expect(stage.render(0).decision).toBe("apply");
});
it("keeps caption and footage updates independent", () => {
  const draw = vi.fn();
  const write = vi.fn();
  const footage = createVisualStage({
    reuse: true,
    calculate: (time) => ({ inputRevision: "fixture-v1", frame: Math.floor(time * 60) }),
    apply: draw,
  });
  const caption = createVisualStage({
    reuse: true,
    calculate: () => ({ inputRevision: "fixture-v1", text: "Read this", opacity: 1 }),
    apply: write,
  });
  for (const time of [0, 0.1, 0.2]) {
    footage.render(time);
    caption.render(time);
  }
  expect(draw).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledTimes(1);
});
it("includes removed and newly added keys, even when their value is undefined", () => {
  const stage = createVisualStage({
    reuse: true,
    calculate: (time) =>
      time === 0
        ? { inputRevision: "fixture-v1", old: undefined }
        : { inputRevision: "fixture-v1", added: undefined },
    apply: () => {},
  });
  stage.render(0);
  expect(stage.render(1).changedKeys).toEqual(["old", "added"]);
});
it("reapplies after a failed partial update, including a seek to the former state", () => {
  let fail = false;
  const apply = vi.fn(() => {
    if (fail) throw Error("drawing failed");
  });
  const stage = createVisualStage({
    reuse: true,
    calculate: (time) => ({ inputRevision: "fixture-v1", x: time }),
    apply,
  });
  stage.render(0);
  fail = true;
  expect(() => stage.render(1)).toThrow("drawing failed");
  fail = false;
  expect(stage.render(0).decision).toBe("apply");
});
it("rejects nested/mutable state, nonfinite values and asynchronous updates", () => {
  const bad = createVisualStage({
    reuse: true,
    calculate: () => ({ inputRevision: "fixture-v1", x: NaN }),
    apply: () => {},
  });
  expect(() => bad.render(0)).toThrow("finite scalar");
  const stage = createVisualStage({
    reuse: true,
    calculate: () => ({ inputRevision: "fixture-v1", x: 0 }),
    apply: () => Promise.resolve(),
  });
  expect(() => stage.render(0)).toThrow("synchronous");
  expect(() => stage.render(Infinity)).toThrow("time must be finite");
  const nested = createVisualStage({
    reuse: true,
    calculate: () => JSON.parse('{"inputRevision":"fixture-v1","position":{"x":1}}'),
    apply: () => {},
  });
  expect(() => nested.render(0)).toThrow("finite scalar");
});

it("defaults to rebuilding and redraws a whole part when its input revision changes", () => {
  let inputRevision = "assets-sha256-a";
  const apply = vi.fn();
  const calculate = () => ({ inputRevision, x: 10 });
  const conservative = createVisualStage({ calculate, apply });
  conservative.render(0);
  conservative.render(0);
  expect(apply).toHaveBeenCalledTimes(2);
  const reusable = createVisualStage({ reuse: true, calculate, apply });
  reusable.render(0);
  reusable.render(0);
  expect(apply).toHaveBeenCalledTimes(3);
  inputRevision = "assets-sha256-b";
  expect(reusable.render(0)).toEqual({ decision: "apply", changedKeys: ["inputRevision"] });
  expect(apply).toHaveBeenLastCalledWith({ inputRevision: "assets-sha256-b", x: 10 }, [
    "inputRevision",
  ]);
});
