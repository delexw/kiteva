// Authoring script: computes fixed scroll geometry and writes ../index.html.
// Deterministic (no randomness). Run: node tools/build-scene.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
// Scene palette (dawn mist over a river valley): cool celadon silk replaces the earlier warm swatch per background_policy=scene_dependent.
const C = { bg: '#E1E8E4', mist: '#F2F5F0', thread: '#B5CEC0', fg: '#3B544D', jade: '#86B6A2', mountain: '#B5CEC0', paper: '#D8C6A5', rose: '#D2A6A3' };
const f = (n) => (Math.round(n * 10) / 10).toString();

// ---- absolute path translator (M L C Q S T H V A Z, absolute only) ----
function tr(d, dx, dy) {
  const tok = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const ar = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, H: 1, V: 1, A: 7, Z: 0 };
  let out = [], cmd = null, i = 0;
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) { cmd = tok[i++]; out.push(cmd); if (cmd === 'Z') continue; }
    const n = ar[cmd];
    const a = tok.slice(i, i + n).map(Number); i += n;
    if (cmd === 'H') a[0] += dx; else if (cmd === 'V') a[0] += dy;
    else if (cmd === 'A') { a[5] += dx; a[6] += dy; }
    else for (let k = 0; k < n; k += 2) { a[k] += dx; a[k + 1] += dy; }
    out.push(a.map(f).join(' '));
  }
  return out.join(' ');
}

// ---- Catmull-Rom smoothing to cubic path ----
function smooth(pts) {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
function spiral(cx, cy, r0, r1, a0, turns, dir = 1, n = 30) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + dir * u * turns * Math.PI * 2, r = r0 + (r1 - r0) * u;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return smooth(pts);
}

// ---- ornamental cloud curl: billowed top lobes, hooked ends, inner spirals, curling tail ----
function cloud(x0, y0, radii, tailLen, tailDir = -1) {
  let d = `M${f(x0)} ${f(y0)}`, x = x0;
  const spirals = [];
  radii.forEach((r, i) => {
    const nx = x + 1.6 * r;
    d += ` A${f(r)} ${f(r)} 0 1 1 ${f(nx)} ${f(y0)}`;
    const cx = (x + nx) / 2, cy = y0 - 0.6 * r;
    spirals.push(spiral(cx, cy + r * 0.05, r * 0.68, r * 0.16, Math.PI * (i % 2 ? 0.15 : 0.85), 1.15, i % 2 ? -1 : 1));
    x = nx;
  });
  const rl = radii[radii.length - 1], rf = radii[0], h = 0.62 * Math.max(...radii) * 0.5 + 8;
  d += ` C${f(x + rl * 0.9)} ${f(y0 + 1)} ${f(x + rl * 0.7)} ${f(y0 + h)} ${f(x - 4)} ${f(y0 + h - 1)}`;
  const w = x - x0;
  d += ` Q${f(x0 + w * 0.75)} ${f(y0 + h + 4)} ${f(x0 + w * 0.5)} ${f(y0 + h)} T${f(x0 + 4)} ${f(y0 + h - 1)}`;
  d += ` C${f(x0 - rf * 0.7)} ${f(y0 + h)} ${f(x0 - rf * 0.9)} ${f(y0 + 1)} ${f(x0)} ${f(y0)} Z`;
  // tail: long ribbon of mist ending in a small curl
  const ty = y0 + h * 0.55, tx = tailDir < 0 ? x0 - 6 : x + 6, L = tailLen * tailDir;
  const ex = tx + L, ey = ty + 4;
  const tail = `M${f(tx)} ${f(ty)} C${f(tx + L * 0.3)} ${f(ty + 12)} ${f(tx + L * 0.6)} ${f(ty - 10)} ${f(ex)} ${f(ey)}`;
  const curl = spiral(ex + tailDir * 6, ey - 6, 7, 1.6, tailDir < 0 ? Math.PI * 0.5 : Math.PI * 0.5, 1.1, tailDir < 0 ? 1 : -1, 16);
  return { d, spirals, tail, curl };
}

