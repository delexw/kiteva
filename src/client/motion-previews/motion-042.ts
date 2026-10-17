import { motionProgress, motionDrawing } from "./drawing";

/**
 * Lighting State Progression.
 * One fixed lakeside stage (same geometry in every state) is re-lit through three
 * named states: DAY → DUSK → NIGHT. Each handoff is an in-world cloud front that
 * travels left → right; behind its wavy edge the complete next state is already
 * painted (masked remap, not a crossfade). Celestial props, reflections, shadows,
 * window light and fireflies belong to their state. The copper kettle is drawn last,
 * outside every mask, with constant geometry and base material colours.
 */

type Pt = [number, number];
type LightingState = {
  name: string;
  labelInk: string;
  sky: string[];
  mountains: string;
  lake: string;
  meadow: string;
  foreground: string;
  pines: string;
  cabin: string;
  cabinWindow: string;
  stone: string;
  reflection: string;
  shadow: { x: number; radius: number; color: string };
};

const STATES: LightingState[] = [
  {
    name: "DAY",
    labelInk: "#0E2238",
    sky: ["#3E8EDB", "#5AA2E3", "#78B6EA", "#98C9EF", "#BBDCF2"],
    mountains: "#7C9AB8",
    lake: "#5FA7D6",
    meadow: "#6DBA5A",
    foreground: "#4E9A45",
    pines: "#2F6E43",
    cabin: "#8C7B6B",
    cabinWindow: "#4A5A66",
    stone: "#9AA0A0",
    reflection: "#F2FAFF",
    shadow: { x: 326, radius: 30, color: "rgba(20, 48, 24, 0.35)" },
  },
  {
    name: "DUSK",
    labelInk: "#F6E8F0",
    sky: ["#3B3570", "#6A4A88", "#A45C8C", "#DA7A78", "#F2A86A"],
    mountains: "#6B4F80",
    lake: "#C17A8C",
    meadow: "#6F7550",
    foreground: "#4E5A3A",
    pines: "#36323A",
    cabin: "#6E5552",
    cabinWindow: "#FFC870",
    stone: "#8A7A80",
    reflection: "#FFD08A",
    shadow: { x: 296, radius: 52, color: "rgba(48, 24, 40, 0.4)" },
  },
  {
    name: "NIGHT",
    labelInk: "#DCE6F5",
    sky: ["#070C22", "#0C1430", "#121C3E", "#18264A", "#1F3054"],
    mountains: "#121A30",
    lake: "#1A2A50",
    meadow: "#1C3638",
    foreground: "#132A2C",
    pines: "#0E1F24",
    cabin: "#2A2836",
    cabinWindow: "#FFD27A",
    stone: "#3A4250",
    reflection: "#C9D6EA",
    shadow: { x: 338, radius: 26, color: "rgba(0, 0, 0, 0.4)" },
  },
];

// Fixed environment geometry shared by every state.
const RIDGE: Pt[] = [
  [0, 200],
  [70, 140],
  [130, 170],
  [210, 108],
  [290, 165],
  [360, 128],
  [430, 172],
  [520, 118],
  [600, 160],
  [640, 142],
  [640, 214],
  [0, 214],
];
const MEADOW: Pt[] = [
  [0, 246],
  [120, 240],
  [250, 248],
  [380, 238],
  [520, 246],
  [640, 240],
  [640, 360],
  [0, 360],
];
const FOREGROUND: Pt[] = [
  [0, 330],
  [160, 320],
  [320, 336],
  [480, 322],
  [640, 330],
  [640, 360],
  [0, 360],
];
const PINES: [number, number, number][] = [
  [66, 250, 52],
  [98, 252, 40],
  [566, 246, 48],
];
const CABIN: Pt[] = [
  [160, 252],
  [160, 222],
  [180, 204],
  [200, 222],
  [200, 252],
];
const STONE: Pt[] = [
  [286, 314],
  [298, 300],
  [362, 298],
  [376, 314],
];
const STARS: Pt[] = [
  [36, 70],
  [90, 96],
  [210, 40],
  [262, 110],
  [320, 26],
  [380, 80],
  [430, 40],
  [470, 112],
  [540, 28],
  [590, 96],
  [612, 52],
  [30, 140],
  [200, 150],
  [350, 140],
];
const FIREFLIES: Pt[] = [
  [90, 282],
  [150, 300],
  [232, 272],
  [420, 290],
  [470, 268],
  [560, 302],
  [604, 278],
];
// Lake glints per state: sun sparkle, low-sun streak, moon path.
const REFLECTIONS: [number, number, number, number][][] = [
  [
    [90, 220, 14, 2],
    [260, 230, 10, 2],
    [410, 216, 16, 2],
    [540, 232, 12, 2],
  ],
  [
    [426, 214, 44, 3],
    [432, 222, 32, 3],
    [438, 230, 20, 3],
  ],
  [
    [134, 214, 28, 2],
    [138, 222, 20, 2],
    [142, 230, 12, 2],
  ],
];
// Handoffs: [state from, state to, window].
const HANDOFFS = [
  {
    from: 0,
    to: 1,
    start: 1.2,
    end: 2.5,
    front: { body: "#C3AECF", shade: "#8F7BA8", ground: "rgba(40, 30, 70, 0.25)" },
  },
  {
    from: 1,
    to: 2,
    start: 3.4,
    end: 4.7,
    front: { body: "#3B365F", shade: "#25213F", ground: "rgba(5, 8, 25, 0.32)" },
  },
];

