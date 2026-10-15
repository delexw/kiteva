import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  drawMotionPreview,
  motionProgress,
  supportedMotionIds,
} from "../src/client/motion-drawing";
function drawCommands(id: string, time: number) {
  const commands: unknown[] = [];
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
  drawMotionPreview(context, id, time);
  return commands;
}
describe("motion explorer preview coverage", () => {
  it("implements every catalog motion with different scheduled frames", async () => {
    const catalog = await loadCatalog();
    expect(supportedMotionIds).toEqual(catalog.motions.map((motion) => motion.id));
    for (const id of supportedMotionIds) {
      expect(drawCommands(id, 0.1)).not.toEqual(drawCommands(id, 3.5));
      expect(drawCommands(id, 2)).toEqual(drawCommands(id, 2));
    }
  });
  it("returns the pointer orbit to its resting viewpoint", () => {
    expect(drawCommands("motion-021", 0)).toEqual(drawCommands("motion-021", 6));
    expect(drawCommands("motion-021", 0)).not.toEqual(drawCommands("motion-021", 3));
  });
  it("gives gallery neighbors curved poses and updates the selected caption", () => {
    expect(drawCommands("motion-018", 0)).toContainEqual(["fillText", "Courtyard House", 320, 312]);
    expect(drawCommands("motion-018", 5)).toContainEqual(["fillText", "Garden Pavilion", 320, 312]);
    expect(
      drawCommands("motion-018", 2).some(
        (command) => Array.isArray(command) && command[0] === "rotate" && command[1] !== 0,
      ),
    ).toBe(true);
  });
  it("keeps glitch endpoints clean and limits slice distortion to the cut", () => {
    expect(
      drawCommands("motion-020", 0).filter(
        (command) => Array.isArray(command) && command[0] === "clip",
      ),
    ).toHaveLength(0);
    expect(
      drawCommands("motion-020", 2.4).filter(
        (command) => Array.isArray(command) && command[0] === "clip",
      ),
    ).toHaveLength(10);
    expect(
      drawCommands("motion-020", 6).filter(
        (command) => Array.isArray(command) && command[0] === "clip",
      ),
    ).toHaveLength(0);
  });
  it("rejects unsupported previews and clamps smooth progress", () => {
    expect(() => drawCommands("motion-999", 0)).toThrow("No preview");
    expect(motionProgress(-1, 0, 1)).toBe(0);
    expect(motionProgress(2, 0, 1)).toBe(1);
    expect(motionProgress(0.5, 0, 1)).toBe(0.5);
  });
});

it("covers the entire stage before the cursor wipe changes scenes", () => {
  expect(drawCommands("motion-023", 2.7)).toContainEqual(["fillRect", 0, 0, 640, 360]);
  expect(drawCommands("motion-023", 6)).toContainEqual(["fillText", "TAKE FLIGHT", 320, 193]);
});

it("builds diagram nodes before drawing connections", () => {
  const entrance = drawCommands("motion-030", 0.8);
  expect(entrance.filter((command) => Array.isArray(command) && command[0] === "arc")).toHaveLength(
    4,
  );
  expect(
    entrance.filter((command) => Array.isArray(command) && command[0] === "lineTo"),
  ).toHaveLength(0);
  expect(drawCommands("motion-030", 6)).toContainEqual(["fillText", "100% connected", 320, 54]);
});

it("keeps cloth attachment points fixed while its mesh moves", () => {
  for (const time of [0, 1, 2.5, 6]) {
    const commands = drawCommands("motion-034", time);
    expect(commands).toContainEqual(["arc", 160, 85, 7, 0, Math.PI * 2]);
    expect(commands).toContainEqual(["arc", 480, 85, 7, 0, Math.PI * 2]);
  }
  expect(drawCommands("motion-034", 1)).not.toEqual(drawCommands("motion-034", 2.5));
});

it("keeps new preview geometry finite throughout the timeline", () => {
  for (const id of supportedMotionIds.slice(21)) {
    for (let frame = 0; frame <= 48; frame++) {
      for (const command of drawCommands(id, frame / 8) as unknown[][]) {
        for (const value of command)
          if (typeof value === "number")
            expect(Number.isFinite(value), `${id} frame ${frame}`).toBe(true);
      }
    }
  }
});

