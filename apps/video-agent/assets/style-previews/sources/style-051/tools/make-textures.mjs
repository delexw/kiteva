// Deterministic, seeded ink-grain masks and paper-fiber texture (prepared once, never re-randomized).
import sharp from 'sharp';
const W=1280,H=720;
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function valueNoise(seed,cell){const r=rng(seed);const gw=Math.ceil(W/cell)+2,gh=Math.ceil(H/cell)+2;const g=new Float32Array(gw*gh).map(()=>r());
 return(x,y)=>{const fx=x/cell,fy=y/cell,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;const s=t=>t*t*(3-2*t);const a=g[iy*gw+ix],b=g[iy*gw+ix+1],c=g[(iy+1)*gw+ix],d=g[(iy+1)*gw+ix+1];const u=s(tx),v=s(ty);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;};}
async function inkMask(seed,file){const r=rng(seed);const n=valueNoise(seed+11,5),m=valueNoise(seed+29,46);const buf=Buffer.alloc(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=n(x,y)*0.75+m(x,y)*0.25;let v=k>0.85?110:(k>0.74?228:255);if(r()<0.022)v=70;else if(v===255&&r()<0.25)v=240;buf[y*W+x]=v;}
 await sharp(buf,{raw:{width:W,height:H,channels:1}}).png({compressionLevel:9,palette:true,colors:8}).toFile(file);}
async function paper(seed,file){const r=rng(seed);const n=valueNoise(seed+3,90),f=valueNoise(seed+7,3);const buf=Buffer.alloc(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=246+Math.round(n(x,y)*9)-(f(x,y)>0.86?10:0);if(r()<0.004)v=222;buf[y*W+x]=Math.min(255,v);}
 await sharp(buf,{raw:{width:W,height:H,channels:1}}).png({compressionLevel:9,palette:true,colors:16}).toFile(file);}
await inkMask(51001,'assets/grain-teal.png');
await inkMask(51002,'assets/grain-orange.png');
await paper(51003,'assets/paper-fiber.png');
console.log('ok');
