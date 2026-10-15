/* Impressionist river at dusk — procedural Canvas 2D brush dabs, state = f(GSAP time). */
(function () {
  'use strict';
  var W = 1280, H = 720;
  // Style tokens (named roles preserved) + scene-dependent toned ground derived from them.
  var T = { paper: '#F0E9D7', fg: '#364747', sky: '#9EBCC8', fol: '#829C79', sun: '#D8BF7A', rose: '#C59D9D' };
  Object.keys(T).forEach(function (k) { if (!chroma.valid(T[k])) throw new Error('bad token ' + k); });
  var mixCache = {};
  function mix(a, b, f) {
    f = Math.round(clamp(f, 0, 1) * 20) / 20;
    var key = a + b + f;
    if (!mixCache[key]) mixCache[key] = chroma.mix(a, b, f, 'lab').hex();
    return mixCache[key];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(e0, e1, x) { var u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); }
  // Toned ground (imprimatura): slate teal = foreground ink thinned with sky. Stationary.
  var GROUND = mix(T.fg, T.sky, 0.3);
  window.__styleGround = GROUND;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = mulberry32(1330215);
  function rr(a, b) { return a + (b - a) * R(); }
  function pick(arr) { return arr[Math.floor(R() * arr.length) % arr.length]; }

  var HORIZON = 342;
  var SUN = { x: 930, y: 196 };
  function treeTop(x) {
    return 300 - 52 * Math.exp(-Math.pow((x - 170) / 115, 2)) - 26 * Math.exp(-Math.pow((x - 640) / 170, 2))
      - 12 * Math.sin(x * 0.023 + 0.7) - 7 * Math.sin(x * 0.061 + 2.1) + 22 * Math.exp(-Math.pow((x - 960) / 150, 2));
  }
  var NODES = [{ x: 340, y: 470 }, { x: 620, y: 420 }, { x: 930, y: 480 }, { x: 760, y: 600 }, { x: 460, y: 610 }];
  var PAD_RX = 62, PAD_RY = 20;
  function D(x, y, len, w, ang, curv, col, a, th) { return { x: x, y: y, len: len, w: w, ang: ang, curv: curv, col: col, a: a, th: th }; }

  // Dusk sky colour by height and sun distance: deeper blue overhead, rose band, sunlight glow near the low sun.
  function skyColour(x, y) {
    var ds = Math.hypot(x - SUN.x, (y - SUN.y) * 1.4);
    var glow = Math.exp(-ds / 190), low = smooth(60, 320, y), r = R();
    if (r < glow * 0.7) return pick([T.sun, mix(T.sun, T.paper, 0.45), mix(T.sun, T.rose, 0.3), T.paper]);
    if (r < glow * 0.7 + low * 0.45) return pick([T.rose, mix(T.rose, T.sun, 0.35), mix(T.rose, T.paper, 0.3), mix(T.rose, T.sky, 0.4)]);
    if (r < 0.93) return pick([mix(T.sky, T.fg, 0.35 * (1 - low)), T.sky, mix(T.sky, T.fg, 0.2), mix(T.sky, T.rose, 0.25), mix(T.sky, T.paper, 0.2 * low)]);
    return mix(T.rose, T.fg, 0.25); // complementary violet-ish touch
  }

  var back = [];
  // 1. Underpainting scumble: broad, low-alpha dabs so no ground reads as empty paper.
  for (var i = 0; i < 700; i++) {
    var x = rr(-20, W + 20), y = rr(-10, H + 10), col, ang, th;
    if (y < HORIZON - 30) { col = skyColour(x, y); ang = rr(-0.15, 0.15); th = 0.0 + 0.12 * R(); }
    else if (y < HORIZON + 4) { col = pick([mix(T.fg, T.fol, 0.4), T.fg, mix(T.fol, T.fg, 0.3)]); ang = rr(-0.3, 0.3); th = 0.18 + 0.1 * R(); }
    else { var nr = (y - HORIZON) / (H - HORIZON); col = pick([mix(T.sky, T.fg, 0.2 + nr * 0.4), mix(T.rose, T.fg, 0.35), mix(T.fol, T.fg, 0.3 + nr * 0.3)]); ang = rr(-0.05, 0.05); th = 0.3 + 0.12 * R(); }
    back.push(D(x, y, rr(40, 90), rr(14, 26), ang, rr(-0.2, 0.2), col, rr(0.35, 0.55), th));
  }
  // 2. Sky: horizontal drifting flow, larger & looser overhead, smaller near the glowing horizon.
  (function () {
    var n = 0, g = 0;
    while (n < 3000 && g++ < 30000) {
      var x = rr(-10, W + 10), y = rr(-8, 320);
      var ds = Math.hypot(x - SUN.x, (y - SUN.y) * 1.3);
      var dens = 0.5 + 0.5 * Math.exp(-ds / 240) + 0.2 * smooth(200, 310, y);
      if (R() > dens) continue;
      var low = smooth(120, 320, y), big = 1.15 - 0.5 * low;
      var flow = -0.08 + 0.22 * Math.sin(x * 0.004 + y * 0.016) + 0.1 * Math.sin(y * 0.05);
      back.push(D(x, y, rr(10, 32) * big, rr(4, 9) * big, flow + rr(-0.15, 0.15), rr(-0.3, 0.3), skyColour(x, y),
        rr(0.7, 0.92), 0.06 + 0.32 * (0.45 * R() + 0.55 * (x / W))));
      n++;
    }
  })();
  // 3. Low sun: tangential dabs, paper-white core, sunlight halo and rose rim.
  for (var i = 0; i < 560; i++) {
    var rad = Math.pow(R(), 0.75) * 96, a = R() * Math.PI * 2;
    var sx = SUN.x + Math.cos(a) * rad, sy = SUN.y + Math.sin(a) * rad * 0.9;
    var core = rad < 38;
    var col = core ? pick([T.paper, T.paper, mix(T.sun, T.paper, 0.5), T.sun]) : pick([T.sun, mix(T.sun, T.paper, 0.3), mix(T.sun, T.rose, 0.4), T.rose]);
    back.push(D(sx, sy, rr(6, 16) * (core ? 0.8 : 1), rr(4, 8), a + Math.PI / 2 + rr(-0.3, 0.3), rr(-0.3, 0.3), col,
      core ? 0.96 : rr(0.55, 0.85), 0.2 + 0.18 * (rad / 96) + 0.06 * R()));
  }
  // 4. Far trees: backlit silhouettes — dark stippled vertical dabs, rose/sunlit rim only where facing the sun.
  (function () {
    var n = 0, g = 0;
    while (n < 1900 && g++ < 30000) {
      var x = rr(-10, W + 10), top = treeTop(x), y = rr(top - 6, HORIZON + 2);
      if (y < top + rr(-4, 6)) continue;
      var depth = (y - top) / (HORIZON - top + 1);
      var rim = (1 - smooth(0, 0.22, depth)) * (0.35 + 0.65 * Math.exp(-Math.pow((x - SUN.x) / 300, 2)));
      var r = R(), col;
      if (r < rim * 0.55) col = pick([mix(T.sun, T.rose, 0.4), T.rose, mix(T.sun, T.fol, 0.4)]);
      else if (r < 0.82) col = pick([mix(T.fol, T.fg, 0.45), mix(T.fol, T.fg, 0.6), mix(T.fol, T.sky, 0.25), mix(T.fg, T.rose, 0.2)]);
      else col = pick([T.fg, mix(T.fg, T.sky, 0.25)]);
      var ang = -Math.PI / 2 + 0.5 * Math.sin(x * 0.03 + y * 0.05) + rr(-0.45, 0.45);
      back.push(D(x, y, rr(6, 15), rr(4, 8), ang, rr(-0.4, 0.4), col, rr(0.75, 0.92), 0.3 + 0.2 * (0.6 * R() + 0.4 * (1 - x / W))));
      n++;
    }
  })();
  // 5. Bank line.
  for (var i = 0; i < 420; i++) {
    back.push(D(rr(-10, W + 10), HORIZON + rr(-6, 8), rr(14, 36), rr(3, 6), rr(-0.07, 0.07), rr(-0.15, 0.15),
      pick([T.fg, T.fg, mix(T.fg, T.fol, 0.35), mix(T.rose, T.fg, 0.5)]), rr(0.75, 0.95), 0.44 + 0.12 * R()));
  }
  // 6. Water body: long thin horizontals; mirrored dusk sky (rose/sky) with tree shadow near the bank, darker foreground.
  (function () {
    var n = 0, g = 0;
    while (n < 2300 && g++ < 30000) {
      var x = rr(-20, W + 20), y = rr(HORIZON + 6, H + 6);
      var near = (y - HORIZON) / (H - HORIZON);
      if (R() > 0.6 + 0.4 * near) continue;
      var treeRefl = Math.exp(-(y - HORIZON) / 55) * (y - HORIZON < (HORIZON - treeTop(x)) * 0.9 ? 1 : 0.2);
      var r = R(), col;
      if (r < treeRefl * 0.85) col = pick([mix(T.fol, T.fg, 0.5), T.fg, mix(T.fol, T.fg, 0.3)]);
      else if (r < 0.5) col = pick([mix(T.sky, T.fg, 0.15 + near * 0.35), T.sky, mix(T.sky, T.rose, 0.3)]);
      else if (r < 0.7) col = pick([mix(T.rose, T.sky, 0.3), mix(T.rose, T.fg, 0.2 + near * 0.3), T.rose]);
      else if (r < 0.86) col = pick([mix(T.fol, T.fg, 0.2 + near * 0.3), mix(T.fol, T.sky, 0.3)]);
      else col = pick([T.fg, mix(T.fg, T.sky, 0.2)]);
      var sc = 0.7 + 0.6 * near;
      back.push(D(x, y, rr(18, 48) * sc, rr(2.5, 5) * sc, rr(-0.05, 0.05) + 0.03 * Math.sin(x * 0.01), rr(-0.08, 0.08), col,
        rr(0.72, 0.95), 0.44 + 0.3 * (0.5 * R() + 0.5 * near)));
      n++;
    }
  })();

  // Dynamic reflection layer (~1.5k dabs): sun glitter column + ripple glints, pure function of t.
  var refl = [];
  for (var i = 0; i < 1500; i++) {
    var kind = R(), x, y, base, s0, len, w;
    if (kind < 0.5) {
      y = rr(HORIZON + 6, H);
      var spread = 30 + (y - HORIZON) * 0.24;
      x = SUN.x + (R() + R() + R() - 1.5) * spread * 1.2;
      base = pick([T.sun, mix(T.sun, T.paper, 0.5), T.paper, mix(T.sun, T.rose, 0.35)]);
      s0 = 0.3; len = rr(8, 26); w = rr(2.2, 4.2);
    } else if (kind < 0.75) {
      x = rr(0, W); y = HORIZON + 6 + Math.pow(R(), 1.3) * (HORIZON - treeTop(x)) * 0.85;
      base = pick([mix(T.fol, T.fg, 0.4), mix(T.rose, T.fg, 0.4), mix(T.sun, T.rose, 0.5)]);
      s0 = 0; len = rr(12, 30); w = rr(2, 4);
    } else {
      x = rr(0, W); y = rr(HORIZON + 40, H);
      base = pick([T.sky, mix(T.sky, T.paper, 0.35), T.rose, mix(T.rose, T.paper, 0.3)]);
      s0 = 0.05; len = rr(10, 28); w = rr(2, 3.6);
    }
    var nr = (y - HORIZON) / (H - HORIZON), ramp = [];
    for (var k = 0; k <= 10; k++) ramp.push(mix(base, T.sun, Math.min(1, s0 + k * 0.05)));
    refl.push({ x: x, y: y, len: len * (0.75 + 0.5 * nr), w: w * (0.8 + 0.4 * nr), ang: rr(-0.04, 0.04), ramp: ramp,
      a: rr(0.75, 0.95), th: 0.55 + 0.33 * R(), om: rr(2.2, 5.4), ph: rr(0, 6.283), ph2: rr(0, 6.283), ph3: rr(0, 6.283) });
  }

  // Lily pads with notch, cast shadow, sunlit flank toward the low sun.
  var lily = [];
  NODES.forEach(function (nd, ni) {
    var rot = rr(-0.12, 0.12), notch = rr(0, 6.283);
    function inPad(px, py) {
      var dx = px - nd.x, dy = py - nd.y;
      var cx = dx * Math.cos(-rot) - dy * Math.sin(-rot), cy = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      return cx * cx / (PAD_RX * PAD_RX) + cy * cy / (PAD_RY * PAD_RY);
    }
    var thB = 0.7 + ni * 0.035;
    for (var i = 0; i < 26; i++) lily.push(D(nd.x + rr(-58, 58), nd.y + rr(14, 26), rr(16, 30), rr(2.5, 4), rr(-0.04, 0.04), 0,
      pick([T.fg, mix(T.fg, T.fol, 0.2)]), rr(0.45, 0.7), thB + 0.05 * R()));
    var n = 0, g = 0, sunSide = Math.sign(SUN.x - nd.x) || 1;
    while (n < 160 && g++ < 3000) {
      var px = nd.x + rr(-PAD_RX, PAD_RX), py = nd.y + rr(-PAD_RY, PAD_RY);
      var e = inPad(px, py); if (e > 0.92) continue;
      var aa = Math.atan2((py - nd.y) * 3, px - nd.x);
      if (Math.abs(Math.atan2(Math.sin(aa - notch), Math.cos(aa - notch))) < 0.22 && e > 0.08) continue;
      var lit = clamp(sunSide * (px - nd.x) / PAD_RX * 0.5 + 0.5 - (py - nd.y) / PAD_RY * 0.3, 0, 1);
      var r = R(), col;
      if (r < lit * 0.35) col = pick([T.sun, mix(T.sun, T.fol, 0.35)]);
      else if (r < 0.8) col = pick([T.fol, mix(T.fol, T.sun, 0.2), mix(T.fol, T.fg, 0.2), mix(T.fol, T.sky, 0.2)]);
      else col = pick([mix(T.fol, T.fg, 0.45), mix(T.rose, T.fol, 0.4)]);
      lily.push(D(px, py, rr(8, 18), rr(3.5, 6), aa + rr(-0.3, 0.3), rr(-0.3, 0.3), col, rr(0.82, 0.98), thB + 0.08 * R()));
      n++;
    }
    for (var i = 0; i < 18; i++) {
      var ra = R() * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(ra - notch), Math.cos(ra - notch))) < 0.25) continue;
      var lx = Math.cos(ra) * PAD_RX * 0.96, ly = Math.sin(ra) * PAD_RY * 0.96;
      lily.push(D(nd.x + lx * Math.cos(rot) - ly * Math.sin(rot), nd.y + lx * Math.sin(rot) + ly * Math.cos(rot), rr(10, 18), rr(2, 3.2),
        Math.atan2(Math.cos(ra) * PAD_RY, -Math.sin(ra) * PAD_RX) + rot, 0.15, T.fg, rr(0.6, 0.85), thB + 0.1 + 0.05 * R()));
    }
    nd.inPad = inPad;
  });

  // Links: brushed sunlight carried pad to pad (closed loop, no arrows).
  var links = [], segLen = [], total = 0, nodeS = [], acc = 0;
  for (var s = 0; s < NODES.length; s++) { var A0 = NODES[s], B0 = NODES[(s + 1) % NODES.length]; segLen.push(Math.hypot(B0.x - A0.x, B0.y - A0.y)); total += segLen[s]; }
  for (var s = 0; s < NODES.length; s++) {
    nodeS.push(acc / total);
    var A = NODES[s], B = NODES[(s + 1) % NODES.length], L = segLen[s];
    var ang = Math.atan2(B.y - A.y, B.x - A.x), nx = -Math.sin(ang), ny = Math.cos(ang);
    for (var d = 0; d < L; d += rr(7, 11)) {
      var px = A.x + (B.x - A.x) * d / L, py = A.y + (B.y - A.y) * d / L;
      if (A.inPad(px, py) < 1.15 || B.inPad(px, py) < 1.15) continue;
      var j = rr(-3, 3) + 2.5 * Math.sin(d * 0.04 + s);
      links.push({ x: px + nx * j, y: py + ny * j, len: rr(9, 16), w: rr(3.5, 5.5), ang: ang + rr(-0.35, 0.35), curv: rr(-0.2, 0.2),
        col: pick([T.sun, T.sun, T.sun, mix(T.sun, T.paper, 0.45), T.paper, mix(T.sun, T.rose, 0.35)]), a: rr(0.88, 1), s: (acc + d) / total });
      if (R() < 0.35) links.push({ x: px + nx * (j + 5), y: py + ny * (j + 5), len: rr(8, 14), w: rr(2, 3), ang: ang + rr(-0.2, 0.2), curv: 0,
        col: T.fg, a: 0.55, s: (acc + d) / total });
    }
    acc += L;
  }
  var blossoms = NODES.map(function (nd, ni) {
    var petals = [];
    for (var p = 0; p < 16; p++) petals.push({ ang: p / 16 * Math.PI * 2 + rr(-0.15, 0.15), len: rr(9, 14), w: rr(4, 6),
      col: pick([T.rose, T.rose, mix(T.rose, T.paper, 0.4), T.paper, mix(T.rose, T.sun, 0.25)]) });
    return { x: nd.x + 6, y: nd.y - 6, petals: petals, s: nodeS[ni] };
  });

  // Foreground reeds (local sway only).
  var reeds = [];
  for (var i = 0; i < 230; i++) {
    var bx = Math.pow(R(), 1.4) * 250 - 10;
    reeds.push({ x: bx, h: rr(50, 150) * (1 - bx / 330), lean: rr(-0.25, 0.15), w: rr(2, 4.5),
      col: pick([T.fg, T.fg, mix(T.fg, T.fol, 0.4), mix(T.fol, T.fg, 0.2), mix(T.rose, T.fg, 0.5)]),
      tip: R() < 0.3 ? pick([T.sun, T.rose]) : null, ph: rr(0, 6.283), th: 0.7 + 0.24 * R() });
  }

  var canvas = document.getElementById('paint');
  var ctx = canvas.getContext('2d');
  function prep(c) { c.lineCap = 'round'; c.lineJoin = 'round'; }
  function stroke(c, x, y, len, w, ang, curv, col, alpha) {
    var hx = Math.cos(ang) * len * 0.5, hy = Math.sin(ang) * len * 0.5;
    c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = w;
    c.beginPath(); c.moveTo(x - hx, y - hy); c.quadraticCurveTo(x - hy * curv * 2, y + hx * curv * 2, x + hx, y + hy); c.stroke();
  }
  function drawDabs(c, list, p) {
    for (var i = 0; i < list.length; i++) {
      var d = list[i], f = p >= 1 ? 1 : clamp((p - d.th) / 0.05, 0, 1);
      if (f > 0) stroke(c, d.x, d.y, d.len * (0.35 + 0.65 * f), d.w, d.ang, d.curv, d.col, d.a * f);
    }
  }
  function makeCache(list) {
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'); prep(c); drawDabs(c, list, 1); c.globalAlpha = 1; return cv;
  }
  var backCache = makeCache(back), lilyCache = makeCache(lily);

  function shimmerAmp(t) { return smooth(0.8, 1.1, t) * (1 - smooth(2.1, 2.6, t)); }
  function backOut(x) { return 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); }
  function linkProgress(t) { var u = clamp((t - 1.0) / 1.2, 0, 1); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }

  function render(t) {
    t = clamp(+t || 0, 0, 3);
    var p = clamp(t / 1.0, 0, 1), A = shimmerAmp(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = GROUND; ctx.fillRect(0, 0, W, H);
    prep(ctx);
    if (p >= 1) ctx.drawImage(backCache, 0, 0); else drawDabs(ctx, back, p);
    for (var i = 0; i < refl.length; i++) {
      var d = refl[i], f = p >= 1 ? 1 : clamp((p - d.th) / 0.05, 0, 1);
      if (f <= 0) continue;
      var len = d.len * (1 + A * 0.4 * Math.sin(t * d.om + d.ph)) * (0.35 + 0.65 * f);
      var m = Math.round(A * 10 * (0.5 + 0.5 * Math.sin(t * d.om * 0.7 + d.ph2)));
      stroke(ctx, d.x + A * 3 * Math.sin(t * d.om * 1.3 + d.ph3), d.y, len, d.w, d.ang, 0, d.ramp[m], d.a * f);
    }
    if (p >= 1) { ctx.globalAlpha = 1; ctx.drawImage(lilyCache, 0, 0); } else drawDabs(ctx, lily, p);
    var L = linkProgress(t);
    if (L > 0) for (var i = 0; i < links.length; i++) {
      var k = links[i]; if (k.s > L) continue;
      var f = clamp((L - k.s) / 0.02, 0, 1);
      stroke(ctx, k.x, k.y, k.len * (0.4 + 0.6 * f), k.w, k.ang, k.curv, k.col, k.a * f);
    }
    var padF = p >= 1 ? 1 : clamp((p - 0.86) / 0.06, 0, 1);
    if (padF > 0) for (var b = 0; b < blossoms.length; b++) {
      var bl = blossoms[b], u = L > 0 ? clamp((L - bl.s) / 0.12, 0, 1) : 0, sc = 0.3 + 0.7 * backOut(u);
      for (var q = 0; q < bl.petals.length; q++) {
        var pt = bl.petals[q], r = pt.len * sc * 0.55;
        stroke(ctx, bl.x + Math.cos(pt.ang) * r, bl.y + Math.sin(pt.ang) * r * 0.62 - (1 - u) * 2, pt.len * sc, pt.w, pt.ang, 0.2, pt.col, 0.95 * padF);
      }
      stroke(ctx, bl.x, bl.y - 1, 5, 5, 0, 0, T.sun, padF * (0.4 + 0.6 * u));
    }
    for (var i = 0; i < reeds.length; i++) {
      var rd = reeds[i], f = p >= 1 ? 1 : clamp((p - rd.th) / 0.05, 0, 1);
      if (f <= 0) continue;
      var sway = A * 7 * Math.sin(t * 2.4 + rd.ph + rd.x * 0.015) * (rd.h / 150);
      var hh = rd.h * f, tx = rd.x + rd.lean * hh + sway, ty = H - hh;
      ctx.globalAlpha = 0.92; ctx.strokeStyle = rd.col; ctx.lineWidth = rd.w;
      ctx.beginPath(); ctx.moveTo(rd.x, H + 4); ctx.quadraticCurveTo(rd.x + rd.lean * hh * 0.3, H - hh * 0.5, tx, ty); ctx.stroke();
      if (rd.tip && f >= 1) stroke(ctx, tx, ty, 7, rd.w + 1.5, -Math.PI / 2 + rd.lean, 0, rd.tip, 0.9);
    }
    ctx.globalAlpha = 1;
  }

  // Rendering only; the GSAP timeline in index.html owns time and calls this.
  window.__paintRender = render;
  render(0);
})();
