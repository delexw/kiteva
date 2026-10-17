import { contentRevealRule } from "./content-reveal";
import { arrowDrawingRule } from "./arrow-drawing";
import { svgTypographyPreparation } from "./svg-typography";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { validateExampleSvg } from "../catalog/style-examples";
import type { Style } from "../../shared/contracts";
export const illustrationMotionRevision = 2;
export {
  IllustrationMotionSchema,
  IllustrationMotionsSchema,
  type IllustrationMotion,
} from "../../shared/agents/schemas/illustration-motion";
import {
  IllustrationMotionSchema,
  type IllustrationMotion,
} from "../../shared/agents/schemas/illustration-motion";
export function annotateIllustration(svg: string) {
  validateExampleSvg(svg);
  const doc = new XMLParser({ ignoreAttributes: false, preserveOrder: true }).parse(svg);
  let index = 0;
  function visit(nodes: Array<Record<string, unknown>>, insideDefinition = false) {
    for (const node of nodes) {
      const tag = Object.keys(node).find((key) => key !== ":@")!;
      const definition =
        insideDefinition ||
        ["defs", "clipPath", "mask", "pattern", "filter", "marker"].includes(tag);
      if (
        !definition &&
        [
          "g",
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polyline",
          "polygon",
          "use",
          "text",
        ].includes(tag)
      ) {
        const attrs = (node[":@"] || {}) as Record<string, string>;
        node[":@"] = attrs;
        // Never rename authored IDs, which may be referenced by SVG use or paint definitions.
        attrs["@_data-demo-actor"] = `demo-actor-${++index}`;
      }
      if (Array.isArray(node[tag])) visit(node[tag] as Array<Record<string, unknown>>, definition);
    }
  }
  visit(doc);
  return new XMLBuilder({ ignoreAttributes: false, preserveOrder: true }).build(doc) as string;
}
export function illustrationMotionPrompt(
  styles: Array<{ style: Style; svg: string; image: string; failure?: string }>,
) {
  return `${arrowDrawingRule} ${contentRevealRule} Inspect EACH actual illustration using Read on its supplied image AND annotated SVG before planning motion. This is a 3-second silent Motion Graphic review, not a new drawing. Pick movement that makes sense for the depicted objects, composition and visual Motion Graphic. Keep the full composition recognizable throughout. Do not select actions from the Motion Graphic name alone. Choose 1-10 coherent actors using their data-demo-actor values from the SVG. Do not animate the background, comic panel borders, decorative dot patterns, unrelated labels, or every primitive independently. Never choose both an ancestor group and a descendant actor. Preserve all original SVG transforms through wrapper groups. Movement MUST be clearly perceptible at a 320x180 card size, not tiny breathing or a barely visible wiggle. Animate 2-4 substantial foreground objects (together covering at least 8% of the image). Choose action reveal to assemble objects from the supplied pose into their original position, draw for stroked unfilled paths, or transform for a clearly visible bounded pop/tilt. Do not force the same action onto every Motion Graphic. Reveal can start at opacity 0 and scale 0.7-0.85, then settle at the exact authored pose; stagger reveals to communicate the illustration. Transform should use a noticeable 15-25% scale change or 24-48px translation only when space/contact constraints allow it. Draw requires a visible stroked unfilled path or line; filled shapes must use reveal instead. No tiny motion-only plans. By 2.7 seconds all objects must be fully present at their original pose for a short readable hold. A pose is a relative offset; x/y 0 is the artwork's original position and scale 1 preserves its authored scale. Each actor eases to this relative pose and returns to neutral before 3 seconds. Readable text, edge margins, contact points and panel boundaries must remain intact. If a reference cannot be expressed faithfully by this illustration, omit it; no references is valid. For Pop Art, use clearly visible on-beat lightbulb or burst reveals/pops within their own panels; never float or rescale the whole page. For diagrams, emphasize connected nodes or paths without breaking the connections. For hand drawing, draw or reveal the main illustrated subject; optional line boil is secondary and the paper stays still. References must be from each Motion Graphic's approved list; do not reinterpret orb-drop/growth as ambient float, or fake 3D orbit from flat artwork. Prefer 2-4 meaningful tracks for restrained Motion Graphics. For Manga or Comic Book Art use 6-10 coordinated tracks in a cinematic opening: main object/eye reveal, speed-line sweep/reveal, network line drawing, node assembly, emphatic Japanese/impact lettering with a punch-in, and speech-bubble text appearing on the concluding beat. Animate both the illustration and meaningful lettering, not only the pupil. Keep screentone and panel frames anchored; preserve readable final text. Separate coherent layers and stagger them; do not choose a parent and its child together. Return plans for all supplied IDs exactly once. Use Read only; no research or other tools. Allowed reference definitions: Read motions and illustrations (including imageFile, svgFile and previousRenderProblem) from the complete required input JSON. Return all ${styles.length} illustrations.`;
}
export function illustrationMotionHtml(
  annotatedSvg: string,
  plan: IllustrationMotion,
  foreground = "#000000",
  background = "#FFFFFF",
) {
  validateExampleSvg(annotatedSvg);
  IllustrationMotionSchema.parse(plan);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}svg{width:1280px;height:720px;display:block}</style></head><body><div data-composition-id="video" data-width="1280" data-height="720" data-duration="3" data-fps="30">${annotatedSvg}</div><script src="gsap.min.js"></script><script src="chroma.min.js"></script><script>