// ---- far range path & sampler for placing pavilions on ridge ----
const farSegs = [
  [600, 668], [640, 560, 660, 470, 700, 420], [730, 380, 740, 330, 770, 300], [795, 275, 820, 282, 840, 312],
  [855, 268, 875, 222, 905, 200], [935, 180, 950, 158, 978, 152], [1005, 146, 1025, 168, 1035, 200],
  [1050, 240, 1070, 252, 1090, 240], [1110, 226, 1128, 214, 1150, 220], [1178, 228, 1202, 252, 1228, 262]
];
const farD = `M600 668 ` + farSegs.slice(1).map((s) => `C${s.join(' ')}`).join(' ') + ' V668 Z';
function yAtX(segs, X) {
  let p = segs[0], best = null;
  for (const s of segs.slice(1)) {
    for (let i = 0; i <= 400; i++) {
      const t = i / 400, m = 1 - t;
      const x = m * m * m * p[0] + 3 * m * m * t * s[0] + 3 * m * t * t * s[2] + t * t * t * s[4];
      const y = m * m * m * p[1] + 3 * m * m * t * s[1] + 3 * m * t * t * s[3] + t * t * t * s[5];
      if (Math.abs(x - X) < 0.6 && (best === null || y < best)) best = y;
    }
    p = [s[4], s[5]];
  }
  return best;
}
const pavX = [800, 975, 1144];
const pavY = pavX.map((x) => yAtX(farSegs, x) + 3);

// ---- pavilion (ground at 0, local) ----
function pavilion(id, x, y, s) {
  const P = (d) => tr(scaleD(d, s), x, y);
  const roof = 'M-38 -40 Q-30 -35 -22 -37 L-8 -53 H8 L22 -37 Q30 -35 38 -40 Q33 -31 22 -33 H-22 Q-33 -31 -38 -40 Z';
  const body = 'M-20 -33 H20 V-6 H-20 Z';
  const base = 'M-27 -6 H27 V0 H-27 Z';
  const det = ['M-14 -33 V-6', 'M-5 -33 V-6', 'M5 -33 V-6', 'M14 -33 V-6', 'M-20 -15 H20', 'M-20 -12 H20', 'M0 -53 V-59', 'M-15 -45 H15'];
  return `<g id="${id}" data-group="pavilion">
    <path class="wash" data-reveal-after="${id}" d="${P(body)}" fill="${C.mist}" fill-opacity="1"/>
    <path class="wash" data-reveal-after="${id}" d="${P(roof)}" fill="${C.jade}" fill-opacity="0.62"/>
    <path class="wash" data-reveal-after="${id}" d="${P(base)}" fill="${C.paper}" fill-opacity="0.9"/>
    <path class="ink" d="${P(roof)}" stroke-width="0.85"/>
    <path class="ink" d="${P(body)}" stroke-width="0.7"/>
    <path class="ink" d="${P(base)}" stroke-width="0.7"/>
    ${det.map((d) => `<path class="ink" d="${P(d)}" stroke-width="0.5"/>`).join('\n    ')}
  </g>`;
}
function scaleD(d, s) {
  return d.replace(/-?\d*\.?\d+/g, (n) => f(Number(n) * s));
}

// ---- blossom (five petals + stamens) ----
function blossom(id, cx, cy, r, rot) {
  const petals = [];
  for (let k = 0; k < 5; k++) {
    const a = (rot + k * 72) * Math.PI / 180;
    const px = cx + Math.cos(a) * r * 0.95, py = cy + Math.sin(a) * r * 0.95;
    petals.push(`<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(r * 0.62)}" ry="${f(r * 0.55)}"/>`);
  }
  const st = [];
  for (let k = 0; k < 5; k++) {
    const a = (rot + 36 + k * 72) * Math.PI / 180;
    st.push(`M${f(cx)} ${f(cy)} L${f(cx + Math.cos(a) * r * 0.7)} ${f(cy + Math.sin(a) * r * 0.7)}`);
  }
  return `<g id="${id}" data-group="blossom">
    <g class="wash" data-reveal-after="${id}" fill="${C.rose}" fill-opacity="0.78">${petals.join('')}</g>
    <g class="ink-g" stroke-width="0.6">${petals.map((p) => p.replace('<ellipse', '<ellipse class="ink"')).join('')}</g>
    <path class="wash" data-reveal-after="${id}" d="${st.join(' ')}" stroke="${C.fg}" stroke-width="0.45" fill="none"/>
    <circle class="wash" data-reveal-after="${id}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 0.22)}" fill="${C.paper}" stroke="${C.fg}" stroke-width="0.45"/>
  </g>`;
}

