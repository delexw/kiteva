// Deterministic riso grain textures (seeded PRNG, minimal PNG encoder, no deps).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const W = 640, H = 360; // tiled/scaled 2x in SVG
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
const crcT = new Uint32Array(256).map((_, n) => { let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; return c>>>0; });
const crc = b => { let c=0xFFFFFFFF; for (const x of b) c = crcT[(c^x)&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
function chunk(type, data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const td=Buffer.concat([Buffer.from(type), data]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(file, px){ // px: Uint8Array RGBA
  const raw = Buffer.alloc((W*4+1)*H); for (let y=0;y<H;y++){ raw[y*(W*4+1)]=0; Buffer.from(px.buffer, y*W*4, W*4).copy(raw, y*(W*4+1)+1); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
  writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',deflateSync(raw,{level:9})), chunk('IEND',Buffer.alloc(0))]));
}
// Ink mask: luminance mask, white = ink prints, dark speckles = dropouts, mid = thin ink.
function inkMask(file, seed, density){
  const r=rng(seed), px=new Uint8Array(W*H*4);
  for (let i=0;i<W*H;i++){ let v = 255 - Math.floor(r()*r()*70); if (r()<density) v = Math.floor(r()*90); px.set([v,v,v,255], i*4); }
  // a few clustered dropouts (roller starvation)
  for (let k=0;k<420;k++){ const cx=r()*W, cy=r()*H, rad=0.6+r()*1.6; for(let y=Math.floor(cy-rad);y<=cy+rad;y++) for(let x=Math.floor(cx-rad);x<=cx+rad;x++){ if(x<0||y<0||x>=W||y>=H) continue; if((x-cx)**2+(y-cy)**2<=rad*rad){ const i=(y*W+x)*4; const v=Math.floor(r()*60); px[i]=px[i+1]=px[i+2]=v; } } }
  png(file, px);
}
// Paper fibre: transparent overlay with faint dark/light flecks for uncoated recycled stock.
function paper(file, seed){
  const r=rng(seed), px=new Uint8Array(W*H*4);
  for (let i=0;i<W*H;i++){ const q=r(); if (q<0.05) px.set([40,52,60, Math.floor(10+r()*22)], i*4); else if (q<0.09) px.set([255,255,255, Math.floor(20+r()*40)], i*4); }
  for (let k=0;k<160;k++){ let x=r()*W, y=r()*H; const a=r()*Math.PI, len=3+r()*9; for(let s=0;s<len;s++){ const xi=Math.floor(x+Math.cos(a)*s), yi=Math.floor(y+Math.sin(a)*s); if(xi>=0&&yi>=0&&xi<W&&yi<H) px.set([70,88,96,38], (yi*W+xi)*4); } }
  png(file, px);
}
inkMask('assets/grain-coral.png', 4911, 0.075);
inkMask('assets/grain-blue.png', 1729, 0.055);
paper('assets/paper-fibre.png', 3307);
console.log('ok');
