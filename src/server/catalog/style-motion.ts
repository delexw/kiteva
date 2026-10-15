import { svgTypographyPreparation } from "../motion/svg-typography";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Style, StyleExample } from "../../shared/contracts";
import { illustrationMotionRevision } from "../motion/illustration-motion";
import { stylePreviewVideoFolder } from "./style-preview-assets";
export { stylePreviewVideoFolder } from "./style-preview-assets";
import { validateExampleSvg } from "./style-examples";
export {
  MotionRecipeSchema,
  MotionRecipesSchema,
  type MotionRecipe,
} from "../../shared/agents/schemas/motion-recipe";
import { MotionRecipeSchema, type MotionRecipe } from "../../shared/agents/schemas/motion-recipe";
export function isSupportedStylePreviewModel(model: string) {
  return model.startsWith("claude") || model === "application-authored";
}
export interface StyleVideo {
  styleId: string;
  catalogHash: string;
  sourceHash: string;
  video: string;
  duration: number;
  generatedAt: string;
  renderMs: number;
  recipe?: MotionRecipe;
  illustrationPlan?: import("../motion/illustration-motion").IllustrationMotion;
  reviewed?: boolean;
  motionRevision?: number;
  visibleChangeRatio?: number;
  model: string;
}
export function isCurrentStylePreview(
  clip: StyleVideo | undefined,
  art: Pick<StyleExample, "styleId" | "generatedAt">,
) {
  return Boolean(
    clip &&
    clip.styleId === art.styleId &&
    clip.reviewed &&
    clip.motionRevision === illustrationMotionRevision &&
    isSupportedStylePreviewModel(clip.model) &&
    art.generatedAt &&
    clip.generatedAt >= art.generatedAt,
  );
}
export async function readStyleVideos(): Promise<StyleVideo[]> {
  try {
    return JSON.parse(await readFile(path.join(stylePreviewVideoFolder, "videos.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function writeStyleVideos(records: StyleVideo[]) {
  await mkdir(stylePreviewVideoFolder, { recursive: true });
  const file = path.join(stylePreviewVideoFolder, "videos.json");
  await writeFile(file + ".tmp", JSON.stringify(records, null, 2));
  await rename(file + ".tmp", file);
}
export function motionRecipePrompt(styles: Style[]) {
  return `Choose one distinctive motion action for each supplied style's 3-second silent illustrated SVG demo. Subject: an idea becomes a connected system. Keep typography readable and preserve its palette. Choose from assemble (pieces build and settle), draw (paths draw in), float (layered drift), orbit (small orbital motion), pulse (breathing scale), wave (flowing deformation), step (discrete pixel-like assembly), type (kinetic typography), jitter (hand-drawn line boil), scan (scanning line and staggered data). These are illustrative vector motion studies, not claims of photorealistic 3D or physical simulation. Avoid selecting the same motion for everything; use the actual style's motion guidance. Amplitude is a multiplier between 0.5 and 2; direction is horizontal, vertical or radial. Return every supplied ID exactly once with a short rationale. No tools or research. ${JSON.stringify(styles.map((s) => ({ styleId: s.id, name: s.name_en, cues: s.visual_cues, motion: s.tech.motion_engine })))}`;
}
export function styleMotionHtml(
  svg: string,
  input: MotionRecipe,
  foreground = "#000000",
  background = "#FFFFFF",
) {
  validateExampleSvg(svg);
  const recipe = MotionRecipeSchema.parse(input);
  // Only application-authored animation code executes. Model output is bounded JSON and validated SVG.
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}svg{width:1280px;height:720px;display:block}</style></head><body><div data-composition-id="video" data-width="1280" data-height="720" data-duration="3" data-fps="30">${svg}</div><script src="gsap.min.js"></script><script src="chroma.min.js"></script><script>
const recipe=${JSON.stringify(recipe).replace(/</g, "\\u003c")};
const svg=document.querySelector('svg');
svg.setAttribute('data-layout-allow-overflow','true');
const foreground=${JSON.stringify(foreground)};
const background=${JSON.stringify(background)};
${svgTypographyPreparation}
const elements=Array.from(svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line,text,use')).filter(el=>!el.closest('defs,clipPath,mask,pattern,marker,filter') && !(el.tagName==='rect' && Number(el.getAttribute('width'))>=1200 && Number(el.getAttribute('height'))>=650)).slice(0,120);
elements.filter(el=>el.tagName!=='text').forEach(el=>el.setAttribute('data-layout-allow-overflow','true'));
const shapes=elements.filter(el=>el.tagName!=='text');
const texts=elements.filter(el=>el.tagName==='text');
const timeline=gsap.timeline({paused:true});
const a=recipe.amplitude;
const ease=recipe.action==='step'?'steps(6)':'power2.inOut';
function drift(el,i,kind){
 const phase=i%7/7*6.283185, sign=i%2?1:-1;
 const x=recipe.direction==='vertical'?0:Math.cos(phase)*12*a;
 const y=recipe.direction==='horizontal'?0:Math.sin(phase)*12*a;
 const props=kind==='pulse'?{scale:1+.035*a}:kind==='orbit'?{x,y,rotation:sign*4*a}:kind==='wave'?{x:x*1.4,y:y*1.4,skewX:sign*3*a}:{x,y};
 gsap.set(el,{transformOrigin:'50% 50%',svgOrigin:undefined});
 timeline.to(el,{...props,duration:.75,ease:'sine.inOut'},0).to(el,{x:0,y:0,rotation:0,skewX:0,scale:1,duration:.75,ease:'sine.inOut'},.75).to(el,{...props,duration:.75,ease:'sine.inOut'},1.5).to(el,{x:0,y:0,rotation:0,skewX:0,scale:1,duration:.75,ease:'sine.inOut'},2.25);
}
if(['assemble','step','type'].includes(recipe.action)) {
 const targets=recipe.action==='type'&&texts.length?texts:shapes;
 targets.forEach((el,i)=> { const start=(i%12)*.045; const offset=recipe.action==='type'?0:(i%2?1:-1)*28*a;
 timeline.fromTo(el,{opacity:0,x:recipe.direction==='vertical'?0:offset,y:recipe.direction==='horizontal'?0:offset},{opacity:1,x:0,y:0,duration:.7,ease},start);
 timeline.to(el,{opacity:0,duration:.45,ease:'power1.in'},2.5+(i%6)*.01);
 });
} else if(recipe.action==='draw') {
 shapes.forEach((el,i)=>{if(typeof el.getTotalLength==='function'&&el.getAttribute('stroke')&&el.getAttribute('stroke')!=='none'){const len=el.getTotalLength();timeline.fromTo(el,{strokeDasharray:len,strokeDashoffset:len},{strokeDashoffset:0,duration:1.3,ease:'power1.inOut'},(i%10)*.07);timeline.to(el,{strokeDashoffset:len,duration:.55},2.4);}else{timeline.fromTo(el,{opacity:0},{opacity:1,duration:.8},(i%10)*.07);timeline.to(el,{opacity:0,duration:.5},2.5);}});
} else if(recipe.action==='jitter') {
 shapes.forEach((el,i)=>timeline.to(el,{keyframes:[{x:(i%2?1:-1)*1.5*a,y:1*a},{x:-1*a,y:-1*a},{x:0,y:0}],duration:.25,repeat:11,ease:'steps(1)'},0));
} else if(recipe.action==='scan') {
 shapes.forEach((el,i)=>timeline.fromTo(el,{opacity:.2},{opacity:1,duration:.3,ease:'none'},(i%16)*.06).to(el,{opacity:.2,duration:.4},2.6));
 const beam=document.createElementNS('http://www.w3.org/2000/svg','rect');beam.setAttribute('width','2');beam.setAttribute('height','720');beam.setAttribute('fill',shapes.find(e=>/^#/.test(e.getAttribute('stroke')||''))?.getAttribute('stroke')||'currentColor');beam.setAttribute('opacity','.3');svg.appendChild(beam);timeline.fromTo(beam,{x:0},{x:1280,duration:3,ease:'none'},0);
} else shapes.forEach((el,i)=>drift(el,i,recipe.action));
timeline.to({}, {duration:.001},2.999);
window.__timelines={video:timeline};
</script></body></html>`;
}
