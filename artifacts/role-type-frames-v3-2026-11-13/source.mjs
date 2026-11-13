// Hand-drawn vector source. No fonts, external images, filters or live generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const here=import.meta.dirname,root=path.resolve(here,'../..');
const out=path.join(root,'apps/web/public/assets/ravens/role-type-frames-v3');
await fs.mkdir(out,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const bronze='#51452f',gold='#786344';
// Only the two upper corner motifs differ. The middle top has no badge.
const motifs={
  townsfolk:`<path d="M10 35V12H15V8H20V12H25V8H30V12H35V35M10 35H35M19 35V25Q22.5 17 26 25V35"/>
      <path d="M40 11Q46 17 40 24Q34 17 40 11ZM40 15V25"/>`,
  outsider:`<path d="M13 29C12 17 24 8 41 7C37 20 25 28 13 29ZM13 29L35 12M18 20H25M13 29V34"/>
      <path d="M13 34C1 22 -1 40 13 34C26 22 27 41 13 34M13 34L8 44M13 34L21 43" stroke-width="2.1"/>`,
  minion:`<path d="M7 39C10 24 25 12 42 11M10 13C21 22 21 35 40 37" stroke-width="2.3"/>
      <path d="M14 27L8 19L19 23ZM19 22L22 12L24 25ZM25 33L20 41L31 35ZM34 35L41 29L39 38Z" fill="#786344" stroke-width=".7"/>`,
  demon:`<path d="M8 34C12 18 27 10 43 9L38 28Q31 19 27 32Q19 24 17 39Q13 31 8 34Z" fill="#191c17" fill-opacity=".8" stroke-width="2.1"/>
      <path d="M43 9L27 32M43 9L17 39M43 9L8 34"/>`,
};
const frames=[],previews=[],composites=[],metrics=[];
function measure(raw){
  let alphaTotal=0,lumaTotal=0,maxCompositeLuminance=0,brightPixels=0;
  const backgroundLuma=.2126*18+.7152*20+.0722*15;
  for(let i=0;i<raw.length;i+=4){
    const alpha=raw[i+3]/255,luma=.2126*raw[i]+.7152*raw[i+1]+.0722*raw[i+2];
    alphaTotal+=alpha;lumaTotal+=alpha*luma;
    const composite=alpha*luma+(1-alpha)*backgroundLuma;
    maxCompositeLuminance=Math.max(maxCompositeLuminance,composite);if(composite>110)brightPixels++;
  }
  return {alphaWeightedArea:alphaTotal,alphaWeightedMeanLuminance:lumaTotal/alphaTotal,maxCompositeLuminance,brightPixelsAbove110:brightPixels};
}
const portraits=['portraits-b-v4/monk.webp','portraits-b-v2/recluse.webp','portraits-b-v2/poisoner-approved-20261112.webp','portraits-b-v2/imp.webp'];
for(const [index,[id,motif]] of Object.entries(motifs).entries()){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
  <title>${id} minimal dark bronze portrait frame</title>
  <defs><g id="corner" fill="none" stroke-linecap="round" stroke-linejoin="round">${motif}</g></defs>
  <g fill="#151913" fill-opacity=".86">
    <path d="M8 47V17Q8 8 17 8H53Q24 21 8 47Z"/>
    <path d="M8 47V17Q8 8 17 8H53Q24 21 8 47Z" transform="translate(240 0) scale(-1 1)"/>
  </g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M58 3H18Q3 3 3 18V302Q3 317 18 317H222Q237 317 237 302V18Q237 3 222 3H182" stroke="${bronze}" stroke-width="1.2" opacity=".85"/>
    <path d="M8 91C14 49 65 18 120 9C175 18 226 49 232 91V299Q232 312 219 312H21Q8 312 8 299Z" stroke="${gold}" stroke-width="1.35" opacity=".78"/>
  </g>
  <g stroke="${gold}" stroke-width="1.85" opacity=".86">
    <use href="#corner" transform="translate(6 6)"/>
    <use href="#corner" transform="translate(234 6) scale(-1 1)"/>
  </g>
</svg>
`;
  const file=id+'.svg',data=Buffer.from(svg);
  await fs.writeFile(path.join(out,file),data);
  frames.push({id,type:id.toUpperCase(),file,width:240,height:320,scalable:true,bytes:data.length,sha256:sha(data)});
  const raw=await sharp(data).resize(120,160).ensureAlpha().raw().toBuffer();
  const pixel=(x,y,c)=>raw[(y*120+x)*4+c];
  for(let y=40;y<145;y++)for(let x=18;x<102;x++)if(pixel(x,y,3)!==0)throw new Error(`${id}: face aperture not clear`);
  for(let y=0;y<4;y++)for(let x=35;x<85;x++)if(pixel(x,y,3)!==0)throw new Error(`${id}: central top must be blank`);
  const oldPath=path.join(root,'apps/web/public/assets/ravens/role-type-frames-v2',id+'-small.webp');
  const oldRaw=await sharp(oldPath).resize(120,160).ensureAlpha().raw().toBuffer();
  const current=measure(raw),previous=measure(oldRaw);
  if(current.maxCompositeLuminance>=previous.maxCompositeLuminance*.75)throw new Error(`${id}: v3 has not been sufficiently darkened`);
  metrics.push({id,renderSize:[120,160],background:'#12140f',v2:previous,v3:current,faceApertureAlpha:0,centralTopAlpha:0});
  const bare=await sharp(data).resize(120,160).png().toBuffer();
  const portrait=await sharp(path.join(root,'apps/web/public/assets/ravens',portraits[index])).resize(115,154,{fit:'cover',position:'north'}).toBuffer();
  const composite=await sharp({create:{width:120,height:160,channels:4,background:'#12140f'}}).composite([{input:portrait,left:2,top:3},{input:bare,left:0,top:0}]).png().toBuffer();
  const old=await sharp(oldPath).resize(120,160).toBuffer();
  previews.push({input:old,left:index*360,top:20},{input:bare,left:index*360+120,top:20},{input:composite,left:index*360+240,top:20});
  composites.push({input:composite,left:index*120,top:0});
}
await sharp({create:{width:1440,height:190,channels:4,background:'#12140f'}}).composite(previews).png().toFile(path.join(here,'comparison-120px.png'));
await sharp({create:{width:480,height:160,channels:4,background:'#12140f'}}).composite(composites).png().toFile(path.join(here,'preview-120px.png'));
await fs.writeFile(path.join(here,'render-metrics.json'),JSON.stringify(metrics,null,2)+'\n');
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({collection:'role-type-frames-v3',createdAt:'2026-11-13',source:'artifacts/role-type-frames-v3-2026-11-13/source.mjs',method:'Hand-authored SVG paths; one scalable file per type; no raster embeds, text fonts, filters or external dependencies.',palette:{bronze,gold},design:'Thin dark low-contrast rails, soft corners, no central badge, no side/lower ornament; only paired upper category motifs.',usage:'Role index previews only; full and thumbnail fields share the same SVG URL.',frames},null,2)+'\n');
console.log(JSON.stringify({frames:frames.length,runtimeImages:4,bytes:frames.reduce((sum,item)=>sum+item.bytes,0)}));