it("records source evidence for every Fable addition and preserves all seven visual styles", async () => {
  const catalog = await loadCatalog();
  const additions = catalog.motions.filter(
    (motion) => Number(motion.id.slice(7)) >= 22 && Number(motion.id.slice(7)) <= 35,
  );
  expect(additions).toHaveLength(14);
  expect(new Set(additions.map((motion) => motion.name)).size).toBe(14);
  for (const motion of additions) {
    const evidence = motion.source_evidence as {
      source_urls: string[];
      review_window_seconds: number[];
    };
    expect(evidence.review_window_seconds).toEqual([0, 3]);
    expect(evidence.source_urls.length).toBeGreaterThan(0);
    expect(motion.executable_prompt_template).not.toContain("Scroll-Driven Storytelling");
  }
  expect(
    catalog.styles.filter(
      (style) => Number(style.id.slice(6)) >= 129 && Number(style.id.slice(6)) <= 135,
    ),
  ).toHaveLength(7);
});

it("settles glitch type into sharp stable glyphs without a cursor wipe", () => {
  const entrance = drawCommands("motion-036", 0.2);
  expect(
    entrance.some(
      (command) => Array.isArray(command) && command[0] === "scale" && Number(command[1]) > 1,
    ),
  ).toBe(true);
  expect(
    entrance.some(
      (command) => Array.isArray(command) && command[0] === "filter" && command[1] !== "blur(0px)",
    ),
  ).toBe(true);
  const settled = drawCommands("motion-036", 4);
  expect(settled).toEqual(drawCommands("motion-036", 6));
  expect(
    settled
      .filter((command) => Array.isArray(command) && command[0] === "fillText")
      .map((command) => (Array.isArray(command) ? command[1] : ""))
      .join(""),
  ).toBe("FLIGHT");
  expect(settled.filter((command) => Array.isArray(command) && command[0] === "scale")).toEqual(
    Array.from({ length: 6 }, () => ["scale", 1, 1]),
  );
});

it("settles the complete glitch title at a moderate pace", () => {
  expect(drawCommands("motion-036", 1.45)).toEqual(drawCommands("motion-036", 6));
  expect(drawCommands("motion-036", 0.5)).not.toEqual(drawCommands("motion-036", 1.45));
});

it("anchors glitch glyphs to their final positions throughout their entrance", () => {
  for (const time of [0.12, 0.25, 0.5, 0.7, 0.85]) {
    const translations = drawCommands("motion-036", time).filter(
      (command) => Array.isArray(command) && command[0] === "translate",
    ) as unknown[][];
    translations.forEach((command, index) =>
      expect(command).toEqual(["translate", 95 + index * 89, 200]),
    );
  }
});

it("settles all three extracted motions into stable final scenes", () => {
  for (const id of ["motion-037", "motion-038", "motion-039"]) {
    expect(drawCommands(id, 4.5)).toEqual(drawCommands(id, 6));
    expect(drawCommands(id, 0.8)).not.toEqual(drawCommands(id, 6));
  }
  const words = drawCommands("motion-037", 6).filter(
    (command) => Array.isArray(command) && command[0] === "fillText",
  );
  expect(words).toHaveLength(5);
  expect(drawCommands("motion-038", 2.4)).toContainEqual(["scale", 64, 64]);
  expect(drawCommands("motion-038", 6)).toContainEqual(["fillText", "NEXT CHAPTER", 320, 190]);
  expect(
    drawCommands("motion-039", 6).filter(
      (command) => Array.isArray(command) && command[0] === "lineTo",
    ),
  ).toHaveLength(16);
});

it("releases repeated white waves at an even tempo with outward travel and fading", () => {
  const waveRadii = (time: number) => {
    const commands = drawCommands("motion-039", time);
    const waves: number[] = [];
    let whiteWave = false;
    for (const command of commands) {
      if (!Array.isArray(command)) continue;
      if (command[0] === "strokeStyle") whiteWave = command[1] === "#FFFFFF";
      if (command[0] === "restore") whiteWave = false;
      if (whiteWave && command[0] === "arc" && command[1] === 320 && command[2] === 180)
        waves.push(Number(command[3]));
    }
    return waves;
  };
  expect(waveRadii(0.5)).toHaveLength(1);
  expect(waveRadii(0.9)).toHaveLength(2);
  const radii = waveRadii(1.3);
  expect(radii).toHaveLength(3);
  expect(radii[0]! - radii[1]!).toBeCloseTo(120);
  expect(radii[1]! - radii[2]!).toBeCloseTo(120);
  expect(waveRadii(1.4)[0]).toBeGreaterThan(radii[0]!);
  expect(drawCommands("motion-039", 1.3)).toContainEqual(["shadowBlur", 8]);
  expect(waveRadii(3.4)).toHaveLength(0);
  expect(drawCommands("motion-039", 4.5)).toEqual(drawCommands("motion-039", 6));
});