// ---------------- scene geometry ----------------
const midD = 'M680 668 C720 600 760 548 800 516 C830 492 852 452 882 444 C906 438 922 456 936 472 C962 432 992 402 1026 398 C1060 394 1082 420 1102 442 C1140 470 1186 474 1228 482 V668 Z';
const nearD = 'M380 668 C420 646 468 632 520 629 C580 626 624 612 682 600 C742 588 792 596 842 614 C900 634 948 652 996 668 Z';
const farRidges = ['M770 312 C758 360 736 404 718 456', 'M802 300 C800 330 792 352 780 380', 'M905 214 C896 262 884 300 872 352', 'M978 166 C988 210 986 252 976 300',
  'M940 190 C930 230 926 262 930 300', 'M1036 214 C1046 248 1076 262 1110 266', 'M1150 234 C1160 260 1186 274 1222 282', 'M690 470 C676 520 664 570 656 620'];
const midRidges = ['M884 456 C878 488 862 516 842 546', 'M1026 410 C1020 444 1004 474 984 504', 'M1104 456 C1124 482 1162 496 1210 502', 'M800 532 C790 560 776 590 760 610'];
const nearRidges = ['M560 640 C600 634 642 628 684 614', 'M760 604 C800 606 830 620 856 636', 'M470 650 C500 646 530 646 556 652'];
const water = ['M86 636 C116 630 146 630 176 636 S236 642 266 636 S326 630 356 636', 'M120 654 C150 648 180 648 210 654 S270 660 300 654 S360 648 390 654', 'M200 670 C220 666 240 666 260 670'];

// clouds
const cA = cloud(706, 376, [13, 19, 23, 17, 21, 15, 18], 92, -1);
const cB = cloud(1016, 306, [11, 16, 20, 15, 13], 70, 1);
const cC = cloud(572, 258, [9, 13, 10], 66, -1);
function cloudSvg(id, c) {
  return `<g id="${id}" data-group="cloud">
    <path class="wash" data-reveal-after="${id}" d="${c.d}" fill="${C.mist}" fill-opacity="0.92"/>
    <path class="wash" data-reveal-after="${id}" d="${c.d}" fill="${C.mountain}" fill-opacity="0.18"/>
    <path class="ink" d="${c.d}" stroke-width="1"/>
    ${c.spirals.map((s) => `<path class="ink" d="${s}" stroke-width="0.65"/>`).join('\n    ')}
    <path class="ink" d="${c.tail}" stroke-width="0.8"/>
    <path class="ink" d="${c.curl}" stroke-width="0.65"/>
  </g>`;
}

// figure: feet at (500, 629), absolute coords
const FX = 500, FY = 629, F = (d) => tr(d, FX, FY);
const fig = {
  robe: 'M-2 -96 C-10 -94 -13 -88 -13 -78 C-14 -55 -18 -25 -22 -2 Q-2 3 20 -2 C16 -25 13 -55 12 -78 C12 -88 8 -94 3 -96 Z',
  head: 'M1 -113.5 C5 -113.5 7.4 -110 7.4 -106 C7.4 -101.5 4.6 -98.5 1 -98.5 C-3 -98.5 -5.2 -102 -5.2 -106 C-5.2 -110.5 -3 -113.5 1 -113.5 Z',
  hair: 'M-5 -106 C-6 -112 -2 -116 3 -115 C6 -114.5 7.5 -112 7.2 -109 C4 -111 0 -111 -5 -106 Z',
  bun: 'M-3.5 -118.5 C-1 -121.5 3 -121 3.6 -117.8 C3.8 -115.6 1 -114.4 -1.6 -114.8 C-3.6 -115.2 -4.6 -117 -3.5 -118.5 Z',
  sleeveR: 'M9 -92 C18 -96 22 -104 24.5 -114 L29.5 -112.5 C28 -100 23 -88 12.5 -80 Z',
  sleeveL: 'M-11 -91 C-18 -80 -21 -64 -20 -50 C-26 -44 -28 -36 -24 -30 C-18 -30 -12 -36 -10 -44 C-9 -60 -8 -78 -6 -88 Z',
  details: ['M-4 -95 L2 -82 L7 -95', 'M-13 -66 Q0 -62.5 12 -66', 'M-5 -60 C-7 -40 -9 -20 -10 -1', 'M5 -58 C6 -38 8 -20 9 -1', 'M14 -1.5 Q18 -2 20.5 -0.5', 'M-1 -118 L6 -121'],
  sash: 'M0 -64 C2 -50 -1 -40 1 -28',
  hand: 'M25 -116 C26 -119 29.5 -119.5 30 -116.5 C30 -114.5 27 -113.5 25 -116 Z',
  sprig: 'M27.5 -118 C30 -126 33 -133 38 -141',
  sleeveFold: 'M-17 -60 C-18 -50 -20 -42 -22 -35'
};
const SPRIG = [FX + 38, FY - 143];
const shoulder = [FX - 11, FY - 91];

