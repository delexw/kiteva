export const motionPreviewDuration = 6;
export const supportedMotionIds = Array.from(
  { length: 42 },
  (_, index) => `motion-${String(index + 1).padStart(3, "0")}`,
);
const ink = "#EAF1F5",
  accent = "#78DEC8",
  warm = "#FF926C",
  dark = "#14212B";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => {
  const p = clamp(value);
  return p * p * (3 - 2 * p);
};
export function motionProgress(time: number, start: number, end: number) {
  return ease((time - start) / (end - start));
}
export function drawMotionPreview(c: CanvasRenderingContext2D, id: string, time: number) {
  if (!supportedMotionIds.includes(id)) throw Error(`No preview for ${id}`);
  const t = Math.max(0, Math.min(motionPreviewDuration, time));
  c.save();
  c.clearRect(0, 0, 640, 360);
  c.fillStyle = dark;
  c.fillRect(0, 0, 640, 360);
  c.lineCap = "round";
  c.lineJoin = "round";
  const circle = (x: number, y: number, r: number, color = accent) => {
    c.beginPath();
    c.fillStyle = color;
    c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2);
    c.fill();
  };
  const line = (x: number, y: number, xx: number, yy: number, color = ink, width = 3) => {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.moveTo(x, y);
    c.lineTo(xx, yy);
    c.stroke();
  };
  const text = (label: string, x: number, y: number, size = 24, color = ink) => {
    c.fillStyle = color;
    c.font = `600 ${size}px sans-serif`;
    c.textAlign = "center";
    c.fillText(label, x, y);
  };
  const card = (
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color = accent,
  ) => {
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(x, y, width, height, 14);
    c.fill();
    text(label, x + width / 2, y + height / 2 + 8, 24, dark);
  };
  const cursor = (x: number, y: number) => {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, 26);
    c.lineTo(7, 20);
    c.lineTo(14, 32);
    c.lineTo(20, 28);
    c.lineTo(13, 16);
    c.lineTo(24, 15);
    c.closePath();
    c.fillStyle = dark;
    c.fill();
    c.strokeStyle = ink;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  };
  const flower = (x: number, y: number, scale = 1) => {
    for (let i = 0; i < 6; i++)
      circle(
        x + Math.cos((i * Math.PI) / 3) * 12 * scale,
        y + Math.sin((i * Math.PI) / 3) * 12 * scale,
        9 * scale,
        warm,
      );
    circle(x, y, 7 * scale, ink);
  };
  switch (id) {
    case "motion-001": {
      const p = motionProgress(t, 0.5, 2) - motionProgress(t, 4, 5.5);
      c.fillStyle = "#080E13";
      c.fillRect(228, 64, 184, 252);
      for (let i = 0; i < 8; i++) flower(320 + Math.cos(i) * 90 * p, 190 + Math.sin(i) * 80 * p, p);
      // Hinged panel foreshortening: opening and bloom share the same reversible progress.
      const width = 176 * Math.cos(p * 1.4);
      card(232, 68, width, 244, "", ink);
      circle(232 + width - 18, 194, 5, dark);
      text(p > 0.7 ? "BLOOM" : "OPEN", 320, 340, 18);
      break;
    }
    case "motion-002": {
      const p = motionProgress(t, 0.4, 4.2);
      c.save();
      c.translate(320, 180);
      for (let i = 12; i >= 0; i--) {
        c.beginPath();
        c.strokeStyle = i % 2 ? accent : ink;
        c.lineWidth = 12;
        c.ellipse(
          0,
          0,
          (28 + i * 20) * Math.exp(p * 2),
          (18 + i * 14) * Math.exp(p * 2),
          p * 0.6,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
      circle(0, 0, 20 + p * p * 440, "#080E13");
      c.restore();
      c.globalAlpha = 1 - motionProgress(t, 0.7, 1.8);
      text("ENTER", 320, 186, 46);
      c.globalAlpha = motionProgress(t, 4.2, 5);
      text("NEXT CHAPTER", 320, 186, 32);
      break;
    }
    case "motion-003": {
      const drop = motionProgress(t, 1, 2);
      const growth = motionProgress(t, 2.2, 4.8);
      const y = 95 + drop * 140;
      c.fillStyle = "#243D4B";
      c.beginPath();
      c.ellipse(320, 278, 220, 46, 0, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.translate(320, y);
      const squash = 1 - 0.45 * Math.sin(motionProgress(t, 1.8, 2.5) * Math.PI);
      c.scale(1 / squash, squash);
      circle(0, 0, 27);
      c.restore();
      c.save();
      c.beginPath();
      c.ellipse(320, 278, 220, 46, 0, 0, Math.PI * 2);
      c.clip();
      circle(320, 255, growth * 250, "#31665A");
      c.restore();
      for (let i = 0; i < 9; i++) {
        const distance = Math.abs(i - 4) / 4;
        if (growth > distance)
          flower(135 + i * 46, 258 + Math.sin(i * 3) * 20, Math.min(1, (growth - distance) * 5));
      }
      text(t < 2 ? "DROP" : "GROW", 320, 335, 18);
      break;
    }
    case "motion-004": {
      const close = Math.sin(motionProgress(t, 0.5, 5.2) * Math.PI);
      const view = motionProgress(t, 0.5, 5.2) * Math.PI;
      const zoom = 1 + close * 0.65;
      c.save();
      c.translate(320, 180);
      c.scale(zoom, zoom);
      for (let i = 0; i < 26; i++) {
        const y = -145 + i * 12;
        const phase = i * 0.4 + view;
        const a = Math.cos(phase) * 88;
        const b = -a;
        line(a, y, b, y, "#39576A", 2);
        circle(a, y, 5, accent);
        circle(b, y, 5, warm);
      }
      c.restore();
      text(t < 2 ? "WIDE" : t < 4 ? "RUNG DETAIL" : "OPPOSITE VIEW", 320, 338, 17);
      break;
    }
    case "motion-005": {
      const p = motionProgress(t, 0, 6);
      const offset = Math.sin(p * Math.PI * 2) * 17;
      for (let i = 0; i < 10; i++)
        line(
          320 + (i - 5) * 40 + offset * 2,
          180,
          320 + (i - 5) * 100 + offset * 3,
          360,
          "#2D4959",
          2,
        );
      c.save();
      c.translate(320 + offset * 0.25, 170);
      c.scale(1 + p * 0.28, 1 + p * 0.28);
      c.shadowColor = accent;
      c.shadowBlur = 24;
      c.strokeStyle = accent;
      c.lineWidth = 8;
      c.strokeRect(-55, -95, 110, 190);
      c.restore();
      for (let i = 0; i < 6; i++) {
        c.globalAlpha = 0.15;
        c.fillStyle = ink;
        c.beginPath();
        c.ellipse(110 + i * 85 + offset, 295 - ((t * 18 + i * 9) % 95), 85, 14, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
    }
    case "motion-006": {
      const x = Math.sin(t * 1.5) * 16,
        y = Math.cos(t * 1.5) * 8;
      circle(320, 175, 105, ink);
      const blink = Math.abs(t - 3) < 0.14;
      for (const xx of [278, 362]) {
        if (blink) line(xx - 23, 167, xx + 23, 167, dark, 5);
        else {
          circle(xx, 165, 27, dark);
          circle(xx + x, 165 + y, 11, accent);
        }
        line(xx - 20, 122 + y * 0.3, xx + 18, 120 + y * 0.3, dark, 5);
      }
      line(295, 230, 345, 230, dark, 4);
      circle(480 + x * 3, 140 + y * 3, 7, warm);
      break;
    }
    case "motion-007": {
      const p = motionProgress(t, 0.6, 4);
      circle(320, 180, 40 + 80 * p, accent);
      circle(320, 180, 30 + 70 * p, dark);
      card(205 - p * 120, 165, 95, 40, "", ink);
      card(340 + p * 120, 165, 95, 40, "", ink);
      c.globalAlpha = 1 - p;
      text("ONE IDEA", 320, 105, 32);
      c.globalAlpha = p;
      text("CONTEXT", 100, 58, 20);
      text("RESULT", 540, 306, 20);
      c.globalAlpha = 1;
      break;
    }
    case "motion-008": {
      for (let i = 0; i < 3; i++) {
        const p = motionProgress(t, i * 1.4, i * 1.4 + 1);
        const y = 390 + (78 + i * 15 - 390) * p;
        if (p > 0) card(135 + i * 15, y, 370, 200, `SECTION ${i + 1}`, [ink, accent, warm][i]);
      }
      break;
    }
    case "motion-009": {
      const x = Math.sin(t) * 20,
        y = Math.cos(t) * 8;
      circle(320 + x * 0.2, 170 + y * 0.2, 138, "#294754");
      for (let i = 0; i < 6; i++) {
        line(
          215 + i * 40 + x * 0.4,
          245 + y * 0.4,
          225 + i * 40 + x * 0.4,
          120 + (i % 2) * 35 + y * 0.4,
          accent,
          8,
        );
      }
      c.fillStyle = "#5A8877";
      c.beginPath();
      c.ellipse(320 + x, 260 + y, 155, 38, 0, 0, Math.PI * 2);
      c.fill();
      circle(335 + x * 1.5, 228 + y * 1.5, 24, warm);
      c.strokeStyle = ink;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(320 + x * 0.1, 180, 168, 145, 0, 0, Math.PI * 2);
      c.stroke();
      line(445 + x * 1.8, 90, 463 + x * 1.8, 190, ink, 6);
      break;
    }
    case "motion-010": {
      const angle = motionProgress(t, 0.4, 5.2) * Math.PI * 2;
      // Perspective projection of a fixed cuboid seen by a camera making a full circuit.
      const project = (x: number, y: number, z: number) => {
        const rx = x * Math.cos(angle) - z * Math.sin(angle);
        const rz = x * Math.sin(angle) + z * Math.cos(angle);
        const factor = 500 / (500 + rz);
        return [320 + rx * factor, 180 + y * factor, rz];
      };
      const vertices = [
        [-65, -85, -45],
        [65, -85, -45],
        [65, 85, -45],
        [-65, 85, -45],
        [-65, -85, 45],
        [65, -85, 45],
        [65, 85, 45],
        [-65, 85, 45],
      ].map(([x, y, z]) => project(x, y, z));
      const faces = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [0, 4, 7, 3],
        [1, 5, 6, 2],
        [0, 1, 5, 4],
      ].sort(
        (a, b) =>
          b.reduce((s, i) => s + vertices[i][2], 0) - a.reduce((s, i) => s + vertices[i][2], 0),
      );
      for (const f of faces) {
        c.beginPath();
        f.forEach((i, j) =>
          j ? c.lineTo(vertices[i][0], vertices[i][1]) : c.moveTo(vertices[i][0], vertices[i][1]),
        );
        c.closePath();
        c.fillStyle = f[0] % 2 ? warm : accent;
        c.fill();
        c.strokeStyle = dark;
        c.lineWidth = 3;
        c.stroke();
      }
      text(t < 2 ? "FRONT" : t < 4 ? "SIDE / BACK" : "FULL CIRCUIT", 320, 324, 20);
      break;
    }
    case "motion-011": {
      const p = motionProgress(t, 0.5, 1.5) - motionProgress(t, 4.5, 5.5);
      const rx = Math.sin(t * 1.6) * 0.32 * p,
        ry = Math.cos(t * 1.2) * 0.4 * p;
      const project = (x: number, y: number, z = 0) => {
        const xx = x * Math.cos(ry) + z * Math.sin(ry);
        const zz = -x * Math.sin(ry) + z * Math.cos(ry);
        const yy = y * Math.cos(rx) - zz * Math.sin(rx);
        const depth = y * Math.sin(rx) + zz * Math.cos(rx);
        const factor = 600 / (600 + depth);
        return [320 + xx * factor, 180 + yy * factor];
      };
      c.beginPath();
      for (const [index, point] of [
        [-170, -100],
        [170, -100],
        [170, 100],
        [-170, 100],
      ].entries()) {
        const [x, y] = project(point[0], point[1]);
        if (index) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.closePath();
      c.fillStyle = ink;
      c.fill();
      const title = project(0, -53, -18 * p);
      text("VOICE NOTE", title[0], title[1], 20, dark);
      for (let i = 0; i < 24; i++) {
        const h = 32 + Math.sin(i * 2 + t) * 18;
        const a = project(-125 + i * 11, 12 - h / 2, -18 * p),
          b = project(-125 + i * 11, 12 + h / 2, -18 * p);
        line(a[0], a[1], b[0], b[1], dark, 5);
      }
      text("HOVER → TILT → REST", 320, 327, 18);
      break;
    }
    case "motion-012": {
      const p = motionProgress(t, 1.8, 3.8);
      card(50 - p * 590, 65, 540, 235, "CHAPTER ONE", ink);
      card(640 - p * 590, 65, 540, 235, "CHAPTER TWO", accent);
      break;
    }
    case "motion-013": {
      const p = motionProgress(t, 0.8, 2) + motionProgress(t, 3.2, 4.5);
      for (let i = 0; i < 4; i++)
        card(
          190 + i * 285 - p * 285,
          60,
          260,
          240,
          `CARD ${i + 1}`,
          [accent, ink, warm, accent][i],
        );
      break;
    }
    case "motion-014": {
      if (t >= 3) {
        c.strokeStyle = ink;
        c.lineWidth = 3;
        c.strokeRect(240, 70, 160, 230);
        for (let i = 0; i < 4; i++) {
          const y = 280 - ((t * 24 + i * 52) % 180);
          c.save();
          c.translate(320 + Math.sin(t + i) * 28, y);
          c.scale(1 + Math.sin(t * 2 + i) * 0.2, 1 - Math.sin(t * 2 + i) * 0.2);
          circle(0, 0, 18 + i * 2, warm);
          c.restore();
        }
        text("CONTAINED FLOW VARIANT", 320, 38, 17);
        break;
      }
      c.save();
      c.translate(320, 180);
      c.shadowBlur = 35;
      c.shadowColor = accent;
      c.fillStyle = accent;
      c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const a = (i / 100) * Math.PI * 2;
        const r = 95 + Math.sin(a * 3 + t * 2) * 16 + Math.cos(a * 5 - t) * 8;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.shadowBlur = 0;
      circle(-30, -34, 20, ink);
      c.restore();
      break;
    }
    case "motion-015": {
      const p = motionProgress(t, 1, 3);
      const outcome = motionProgress(t, 3.5, 4.8);
      circle(155, 180, 27, warm);
      line(185, 180, 185 + p * 285, 180, accent, 5);
      circle(470, 180, 27 * p, accent);
      text(t < 2 ? "QUESTION" : t < 4 ? "CONNECTION" : "OUTCOME", 320, 72, 30);
      c.globalAlpha = outcome;
      text("One idea becomes a system", 320, 293, 23);
      c.globalAlpha = 1;
      break;
    }
    case "motion-017": {
      const approach = motionProgress(t, 0.2, 0.7),
        p = motionProgress(t, 0.8, 2.4) - motionProgress(t, 4.1, 5.6);
      text("EXPLORE THE ASSEMBLY", 320, 42, 20);
      for (let i = 2; i >= 0; i--) {
        const x = 220 + (i - 1) * p * 36,
          y = 144 + i * 25 + (i - 1) * p * 68;
        card(x, y, 200, 28, "", i === 1 ? accent : ink);
        for (let j = 0; j < 4; j++) circle(x + 30 + j * 46, y + 14, 4, dark);
        if (p > 0.1) {
          c.save();
          c.globalAlpha = p;
          line(x + 200, y + 14, 475, y + 14, warm, 2);
          text(["TOP SHELL", "CIRCUIT", "BASE"][i], 535, y + 20, 14);
          c.restore();
        }
      }
      circle(320, 183, 15 + p * 5, warm);
      circle(320, 183, 5, dark);
      cursor(545 - approach * 210 + motionProgress(t, 3.8, 4.5) * 210, 240 - approach * 45);
      text(
        p > 0.5
          ? "Components stay anchored to their assembly"
          : "Hover hotspot to reveal components",
        320,
        326,
        16,
      );
      break;
    }
    case "motion-018": {
      const offset = motionProgress(t, 0.8, 2.2) + motionProgress(t, 3.4, 4.8);
      text("ARCHITECTURE GALLERY", 320, 40, 20);
      c.save();
      c.beginPath();
      c.rect(0, 58, 640, 235);
      c.clip();
      for (let i = -2; i < 5; i++) {
        const distance = i - offset,
          x = 320 + distance * 215;
        const y = 153 + distance * distance * 20;
        c.save();
        c.translate(x, y);
        c.rotate(distance * 0.13);
        c.scale(Math.max(0.6, 1 - Math.abs(distance) * 0.07), 1);
        card(-100, -70, 200, 148, "", i % 2 ? warm : ink);
        // Distinct architectural illustrations serve as local gallery assets.
        c.fillStyle = dark;
        c.fillRect(-75, -20, 145, 65);
        c.fillStyle = accent;
        c.fillRect(-60, -10, 38, 45);
        c.fillRect(0, -10, 55, 45);
        line(-85, -25, 0, -56, dark, 7);
        line(0, -56, 85, -25, dark, 7);
        c.restore();
      }
      c.restore();
      text(
        ["Courtyard House", "Hilltop Studio", "Garden Pavilion"][Math.min(2, Math.round(offset))],
        320,
        312,
        19,
      );
      for (let i = 0; i < 3; i++)
        circle(292 + i * 28, 337, 5, Math.round(offset) === i ? accent : ink);
      cursor(420 - (offset % 1) * 190, 258);
      break;
    }
    case "motion-019": {
      const p = motionProgress(t, 0.7, 4.8);
      text("SCROLL TO DISCOVER", 320, 40, 20);
      c.save();
      c.beginPath();
      c.rect(0, 60, 640, 235);
      c.clip();
      // A camera translates through fixed world geometry: depth changes parallax.
      const project = (x: number, y: number, z: number) => {
        const depth = z + 8 - p * 5;
        return { x: 320 + (x * 230) / depth, y: 175 + (y * 230) / depth };
      };
      for (let i = 0; i < 6; i++) {
        const z = i * 2;
        for (const side of [-1, 1]) {
          const a = project(side * 2.7, -1.5, z),
            b = project(side * 2.7, 1.4, z);
          line(a.x, a.y, b.x, b.y, i % 2 ? accent : ink, 5);
          const next = project(side * 2.7, 1.4, z + 2);
          line(b.x, b.y, next.x, next.y, ink, 2);
        }
      }
      const focal = project(0.7, 0, 0);
      circle(focal.x, focal.y, 190 / (8 - p * 5), accent);
      circle(focal.x, focal.y, 90 / (8 - p * 5), dark);
      c.restore();
      text(`CAMERA DEPTH ${(8 - p * 5).toFixed(1)} units`, 320, 285, 16);
      line(180, 315, 460, 315, ink, 3);
      circle(180 + p * 280, 315, 7, warm);
      text(p > 0.7 ? "DETAIL VIEW" : "FORWARD CAMERA TRAVEL", 320, 70, 17);
      break;
    }
    case "motion-020": {
      const p = motionProgress(t, 1.8, 3),
        band = p > 0 && p < 1;
      const scene = (incoming: boolean) => {
        c.fillStyle = incoming ? warm : ink;
        c.fillRect(25, 65, 590, 220);
        text(incoming ? "IDEAS IN MOTION" : "DESIGN STUDIO", 320, 147, 34, dark);
        text(incoming ? "CHAPTER 02" : "CHAPTER 01", 320, 195, 18, dark);
        for (let i = 0; i < 4; i++) circle(250 + i * 45, 240, 10, incoming ? dark : accent);
      };
      scene(p > 0.5);
      if (band)
        for (let i = 0; i < 10; i++) {
          c.save();
          c.beginPath();
          c.rect(25, 65 + i * 22, 590, 22);
          c.clip();
          c.translate(Math.sin(i * 7 + p * 24) * 60 * Math.sin(p * Math.PI), 0);
          scene((i % 3) / 3 < p);
          c.restore();
        }
      text("READABLE SCENE → BRIEF DISTORTION → CLEAN CUT", 320, 330, 15);
      break;
    }
    case "motion-021": {
      const p = motionProgress(t, 0.7, 2.6) - motionProgress(t, 4, 5.6);
      const angle = p * 1.15 - 0.35,
        elevation = p * 0.22;
      const project = (x: number, y: number, z: number) => {
        const rx = x * Math.cos(angle) - z * Math.sin(angle),
          rz = x * Math.sin(angle) + z * Math.cos(angle),
          ry = y * Math.cos(elevation) - rz * Math.sin(elevation),
          depth = 5 + y * Math.sin(elevation) + rz * Math.cos(elevation);
        return { x: 320 + (rx * 210) / depth, y: 185 + (ry * 210) / depth };
      };
      text("POINTER-CONTROLLED CAMERA", 320, 40, 20);
      // Asymmetric stationary model and ground grid make viewpoint change legible.
      for (let i = -3; i <= 3; i++) {
        const a = project(i, 1.4, -3),
          b = project(i, 1.4, 3),
          d = project(-3, 1.4, i),
          e = project(3, 1.4, i);
        line(a.x, a.y, b.x, b.y, "#304653", 1);
        line(d.x, d.y, e.x, e.y, "#304653", 1);
      }
      const points = [-1, 1].flatMap((z) =>
        [-1, 1].flatMap((y) => [-1, 1].map((x) => project(x, y, z))),
      );
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4]) {
          const j = i ^ bit;
          if (j > i) line(points[i].x, points[i].y, points[j].x, points[j].y, accent, 5);
        }
      const feature = project(1, -0.45, -1);
      circle(feature.x, feature.y, 13, warm);
      cursor(320 + p * 210, 275);
      text("FIXED SUBJECT · BOUNDED ORBIT · RETURN ON EXIT", 320, 335, 15);
      break;
    }
    case "motion-022": {
      const phrase = "Ideas take flight.";
      const count = Math.floor(motionProgress(t, 0.6, 3.5) * phrase.length);
      const shown = phrase.slice(0, count);
      c.fillStyle = ink;
      c.font = "600 36px monospace";
      c.textAlign = "left";
      c.fillText(shown, 120, 190);
      if (t < 3.5 || Math.floor(t * 2) % 2 === 0) {
        const x = 120 + count * 21.6 + 4;
        c.fillStyle = warm;
        c.fillRect(x, 157, 7, 40);
      }
      break;
    }
    case "motion-023": {
      const typed = "CREATE".slice(0, Math.floor(motionProgress(t, 0.2, 1.5) * 6));
      text(t < 2.7 ? typed : "TAKE FLIGHT", 320, 193, 40);
      const expand = motionProgress(t, 1.6, 2.7);
      const clear = motionProgress(t, 2.7, 3.6);
      c.fillStyle = warm;
      const width = (10 + expand * 630) * (1 - clear);
      c.fillRect(
        (320 + typed.length * 12) * (1 - expand),
        150 - expand * 150,
        width,
        50 + expand * 310,
      );
      break;
    }
    case "motion-024": {
      for (const [i, label] of ["FROM IDEA", "TO CREATION"].entries()) {
        const p = motionProgress(t, 0.4 + i * 0.8, 1.3 + i * 0.8);
        c.save();
        c.globalAlpha = p;
        c.filter = `blur(${(1 - p) * 12}px)`;
        if (i) card(165, 183, 310 * p, 54, "", accent);
        text(label, 320, 155 + i * 70 + (1 - p) * 25, 32, i ? dark : ink);
        c.restore();
      }
      break;
    }
    case "motion-025": {
      const p = motionProgress(t, 1.1, 3.3);
      for (const i of [0, 2, 3, 4, 5, 1]) {
        const selected = i === 1;
        const x = 70 + (i % 3) * 175;
        const y = 80 + Math.floor(i / 3) * 115;
        c.save();
        c.globalAlpha = selected ? 1 : 1 - p;
        card(
          x + (selected ? (95 - x) * p : (x - 320) * p),
          y + (selected ? (80 - y) * p : 0),
          140 + (selected ? p * 310 : 0),
          85 + (selected ? p * 155 : 0),
          selected ? "FOCUS" : `VIEW ${i + 1}`,
          selected ? accent : ink,
        );
        c.restore();
      }
      break;
    }
    case "motion-026": {
      const p = motionProgress(t, 1.1, 3.1);
      card(50 + p * 75, 55 + p * 70, 540 - p * 150, 250 - p * 140, "", ink);
      text("hello", 320 - p * 120, 195 - p * 37, 46 - p * 26, dark);
      c.save();
      c.globalAlpha = p;
      text("+", 150, 213, 20, dark);
      circle(485, 210, 12, warm);
      c.restore();
      break;
    }
    case "motion-027": {
      for (let i = 0; i < 3; i++) {
        const elapsed = Math.max(0, t - i * 0.3);
        const fall = motionProgress(elapsed, 0, 0.7);
        const after = Math.max(0, elapsed - 0.7);
        const bounce =
          elapsed < 0.7
            ? 170 * (1 - fall)
            : Math.abs(Math.sin(after * 6)) * 85 * Math.exp(-after * 1.4);
        const squash = elapsed >= 0.7 ? Math.exp(-after * 1.5) * Math.exp(-bounce / 10) * 0.35 : 0;
        const x = 220 + i * 100;
        c.save();
        c.translate(x, 268);
        c.scale(1 + squash, 1 - squash);
        circle(0, -28 - bounce, 28, [warm, accent, ink][i]);
        c.restore();
        line(x - 35, 270, x + 35, 270, ink, 2);
      }
      break;
    }
    case "motion-028": {
      for (let i = 0; i < 9; i++) {
        const x = ((((i * 100 - t * 70) % 800) + 800) % 800) - 80;
        line(x, 110, x + 35, 110, ink, 2);
        const road = ((((i * 100 - t * 180) % 800) + 800) % 800) - 80;
        line(road, 300, road + 45, 300, warm, 4);
      }
      const bob = Math.sin(t * 8) * 4;
      for (const x of [260, 380]) {
        circle(x, 250, 34, ink);
        circle(x, 250, 29, dark);
        for (let j = 0; j < 4; j++)
          line(
            x,
            250,
            x + Math.cos(t * 5 + (j * Math.PI) / 2) * 29,
            250 + Math.sin(t * 5 + (j * Math.PI) / 2) * 29,
            accent,
            2,
          );
      }
      line(260, 250, 310, 210, accent, 5);
      line(310, 210, 380, 250, accent, 5);
      circle(320, 145 + bob, 19, warm);
      line(320, 165 + bob, 303, 210 + bob, ink, 6);
      line(303, 210 + bob, 325 + Math.cos(t * 5) * 18, 243 + Math.sin(t * 5) * 18, ink, 5);
      break;
    }
    case "motion-029": {
      const p = motionProgress(t, 0.4, 3.8);
      const end = Math.floor(p * 120);
      c.beginPath();
      c.strokeStyle = accent;
      c.lineWidth = 5;
      let x = 100,
        y = 185;
      for (let i = 0; i <= end; i++) {
        x = 100 + i * 3.6;
        y = 185 + Math.sin(i / 9) * 55;
        if (!i) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      circle(x, y, 7, warm);
      text("FOLLOW THE STROKE", 320, 54, 20);
      break;
    }
    case "motion-030": {
      const points = [
        [150, 190],
        [320, 110],
        [490, 190],
        [320, 260],
      ];
      const nodes = motionProgress(t, 0.3, 1.3);
      for (const [x, y] of points) circle(x, y, 17 * nodes, accent);
      const p = motionProgress(t, 1.4, 3.4);
      for (let i = 0; i < 3; i++) {
        const a = points[i],
          b = points[i + 1];
        const local = clamp(p * 3 - i);
        if (local)
          line(a[0], a[1], a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local, ink, 3);
      }
      text(`${Math.floor(p * 100)}% connected`, 320, 54, 22);
      break;
    }
    case "motion-031": {
      const p = motionProgress(t, 1.5, 3.6);
      const scene = (incoming: boolean) => {
        c.fillStyle = incoming ? "#E9CD97" : "#98684A";
        c.fillRect(45, 45, 550, 265);
        line(120, 250, 510, 250, dark, 3);
        line(280, 210, 280, 250, dark, 6);
        line(235, 210, 340, 210, dark, 6);
        circle(400, 125, 23, incoming ? warm : dark);
        const phase = Math.sin(t * 1.5) * 12;
        line(400, 148, 400, 220, dark, 7);
        line(400, 167, 348, 183 + phase, dark, 6);
        if (incoming)
          for (let i = 0; i < 12; i++) card(50 + i * 44, 50, 28, 15, "", i % 2 ? warm : accent);
      };
      scene(false);
      c.save();
      c.beginPath();
      c.rect(45, 45, 550 * p, 265);
      c.clip();
      scene(true);
      c.restore();
      text("SAME ACTION · DIFFERENT MEDIUM", 320, 32, 16);
      break;
    }
    case "motion-032": {
      for (let i = 0; i < 120; i++) {
        const a = i * 2.39996;
        const spread = 65 + Math.sin(t * 1.5) * 20;
        const x = 320 + Math.cos(a + t * 0.5) * spread * (1 + Math.sin(t + a) * 0.5);
        const y = 180 + Math.sin(a + t * 0.5) * spread * 0.65 + Math.sin(t * 2 + i / 20) * 25;
        circle(x, y, 2, i % 4 ? ink : accent);
      }
      text("COLLECTIVE FLOW", 320, 54, 20);
      break;
    }
    case "motion-033": {
      card(220, 110, 200, 135, "", ink);
      for (let i = 0; i < 2; i++) {
        const p = motionProgress(t, 0.5 + i * 0.9, 1.8 + i * 0.9);
        card(
          i ? 420 + (1 - p) * 100 : 175 - (1 - p) * 100,
          110 - (1 - p) * 90,
          45,
          135,
          "",
          i ? warm : accent,
        );
      }
      c.save();
      c.globalAlpha = motionProgress(t, 3.1, 3.8);
      text("READY", 320, 185, 30, dark);
      c.restore();
      break;
    }
    case "motion-034": {
      text("PINNED CLOTH · SCHEMATIC MESH", 320, 38, 18);
      const response = Math.sin(t * 2) * Math.sin(Math.min(t / 5, 1) * Math.PI);
      const mesh = (u: number, v: number) => ({
        x: 160 + u * 320 + Math.sin(u * Math.PI) * v * response * 35,
        y: 85 + v * 190 + Math.sin(u * Math.PI) * v * Math.sin(t * 2 + v * 4) * 20,
      });
      for (let j = 0; j <= 10; j++) {
        c.beginPath();
        c.strokeStyle = j % 2 ? accent : ink;
        c.lineWidth = 2;
        for (let i = 0; i <= 20; i++) {
          const a = mesh(i / 20, j / 10);
          if (!i) c.moveTo(a.x, a.y);
          else c.lineTo(a.x, a.y);
        }
        c.stroke();
      }
      for (let i = 0; i <= 10; i++) {
        c.beginPath();
        c.strokeStyle = accent;
        for (let j = 0; j <= 20; j++) {
          const a = mesh(i / 10, j / 20);
          if (!j) c.moveTo(a.x, a.y);
          else c.lineTo(a.x, a.y);
        }
        c.stroke();
      }
      circle(160, 85, 7, warm);
      circle(480, 85, 7, warm);
      break;
    }
    case "motion-035": {
      circle(320, 180, 34, ink);
      text("A", 320, 188, 24, dark);
      const objects = Array.from({ length: 5 }, (_, i) => {
        const a = t * 0.7 + (i * Math.PI * 2) / 5;
        return { i, x: 320 + Math.cos(a) * 160, y: 180 + Math.sin(a) * 65, depth: Math.sin(a) };
      }).sort((a, b) => a.depth - b.depth);
      for (const o of objects) {
        circle(o.x, o.y, 18 + o.depth * 4, o.i % 2 ? warm : accent);
        text(String(o.i + 1), o.x, o.y + 6, 16, dark);
      }
      text("OBJECTS ORBIT · CAMERA HOLDS", 320, 54, 18);
      break;
    }
    case "motion-036": {
      c.fillStyle = "#070F0C";
      c.fillRect(0, 0, 640, 360);
      c.strokeStyle = "#68271F";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(285, 180, 170, 0, Math.PI * 2);
      c.stroke();
      for (const [i, glyph] of Array.from("FLIGHT").entries()) {
        const start = 0.12 + i * 0.18;
        if (t < start) continue;
        const progress = motionProgress(t, start, start + 0.38);
        const remaining = 1 - progress;
        c.save();
        c.translate(95 + i * 89, 200);
        const scale = 1 + remaining * remaining * 4;
        c.scale(scale, scale);
        c.filter = `blur(${remaining * 3}px)`;
        const offset = remaining * 6;
        if (remaining > 0.01) {
          c.globalAlpha = remaining * 0.8;
          text(glyph, -offset, -offset * 0.3, 72, "#E83A20");
          text(glyph, offset, offset * 0.3, 72, "#71E8BD");
        }
        c.globalAlpha = 1;
        text(glyph, 0, 0, 72, "#F4ECD7");
        c.restore();
      }
      break;
    }
    case "motion-037": {
      const scatter = motionProgress(t, 0.4, 1.8);
      if (scatter < 1) {
        for (const [index, glyph] of Array.from("OLD TALE").entries()) {
          c.save();
          c.globalAlpha = 1 - scatter;
          c.translate(
            208 + index * 32 + Math.sin(index * 2) * scatter * 30,
            160 + scatter * (45 + index * 5),
          );
          c.rotate((index % 2 ? 1 : -1) * scatter * 0.6);
          text(glyph, 0, 0, 36);
          c.restore();
        }
      }
      for (const [index, word] of ["THIS", "IS", "A", "NEW", "IDEA"].entries()) {
        const entrance = motionProgress(t, 1.1 + index * 0.25, 1.4 + index * 0.25);
        if (entrance === 0) continue;
        c.save();
        c.globalAlpha = entrance;
        if (word !== "NEW")
          text(word, [120, 210, 260, 350, 465][index]!, 185 + (1 - entrance) * 20, 34);
        if (word === "NEW") {
          c.fillStyle = warm;
          c.textAlign = "center";
          c.font = "italic 600 34px serif";
          c.fillText(word, 350, 185 + (1 - entrance) * 20);
        }
        c.restore();
      }
      break;
    }
    case "motion-038": {
      if (t < 2.7) {
        const zoom = motionProgress(t, 1, 2.4);
        c.save();
        c.translate(320, 180);
        c.scale(1 + zoom * 63, 1 + zoom * 63);
        c.translate(-(320 + zoom * 85), -181);
        text("An idea", 290, 190, 38);
        circle(405, 181, 6, warm);
        c.restore();
      } else {
        c.fillStyle = warm;
        c.fillRect(0, 0, 640, 360);
        text("NEXT CHAPTER", 320, 190, 38, dark);
      }
      break;
    }
    case "motion-039": {
      c.fillStyle = warm;
      c.fillRect(0, 0, 640, 360);
      const inversion = motionProgress(t, 3, 4.2);
      if (inversion > 0) circle(320, 180, inversion * 400, dark);
      for (let index = 0; index < 16; index++) {
        const angle = (index * Math.PI) / 8;
        line(
          320 + Math.cos(angle) * 10,
          180 + Math.sin(angle) * 10,
          320 + Math.cos(angle) * 45,
          180 + Math.sin(angle) * 45,
          inversion > 0 ? warm : dark,
          6,
        );
      }
      for (let index = 0; index < 72; index++) {
        const age = t - (0.45 + (index % 7) * 0.012);
        if (age < 0 || age >= 3) continue;
        const travel = 1 - Math.exp(-age * 10);
        const angle = index * 2.399963;
        const distance = 45 + ((index * 47) % 65);
        const size = 3 + ((index * 7) % 6);
        c.save();
        c.globalAlpha = Math.min(1, age / 0.035) * (1 - motionProgress(age, 1.8, 2.7));
        c.translate(
          320 + Math.cos(angle) * distance * travel - age * 3,
          180 + Math.sin(angle) * distance * travel * 0.35 + Math.max(0, age - 0.35) ** 2 * 40,
        );
        c.rotate(angle + age * (index % 2 ? 1.8 : -1.4));
        // Small at the exit, larger in the foreground as the pieces approach the viewer.
        const foregroundScale = 0.12 + motionProgress(age, 0, 0.35) * 1.35;
        c.scale(
          foregroundScale * (0.65 + Math.abs(Math.cos(age * 2 + index)) * 0.35),
          foregroundScale,
        );
        const confettiColor = index % 3 === 0 ? dark : "#FFFFFF";
        c.fillStyle = confettiColor;
        c.strokeStyle = confettiColor;
        c.shadowColor = "#14212B40";
        c.shadowBlur = 3;
        c.shadowOffsetX = 2;
        c.shadowOffsetY = 3;
        switch (index % 4) {
          case 0:
            c.fillRect(-size / 2, -size / 2, size, size);
            break;
          case 1:
            c.beginPath();
            c.moveTo(0, -size * 0.65);
            c.lineTo(size * 0.6, size * 0.5);
            c.lineTo(-size * 0.6, size * 0.5);
            c.closePath();
            c.fill();
            break;
          case 2:
            c.beginPath();
            c.arc(0, 0, size * 0.45, 0, Math.PI * 2);
            c.fill();
            break;
          case 3:
            c.lineWidth = Math.max(2, size * 0.22);
            c.beginPath();
            c.moveTo(-size / 2, 0);
            c.lineTo(size / 2, 0);
            c.moveTo(0, -size / 2);
            c.lineTo(0, size / 2);
            c.stroke();
            break;
        }
        c.restore();
      }
      // Each beat releases another wave; linear travel keeps the pulse spacing even.
      for (let pulse = 0; pulse < 5; pulse++) {
        const age = t - (0.45 + pulse * 0.4);
        if (age < 0 || age >= 1.3) continue;
        const progress = age / 1.3;
        c.save();
        c.globalAlpha = Math.min(1, age / 0.08) * (1 - progress) * 0.85;
        c.strokeStyle = "#FFFFFF";
        c.lineWidth = 4 + progress * 3;
        c.shadowColor = "#FFFFFF";
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(320, 180, 35 + progress * 390, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      break;
    }
    case "motion-040": {
      const cards = [
        { start: 0, copy: "Let's", background: "#9BFF46", foreground: dark, size: 44 },
        { start: 0.4, copy: "Let's.", background: "#9BFF46", foreground: dark, size: 44 },
        { start: 0.8, copy: "Let's..", background: "#9BFF46", foreground: dark, size: 44 },
        { start: 1.2, copy: "Let's...", background: "#9BFF46", foreground: dark, size: 44 },
        { start: 1.7, copy: "MAKE", background: dark, foreground: "#FFF8EA", size: 96 },
        { start: 2.4, copy: "SOMETHING", background: "#9BFF46", foreground: dark, size: 80 },
        { start: 3.2, copy: "AND", background: "#A523A9", foreground: "#FFF8EA", size: 100 },
        { start: 3.8, copy: "GO BIG", background: dark, foreground: "#9BFF46", size: 190 },
        {
          start: 4.6,
          copy: "MAKE IT REAL",
          background: "#A523A9",
          foreground: "#FFF8EA",
          size: 65,
        },
      ];
      const active = cards.reduce((current, card) => (t >= card.start ? card : current), cards[0]!);
      c.fillStyle = active.background;
      c.fillRect(0, 0, 640, 360);
      text(active.copy, 320, 180 + active.size * 0.34, active.size, active.foreground);
      break;
    }
    case "motion-041": {
      // Fictional preview dataset (clearly labelled on screen): cumulative votes after each week.
      const flavors = [
        { name: "Mint", hue: "#4FD1C5", votes: [38, 70, 112, 150] },
        { name: "Mango", hue: "#F2B33D", votes: [42, 78, 110, 138] },
        { name: "Blueberry", hue: "#6FA8F5", votes: [24, 44, 80, 130] },
        { name: "Plum", hue: "#B48CF2", votes: [55, 80, 104, 126] },
        { name: "Berry", hue: "#F27A9B", votes: [30, 52, 74, 92] },
        { name: "Lime", hue: "#A6D85B", votes: [34, 50, 62, 70] },
      ];
      // Each data step interpolates one week into the next; the gaps between steps are holds.
      const periodSteps: [number, number][] = [
        [0.5, 1.5],
        [1.9, 2.9],
        [3.3, 4.3],
      ];
      const visibleRows = 5,
        maxVotes = 160,
        barLeft = 150,
        barSpan = 380,
        labelRight = 140;
      const rowCenter = (rank: number) => 100 + rank * 42;
      const cutoffY = (rowCenter(visibleRows - 1) + rowCenter(visibleRows)) / 2;
      const rankAt = (period: number, flavorIndex: number) =>
        flavors.filter((other) => other.votes[period]! > flavors[flavorIndex]!.votes[period]!)
          .length;
      const activeStep = periodSteps.reduce(
        (current, [start], index) => (t >= start ? index : current),
        0,
      );
      const [stepStart, stepEnd] = periodSteps[activeStep]!;
      const stepProgress = motionProgress(t, stepStart, stepEnd);
      const fromPeriod = activeStep,
        toPeriod = activeStep + 1;
      const shownPeriod = stepProgress >= 0.5 ? toPeriod : fromPeriod;
      const chartText = (
        label: string,
        x: number,
        y: number,
        size: number,
        color: string,
        align: CanvasTextAlign,
      ) => {
        c.fillStyle = color;
        c.font = `600 ${size}px sans-serif`;
        c.textAlign = align;
        c.fillText(label, x, y);
      };
      chartText("Smoothie Flavor Race", 30, 32, 22, ink, "left");
      chartText("DEMO DATA · fictional votes, running total", 30, 56, 16, "#9FB0BC", "left");
      // Fixed axis scale with guides, so bar growth reads as value growth.
      for (const tick of [0, 50, 100, 150]) {
        const x = barLeft + (tick / maxVotes) * barSpan;
        line(x, 84, x, cutoffY, "#2A3B47", 1);
        chartText(String(tick), x, 78, 16, "#7F93A1", "center");
      }
      line(30, cutoffY, 610, cutoffY, "#3C5262", 1);
      chartText("top 5 shown", 610, cutoffY - 6, 16, "#7F93A1", "right");
      const rows = flavors.map((flavor, index) => {
        const fromRank = rankAt(fromPeriod, index);
        const toRank = rankAt(toPeriod, index);
        const rankPosition = fromRank + (toRank - fromRank) * stepProgress;
        const fromVotes = flavor.votes[fromPeriod]!,
          toVotes = flavor.votes[toPeriod]!;
        return {
          ...flavor,
          rankPosition,
          votes: fromVotes + (toVotes - fromVotes) * stepProgress,
          // Rising rows own the lane during a swap; steady rows yield to them; falling rows yield to both.
          priority: toRank < fromRank ? 2 : toRank === fromRank ? 1 : 0,
          moving: toRank !== fromRank,
          rowAlpha: 1 - 0.75 * clamp(rankPosition - (visibleRows - 1)),
          y: rowCenter(rankPosition),
        };
      });
      // Labels of lower-priority rows fade out while another visible row is closer than a label height.
      const labelOrder = [...rows].sort(
        (a, b) => b.priority - a.priority || a.rankPosition - b.rankPosition,
      );
      const labelAlpha = new Map(
        labelOrder.map((row, index) => {
          const nearest = Math.min(
            Infinity,
            ...labelOrder
              .slice(0, index)
              .filter((other) => other.rowAlpha > 0.3)
              .map((other) => Math.abs(other.y - row.y)),
          );
          return [row.name, row.rowAlpha * clamp((nearest - 16) / 14)] as const;
        }),
      );
      const drawOrder = [...rows].sort(
        (a, b) => a.priority - b.priority || b.rankPosition - a.rankPosition,
      );
      for (const row of drawOrder) {
        const squeeze = row.moving && stepProgress < 1 ? Math.sin(Math.PI * stepProgress) : 0;
        const barHeight = 30 * (1 - (row.priority === 0 ? 0.45 : 0.15) * squeeze);
        const width = Math.max(2, (row.votes / maxVotes) * barSpan);
        c.globalAlpha = row.rowAlpha * (row.priority === 0 ? 1 - 0.35 * squeeze : 1);
        c.fillStyle = row.hue;
        c.beginPath();
        c.roundRect(barLeft, row.y - barHeight / 2, width, barHeight, 6);
        c.fill();
        const alpha = labelAlpha.get(row.name) ?? 0;
        if (alpha > 0.01) {
          c.globalAlpha = alpha;
          chartText(row.name, labelRight, row.y + 6, 16, ink, "right");
          chartText(
            String(Math.round(row.votes)),
            barLeft + width + 8,
            row.y + 6,
            16,
            row.hue,
            "left",
          );
        }
      }
      c.globalAlpha = 1;
      chartText(`WEEK ${shownPeriod + 1}`, 610, 340, 34, ink, "right");
      for (let step = 0; step < 4; step++)
        circle(552 + step * 18, 302, 4, step <= shownPeriod ? accent : "#3C5262");
      break;
    }
    case "motion-042": {
      // One fixed valley composition; only per-state palettes and state-owned light accents change.
      const lightingStates = [
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
          shadow: { x: 338, radius: 26, color: "rgba(0, 0, 0, 0.4)" },
        },
      ];
      const ridge: [number, number][] = [
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
      const meadowEdge: [number, number][] = [
        [0, 246],
        [120, 240],
        [250, 248],
        [380, 238],
        [520, 246],
        [640, 240],
        [640, 360],
        [0, 360],
      ];
      const foregroundEdge: [number, number][] = [
        [0, 330],
        [160, 320],
        [320, 336],
        [480, 322],
        [640, 330],
        [640, 360],
        [0, 360],
      ];
      const pineTrees: [number, number, number][] = [
        [66, 250, 52],
        [98, 252, 40],
        [566, 246, 48],
      ];
      const cabinOutline: [number, number][] = [
        [160, 252],
        [160, 222],
        [180, 204],
        [200, 222],
        [200, 252],
      ];
      const stoneOutline: [number, number][] = [
        [286, 314],
        [298, 300],
        [362, 298],
        [376, 314],
      ];
      const stars: [number, number][] = [
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
      const fireflies: [number, number][] = [
        [90, 282],
        [150, 300],
        [232, 272],
        [420, 290],
        [470, 268],
        [560, 302],
        [604, 278],
      ];
      const polygon = (points: [number, number][], color: string) => {
        c.fillStyle = color;
        c.beginPath();
        points.forEach(([x, y], index) => (index ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fill();
      };
      const drawEnvironment = (stateIndex: number) => {
        const state = lightingStates[stateIndex]!;
        state.sky.forEach((color, band) => {
          c.fillStyle = color;
          c.fillRect(0, band * 40, 640, 41);
        });
        // Celestial bodies belong to their lighting state and sit behind the fixed ridge.
        if (stateIndex === 0) {
          circle(505, 78, 36, "rgba(255, 236, 170, 0.35)");
          circle(505, 78, 24, "#FFE08A");
        } else if (stateIndex === 1) {
          circle(448, 158, 46, "rgba(255, 184, 120, 0.35)");
          circle(448, 158, 28, "#FFC46B");
        } else {
          for (const [x, y] of stars) circle(x, y, 1.4, "#F4F6FF");
          circle(148, 66, 18, "#E8EEF6");
          circle(142, 61, 4, "#C7D0DC");
          circle(155, 72, 3, "#C7D0DC");
        }
        polygon(ridge, state.mountains);
        c.fillStyle = state.lake;
        c.fillRect(0, 208, 640, 40);
        const reflections: [number, number, number, number][] =
          stateIndex === 0
            ? [
                [90, 220, 14, 2],
                [260, 230, 10, 2],
                [410, 216, 16, 2],
                [540, 232, 12, 2],
              ]
            : stateIndex === 1
              ? [
                  [426, 214, 44, 3],
                  [432, 222, 32, 3],
                  [438, 230, 20, 3],
                ]
              : [
                  [134, 214, 28, 2],
                  [138, 222, 20, 2],
                  [142, 230, 12, 2],
                ];
        c.fillStyle = ["#F2FAFF", "#FFD08A", "#C9D6EA"][stateIndex]!;
        for (const [x, y, width, height] of reflections) c.fillRect(x, y, width, height);
        polygon(meadowEdge, state.meadow);
        for (const [x, y, height] of pineTrees)
          polygon(
            [
              [x, y - height],
              [x + 14, y],
              [x - 14, y],
            ],
            state.pines,
          );
        polygon(cabinOutline, state.cabin);
        c.fillStyle = state.cabinWindow;
        c.fillRect(174, 226, 12, 10);
        if (stateIndex > 0) circle(180, 231, 15, "rgba(255, 210, 122, 0.22)");
        polygon(foregroundEdge, state.foreground);
        polygon(stoneOutline, state.stone);
        // The cast shadow follows the light direction of the state, not the object.
        c.fillStyle = state.shadow.color;
        c.beginPath();
        c.ellipse(state.shadow.x, 302, state.shadow.radius, 4, 0, 0, Math.PI * 2);
        c.fill();
        if (stateIndex === 2)
          for (const [x, y] of fireflies) {
            circle(x, y, 5, "rgba(232, 247, 154, 0.25)");
            circle(x, y, 2.2, "#E8F79A");
          }
        text(state.name, 60, 34, 18, state.labelInk);
      };
      const toDusk = motionProgress(t, 1.2, 2.5);
      const toNight = motionProgress(t, 3.4, 4.7);
      const nightFront = toNight > 0;
      const fromState = nightFront ? 1 : 0;
      const toState = nightFront ? 2 : 1;
      const frontProgress = nightFront ? toNight : toDusk;
      drawEnvironment(frontProgress >= 1 ? toState : fromState);
      if (frontProgress > 0 && frontProgress < 1) {
        // Authored cloud/shadow front: the next state exists only behind its wavy edge.
        const frontX = -140 + frontProgress * 900;
        const edgeX = (y: number) =>
          frontX + 24 * Math.sin(y / 41 + 0.8) + 12 * Math.sin(y / 19 + 2.1);
        c.save();
        c.beginPath();
        c.moveTo(-20, -10);
        for (let y = -10; y <= 370; y += 20) c.lineTo(edgeX(y), y);
        c.lineTo(-20, 370);
        c.closePath();
        c.clip();
        drawEnvironment(toState);
        c.restore();
        const front =
          toState === 1
            ? { body: "#C3AECF", shade: "#8F7BA8", ground: "rgba(40, 30, 70, 0.25)" }
            : { body: "#3B365F", shade: "#25213F", ground: "rgba(5, 8, 25, 0.32)" };
        c.fillStyle = front.ground;
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
        for (const puff of puffs) circle(puff.x + 6, puff.y + 6, puff.radius, front.shade);
        for (const puff of puffs) circle(puff.x, puff.y, puff.radius, front.body);
      }
      // The copper kettle keeps one local material colour in every lighting state.
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
      break;
    }
    case "motion-016": {
      c.fillStyle = ink;
      c.fillRect(22, 22, 596, 316);
      c.strokeStyle = dark;
      c.lineWidth = 4;
      c.strokeRect(32, 32, 265, 296);
      c.strokeRect(308, 32, 298, 145);
      c.strokeRect(308, 188, 298, 140);
      const eye = motionProgress(t, 0.2, 1);
      const rays = motionProgress(t, 1, 1.6);
      const impact = motionProgress(t, 1.3, 2);
      const nodes = motionProgress(t, 2.3, 3.7);
      const dialogue = motionProgress(t, 4, 4.7);
      c.save();
      c.globalAlpha = eye;
      c.strokeStyle = dark;
      c.lineWidth = 5;
      c.beginPath();
      c.ellipse(165, 196, 86, 40, 0, 0, Math.PI * 2);
      c.stroke();
      circle(165, 196, 31 * eye, dark);
      circle(176, 185, 9, ink);
      c.restore();
      c.save();
      c.globalAlpha = rays;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i * Math.PI) / 6;
        line(
          165 + Math.cos(a) * 60,
          196 + Math.sin(a) * 60,
          165 + Math.cos(a) * 140,
          196 + Math.sin(a) * 155,
          dark,
          4,
        );
      }
      c.restore();
      c.save();
      c.globalAlpha = impact;
      c.translate(163, 92);
      const punch = 0.65 + impact * 0.65 - motionProgress(t, 2, 2.6) * 0.3;
      c.scale(punch, punch);
      text("ZAP!", 0, 0, 42, dark);
      c.restore();
      c.save();
      c.globalAlpha = nodes;
      for (let i = 0; i < 4; i++) {
        const x = 350 + i * 65,
          y = 100 + Math.sin(i * 2) * 25;
        if (i) line(x - 65, 100 + Math.sin((i - 1) * 2) * 25, x, y, dark);
        circle(x, y, 10, dark);
      }
      c.restore();
      c.save();
      c.globalAlpha = dialogue;
      text("IT ALL", 455, 245, 22, dark);
      text("CONNECTS!", 455, 278, 22, dark);
      c.restore();
      break;
    }
  }
  c.restore();
}
