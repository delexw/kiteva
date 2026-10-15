// One-time geometry preparation (Node). An isolated PaperScope intersects and
// subtracts authored multi-view outlines of each still-life part into planar
// facets, then caches them as SVG path data (geometry.js) with part/view IDs.
// Not used at frame time.
const fs = require('fs');
const path = require('path');
const paper = require('paper/dist/paper-core.js');

const scope = new paper.PaperScope();
scope.setup(new scope.Size(1280, 720));
const P = (x, y) => new scope.Point(x, y);
const poly = (pts) => new scope.Path({ segments: pts.map(([x, y]) => P(x, y)), closed: true, insert: false });
const circle = (x, y, r) => new scope.Path.Circle({ center: P(x, y), radius: r, insert: false });
const ellipse = (x, y, rx, ry) => new scope.Path.Ellipse({ center: P(x, y), radius: [rx, ry], insert: false });
const rrect = (x, y, w, h, r) => new scope.Path.Rectangle({ rectangle: new scope.Rectangle(x, y, w, h), radius: r, insert: false });
const unite = (...ps) => ps.reduce((a, b) => a.unite(b, { insert: false }));
const rot = (p, deg, cx, cy) => { p.rotate(deg, P(cx, cy)); return p; };
const d = (p) => (p && !p.isEmpty() ? p.pathData : '');

// ---- Authored views (each part from 2–3 viewpoints) ----
// TABLE: top-down plane vs frontal edge/apron.
const tableTop = poly([[372, 488], [1150, 438], [1196, 600], [340, 664]]);
const tableFront = poly([[330, 590], [1210, 548], [1214, 628], [326, 690]]);

// GUITAR (tilted -10° about its body): frontal figure-eight vs side profile band.
const gx = 572, gy = 380;
const gFront = rot(unite(circle(gx, gy + 70, 100), circle(gx, gy - 62, 74), rrect(gx - 70, gy - 60, 140, 120, 30)), -10, gx, gy);
const gProfile = rot(rrect(gx + 34, gy - 150, 78, 330, 38), -10, gx, gy);
const gNeck = rot(rrect(gx - 22, gy - 300, 44, 172, 4), -10, gx, gy);
const gHead = rot(poly([[gx - 30, gy - 336], [gx + 30, gy - 344], [gx + 26, gy - 296], [gx - 26, gy - 296]]), -10, gx, gy);
const gHole = rot(circle(gx, gy - 4, 34), -10, gx, gy);
const gBridge = rot(rrect(gx - 34, gy + 104, 68, 14, 3), -10, gx, gy);

// BOTTLE: profile silhouette vs top view (concentric shoulder + mouth rings).
const bx = 812;
const bProfile = unite(rrect(bx - 54, 250, 108, 248, 18), ellipse(bx, 252, 54, 34), rrect(bx - 17, 128, 34, 130, 4), rrect(bx - 22, 118, 44, 18, 4));
const bTop = circle(bx + 6, 214, 64);
const bTopMouth = circle(bx + 6, 214, 20);
const bTopShoulder = circle(bx + 6, 214, 42);

// GLASS: profile trapezoid with stem vs elevated rim ellipse (top view).
const cx = 1004;
const cProfile = unite(poly([[cx - 64, 300], [cx + 64, 300], [cx + 40, 430], [cx - 40, 430]]), rrect(cx - 8, 428, 16, 46, 2), ellipse(cx, 478, 46, 12));
const cRim = ellipse(cx + 10, 300, 70, 30);

// Wall / picture-plane shards anchored to the table corner (not free polygons).
const wallA = poly([[392, 44], [770, 22], [1000, 452], [372, 488]]);
const wallB = poly([[690, 76], [1100, 112], [1150, 438], [760, 466]]);