// plum branch (tapered, filled with warm paper wash)
const branchD = 'M52 606 C110 594 150 584 188 556 C212 538 240 531 274 527 C242 536 214 545 192 562 C154 592 112 605 52 618 Z';
const twigs = ['M150 588 C170 606 198 614 226 612', 'M190 560 C194 542 204 526 220 514', 'M112 600 C116 584 126 572 140 566', 'M244 534 C252 522 262 516 274 512'];
const blossoms = [[274, 527, 6.5, 10], [226, 612, 6, 40], [220, 514, 6, 70], [140, 566, 5.5, 20], [274, 512, 4.5, 50]];

// thread: blossom -> pavilion 1 -> 2 -> 3 (the connected system)
const s = 0.85;
const eave = (i, side) => [pavX[i] + side * 30 * s, pavY[i] - 35 * s];
const p1L = eave(0, -1), p1R = eave(0, 1), p2L = eave(1, -1), p2R = eave(1, 1), p3L = eave(2, -1);
const thread = [
  `M${f(SPRIG[0])} ${f(SPRIG[1])} C${f(SPRIG[0] + 70)} ${f(SPRIG[1] - 10)} ${f(640)} ${f(410)} ${f(690)} ${f(360)} S${f(p1L[0] - 30)} ${f(p1L[1] + 18)} ${f(p1L[0])} ${f(p1L[1])}`,
  `M${f(p1R[0])} ${f(p1R[1])} C${f(p1R[0] + 50)} ${f(p1R[1] - 20)} ${f(p2L[0] - 60)} ${f(p2L[1] + 30)} ${f(p2L[0])} ${f(p2L[1])}`,
  `M${f(p2R[0])} ${f(p2R[1])} C${f(p2R[0] + 50)} ${f(p2R[1] - 12)} ${f(p3L[0] - 50)} ${f(p3L[1] - 30)} ${f(p3L[0])} ${f(p3L[1])}`
];
const knots = [p1L, p2L, p3L];

// bird path (authored cubic) sampled into keyframes
const BP = [[372, 380], [468, 334], [560, 252], [706, 204]];
function bez(t) {
  const m = 1 - t;
  return [0, 1].map((k) => m * m * m * BP[0][k] + 3 * m * m * t * BP[1][k] + 3 * m * t * t * BP[2][k] + t * t * t * BP[3][k]);
}
const birdKeys = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16, p = bez(t), q = bez(Math.min(1, t + 0.01)), r = bez(Math.max(0, t - 0.01));
  const ang = Math.atan2(q[1] - r[1], q[0] - r[0]) * 180 / Math.PI;
  birdKeys.push({ x: +f(p[0]), y: +f(p[1]), rotation: +f(Math.max(-15, Math.min(15, ang * 0.35))) });
}

// petals: start at blossoms, drift down-right, settle on the water lines
const petals = [
  { from: [274, 527], keys: [[290, 548, 40], [282, 572, 110], [306, 600, 170], [318, 633, 220]], start: 1.34 },
  { from: [220, 514], keys: [[238, 540, -30], [228, 572, -90], [252, 610, -150], [262, 637, -190]], start: 1.42 },
  { from: [226, 612], keys: [[240, 624, 30], [252, 634, 70], [268, 646, 120], [286, 653, 150]], start: 1.5 },
  { from: [SPRIG[0], SPRIG[1]], keys: [[552, 504, 30], [548, 532, 90], [566, 568, 150], [584, 600, 200]], start: 1.38 }
];