it("bursts varied tumbling confetti rather than identical dots", () => {
  const frame = drawCommands("motion-039", 1.2);
  const count = (name: string) =>
    frame.filter((command) => Array.isArray(command) && command[0] === name).length;
  expect(count("rotate")).toBe(72);
  expect(count("closePath")).toBe(18);
  expect(count("fillRect")).toBe(20);
  expect(frame).toContainEqual(["fillStyle", "#FFFFFF"]);
  expect(frame).toContainEqual(["fillStyle", "#14212B"]);
  expect(frame).toContainEqual(["shadowOffsetY", 3]);
  expect(drawCommands("motion-039", 1.3)).not.toEqual(frame);
  expect(
    drawCommands("motion-039", 4.5).filter(
      (command) => Array.isArray(command) && command[0] === "rotate",
    ),
  ).toHaveLength(0);
});

it("lets party-popper confetti fall under gravity after the initial outward burst", () => {
  const positions = (time: number) =>
    drawCommands("motion-039", time).filter(
      (command) => Array.isArray(command) && command[0] === "translate",
    ) as number[][];
  const early = positions(1.2);
  const later = positions(2.2);
  expect(early).toHaveLength(72);
  expect(later).toHaveLength(72);
  for (let index = 0; index < 72; index++) {
    expect(later[index]![2]! - early[index]![2]!).toBeGreaterThan(30);
  }
});

it("keeps the visible confetti burst local to the icon", () => {
  for (const time of [0.6, 1.2, 1.8, 2.2]) {
    const positions = drawCommands("motion-039", time).filter(
      (command) => Array.isArray(command) && command[0] === "translate",
    ) as number[][];
    for (const position of positions) {
      expect(Math.abs(position[1]! - 320)).toBeLessThan(115);
      expect(Math.abs(position[2]! - 180)).toBeLessThan(165);
    }
  }
});

it("pops toward the viewer without an upward launch, briefly hangs, then falls", () => {
  const firstY = (time: number) => {
    const command = drawCommands("motion-039", time).find(
      (entry) => Array.isArray(entry) && entry[0] === "translate",
    ) as number[];
    return command[2]!;
  };
  expect(firstY(0.5)).toBe(180);
  expect(firstY(0.75)).toBe(180);
  expect(Math.abs(firstY(0.85) - firstY(0.75))).toBeLessThan(4);
  expect(firstY(1.5) - firstY(0.85)).toBeGreaterThan(15);
});

it("launches confetti from the center toward the viewer in front of the icon", () => {
  const entrance = drawCommands("motion-039", 0.45);
  expect(entrance).toContainEqual(["translate", 320, 180]);
  const scales = (time: number) =>
    drawCommands("motion-039", time).filter(
      (command) => Array.isArray(command) && command[0] === "scale",
    ) as number[][];
  expect(scales(0.45)[0]![2]).toBeCloseTo(0.12);
  expect(scales(1)[0]![2]).toBeGreaterThan(1.4);
  const frame = drawCommands("motion-039", 1);
  const firstPiece = frame.findIndex(
    (command) => Array.isArray(command) && command[0] === "translate",
  );
  const iconStroke = frame.findIndex(
    (command) => Array.isArray(command) && command[0] === "lineTo",
  );
  expect(iconStroke).toBeLessThan(firstPiece);
});

it("cuts words and backgrounds together with crisp holds and a stable final message", async () => {
  expect(drawCommands("motion-040", 1.7)).toContainEqual(["fillText", "MAKE", 320, 212.64]);
  const before = drawCommands("motion-040", 2.399);
  const after = drawCommands("motion-040", 2.4);
  expect(before).toContainEqual(["fillStyle", "#14212B"]);
  expect(after).toContainEqual(["fillStyle", "#9BFF46"]);
  expect(after).toContainEqual(["fillText", "SOMETHING", 320, 207.2]);
  expect(drawCommands("motion-040", 2.6)).toEqual(after);
  expect(drawCommands("motion-040", 5)).toEqual(drawCommands("motion-040", 6));
  expect(
    after.some(
      (command) => Array.isArray(command) && ["rotate", "scale", "filter"].includes(command[0]),
    ),
  ).toBe(false);
  const catalog = await loadCatalog();
  expect(
    catalog.styles
      .filter((style) =>
        style.motion_references.candidates.some(
          (reference) => reference.motion_id === "motion-040",
        ),
      )
      .map((style) => style.id),
  ).toEqual([
    "style-003",
    "style-005",
    "style-010",
    "style-011",
    "style-015",
    "style-018",
    "style-028",
    "style-031",
    "style-049",
    "style-050",
    "style-051",
    "style-054",
    "style-057",
    "style-064",
    "style-066",
    "style-074",
    "style-093",
    "style-103",
    "style-105",
    "style-107",
  ]);
});
// Append to the existing motion-drawing test file. Uses the existing drawCommands helper
// and imports already present at the top of that file (describe/expect/it, drawMotionPreview).

