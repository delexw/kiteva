import { expect, it } from "vitest";
import {
  boxCorners,
  boxFaces,
  makeCamera,
  orbitCameraPose,
  prismFaces,
  projector,
  shade,
} from "../src/client/motion-orbit-preview";
import { Vector3 } from "three";
import { drawMotionPreview } from "../src/client/motion-drawing";

it("constructs a closed box with outward normals and eight distinct corners", () => {
  const center = new Vector3(2, 3, 4);
  const faces = boxFaces(2, 3, 4, 2, 4, 6, "#123456");
  expect(faces).toHaveLength(6);
  for (const face of faces) {
    expect(face.points).toHaveLength(4);
    expect(face.color).toBe("#123456");
    expect(face.normal.length()).toBeCloseTo(1);
    for (const point of face.points)
      expect(point.clone().sub(center).dot(face.normal)).toBeGreaterThan(0);
  }
  const corners = boxCorners(2, 3, 4, 2, 4, 6);
  expect(new Set(corners.map((point) => point.toArray().join(","))).size).toBe(8);
  expect(corners.map((point) => point.x).sort()).toEqual([1, 1, 1, 1, 3, 3, 3, 3]);
  expect(Math.min(...corners.map((point) => point.y))).toBe(1);
  expect(Math.max(...corners.map((point) => point.z))).toBe(7);
});

it("closes both ends of a prism and keeps its sides on the requested radius", () => {
  const faces = prismFaces(2, 1, 3, 4, 2, 8, "#abcdef");
  expect(faces).toHaveLength(10);
  const caps = faces.filter((face) => Math.abs(face.normal.y) === 1);
  expect(caps.map((face) => face.normal.y).sort()).toEqual([-1, 1]);
  for (const face of faces) {
    expect(face.color).toBe("#abcdef");
    for (const point of face.points) {
      expect(Math.hypot(point.x - 2, point.z - 3)).toBeCloseTo(4);
      expect([1, 3]).toContain(point.y);
    }
  }
});

it("projects the camera target to the canvas center with correct screen axes", () => {
  const target = new Vector3();
  const position = new Vector3(0, 0, 7);
  const project = projector(makeCamera(position, target));
  expect(project(target)).toEqual({ x: 320, y: 180, depth: 7 });
  expect(project(new Vector3(1, 0, 0)).x).toBeGreaterThan(320);
  expect(project(new Vector3(0, 1, 0)).y).toBeLessThan(180);
  expect(project(new Vector3(0, 0, 8)).depth).toBeLessThan(0);
  expect(target.toArray()).toEqual([0, 0, 0]);
  expect(position.toArray()).toEqual([0, 0, 7]);
});

it("clamps shaded color channels without changing their relative source values", () => {
  expect(shade("#804020", 0.5)).toBe("rgb(64, 32, 16)");
  expect(shade("#804020", -1)).toBe("rgb(0, 0, 0)");
  expect(shade("#804020", 4)).toBe("rgb(255, 255, 128)");
});

function frame(time: number) {
  const commands: unknown[][] = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          commands.push([name, ...args]),
      set: (_, name, value) => {
        commands.push([name, value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  drawMotionPreview(context, "motion-043", time);
  return commands;
}
it("makes one full camera circuit with a fixed target, radius and height and held endpoints", () => {
  const start = orbitCameraPose(0);
  expect(orbitCameraPose(0.8).position).toEqual(start.position);
  expect(orbitCameraPose(6).position).toEqual(start.position);
  expect(orbitCameraPose(6).progress).toBe(1);
  expect(orbitCameraPose(-10).position).toEqual(start.position);
  expect(orbitCameraPose(60).position).toEqual(start.position);
  for (const time of [1.2, 2, 3, 4, 5]) {
    const pose = orbitCameraPose(time);
    expect(pose.target).toEqual(start.target);
    expect(pose.position.y).toBe(start.position.y);
    expect(Math.hypot(pose.position.x, pose.position.z)).toBeCloseTo(7, 10);
    expect(pose.position.distanceTo(start.position)).toBeGreaterThan(0.01);
  }
  expect(orbitCameraPose(3).progress).toBeCloseTo(0.5);
});
it("reveals different geometry and occlusions, then reproduces frames after arbitrary seeking", () => {
  const front = frame(0);
  const back = frame(3);
  expect(front).not.toEqual(back);
  const light = new Vector3(-0.5, 1, 0.65).normalize();
  const lastFill = (commands: unknown[][], color: string) => {
    const litColors = new Set(
      [
        new Vector3(1, 0, 0),
        new Vector3(-1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, -1, 0),
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -1),
      ].map((normal) => shade(color, 0.5 + 0.55 * Math.max(0, normal.dot(light)))),
    );
    return commands.reduce(
      (last, command, index) =>
        command[0] === "fillStyle" && litColors.has(String(command[1])) ? index : last,
      -1,
    );
  };
  for (const commands of [front, back]) {
    expect(lastFill(commands, "#F4BA73")).toBeGreaterThan(-1);
    expect(lastFill(commands, "#72CCB9")).toBeGreaterThan(-1);
  }
  expect(lastFill(front, "#F4BA73")).toBeGreaterThan(lastFill(front, "#72CCB9"));
  expect(lastFill(back, "#F4BA73")).toBeLessThan(lastFill(back, "#72CCB9"));
  expect(frame(0.5)).toEqual(front);
  const geometry = (commands: unknown[][]) =>
    commands.filter((command) =>
      ["beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "rect", "clip"].includes(
        String(command[0]),
      ),
    );
  expect(geometry(frame(6))).toEqual(geometry(front));
  const expected = frame(2.2);
  frame(5.8);
  frame(0.1);
  frame(3.7);
  expect(frame(2.2)).toEqual(expected);
  for (const time of [0, 1.5, 3, 4.5, 6])
    for (const command of frame(time))
      for (const value of command.slice(1))
        if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
});