const svg = `
<svg id="scroll" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" aria-label="An idea becomes a connected system">
  <defs>
    <filter id="feather" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.1"/>
    </filter>
    <path id="bird-path" d="M${BP[0].join(' ')} C${BP[1].join(' ')} ${BP[2].join(' ')} ${BP[3].join(' ')}" fill="none"/>
  </defs>
  <!-- stationary mounting: warm paper border is the scroll mount material (not animated) -->
  <rect x="40" y="40" width="1200" height="640" fill="none" stroke="${C.paper}" stroke-width="6"/>
  <g id="frame-rule" data-group="frame"><path class="ink" d="M52 52 H1228 V668 H52 Z" stroke-width="1"/></g>

  <g id="dawn-sun" data-group="sun">
    <circle class="wash feathered" data-reveal-after="dawn-sun" cx="1132" cy="112" r="34" fill="${C.rose}" fill-opacity="0.5"/>
    <path class="ink" d="M1132 78 A34 34 0 1 1 1131.9 78" stroke-width="0.6"/>
  </g>
  <g id="far-range" data-group="mountain">
    <path class="wash feathered" data-reveal-after="far-range" d="${farD}" fill="${C.mountain}" fill-opacity="0.62"/>
    <path class="wash feathered" data-reveal-after="far-range" d="M640 668 C660 610 690 560 720 520 C780 470 860 470 930 500 C1000 470 1100 470 1228 500 V668 Z" fill="${C.jade}" fill-opacity="0.22"/>
    <path class="ink" d="${farD}" stroke-width="1.3"/>
    ${farRidges.map((d) => `<path class="ink" d="${d}" stroke-width="0.6"/>`).join('\n    ')}
  </g>
  ${cloudSvg('cloud-c', cC)}
  <g id="pavilions">
  ${pavilion('pavilion-1', pavX[0], pavY[0], s)}
  ${pavilion('pavilion-2', pavX[1], pavY[1], s)}
  ${pavilion('pavilion-3', pavX[2], pavY[2], s)}
  </g>
  <g id="mid-range" data-group="mountain">
    <path class="wash feathered" data-reveal-after="mid-range" d="${midD}" fill="${C.jade}" fill-opacity="0.52"/>
    <path class="ink" d="${midD}" stroke-width="1.2"/>
    ${midRidges.map((d) => `<path class="ink" d="${d}" stroke-width="0.6"/>`).join('\n    ')}
  </g>
  <g id="mist-band" data-group="mist">
    <path class="wash feathered" data-reveal-after="mist-band" d="M660 578 C720 566 780 572 840 564 C910 556 980 566 1050 558 C1120 552 1180 560 1228 556 V600 C1150 606 1060 598 980 604 C900 610 800 600 700 608 Z" fill="${C.mist}" fill-opacity="0.62"/>
    <path class="ink" d="M660 578 C720 566 780 572 840 564 C910 556 980 566 1050 558 C1120 552 1180 560 1228 556" stroke-width="0.55"/>
  </g>
  <g id="cloud-band">
  ${cloudSvg('cloud-a', cA)}
  ${cloudSvg('cloud-b', cB)}
  </g>
  <g id="near-bank" data-group="mountain">
    <path class="wash feathered" data-reveal-after="near-bank" d="${nearD}" fill="${C.jade}" fill-opacity="0.6"/>
    <path class="wash feathered" data-reveal-after="near-bank" d="M430 668 C480 650 560 646 640 640 C720 634 820 640 940 668 Z" fill="${C.mountain}" fill-opacity="0.5"/>
    <path class="ink" d="${nearD}" stroke-width="1.2"/>
    ${nearRidges.map((d) => `<path class="ink" d="${d}" stroke-width="0.6"/>`).join('\n    ')}
  </g>
  <g id="thread" data-group="thread" fill="none">
    ${thread.map((d, i) => `<path id="thread-${i + 1}" class="thread" d="${d}" stroke="${C.rose}" stroke-width="1.5" stroke-linecap="round"/>`).join('\n    ')}
    ${knots.map((k, i) => `<circle class="knot" data-reveal-after="thread-${i + 1}" cx="${f(k[0])}" cy="${f(k[1])}" r="2.6" fill="${C.rose}" stroke="${C.fg}" stroke-width="0.5"/>`).join('\n    ')}
  </g>
  <g id="figure" data-group="figure">
    <path class="wash" data-reveal-after="figure" d="${F(fig.robe)}" fill="${C.mist}" fill-opacity="1"/>
    <path class="wash" data-reveal-after="figure" d="${F(fig.robe)}" fill="${C.paper}" fill-opacity="0.62"/>
    <path class="wash" data-reveal-after="figure" d="${F(fig.head)}" fill="${C.mist}" fill-opacity="1"/>
    <path class="wash" data-reveal-after="figure" d="${F(fig.hair)} ${F(fig.bun)}" fill="${C.fg}" fill-opacity="0.85"/>
    <path class="wash" data-reveal-after="figure" d="${F(fig.sleeveR)}" fill="${C.mountain}" fill-opacity="0.85"/>
    <path class="wash" data-reveal-after="figure" d="${F(fig.hand)}" fill="${C.mist}"/>
    <path class="ink" d="${F(fig.robe)}" stroke-width="0.75"/>
    <path class="ink" d="${F(fig.head)}" stroke-width="0.6"/>
    <path class="ink" d="${F(fig.hair)}" stroke-width="0.5"/>
    <path class="ink" d="${F(fig.bun)}" stroke-width="0.5"/>
    <path class="ink" d="${F(fig.sleeveR)}" stroke-width="0.7"/>
    <path class="ink" d="${F(fig.hand)}" stroke-width="0.5"/>
    ${fig.details.map((d) => `<path class="ink" d="${F(d)}" stroke-width="0.5"/>`).join('\n    ')}
    <path class="ink" d="${F(fig.sash)}" style="stroke:${C.rose}" stroke-width="0.9"/>
    <path class="ink" d="${F(fig.sprig)}" stroke-width="0.7"/>
    <g id="sleeve" data-pivot="${shoulder.join(' ')}">
      <path class="wash" data-reveal-after="figure" d="${F(fig.sleeveL)}" fill="${C.mountain}" fill-opacity="0.85"/>
      <path class="ink" d="${F(fig.sleeveL)}" stroke-width="0.7"/>
      <path class="ink" d="${F(fig.sleeveFold)}" stroke-width="0.45"/>
    </g>
  </g>
  ${blossom('idea-blossom', SPRIG[0], SPRIG[1], 5.2, 15)}
  <g id="plum-branch" data-group="branch">
    <path class="wash" data-reveal-after="plum-branch" d="${branchD}" fill="${C.paper}" fill-opacity="0.85"/>
    <path class="ink" d="${branchD}" stroke-width="0.9"/>
    ${twigs.map((d) => `<path class="ink" d="${d}" stroke-width="0.8"/>`).join('\n    ')}
  </g>
  <g id="plum-blossoms">
  ${blossoms.map((b, i) => blossom(`plum-${i + 1}`, b[0], b[1], b[2], b[3])).join('\n  ')}
  </g>
  <g id="water" data-group="water">
    ${water.map((d) => `<path class="ink" d="${d}" style="stroke:${C.jade}" stroke-width="1"/>`).join('\n    ')}
  </g>
  <g id="petals">
    ${petals.map((p, i) => `<g id="petal-${i + 1}" class="petal"><ellipse cx="0" cy="0" rx="3.6" ry="2.6" fill="${C.rose}" fill-opacity="0.85" stroke="${C.fg}" stroke-width="0.45"/></g>`).join('\n    ')}
  </g>
  <g id="bird">
    <g id="bird-wings"><path d="M0 0 C-4 -7 -11 -11 -18 -9 C-12 -7 -7 -4 -3 0 Z M0 0 C4 -8 11 -13 19 -12 C12 -9 7 -5 3 0 Z" fill="${C.mountain}" fill-opacity="0.9" stroke="${C.fg}" stroke-width="0.6"/></g>
    <path d="M-7 1.5 C-3 -1 4 -1.5 8 0 L11 -1 L9 1.2 C5 3 -2 3.4 -7 1.5 Z M-7 1.5 L-12 -0.5 L-11 3 Z" fill="${C.mist}" stroke="${C.fg}" stroke-width="0.6"/>
  </g>

  <!-- copy (standalone headings: independent timing) -->
  <g id="copy" font-family="'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC',Georgia,serif" fill="${C.fg}">
    <text id="title-1" x="110" y="150" font-size="44">An idea becomes</text>
    <text id="title-2" x="110" y="204" font-size="44" font-style="italic">a connected system</text>
    <g id="title-rule-g"><path id="title-rule" class="ink" d="M110 228 H330" style="stroke:${C.jade}" stroke-width="1"/></g>
    <g id="seal-frame" data-group="seal">
      <rect class="wash" data-reveal-after="seal-frame" x="110" y="250" width="38" height="38" fill="${C.rose}" fill-opacity="0.45"/>
      <path class="ink" d="M110 250 H148 V288 H110 Z" stroke-width="0.9"/>
      <text class="seal-char" data-reveal-after="seal-frame" x="129" y="277.5" text-anchor="middle" font-size="24">念</text>
    </g>
    <text id="caption" x="162" y="275" font-size="16">one blossom, a thread, three pavilions</text>
  </g>
</svg>`;

