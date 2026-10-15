export const svgTypographyPreparation = `const seenText=new Map();
Array.from(svg.querySelectorAll('text')).forEach(el=>{
 const label=el.textContent.trim();const prior=seenText.get(label);
 if(prior && Math.abs(Number(prior.getAttribute('x'))-Number(el.getAttribute('x')))<12 && Math.abs(Number(prior.getAttribute('y'))-Number(el.getAttribute('y')))<12) {
  const selected=typeof plan!=='undefined' && plan.tracks.some(track=>track.actorId===prior.getAttribute('data-demo-actor'));
  if(selected){el.remove();return;}
  prior.remove();
 }
 seenText.set(label,el);
 // Preserve authored baselines. Tight headline leading can overlap font em-boxes
 // without overlapping visible glyphs; annotate only baseline gaps of at least one em.
 const fontSize=Number(getComputedStyle(el).fontSize.replace('px',''));
 const fill=getComputedStyle(el).fill;
 if(fontSize<24 && chroma.valid(fill) && chroma(fill).hex()!==chroma(background).hex() && chroma.contrast(fill,background)<4.5){el.setAttribute('fill',foreground);el.setAttribute('opacity','1');el.setAttribute('fill-opacity','1');}
 if(fontSize>=36){
  for(const sibling of Array.from(el.parentElement.querySelectorAll(':scope > text'))){
   if(sibling===el)continue;
   const gap=Math.abs(Number(sibling.getAttribute('y'))-Number(el.getAttribute('y')));
   if(gap>=fontSize && gap<=fontSize*1.3 && Math.abs(Number(sibling.getAttribute('x'))-Number(el.getAttribute('x')))<12){el.setAttribute('data-layout-allow-overlap','true');sibling.setAttribute('data-layout-allow-overlap','true');}
  }
 }
 // Outlined display lettering needs a readable fill as well as its decorative outline.
 if(el.getAttribute('stroke') && el.getAttribute('stroke')!=='none') {el.setAttribute('fill',foreground);el.setAttribute('stroke',background);}
});
`;
