import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=join(root,'apps/web/public/assets/ravens/role-type-frames-v4'),art=fileURLToPath(new URL('./',import.meta.url));
const require=createRequire(new URL('../../package.json',import.meta.url)),sharp=require('sharp');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
  <title>Shared inset double-line dark gold arch</title>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 120A117 117 0 0 1 237 120V302Q237 317 222 317H18Q3 317 3 302Z" stroke="#51452f" stroke-width="1.2" opacity=".85"/>
    <path d="M8 120A112 112 0 0 1 232 120V299Q232 312 219 312H21Q8 312 8 299Z" stroke="#786344" stroke-width="1.35" opacity=".78"/>
  </g>
</svg>
`;
await mkdir(out,{recursive:true});await writeFile(join(out,'arch.svg'),svg);
const sha256=createHash('sha256').update(svg).digest('hex');
await writeFile(join(out,'manifest.json'),JSON.stringify({collection:'role-type-frames-v4',createdAt:'2026-11-13',source:'artifacts/role-type-frames-v4-2026-11-13/source.mjs',usage:'One shared inset frame, role index previews only. Full and thumbnail fields use the same immutable URL.',palette:{outer:'#51452f',inner:'#786344'},geometry:{upper:'Concentric semicircles centered at (120,120), radii 117/112',lower:'v3 double rails and soft bottom corners retained',portraitClip:'Guide-only CSS border-radius 50% 50% 6.666667% 6.666667% / 37.5% 37.5% 5% 5% on a 3:4 image'},frames:[{id:'arch',file:'arch.svg',width:240,height:320,scalable:true,bytes:Buffer.byteLength(svg),sha256}]},null,2)+'\n');
// Offline silhouette matches that CSS geometry: top radius 120, lower radius 16.
const silhouette='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><path d="M0 120A120 120 0 0 1 240 120V304Q240 320 224 320H16Q0 320 0 304Z" fill="white"/></svg>';
const frame=await sharp(Buffer.from(svg)).resize(120,160).png().toBuffer(),mask=await sharp(Buffer.from(silhouette)).resize(120,160).png().toBuffer();
const roles=[['town','washerwoman-small.webp'],['outsider','butler-small.webp'],['minion','poisoner-approved-20261112-small.webp'],['demon','imp-small.webp']];
const parts=[{input:frame,left:10,top:25}],samples=[];
for(let i=0;i<roles.length;i++){
  const [name,file]=roles[i],portrait=await sharp(join(root,'apps/web/public/assets/ravens/portraits-b-v2',file)).resize(120,160).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  const combined=await sharp(portrait).composite([{input:frame}]).png().toBuffer(),raw=await sharp(combined).raw().toBuffer({resolveWithObject:true});
  const alpha=(x,y)=>raw.data[(y*120+x)*raw.info.channels+3];
  if(alpha(0,0)!==0||alpha(119,0)!==0||alpha(1,8)!==0||alpha(60,3)===0)throw Error('Arch silhouette regression: '+name);
  samples.push({name,cornerAlpha:[alpha(0,0),alpha(119,0)],topCenterAlpha:alpha(60,3)});parts.push({input:combined,left:140+i*130,top:25});
}
const labels='<svg xmlns="http://www.w3.org/2000/svg" width="660" height="195"><g fill="#b8a47b" font-family="sans-serif" font-size="12"><text x="10" y="16">shared v4</text>'+roles.map(([name],i)=>`<text x="${140+i*130}" y="16">${name}</text>`).join('')+'</g></svg>';
parts.push({input:Buffer.from(labels),left:0,top:0});
await sharp({create:{width:660,height:195,channels:4,background:'#12140f'}}).composite(parts).png().toFile(join(art,'preview-120px.png'));
const naked=await sharp(frame).raw().toBuffer({resolveWithObject:true});let maxLuma=0,painted=0;
for(let i=0;i<naked.data.length;i+=4){const a=naked.data[i+3]/255;if(!a)continue;painted++;const luma=(.2126*naked.data[i]+.7152*naked.data[i+1]+.0722*naked.data[i+2])*a+(18*.2126+20*.7152+15*.0722)*(1-a);maxLuma=Math.max(maxLuma,luma);}
await writeFile(join(art,'render-metrics.json'),JSON.stringify({method:'sharp/librsvg only, no browser; 120x160 frame and image silhouette',frameSha256:sha256,maxFrameLumaOnDark:Math.round(maxLuma*100)/100,paintedPixels:painted,samples},null,2)+'\n');
process.stdout.write(JSON.stringify({sha256,bytes:Buffer.byteLength(svg),maxFrameLumaOnDark:Math.round(maxLuma*100)/100})+'\n');