// draw schedule: [groupSelector, start, perPathDuration, stagger]
const schedule = [
  ['frame-rule', 0.0, 0.5, 0],
  ['far-range', 0.04, 0.5, 0.025],
  ['plum-branch', 0.16, 0.42, 0.04],
  ['dawn-sun', 0.1, 0.4, 0],
  ['mid-range', 0.26, 0.46, 0.03],
  ['mist-band', 0.46, 0.36, 0],
  ['water', 0.3, 0.5, 0.06],
  ['near-bank', 0.4, 0.4, 0.03],
  ['cloud-c', 0.42, 0.42, 0.012],
  ['title-rule-g', 0.4, 0.3, 0],
  ['seal-frame', 0.5, 0.26, 0],
  ['cloud-a', 0.5, 0.44, 0.008],
  ['cloud-b', 0.56, 0.42, 0.01],
  ['pavilion-1', 0.6, 0.3, 0.012],
  ['pavilion-2', 0.66, 0.3, 0.012],
  ['pavilion-3', 0.72, 0.3, 0.012],
  ['figure', 0.6, 0.36, 0.012],
  ['plum-1', 0.62, 0.26, 0.02], ['plum-2', 0.66, 0.26, 0.02], ['plum-3', 0.7, 0.26, 0.02], ['plum-4', 0.74, 0.26, 0.02], ['plum-5', 0.78, 0.26, 0.02],
  ['idea-blossom', 0.86, 0.22, 0.015]
];

