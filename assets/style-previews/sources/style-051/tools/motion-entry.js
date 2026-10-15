// Only pure, time-evaluated Motion utilities are exposed: no animate(), no WAAPI, no frame loop.
import { interpolate, easeInOut, easeOut, backOut, clamp } from 'motion';
window.PrintMotion = { interpolate, easeInOut, easeOut, backOut, clamp };
