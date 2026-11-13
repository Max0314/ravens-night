// Rebuild only the November 13 independent prop/background assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'artifacts/cinematic-motion-2026-11-12/sources/nov13'),out=path.join(root,'apps/web/public/art/effects/v5');
await fs.mkdir(out,{recursive:true});
const spec=JSON.parse(await fs.readFile(path.join(source,'spec.json'),'utf8')),files=[];
for(const row of spec){const input=await fs.readFile(path.join(source,row.file));let image=sharp(input).ensureAlpha();if(row.trim)image=image.trim({background:'#00000000',threshold:5});
const data=await image.resize({width:1008,height:1008,fit:'inside',withoutEnlargement:true}).extend({top:8,bottom:8,left:8,right:8,background:row.opaque?'#0a0808':'#00000000'}).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();await fs.writeFile(path.join(out,row.id+'.webp'),data);const meta=await sharp(data).metadata();files.push({...row,width:meta.width,height:meta.height,sha256:createHash('sha256').update(data).digest('hex'),sourceSha256:createHash('sha256').update(input).digest('hex'),processing:'Uniform fit within1008; 8px safe border; no stretching; preserve alpha'});}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({generator:'built-in image_gen; scripts/build-cinematics-v5.mjs',files},null,2)+'\n');
console.log(files.map(({id,width,height})=>({id,width,height})));