const script = `
(function () {
  var gsap = window.gsap;
  gsap.registerPlugin(window.DrawSVGPlugin);
  var C = ${JSON.stringify(C)};
  var schedule = ${JSON.stringify(schedule)};
  var birdKeys = ${JSON.stringify(birdKeys)};
  var petals = ${JSON.stringify(petals)};

  // ---- Canvas 2D: fixed seeded silk weave (stationary; redrawn identically on every seek) ----
  var canvas = document.getElementById('silk');
  var weaveCache = null;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function buildWeave() {
    var off = document.createElement('canvas'); off.width = 1280; off.height = 720;
    var g = off.getContext('2d'), rnd = mulberry32(134);
    g.fillStyle = C.bg; g.fillRect(0, 0, 1280, 720);
    g.lineWidth = 0.6;
    for (var y = 1.5; y < 720; y += 3) { g.strokeStyle = C.thread; g.globalAlpha = 0.10 + rnd() * 0.09; g.beginPath(); g.moveTo(0, y); g.lineTo(1280, y); g.stroke(); }
    for (var x = 1.5; x < 1280; x += 3) { g.strokeStyle = C.thread; g.globalAlpha = 0.06 + rnd() * 0.07; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 720); g.stroke(); }
    for (var i = 0; i < 260; i++) { var sx = rnd() * 1280, sy = Math.floor(rnd() * 240) * 3 + 1.5, len = 8 + rnd() * 30;
      g.globalAlpha = 0.12 + rnd() * 0.12; g.strokeStyle = C.mist; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + len, sy); g.stroke(); }
    g.globalAlpha = 1; return off;
  }
  function drawSilk() {
    if (!weaveCache) weaveCache = buildWeave();
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, 1280, 720); ctx.drawImage(weaveCache, 0, 0);
  }
  drawSilk();

  var tl = gsap.timeline({ paused: true, defaults: { overwrite: false } });

  // Phase 1 (0-1.3s): contours draw; each wash waits for its own contour group to finish.
  schedule.forEach(function (s) {
    var id = s[0], start = s[1], dur = s[2], stag = s[3];
    var root = document.getElementById(id);
    var inks = root.querySelectorAll('.ink');
    tl.fromTo(inks, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: dur, stagger: stag, ease: 'sine.inOut', immediateRender: true }, start);
    var end = start + dur + stag * Math.max(0, inks.length - 1);
    var after = document.querySelectorAll('[data-reveal-after="' + id + '"]');
    if (after.length) tl.fromTo(after, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.inOut', immediateRender: true }, end + 0.005);
  });

  // thread: blossom -> pavilion 1 -> 2 -> 3, knots appear as each span arrives
  var threadT = [[1.0, 0.16], [1.16, 0.08], [1.24, 0.06]];
  threadT.forEach(function (tt, i) {
    tl.fromTo('#thread-' + (i + 1), { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: tt[1], ease: 'none', immediateRender: true }, tt[0]);
    tl.fromTo('[data-reveal-after="thread-' + (i + 1) + '"]', { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.12, ease: 'back.out(1.2)', immediateRender: true }, tt[0] + tt[1] + 0.005);
  });

  // standalone headings (independent timing)
  tl.fromTo('#title-1', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.inOut', immediateRender: true }, 0.05);
  tl.fromTo('#title-2', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.inOut', immediateRender: true }, 0.18);
  tl.fromTo('#caption', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'sine.inOut', immediateRender: true }, 0.62);

  // Phase 2 (1.3-2.6s): bird on authored path, petals, sleeve sway, shallow cloud-band shift; hold to 3.0s
  var bk = birdKeys.slice(1).map(function (k) { return { x: k.x, y: k.y, rotation: k.rotation, duration: 1.2 / (birdKeys.length - 1), ease: 'none' }; });
  tl.set('#bird', { x: birdKeys[0].x, y: birdKeys[0].y, rotation: birdKeys[0].rotation, opacity: 0, transformOrigin: '50% 50%' }, 0);
  tl.to('#bird', { opacity: 1, duration: 0.15, ease: 'sine.inOut' }, 1.3);
  tl.to('#bird', { keyframes: bk, duration: 1.2 }, 1.3);
  tl.fromTo('#bird-wings', { scaleY: 1, transformOrigin: '50% 100%' }, { scaleY: 0.3, duration: 0.1, ease: 'sine.inOut', repeat: 9, yoyo: true, immediateRender: true }, 1.3);
  tl.to('#bird-wings', { scaleY: 0.85, duration: 0.2, ease: 'sine.inOut' }, 2.3);

  petals.forEach(function (p, i) {
    var sel = '#petal-' + (i + 1);
    tl.set(sel, { x: p.from[0], y: p.from[1], rotation: 0, opacity: 0, transformOrigin: '50% 50%' }, 0);
    tl.to(sel, { opacity: 1, duration: 0.12, ease: 'sine.inOut' }, p.start);
    var span = 2.6 - p.start;
    tl.to(sel, { keyframes: p.keys.map(function (k) { return { x: k[0], y: k[1], rotation: k[2], duration: span / p.keys.length, ease: 'sine.inOut' }; }) }, p.start);
  });

  tl.set('#sleeve', { rotation: 0, svgOrigin: '${shoulder.join(' ')}' }, 0);
  tl.to('#sleeve', { keyframes: [
    { rotation: 5, duration: 0.42, ease: 'sine.inOut' }, { rotation: -2.5, duration: 0.42, ease: 'sine.inOut' }, { rotation: 0, duration: 0.42, ease: 'sine.inOut' }
  ] }, 1.32);

  tl.fromTo('#cloud-band', { x: 0 }, { x: 16, duration: 1.3, ease: 'sine.inOut', immediateRender: true }, 1.3);
  tl.fromTo('#cloud-c', { x: 0 }, { x: -10, duration: 1.3, ease: 'sine.inOut', immediateRender: true }, 1.3);

  tl.set({}, {}, 3.0); // hold to end
  tl.seek(0);

  window.__timelines = window.__timelines || {};
  window.__timelines.video = tl;
  window.addEventListener('hf-seek', function () { drawSilk(); });
})();`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fine-Line Chinese Painted Scroll — An idea becomes a connected system</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: ${C.bg}; overflow: hidden; }
  #video { position: relative; width: 100%; height: 100%; background: ${C.bg}; overflow: hidden; }
  #silk, #scroll { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  #scroll .ink { fill: none; stroke: ${C.fg}; stroke-linecap: round; stroke-linejoin: round; }
  #scroll .ink-g .ink { fill: none; }
  #scroll .feathered { filter: url(#feather); }
  #scroll text { font-kerning: normal; }
</style>
</head>
<body>
<div id="video" data-composition-id="video" data-width="1280" data-height="720" data-duration="3" data-fps="30">
  <canvas id="silk" width="1280" height="720" aria-hidden="true"></canvas>
  ${svg}
</div>
<script src="gsap.min.js"></script>
<script src="DrawSVGPlugin.min.js"></script>
<script>${script}
</script>
</body>
</html>
`;
if (/NaN|Infinity|undefined/.test(svg)) throw new Error("non-finite geometry in SVG");
const badId = svg.match(/id="\d[^"]*"/); if (badId) throw new Error("id starts with digit: " + badId[0]);
writeFileSync(OUT, html);
console.log('wrote', OUT, 'pavY', pavY.map(f));
