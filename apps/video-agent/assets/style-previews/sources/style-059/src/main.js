// Entry: builds the Three.js low-poly scene once and exposes a pure render(t).
// GSAP (global, local gsap.min.js) owns composition time; this module never ticks itself.
import { createScene, DURATION } from './scene.src.js';

const canvas = document.getElementById('lowpoly-canvas');
const scene = createScene(canvas);
let last = -1;
function draw(t) {
  const tt = Math.min(DURATION, Math.max(0, Number(t) || 0));
  last = tt;
  scene.render(tt);
}
window.__lowpoly = { draw, get lastTime() { return last; } };
draw(0);
