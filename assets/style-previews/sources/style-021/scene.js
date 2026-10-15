(function () {
  "use strict";
  var W = 1280, H = 720, DURATION = 3;

  // ---- Resolved scene palette (scene-dependent: cool notebook paper for a "system" subject) ----
  // Ink and the two pigment roles keep the style's semantic assignments:
  // ink #343E42 (contours + lettering), terracotta #BC705A (the idea / emphasis), sage #758D72 (system nodes).
  var C = { paper: "#E3E9EE", ink: "#343E42", terra: "#BC705A", sage: "#758D72" };
  Object.keys(C).forEach(function (k) { if (!chroma.valid(C[k])) throw new Error("invalid color " + k); C[k] = chroma(C[k]).hex(); });

  // ---- Deterministic helpers ----
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function noise1(seed) { var r = mulberry32(seed), tab = []; for (var i = 0; i < 64; i++) tab.push(r()); return function (x) { var i = Math.floor(x), f = x - i, a = tab[((i % 64) + 64) % 64], b = tab[(((i + 1) % 64) + 64) % 64]; f = f * f * (3 - 2 * f); return a + (b - a) * f; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var E = {
    stroke: gsap.parseEase("sine.inOut"),
    travel: gsap.parseEase("power2.inOut"),
    bloom: gsap.parseEase("power2.out"),
    write: gsap.parseEase("none")
  };
  function prog(t, a, b, ease) { var u = clamp((t - a) / (b - a), 0, 1); return ease ? ease(u) : u; }

  // ---- Geometry: illustration coordinates mapped to screen (slight enlargement about the centre) ----
  var S = 1.08, OX = 640, OY = 330;
  function tp(x, y) { return [OX + (x - OX) * S, OY + (y - OY) * S]; }

  function parsePath(d) {
    var tok = d.match(/[MLCHV]|-?\d*\.?\d+/g), i = 0, subs = [], cur = null, x = 0, y = 0, cmd = null;
    function n() { return parseFloat(tok[i++]); }
    while (i < tok.length) {
      if (/[MLCHV]/.test(tok[i])) cmd = tok[i++];
      if (cmd === "M") { x = n(); y = n(); cur = { start: [x, y], segs: [] }; subs.push(cur); cmd = "L"; }
      else if (cmd === "L") { var p = [x, y]; x = n(); y = n(); cur.segs.push([p, p, [x, y], [x, y]]); }
      else if (cmd === "H") { var ph = [x, y]; x = n(); cur.segs.push([ph, ph, [x, y], [x, y]]); }
      else if (cmd === "V") { var pv = [x, y]; y = n(); cur.segs.push([pv, pv, [x, y], [x, y]]); }
      else if (cmd === "C") { var p0 = [x, y], p1 = [n(), n()], p2 = [n(), n()]; x = n(); y = n(); cur.segs.push([p0, p1, p2, [x, y]]); }
    }
    return subs;
  }
  function bez(s, t) { var m = 1 - t; return [m * m * m * s[0][0] + 3 * m * m * t * s[1][0] + 3 * m * t * t * s[2][0] + t * t * t * s[3][0], m * m * m * s[0][1] + 3 * m * m * t * s[1][1] + 3 * m * t * t * s[2][1] + t * t * t * s[3][1]]; }
  function samplePath(sub, map) {
    var pts = [];
    sub.segs.forEach(function (s, si) { for (var k = si === 0 ? 0 : 1; k <= 40; k++) { var q = bez(s, k / 40); pts.push(map ? map(q[0], q[1]) : q); } });
    return pts;
  }

  // Pressure-varied brush ribbon: width follows a seeded pressure curve plus entry/exit taper.
  function makeBrush(pts, w, seed, opts) {
    opts = opts || {};
    var cum = [0], i;
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var L = cum[cum.length - 1] || 1, nz = noise1(seed), L2 = [], R2 = [], ws = [];
    var taperIn = opts.taperIn != null ? opts.taperIn : 14, taperOut = opts.taperOut != null ? opts.taperOut : 22;
    for (i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
      var nx = -dy / dl, ny = dx / dl, s = cum[i];
      var pressure = 0.78 + 0.42 * nz(s / 38);
      var tin = 0.35 + 0.65 * clamp(s / taperIn, 0, 1), tout = 0.25 + 0.75 * clamp((L - s) / taperOut, 0, 1);
      var ww = w * pressure * Math.min(tin, tout) * 0.5;
      ws.push(ww);
      L2.push([pts[i][0] + nx * ww, pts[i][1] + ny * ww]);
      R2.push([pts[i][0] - nx * ww, pts[i][1] - ny * ww]);
    }
    return { pts: pts, cum: cum, L: L, left: L2, right: R2, ws: ws };
  }
  function brushPoint(b, p) {
    var target = clamp(p, 0, 1) * b.L, k = 0;
    while (k < b.cum.length - 2 && b.cum[k + 1] < target) k++;
    var seg = b.cum[k + 1] - b.cum[k] || 1, f = clamp((target - b.cum[k]) / seg, 0, 1);
    var a = b.pts[k], c = b.pts[k + 1] || a;
    return { k: k, f: f, x: a[0] + (c[0] - a[0]) * f, y: a[1] + (c[1] - a[1]) * f, w: b.ws[k] + ((b.ws[k + 1] || b.ws[k]) - b.ws[k]) * f };
  }
  function drawBrush(ctx, b, p, color) {
    if (p <= 0) return;
    var e = brushPoint(b, p), i;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(b.left[0][0], b.left[0][1]);
    for (i = 1; i <= e.k; i++) ctx.lineTo(b.left[i][0], b.left[i][1]);
    var nx = b.left[e.k][0] - b.pts[e.k][0], ny = b.left[e.k][1] - b.pts[e.k][1], nl = Math.hypot(nx, ny) || 1;
    ctx.lineTo(e.x + nx / nl * e.w, e.y + ny / nl * e.w);
    ctx.lineTo(e.x - nx / nl * e.w, e.y - ny / nl * e.w);
    for (i = e.k; i >= 0; i--) ctx.lineTo(b.right[i][0], b.right[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(b.pts[0][0], b.pts[0][1], b.ws[0], 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(e.x, e.y, e.w, 0, Math.PI * 2); ctx.fill();
  }

  // ---- Paper: stationary cool notebook sheet (fibre noise, mottling, dot grid, soft edge tone) ----
  var paper = document.createElement("canvas"); paper.width = W; paper.height = H;
  (function () {
    var g = paper.getContext("2d"), r = mulberry32(2101), base = chroma(C.paper).rgb();
    var img = g.createImageData(W, H), d = img.data, gw = 34, gh = 20, grid = [], x, y, i;
    for (i = 0; i < (gw + 1) * (gh + 1); i++) grid.push(r() - 0.5);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var gx = x / 40, gy = y / 40, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
      var a = grid[iy * (gw + 1) + ix], b = grid[iy * (gw + 1) + ix + 1], c = grid[(iy + 1) * (gw + 1) + ix], e = grid[(iy + 1) * (gw + 1) + ix + 1];
      var mott = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
      var v = mott * 7 + (r() - 0.5) * 7;
      var o = (y * W + x) * 4;
      d[o] = base[0] + v; d[o + 1] = base[1] + v; d[o + 2] = base[2] + v * 1.05; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = chroma(C.ink).alpha(0.13).css();
    for (y = 22; y < H; y += 30) for (x = 20; x < W; x += 30) { g.beginPath(); g.arc(x, y, 1.15, 0, Math.PI * 2); g.fill(); }
    var vg = g.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 820);
    vg.addColorStop(0, "rgba(52,62,66,0)"); vg.addColorStop(1, "rgba(52,62,66,0.07)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  })();

  // ---- Pigment wash textures: translucent fill, mottled pooling, darker wet edge, granulation ----
  function makeWash(poly, color, seed) {
    var r = mulberry32(seed), minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, pad = 6;
    poly.forEach(function (p) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); });
    var cw = Math.ceil(maxx - minx + pad * 2), ch = Math.ceil(maxy - miny + pad * 2);
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var g = c.getContext("2d"); g.translate(pad - minx, pad - miny);
    var path = new Path2D(); path.moveTo(poly[0][0], poly[0][1]); poly.forEach(function (p) { path.lineTo(p[0], p[1]); }); path.closePath();
    g.save(); g.clip(path);
    g.fillStyle = chroma(color).alpha(0.74).css(); g.fill(path);
    for (var i = 0; i < 26; i++) {
      var bx = minx + r() * (maxx - minx), by = miny + r() * (maxy - miny), br = 8 + r() * 26;
      var col = r() < 0.6 ? chroma(color).darken(0.25 + r() * 0.45) : chroma(color).brighten(0.3 + r() * 0.4);
      var rg = g.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, col.alpha(0.22).css()); rg.addColorStop(1, col.alpha(0).css());
      g.fillStyle = rg; g.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    g.lineWidth = 7; g.strokeStyle = chroma(color).darken(0.7).alpha(0.33).css(); g.stroke(path);
    var area = (maxx - minx) * (maxy - miny);
    g.fillStyle = chroma(color).darken(1.1).alpha(0.16).css();
    for (i = 0; i < area / 40; i++) g.fillRect(minx + r() * (maxx - minx), miny + r() * (maxy - miny), 1.2, 1.2);
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,0.22)";
    for (i = 0; i < area / 70; i++) g.fillRect(minx + r() * (maxx - minx), miny + r() * (maxy - miny), 1.4, 1.4);
    g.restore();
    return { c: c, x: minx - pad, y: miny - pad, maxR: Math.hypot(maxx - minx, maxy - miny) };
  }
  function drawWash(ctx, wsh, cx, cy, p) {
    if (p <= 0) return;
    ctx.save();
    if (p < 1) { ctx.beginPath(); ctx.arc(cx, cy, wsh.maxR * p, 0, Math.PI * 2); ctx.clip(); }
    ctx.drawImage(wsh.c, wsh.x, wsh.y);
    ctx.restore();
  }

  // ---- Scene elements ----
  function strokesFrom(d, w, seed, opts) { return parsePath(d).map(function (sub, i) { return makeBrush(samplePath(sub, tp), w * S, seed + i * 17, opts); }); }
  var bulb = strokesFrom("M262 400C232 370 210 340 212 300C215 240 260 205 302 206C350 208 392 245 390 300C388 340 368 368 340 398", 4.4, 11)[0];
  var base = strokesFrom("M262 400L340 398M266 418C290 420 312 416 336 417M276 436C292 438 308 437 324 434", 3.6, 31, { taperIn: 6, taperOut: 10 });
  var filament = strokesFrom("M282 362L290 322L302 346L314 318L322 362", 2.6, 53, { taperIn: 6, taperOut: 8 })[0];
  var rays = strokesFrom("M300 180V150M232 206L214 186M372 206L392 186M196 286H168", 3.2, 71, { taperIn: 4, taperOut: 14 });
  var edgeD = [
    "M395 300C470 260 540 250 590 224",
    "M640 238C670 320 710 370 738 390",
    "M786 386C830 330 860 290 880 264",
    "M926 240C990 210 1030 200 1052 194",
    "M1080 220C1086 300 1078 350 1066 392",
    "M926 270C970 320 1000 380 1018 404"
  ];
  var edges = edgeD.map(function (d, i) { return strokesFrom(d, 3.1, 101 + i * 13)[0]; });

  var bulbWashPoly = []; for (var a = 0; a < 64; a++) { var th = a / 64 * Math.PI * 2; bulbWashPoly.push(tp(308 + 78 * Math.cos(th) + 2 * Math.sin(3 * th), 296 + 84 * Math.sin(th) + 2 * Math.cos(2 * th))); }
  var bulbWash = makeWash(bulbWashPoly, C.terra, 901);
  var bulbBloom = tp(300, 312);

  // nodes in drawing order; each blooms when its incoming connector arrives
  var nodeDefs = [
    { c: [620, 220], from: 0, seed: 1201 },
    { c: [762, 402], from: 1, seed: 1301 },
    { c: [902, 248], from: 2, seed: 1401 },
    { c: [1080, 190], from: 3, seed: 1501 },
    { c: [1042, 420], from: 4, seed: 1601 }
  ];
  var nodes = nodeDefs.map(function (nd) {
    var r = mulberry32(nd.seed), ph1 = r() * 6.28, ph2 = r() * 6.28, R = 33;
    var endPt = edges[nd.from].pts[edges[nd.from].pts.length - 1];
    var cs = tp(nd.c[0], nd.c[1]);
    var start = Math.atan2(endPt[1] - cs[1], endPt[0] - cs[0]);
    var ring = [], washPoly = [];
    for (var k = 0; k <= 70; k++) {
      var th = start + k / 70 * Math.PI * 2.12;
      var rr = R * (1 + 0.06 * Math.sin(2 * th + ph1) + 0.04 * Math.sin(3 * th + ph2)) * (1 - 0.05 * k / 70);
      ring.push(tp(nd.c[0] + rr * Math.cos(th), nd.c[1] + rr * Math.sin(th)));
    }
    for (k = 0; k < 60; k++) {
      var tw = k / 60 * Math.PI * 2, rw = R * 0.98 * (1 + 0.07 * Math.sin(2 * tw + ph2) + 0.03 * Math.sin(5 * tw + ph1));
      washPoly.push(tp(nd.c[0] - 3 + rw * Math.cos(tw), nd.c[1] + 3 + rw * Math.sin(tw)));
    }
    return { cs: cs, contour: makeBrush(ring, 3.6 * S, nd.seed + 7, { taperIn: 8, taperOut: 26 }), wash: makeWash(washPoly, C.sage, nd.seed + 9), from: nd.from };
  });

  // ---- Text measurement (DOM text keeps lettering real for contrast/legibility checks) ----
  var headingEl = document.getElementById("heading"), captionEl = document.getElementById("caption");
  function textBox(el) {
    var fs = parseFloat(getComputedStyle(el).fontSize);
    return { left: el.offsetLeft + 4, top: el.offsetTop + 6, w: Math.max(40, el.offsetWidth - 14), fs: fs };
  }
  // Text boxes are re-measured at render time so the layout always matches the loaded local font.
  var hb, cb, underline, measuredKey = "";
  function measure() {
    var nh = textBox(headingEl), nc = textBox(captionEl), key = [nh.left, nh.top, nh.w, nc.left, nc.top, nc.w].join(",");
    if (key === measuredKey) return;
    measuredKey = key; hb = nh; cb = nc;
    underline = makeBrush(samplePath(parsePath(
      "M" + (cb.left + 6) + " " + (cb.top + cb.fs + 18) + "C" + (cb.left + cb.w * 0.28) + " " + (cb.top + cb.fs + 8) + " " +
      (cb.left + cb.w * 0.6) + " " + (cb.top + cb.fs + 28) + " " + (cb.left + cb.w + 8) + " " + (cb.top + cb.fs + 14))[0]), 6.2, 1701, { taperIn: 10, taperOut: 40 });
  }
  measure();
  var TAN3 = Math.tan(-3 * Math.PI / 180);
  function headingPt(p) { var x = hb.left + hb.w * p; return [x, hb.top + hb.fs * 0.82 + (x - hb.left) * TAN3]; }
  function captionPt(p) { return [cb.left + cb.w * p, cb.top + cb.fs * 0.8]; }

  // ---- Cue sheet (seconds). One marker draws; washes, rays and filament are layered accents. ----
  var T = {
    heading: [0.12, 0.48], bulb: [0.54, 0.90], base: [[0.93, 0.99], [1.01, 1.07], [1.09, 1.14]],
    bulbWash: [0.80, 1.12], filament: [0.96, 1.12], rays: [1.04, 1.22],
    edges: [[1.18, 1.36], [1.38, 1.52], [1.54, 1.68], [1.70, 1.82], [1.84, 1.96], [1.98, 2.08]],
    caption: [2.14, 2.46], underline: [2.50, 2.62], penExit: [2.62, 2.70]
  };
  function nodeTimes(n) { var e = T.edges[n.from]; return { contour: [e[1] - 0.03, e[1] + 0.10], wash: [e[1], e[1] + 0.18] }; }

  // Pen jobs: the marker tip always sits on the live end of the stroke being drawn.
  function bp(b) { return function (p) { var e = brushPoint(b, p); return [e.x, e.y]; }; }
  var jobs = [{ t: T.heading, at: headingPt }, { t: T.bulb, at: bp(bulb) }];
  T.base.forEach(function (tt, i) { jobs.push({ t: tt, at: bp(base[i]) }); });
  T.edges.forEach(function (tt, i) { jobs.push({ t: tt, at: bp(edges[i]) }); });
  jobs.push({ t: T.caption, at: captionPt }, { t: T.underline, at: function (p) { return bp(underline)(p); }, terra: true });
  var PEN_IN = [760, 820], PEN_OUT = [1340, 820];
  function penState(t) {
    var i, j, u;
    if (t < jobs[0].t[0]) { u = E.travel(t / jobs[0].t[0]); var s0 = jobs[0].at(0); return { x: PEN_IN[0] + (s0[0] - PEN_IN[0]) * u, y: PEN_IN[1] + (s0[1] - PEN_IN[1]) * u, lift: 1 - u }; }
    for (i = 0; i < jobs.length; i++) {
      j = jobs[i];
      if (t >= j.t[0] && t <= j.t[1]) { var q = j.at(prog(t, j.t[0], j.t[1], j.at === headingPt || j.at === captionPt ? E.write : E.stroke)); return { x: q[0], y: q[1], lift: 0, terra: j.terra }; }
      var nx = jobs[i + 1];
      if (nx && t > j.t[1] && t < nx.t[0]) {
        u = E.travel((t - j.t[1]) / (nx.t[0] - j.t[1]));
        var a = j.at(1), b = nx.at(0);
        return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, lift: Math.sin(Math.PI * u), terra: nx.terra };
      }
    }
    var last = jobs[jobs.length - 1].at(1);
    u = E.travel(prog(t, T.penExit[0], T.penExit[1]));
    if (u >= 1) return null;
    return { x: last[0] + (PEN_OUT[0] - last[0]) * u, y: last[1] + (PEN_OUT[1] - last[1]) * u, lift: u, terra: true };
  }

  var art = document.getElementById("art").getContext("2d");
  var penCtx = document.getElementById("pen").getContext("2d");

  function drawPen(ctx, st) {
    ctx.clearRect(0, 0, W, H);
    if (!st) return;
    var ang = -0.62, lift = st.lift * 14;
    ctx.save();
    // soft cast shadow on the paper (moves further away when the marker lifts)
    ctx.translate(st.x + 10 + lift, st.y + 14 + lift * 1.2);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(40,50,58,0.16)";
    ctx.beginPath(); ctx.ellipse(-82, 0, 84, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(st.x, st.y - lift); ctx.rotate(ang);
    var inkCol = st.terra ? C.terra : C.ink;
    ctx.fillStyle = inkCol; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16, -6); ctx.lineTo(-16, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#cfd6db"; ctx.fillRect(-26, -8, 10, 16);
    ctx.fillStyle = "#f4f6f7"; ctx.fillRect(-150, -11, 124, 22);
    ctx.fillStyle = inkCol; ctx.fillRect(-112, -11, 40, 22);
    ctx.fillStyle = "#2a3236"; ctx.fillRect(-170, -12, 22, 24);
    ctx.strokeStyle = "rgba(42,50,54,0.55)"; ctx.lineWidth = 1.4; ctx.strokeRect(-150, -11, 124, 22);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(-148, -9, 120, 4);
    ctx.restore();
  }

  function setReveal(el, p) {
    el.style.clipPath = p >= 1 ? "none" : "inset(0 " + ((1 - clamp(p, 0, 1)) * 100).toFixed(3) + "% 0 0)";
  }

  function render(t) {
    t = clamp(t, 0, DURATION);
    measure();
    var ctx = art, i;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(paper, 0, 0);
    // washes sit beneath the ink layer
    drawWash(ctx, bulbWash, bulbBloom[0], bulbBloom[1], prog(t, T.bulbWash[0], T.bulbWash[1], E.bloom));
    nodes.forEach(function (n) { var nt = nodeTimes(n); var p = prog(t, nt.wash[0], nt.wash[1], E.bloom); drawWash(ctx, n.wash, n.cs[0] - 3, n.cs[1] + 3, p); });
    var ink = C.ink;
    drawBrush(ctx, bulb, prog(t, T.bulb[0], T.bulb[1], E.stroke), ink);
    base.forEach(function (b, k) { drawBrush(ctx, b, prog(t, T.base[k][0], T.base[k][1], E.stroke), ink); });
    drawBrush(ctx, filament, prog(t, T.filament[0], T.filament[1], E.stroke), ink);
    rays.forEach(function (b, k) { var a = T.rays[0] + k * 0.035; drawBrush(ctx, b, prog(t, a, a + 0.08, E.stroke), ink); });
    edges.forEach(function (b, k) { drawBrush(ctx, b, prog(t, T.edges[k][0], T.edges[k][1], E.stroke), ink); });
    nodes.forEach(function (n) { var nt = nodeTimes(n); drawBrush(ctx, n.contour, prog(t, nt.contour[0], nt.contour[1], E.stroke), ink); });
    drawBrush(ctx, underline, prog(t, T.underline[0], T.underline[1], E.stroke), C.terra);
    setReveal(headingEl, prog(t, T.heading[0], T.heading[1], E.write));
    setReveal(captionEl, prog(t, T.caption[0], T.caption[1], E.write));
    drawPen(penCtx, penState(t));
  }

  // Expose the pure render(t) and cue labels; the timeline itself is built and registered in index.html.
  window.__style021Scene = { render: render, duration: DURATION, labels: { idea: 0, network: T.edges[0][0], caption: T.caption[0], hold: T.penExit[1] } };
})();