const plan=${JSON.stringify(plan).replace(/</g, "\\u003c")};
const svg=document.querySelector('svg');
const foreground=${JSON.stringify(foreground)};
const background=${JSON.stringify(background)};
${svgTypographyPreparation}
const timeline=gsap.timeline({paused:true});
const chosen=plan.tracks.map(track=>({track,element:document.querySelector('[data-demo-actor="'+track.actorId+'"]')}));
if(chosen.some(item=>!item.element))throw Error('Motion references an absent actor');
for(const item of chosen){
 if(chosen.some(other=>other!==item&&other.element.contains(item.element)))throw Error('Nested motion actors would double-transform artwork');
 const el=item.element;
 if(el.tagName==='rect' && Number(el.getAttribute('width'))>=1200 && Number(el.getAttribute('height'))>=650)throw Error('Background cannot be a motion actor');
 const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');
 el.parentNode.insertBefore(wrapper,el);wrapper.appendChild(el);
 wrapper.setAttribute('data-demo-motion',item.track.actorId);
 // Animate a neutral wrapper, never overwrite the artwork's authored matrix.
 gsap.set(wrapper,{transformOrigin:'50% 50%'});
 if(item.track.action==='reveal'){
   gsap.set(wrapper,item.track.pose);
   timeline.to(wrapper,{x:0,y:0,scale:1,rotation:0,opacity:1,duration:item.track.duration,ease:item.track.ease},item.track.start);
 }else if(item.track.action==='draw'){
   const paths=Array.from(el.matches('path,line,polyline,polygon')?[el]:el.querySelectorAll('path,line,polyline,polygon'));
   const drawable=paths.filter(p=>(p.localName==='line' || getComputedStyle(p).fill==='none') && getComputedStyle(p).stroke!=='none' && typeof p.getTotalLength==='function');
   if(!drawable.length)throw Error('Draw action needs visible unfilled stroked paths');
   for(const path of drawable){const length=path.getTotalLength();gsap.set(path,{strokeDasharray:length,strokeDashoffset:length});timeline.to(path,{strokeDashoffset:0,duration:item.track.duration,ease:item.track.ease},item.track.start);}
 }else{
   timeline.to(wrapper,{...item.track.pose,duration:item.track.duration,ease:item.track.ease},item.track.start);
   timeline.to(wrapper,{x:0,y:0,scale:1,rotation:0,opacity:1,duration:item.track.duration,ease:'sine.inOut'},Math.min(2.7-item.track.duration,item.track.start+item.track.duration+.2));
 }
}
timeline.to({}, {duration:.001},2.999);window.__timelines={video:timeline};
</script></body></html>`;
}
