import rough from 'roughjs/bundled/rough.esm.js';
import { interpolate, mix, backOut, easeInOut, easeOut, cubicBezier, clamp, progress, steps } from 'motion';
window.ComicVendor = { rough, motion: { interpolate, mix, backOut, easeInOut, easeOut, cubicBezier, clamp, progress, steps } };