const facet = (part, view, role, p, extra = {}) => ({ id: `${part}-${view}`, part, view, role, d: d(p), ...extra });
const facets = [
  facet('wall', 'plane-a', 'ground', wallA.subtract(wallB, { insert: false }), { tone: 'ochre', angle: 62 }),
  facet('wall', 'plane-ab', 'ground', wallA.intersect(wallB, { insert: false }), { tone: 'umber', angle: 12 }),
  facet('wall', 'plane-b', 'ground', wallB.subtract(wallA, { insert: false }), { tone: 'gray', angle: -20 }),

  facet('table', 'top', 'table-top-view', tableTop.subtract(tableFront, { insert: false }), { tone: 'ochre', angle: -4 }),
  facet('table', 'top-x-front', 'table-overlap', tableTop.intersect(tableFront, { insert: false }), { tone: 'umber', angle: 30 }),
  facet('table', 'front', 'table-front-view', tableFront.subtract(tableTop, { insert: false }), { tone: 'gray', angle: -3 }),

  facet('guitar', 'front', 'guitar-frontal-view', gFront.subtract(gProfile, { insert: false }).subtract(gHole, { insert: false }), { tone: 'ochre', angle: 80 }),
  facet('guitar', 'front-x-profile', 'guitar-overlap', gFront.intersect(gProfile, { insert: false }).subtract(gHole, { insert: false }), { tone: 'umber', angle: -10 }),
  facet('guitar', 'profile', 'guitar-side-view', gProfile.subtract(gFront, { insert: false }), { tone: 'gray', angle: -10 }),
  facet('guitar', 'neck', 'guitar-neck', gNeck.unite(gHead, { insert: false }).subtract(gFront, { insert: false }), { tone: 'umber', angle: -10 }),
  facet('guitar', 'soundhole', 'guitar-soundhole', gHole, { tone: 'ink', angle: 0 }),
  facet('guitar', 'bridge', 'guitar-bridge', gBridge, { tone: 'ink', angle: 0 }),

  facet('bottle', 'profile', 'bottle-profile-view', bProfile.subtract(bTop, { insert: false }), { tone: 'gray', angle: 90 }),
  facet('bottle', 'profile-x-top', 'bottle-overlap', bProfile.intersect(bTop, { insert: false }), { tone: 'umber', angle: 45 }),
  facet('bottle', 'top', 'bottle-top-view', bTop.subtract(bProfile, { insert: false }), { tone: 'paper', angle: 0 }),

  facet('glass', 'profile', 'glass-profile-view', cProfile.subtract(cRim, { insert: false }), { tone: 'paper', angle: 75 }),
  facet('glass', 'profile-x-rim', 'glass-overlap', cProfile.intersect(cRim, { insert: false }), { tone: 'gray', angle: 0 }),
  facet('glass', 'rim', 'glass-top-view', cRim.subtract(cProfile, { insert: false }), { tone: 'paper', angle: 0 }),
];

// Line work: subject contours (outlines of each original view) and anchors.
const sp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const gr = (x, y) => { const p = P(x, y).rotate(-10, P(gx, gy)); return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]; };
const strings = [-12, -4, 4, 12].map((o) => { const a = gr(gx + o, gy - 322), b = gr(gx + o, gy + 110); return `M${a[0]},${a[1]}L${b[0]},${b[1]}`; }).join('');
const lines = {
  tableTop: d(tableTop), tableFront: d(tableFront),
  guitarFront: d(gFront), guitarProfile: d(gProfile), guitarNeck: d(gNeck.unite(gHead, { insert: false })), guitarStrings: strings,
  bottleProfile: d(bProfile), bottleTop: d(bTop), bottleTopMouth: d(bTopMouth), bottleTopShoulder: d(bTopShoulder),
  glassProfile: d(cProfile), glassRim: d(cRim), glassLiquid: d(ellipse(cx, 352, 52, 14)),
};

const out = { generatedBy: 'Paper.js ' + paper.version + ' isolated PaperScope (tools/build-geometry.cjs)', facets, lines };
fs.writeFileSync(path.join(__dirname, '..', 'geometry.js'), '// Generated by tools/build-geometry.cjs — cached Paper.js boolean facets.\nwindow.CUBIST_GEOMETRY = ' + JSON.stringify(out) + ';\n');
console.log(facets.map((f) => `${f.id}:${f.d.length}`).join('\n'));
