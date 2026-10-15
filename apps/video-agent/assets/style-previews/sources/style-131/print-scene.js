(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = { paper: '#E4E8E2', persimmon: '#C8553D', key: '#283C49', indigo: '#385F84', blue: '#6E9FB3', rose: '#C58B95', ochre: '#BCA16C' };
  gsap.registerPlugin(MorphSVGPlugin);

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(u) { return u * u * (3 - 2 * u); }
  function easeOut(u) { return 1 - (1 - u) * (1 - u) * (1 - u); }
  // Variable-width key rim: plate shrinks toward an interior anchor + 1.5/1px registration offset
  function inset(cx, cy, s, dx, dy) {
    return 'translate(' + (dx + cx * (1 - s)).toFixed(2) + ' ' + (dy + cy * (1 - s)).toFixed(2) + ') scale(' + s + ')';
  }

  /* ---------- (1) Seeded paper fibre, generated once ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var fibre = document.createElement('canvas');
  fibre.width = 1280; fibre.height = 720;
  (function buildFibre() {
    var g = fibre.getContext('2d');
    var rnd = mulberry32(131);
    g.lineCap = 'round';
    for (var i = 0; i < 2600; i++) {
      var x = rnd() * 1280, y = rnd() * 720;
      var len = 4 + rnd() * 16, a = (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI / 2) * 0.3;
      var bend = (rnd() - 0.5) * 6;
      g.strokeStyle = rnd() < 0.55 ? C.indigo : C.key;
      g.globalAlpha = g.strokeStyle === C.key.toLowerCase() ? 0.05 + rnd() * 0.05 : 0.07 + rnd() * 0.08;
      g.lineWidth = 0.4 + rnd() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * len / 2 - Math.sin(a) * bend, y + Math.sin(a) * len / 2 + Math.cos(a) * bend,
                         x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    for (var j = 0; j < 1400; j++) {
      g.globalAlpha = 0.06 + rnd() * 0.08;
      g.fillStyle = C.blue;
      g.fillRect(rnd() * 1280, rnd() * 720, 1 + rnd(), 1 + rnd());
    }
    g.globalAlpha = 1;
  })();
  (function placePaper() {
    var p = document.getElementById('paper').getContext('2d');
    p.fillStyle = C.paper; p.fillRect(0, 0, 1280, 720);
    p.drawImage(fibre, 0, 0);
    var o = document.getElementById('fibre-over').getContext('2d');
    o.clearRect(0, 0, 1280, 720);
    o.drawImage(fibre, 0, 0); // identical coordinates: grain registers across layers
  })();

  /* ---------- (3) Stepped bokashi sky (chroma lab ramp of tokens) ---------- */
  (function buildSky() {
    var steps = chroma.scale([C.indigo, C.blue, C.paper]).mode('lab').colors(9);
    steps[0] = C.indigo; steps[steps.length - 1] = C.paper;
    var grad = document.getElementById('bokashi');
    var n = steps.length;
    for (var i = 0; i < n; i++) {
      el('stop', { offset: (i / n).toFixed(4), 'stop-color': steps[i] }, grad);
      el('stop', { offset: ((i + 1) / n).toFixed(4), 'stop-color': steps[i] }, grad);
    }
    // Horizon akabokashi: restrained stepped ramp from paper toward persimmon (both scene tokens)
    var dawn = chroma.scale([C.paper, chroma.mix(C.paper, C.persimmon, 0.42, 'lab').hex()]).mode('lab').colors(5);
    var hg = document.getElementById('dawnBand');
    for (var j = 0; j < 5; j++) {
      el('stop', { offset: (j / 5).toFixed(4), 'stop-color': dawn[j] }, hg);
      el('stop', { offset: ((j + 1) / 5).toFixed(4), 'stop-color': dawn[j] }, hg);
    }
  })();

  /* ---------- Patterned cloud band ---------- */
  var cloudBand = document.getElementById('cloudBand');
  function cloudPath(x0, y0, bumps, w, h) {
    var d = 'M' + x0 + ' ' + y0;
    for (var i = 0; i < bumps; i++) {
      var r = w / 2;
      d += 'a' + r + ' ' + (r * (i % 2 ? 0.8 : 1)) + ' 0 0 1 ' + w + ' 0';
    }
    d += 'q8 ' + (h / 2) + ' -6 ' + h + 'H' + (x0 + 6) + 'q-14 ' + (-h / 2) + ' -6 ' + (-h) + 'Z';
    return d;
  }
  [[520, 104, 9, 34, 18], [150, 128, 7, 30, 16], [880, 64, 6, 28, 14]].forEach(function (c) {
    var d = cloudPath(c[0], c[1], c[2], c[3], c[4]);
    el('path', { d: d, fill: C.key }, cloudBand);
    el('path', { d: d, fill: C.paper, transform: inset(c[0] + c[2] * c[3] / 2, c[1], 0.985, 1.5, 1) }, cloudBand);
    el('rect', { x: c[0] + 10, y: c[1] + c[4] * 0.45, width: c[2] * c[3] - 18, height: c[4] * 0.3, fill: C.ochre, transform: 'translate(1 1)' }, cloudBand);
    el('path', { d: d, fill: 'none', stroke: C.key, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, cloudBand);
  });

  /* ---------- Sun reflection plate ---------- */
  var refl = document.getElementById('reflection');
  var reflBars = [];
  [[1000, 532, 70], [1004, 546, 54], [998, 560, 40], [1003, 574, 28], [999, 588, 16]].forEach(function (b) {
    var g = el('g', { transform: 'translate(' + b[0] + ' ' + b[1] + ')' }, refl);
    var r = el('rect', { x: -b[2] / 2, y: -3, width: b[2], height: 6, rx: 3, fill: C.persimmon }, g);
    reflBars.push(r);
  });

  /* ---------- Boats with rowers ---------- */
  var BOATS = [{ x: 585, y: 526, d: 0.95 }, { x: 770, y: 566, d: 1.2 }, { x: 930, y: 528, d: 1.45 }];
  var boatsG = document.getElementById('boats');
  BOATS.forEach(function (b) {
    b.g = el('g', { transform: 'translate(' + b.x + ' ' + b.y + ')' }, boatsG);
    for (var k = 0; k < 4; k++) {
      var hx = -36 + k * 24;
      el('path', { d: 'M' + (hx - 7) + ' 1L' + hx + ' -9L' + (hx + 7) + ' 1Z', fill: C.key }, b.g);
      el('path', { d: 'M' + (hx - 5) + ' 0L' + hx + ' -7L' + (hx + 5) + ' 0Z', fill: C.indigo, transform: 'translate(1 0.5)' }, b.g);
    }
    el('path', { d: 'M-74 -1Q0 24 74 -1L63 14L-63 14Z', fill: C.key }, b.g);
    el('path', { d: 'M-68 1Q0 21 68 1L58 11L-58 11Z', fill: C.ochre, transform: 'translate(1.5 1)' }, b.g);
    el('path', { d: 'M-52 6Q0 15 52 6', fill: 'none', stroke: C.key, 'stroke-width': 1.4 }, b.g);
  });

  /* ---------- Cords (connections) ---------- */
  var cordsG = document.getElementById('cords');
  var CORDS = [
    { a: 0, b: 1, start: 0.55, dur: 0.55 },
    { a: 1, b: 2, start: 0.85, dur: 0.55 }
  ];
  CORDS.forEach(function (c, i) {
    c.under = el('path', { id: 'cordKey' + i, stroke: C.key, 'stroke-width': 5, pathLength: 1, 'stroke-dasharray': '1 1' }, cordsG);
    c.top = el('path', { id: 'cord' + i, stroke: C.persimmon, 'stroke-width': 2.6, pathLength: 1, 'stroke-dasharray': '1 1' }, cordsG);
  });

  /* ---------- Foam claws (final crest) ---------- */
  var CLAWS = [
    [196, 176, -12, 1.0], [244, 163, -4, 1.05], [294, 162, 6, 1.1], [340, 174, 18, 1.1],
    [382, 194, 30, 1.0], [416, 220, 45, 0.95], [446, 252, 70, 0.85], [458, 290, 100, 0.75],
    [440, 318, 150, 0.7], [412, 324, 190, 0.6]
  ];
  var clawsG = document.getElementById('claws');
  var clawNodes = CLAWS.map(function (c) {
    var outer = el('g', { transform: 'translate(' + c[0] + ' ' + c[1] + ') rotate(' + c[2] + ') scale(' + c[3] + ')' }, clawsG);
    var inner = el('g', {}, outer);
    el('use', { href: '#clawShape', fill: C.key, transform: 'translate(-1.5 -1) scale(1.12)' }, inner);
    el('use', { href: '#clawShape', fill: C.paper }, inner);
    return inner;
  });

  /* ---------- Spray droplets (seeded, frozen at rest) ---------- */
  var sprayRnd = mulberry32(7131);
  var sprayG = document.getElementById('spray');
  var SPRAY = [];
  for (var s = 0; s < 22; s++) {
    var sp = {
      ox: 452 + sprayRnd() * 10, oy: 248 + sprayRnd() * 30,
      fx: 470 + sprayRnd() * 190, fy: 140 + sprayRnd() * 170,
      r: 2.2 + sprayRnd() * 3.2, delay: sprayRnd() * 0.25, lift: 30 + sprayRnd() * 50
    };
    sp.node = el('g', { opacity: 0 }, sprayG);
    el('circle', { r: sp.r + 1.2, fill: C.key }, sp.node);
    el('circle', { r: sp.r, fill: C.paper, cx: 0.6, cy: 0.4 }, sp.node);
    SPRAY.push(sp);
  }

  /* ---------- Petals (lateral drift path) ---------- */
  var PETALS = [[640, 262, 0.0], [712, 318, 0.08], [790, 236, 0.16], [868, 330, 0.05], [676, 400, 0.12], [596, 352, 0.2]];
  var petalsG = document.getElementById('petals');
  PETALS.forEach(function (p, i) {
    p.node = el('g', { opacity: 0 }, petalsG);
    el('use', { href: '#petalShape', fill: C.key, transform: 'scale(1.25)' }, p.node);
    el('use', { href: '#petalShape', fill: C.rose, transform: 'translate(0.8 0.5)' }, p.node);
    p.phase = i * 1.3;
  });

  /* ---------- Static variable-width plate insets ---------- */
  document.getElementById('wavePlate').setAttribute('transform', inset(220, 600, 0.992, 1.5, 1));
  document.getElementById('facePlate').setAttribute('transform', inset(150, 640, 0.99, 1, 1.5));

  /* ---------- Time-derived scene state ---------- */
  function render(t) {
    // cloud band slow pan (settles at 2.6s)
    var cu = ease(clamp01(t / 2.6));
    cloudBand.setAttribute('transform', 'translate(' + (-36 + 64 * cu).toFixed(2) + ' 0)');

    // sun reflection plate grows after the idea appears
    var ru = easeOut(clamp01((t - 0.45) / 0.5));
    reflBars.forEach(function (r, i) {
      var u = clamp01(ru * 1.4 - i * 0.1);
      r.setAttribute('transform', 'scale(' + u.toFixed(3) + ' 1)');
      r.setAttribute('opacity', u > 0 ? 1 : 0);
    });

    // boats ride the swell sent out by the wave, one after another (connected response)
    BOATS.forEach(function (b) {
      var u = clamp01((t - b.d) / 0.9);
      var lift = Math.sin(Math.PI * u);
      b.cy = b.y - 16 * lift;
      b.rot = -5 * Math.sin(2 * Math.PI * u) * (1 - u * 0.3);
      b.g.setAttribute('transform', 'translate(' + b.x + ' ' + b.cy.toFixed(2) + ') rotate(' + b.rot.toFixed(2) + ')');
    });

    // cords follow boat endpoints; draw progress from timeline time
    CORDS.forEach(function (c) {
      var A = BOATS[c.a], B = BOATS[c.b];
      var ra = A.rot * Math.PI / 180, rb = B.rot * Math.PI / 180;
      var ax = A.x + 66 * Math.cos(ra), ay = A.cy + 66 * Math.sin(ra) + 1;
      var bx = B.x - 66 * Math.cos(rb), by = B.cy - 66 * Math.sin(rb) + 1;
      var mx = (ax + bx) / 2, my = Math.max(ay, by) + 14;
      var d = 'M' + ax.toFixed(2) + ' ' + ay.toFixed(2) + 'Q' + mx.toFixed(2) + ' ' + my.toFixed(2) + ' ' + bx.toFixed(2) + ' ' + by.toFixed(2);
      var u = ease(clamp01((t - c.start) / c.dur));
      var off = (1 - u).toFixed(4);
      c.under.setAttribute('d', d); c.top.setAttribute('d', d);
      c.under.setAttribute('stroke-dashoffset', off); c.top.setAttribute('stroke-dashoffset', off);
      c.under.setAttribute('opacity', u > 0 ? 1 : 0); c.top.setAttribute('opacity', u > 0 ? 1 : 0);
    });

    // spray: thrown from the crest, comes to rest as frozen spray by 2.6s
    SPRAY.forEach(function (sp) {
      var u = clamp01((t - 1.8 - sp.delay) / 0.55);
      if (u <= 0) { sp.node.setAttribute('opacity', 0); return; }
      var e = easeOut(u);
      var x = sp.ox + (sp.fx - sp.ox) * e;
      var y = sp.oy + (sp.fy - sp.oy) * e - sp.lift * Math.sin(Math.PI * e) * 0.6;
      sp.node.setAttribute('opacity', 1);
      sp.node.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + (0.4 + 0.6 * e).toFixed(3) + ')');
    });

    // petals drift laterally along a gentle sine path and settle by 2.6s
    PETALS.forEach(function (p) {
      var u = clamp01((t - 0.2 - p[2]) / (2.4 - p[2]));
      var e = ease(u);
      var x = p[0] - 520 * (1 - e);
      var y = p[1] + Math.sin(e * Math.PI * 2 + p.phase) * 22 * (1 - e);
      var rot = 140 * (1 - e) + p.phase * 10;
      p.node.setAttribute('opacity', clamp01(u / 0.12).toFixed(3));
      p.node.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') rotate(' + rot.toFixed(1) + ')');
    });
  }

  // Expose scene builders; the timeline is built and registered in index.html
  window.__printScene = { render: render, clawNodes: clawNodes };
})();