function polygon(c: CanvasRenderingContext2D, points: Pt[], color: string) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], index) => (index ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

function paintEnvironment(c: CanvasRenderingContext2D, index: number) {
  const { circle, text } = motionDrawing(c);
  const state = STATES[index]!;
  state.sky.forEach((color, band) => {
    c.fillStyle = color;
    c.fillRect(0, band * 40, 640, 41);
  });
  // Celestial props belong to the state and sit behind the fixed ridge.
  if (index === 0) {
    circle(505, 78, 36, "rgba(255, 236, 170, 0.35)");
    circle(505, 78, 24, "#FFE08A");
  } else if (index === 1) {
    circle(448, 158, 46, "rgba(255, 184, 120, 0.35)");
    circle(448, 158, 28, "#FFC46B");
  } else {
    for (const [x, y] of STARS) circle(x, y, 1.4, "#F4F6FF");
    circle(148, 66, 18, "#E8EEF6");
    circle(142, 61, 4, "#C7D0DC");
    circle(155, 72, 3, "#C7D0DC");
  }
  polygon(c, RIDGE, state.mountains);
  c.fillStyle = state.lake;
  c.fillRect(0, 208, 640, 40);
  c.fillStyle = state.reflection;
  for (const [x, y, w, h] of REFLECTIONS[index]!) c.fillRect(x, y, w, h);
  polygon(c, MEADOW, state.meadow);
  for (const [x, y, height] of PINES)
    polygon(
      c,
      [
        [x, y - height],
        [x + 14, y],
        [x - 14, y],
      ],
      state.pines,
    );
  polygon(c, CABIN, state.cabin);
  c.fillStyle = state.cabinWindow;
  c.fillRect(174, 226, 12, 10);
  if (index > 0) circle(180, 231, 15, "rgba(255, 210, 122, 0.22)"); // window glow
  polygon(c, FOREGROUND, state.foreground);
  polygon(c, STONE, state.stone);
  // Cast shadow follows the state's light direction, not the object.
  c.fillStyle = state.shadow.color;
  c.beginPath();
  c.ellipse(state.shadow.x, 302, state.shadow.radius, 4, 0, 0, Math.PI * 2);
  c.fill();
  if (index === 2)
    for (const [x, y] of FIREFLIES) {
      circle(x, y, 5, "rgba(232, 247, 154, 0.25)");
      circle(x, y, 2.2, "#E8F79A");
    }
  text(state.name, 60, 34, 18, state.labelInk);
}

function paintFront(
  c: CanvasRenderingContext2D,
  handoff: (typeof HANDOFFS)[number],
  progress: number,
) {
  const { circle } = motionDrawing(c);
  const frontX = -140 + progress * 900;
  const edgeX = (y: number) => frontX + 24 * Math.sin(y / 41 + 0.8) + 12 * Math.sin(y / 19 + 2.1);
  // Behind the edge, the complete next state.
  c.save();
  c.beginPath();
  c.moveTo(-20, -10);
  for (let y = -10; y <= 370; y += 20) c.lineTo(edgeX(y), y);
  c.lineTo(-20, 370);
  c.closePath();
  c.clip();
  paintEnvironment(c, handoff.to);
  c.restore();
  // The cloud mass itself, with its shadow on the ground.
  const { body, shade, ground } = handoff.front;
  c.fillStyle = ground;
  c.beginPath();
  c.moveTo(edgeX(200), 200);
  for (let y = 200; y <= 360; y += 20) c.lineTo(edgeX(y) + 56, y);
  for (let y = 360; y >= 200; y -= 20) c.lineTo(edgeX(y), y);
  c.closePath();
  c.fill();
  const puffs = Array.from({ length: 9 }, (_, index) => {
    const y = 18 + index * 20;
    return { x: edgeX(y) + 10 + (index % 3) * 8, y, radius: 30 + ((index * 7) % 4) * 4 };
  });
  for (const puff of puffs) circle(puff.x + 6, puff.y + 6, puff.radius, shade);
  for (const puff of puffs) circle(puff.x, puff.y, puff.radius, body);
}

/** The hero: constant geometry and base material colours in every state. */
function paintKettle(c: CanvasRenderingContext2D) {
  const { circle } = motionDrawing(c);
  c.save();
  c.translate(330, 268);
  c.strokeStyle = "#7A3418";
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-26, -2);
  c.lineTo(-40, 6);
  c.lineTo(-28, 22);
  c.stroke();
  polygon(
    c,
    [
      [24, 4],
      [44, -10],
      [48, -6],
      [30, 16],
    ],
    "#B0552A",
  );
  c.fillStyle = "#C4622D";
  c.beginPath();
  c.ellipse(0, 10, 30, 22, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#F09A62";
  c.beginPath();
  c.ellipse(-11, 2, 9, 6, -0.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#7A3418";
  c.fillRect(-24, 26, 48, 5);
  c.fillStyle = "#9C4521";
  c.beginPath();
  c.ellipse(0, -11, 16, 5, 0, 0, Math.PI * 2);
  c.fill();
  circle(0, -18, 4, "#7A3418");
  c.restore();
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  // Which handoff is current: the later one once it has begun.
  const progressOf = HANDOFFS.map((h) => motionProgress(t, h.start, h.end));
  const active = progressOf[1]! > 0 ? 1 : 0;
  const handoff = HANDOFFS[active]!;
  const progress = progressOf[active]!;
  paintEnvironment(c, progress >= 1 ? handoff.to : handoff.from);
  if (progress > 0 && progress < 1) paintFront(c, handoff, progress);
  paintKettle(c);
}