type Command = unknown[];
const commandsNamed = (commands: unknown[], name: string) =>
  (commands as Command[]).filter((command) => Array.isArray(command) && command[0] === name);
const fillStyles = (id: string, time: number) =>
  new Set(commandsNamed(drawCommands(id, time), "fillStyle").map((command) => String(command[1])));

const flavorNames = ["Mint", "Mango", "Blueberry", "Plum", "Berry", "Lime"];
type RankedRow = {
  name: string;
  y: number;
  alpha: number;
  barFill: string;
  barWidth: number;
  value?: number;
  valueColor?: string;
};
// Reads each labelled row back from the command stream: the bar drawn just before a
// category label is that category's bar, and the numeric label after it is its value.
function rankedRows(time: number) {
  const rows: RankedRow[] = [];
  let alpha = 1,
    fill = "",
    barFill = "",
    barWidth = 0;
  let pending: RankedRow | undefined;
  for (const command of drawCommands("motion-041", time) as Command[]) {
    const [name, ...args] = command;
    if (name === "globalAlpha") alpha = Number(args[0]);
    else if (name === "fillStyle") fill = String(args[0]);
    else if (name === "roundRect") {
      barFill = fill;
      barWidth = Number(args[2]);
    } else if (name === "fillText") {
      const label = String(args[0]);
      if (flavorNames.includes(label)) {
        pending = { name: label, y: Number(args[2]), alpha, barFill, barWidth };
        rows.push(pending);
      } else if (pending && /^\d+$/.test(label)) {
        pending.value = Number(label);
        pending.valueColor = fill;
        pending = undefined;
      }
    }
  }
  return rows;
}
const periodStamp = (time: number) =>
  commandsNamed(drawCommands("motion-041", time), "fillText")
    .map((command) => String(command[1]))
    .find((label) => /^WEEK \d$/.test(label));

describe("motion-041 ranked bar race", () => {
  it("settles on the final ranking and holds it unchanged from 5s to 6s", () => {
    const final = drawCommands("motion-041", 6);
    expect(drawCommands("motion-041", 5)).toEqual(final);
    expect(drawCommands("motion-041", 5.5)).toEqual(final);
    expect(drawCommands("motion-041", 4)).not.toEqual(final);
    expect(periodStamp(6)).toBe("WEEK 4");
    const ordered = rankedRows(6).sort((a, b) => a.y - b.y);
    expect(ordered[0]!.name).toBe("Mint");
    // The settled order agrees with the settled values (no falsified ranking).
    const values = ordered.map((row) => row.value!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("steps a discrete period stamp and holds between data steps", () => {
    expect(periodStamp(0.2)).toBe("WEEK 1");
    expect(periodStamp(1.7)).toBe("WEEK 2");
    expect(periodStamp(3.1)).toBe("WEEK 3");
    const stamps = Array.from({ length: 61 }, (_, frame) => periodStamp(frame / 10));
    expect([...new Set(stamps)]).toEqual(["WEEK 1", "WEEK 2", "WEEK 3", "WEEK 4"]);
    expect(drawCommands("motion-041", 1.6)).toEqual(drawCommands("motion-041", 1.85));
    expect(drawCommands("motion-041", 1)).not.toEqual(drawCommands("motion-041", 1.6));
  });

  it("labels the chart as demo data in every frame", () => {
    for (let frame = 0; frame <= 12; frame++) {
      const labels = commandsNamed(drawCommands("motion-041", frame / 2), "fillText").map(
        (command) => String(command[1]),
      );
      expect(labels.some((label) => /demo data/i.test(label))).toBe(true);
    }
  });

  it("keeps each category's hue tied to identity, not rank, through swaps and the cutoff", () => {
    const identity = new Map(rankedRows(0).map((row) => [row.name, row.barFill]));
    expect(identity.size).toBe(6);
    expect(new Set(identity.values()).size).toBe(6);
    const seen = new Set<string>();
    for (let frame = 0; frame <= 120; frame++) {
      for (const row of rankedRows(frame / 20)) {
        seen.add(row.name);
        expect(row.barFill).toBe(identity.get(row.name));
        if (row.valueColor) expect(row.valueColor).toBe(row.barFill);
      }
    }
    expect(seen.size).toBe(6);
    const rankOf = (time: number, name: string) =>
      rankedRows(time)
        .sort((a, b) => a.y - b.y)
        .findIndex((row) => row.name === name);
    // Ranks really change while hues stay put.
    expect(rankOf(0, "Plum")).toBe(0);
    expect(rankOf(6, "Plum")).toBeGreaterThan(0);
    expect(rankOf(6, "Mint")).toBeLessThan(rankOf(0, "Mint"));
    // One row enters the visible top five and one exits below the cutoff.
    const alphaOf = (time: number, name: string) =>
      rankedRows(time).find((row) => row.name === name)?.alpha ?? 0;
    expect(alphaOf(0, "Blueberry")).toBeLessThan(0.3);
    expect(alphaOf(6, "Blueberry")).toBe(1);
    expect(alphaOf(0, "Lime")).toBe(1);
    expect(alphaOf(6, "Lime")).toBeLessThan(0.3);
  });

  it("never shows two readable category labels overlapping during rank swaps", () => {
    for (let frame = 0; frame <= 300; frame++) {
      const time = frame / 50;
      const readable = rankedRows(time).filter((row) => row.alpha > 0.3);
      for (let i = 0; i < readable.length; i++)
        for (let j = i + 1; j < readable.length; j++)
          expect(
            Math.abs(readable[i]!.y - readable[j]!.y),
            `${readable[i]!.name}/${readable[j]!.name} at ${time}s`,
          ).toBeGreaterThanOrEqual(18);
    }
  });

  it("sizes every bar on one shared scale during holds", () => {
    for (const time of [0, 1.7, 3.1, 6]) {
      const ratios = rankedRows(time)
        .filter((row) => row.value !== undefined)
        .map((row) => row.barWidth / row.value!);
      expect(ratios.length).toBeGreaterThanOrEqual(5);
      expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1e-9);
    }
  });
});

describe("motion-042 lighting state progression", () => {
  const pathPoints = (time: number) =>
    (drawCommands("motion-042", time) as Command[]).filter(
      (command) => command[0] === "moveTo" || command[0] === "lineTo",
    );
  const kettleBlock = (time: number) => {
    const commands = drawCommands("motion-042", time) as Command[];
    const start = commands.findIndex(
      (command) => command[0] === "translate" && command[1] === 330 && command[2] === 268,
    );
    expect(start).toBeGreaterThan(-1);
    const end = commands.findIndex((command, index) => index > start && command[0] === "restore");
    return { start, block: commands.slice(start, end), commands };
  };
  const stateLabel = (time: number) =>
    commandsNamed(drawCommands("motion-042", time), "fillText").map((command) => command[1]);

  it("holds day, dusk and night as clean states and settles night from 5s to 6s", () => {
    expect(drawCommands("motion-042", 0)).toEqual(drawCommands("motion-042", 1.1));
    expect(drawCommands("motion-042", 2.6)).toEqual(drawCommands("motion-042", 3.3));
    expect(drawCommands("motion-042", 4.8)).toEqual(drawCommands("motion-042", 6));
    expect(drawCommands("motion-042", 5)).toEqual(drawCommands("motion-042", 6));
    expect(stateLabel(0.5)).toEqual(["DAY"]);
    expect(stateLabel(3)).toEqual(["DUSK"]);
    expect(stateLabel(6)).toEqual(["NIGHT"]);
    for (const time of [0.5, 3, 6])
      expect(commandsNamed(drawCommands("motion-042", time), "clip")).toHaveLength(0);
  });

  it("keeps environment geometry fixed while the palette changes", () => {
    const day = pathPoints(0.5);
    expect(day.length).toBeGreaterThan(30);
    expect(pathPoints(3)).toEqual(day);
    expect(pathPoints(6)).toEqual(day);
    const dayFills = fillStyles("motion-042", 0.5);
    const nightFills = fillStyles("motion-042", 6);
    const dayOnly = [...dayFills].filter((color) => !nightFills.has(color));
    expect(dayOnly.length).toBeGreaterThanOrEqual(8);
    // No camera move or global filter: the only transform is the object anchor.
    for (let frame = 0; frame <= 48; frame++) {
      const commands = drawCommands("motion-042", frame / 8);
      for (const command of commandsNamed(commands, "translate"))
        expect(command).toEqual(["translate", 330, 268]);
      expect(commandsNamed(commands, "scale")).toHaveLength(0);
      expect(commandsNamed(commands, "rotate")).toHaveLength(0);
      expect(commandsNamed(commands, "filter")).toHaveLength(0);
    }
  });

  it("reveals the whole next state behind a bounded front, then clears it", () => {
    const midDusk = drawCommands("motion-042", 1.85);
    expect(commandsNamed(midDusk, "clip")).toHaveLength(1);
    const midFills = fillStyles("motion-042", 1.85);
    for (const color of fillStyles("motion-042", 0.5)) expect(midFills.has(color)).toBe(true);
    for (const color of fillStyles("motion-042", 3)) expect(midFills.has(color)).toBe(true);
    const midNight = fillStyles("motion-042", 4.05);
    for (const color of fillStyles("motion-042", 6)) expect(midNight.has(color)).toBe(true);
    // The front travels left to right: earlier frames reveal less of the new state.
    const clipEdge = (time: number) => {
      const commands = drawCommands("motion-042", time) as Command[];
      const clipIndex = commands.findIndex((command) => command[0] === "clip");
      return commands
        .slice(0, clipIndex)
        .filter((command) => command[0] === "lineTo")
        .slice(-21, -1)
        .map((command) => Number(command[1]));
    };
    expect(Math.min(...clipEdge(2.1))).toBeGreaterThan(Math.max(...clipEdge(1.5)));
  });

  it("keeps the copper object's geometry and material colours identical in every state", () => {
    const reference = kettleBlock(0).block;
    expect(reference.length).toBeGreaterThan(10);
    for (const time of [1.5, 1.85, 2.2, 3, 3.9, 4.3, 6]) {
      const { start, block, commands } = kettleBlock(time);
      expect(block).toEqual(reference);
      // Drawn after the front so the wipe never tints or hides the object.
      const lastClip = commands.map((command) => command[0]).lastIndexOf("clip");
      expect(start).toBeGreaterThan(lastClip);
    }
  });
});

it("renders both new studies identically for forward, backward and direct seeks", () => {
  const times = [0, 0.75, 1.85, 2.4, 2.6, 3.95, 4.4, 5, 6];
  for (const id of ["motion-041", "motion-042"]) {
    const forward = times.map((time) => drawCommands(id, time));
    const backward = [...times]
      .reverse()
      .map((time) => drawCommands(id, time))
      .reverse();
    expect(backward).toEqual(forward);
    drawCommands(id, 6);
    expect(drawCommands(id, 1.85)).toEqual(forward[2]);
    expect(drawCommands(id, -1)).toEqual(forward[0]);
    expect(drawCommands(id, 9)).toEqual(forward[forward.length - 1]);
  }
});

it("keeps the new motion evidence and style references scoped to their actual use cases", async () => {
  const catalog = await loadCatalog();
  for (const id of ["motion-041", "motion-042"]) {
    const motion = catalog.motions.find((entry) => entry.id === id)!;
    expect(motion.source_evidence).toMatchObject({
      review_window_seconds: [1, 8],
      exact_hex_from_source: false,
      review_model: "claude-opus-5-5",
      source_urls: expect.arrayContaining([
        expect.stringContaining("https://skillry.dev/ai-videos/opus-5-5/"),
      ]),
    });
  }
  const attachedStyles = (id: string) =>
    catalog.styles
      .filter((style) => style.motion_references.candidates.some((entry) => entry.motion_id === id))
      .map((style) => style.id);
  expect(attachedStyles("motion-041")).toEqual(["style-093", "style-095", "style-097"]);
  expect(attachedStyles("motion-042")).toEqual([
    "style-030",
    "style-035",
    "style-057",
    "style-079",
    "style-099",
  ]);
  expect(catalog.motions.find((motion) => motion.id === "motion-041")!.video_adaptation).toContain(
    "never invent factual values",
  );
  expect(catalog.motions.find((motion) => motion.id === "motion-042")!.video_adaptation).toContain(
    "do not establish its exact timing",
  );
});
