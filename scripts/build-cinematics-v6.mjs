// November13 review revision: true bird-head grip and broad physical frame.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'artifacts/cinematic-motion-2026-11-12/sources/nov13-v6'),out=path.join(root,'apps/web/public/art/effects/v6');
await fs.mkdir(out,{recursive:true});
const spec=JSON.parse(await fs.readFile(path.join(source,'spec.json'),'utf8')),files=[];
for(const row of spec){const input=await fs.readFile(path.join(source,row.file));let image=sharp(input).ensureAlpha();if(row.clearCircle){const {data,info}=await image.raw().toBuffer({resolveWithObject:true}),{cx,cy,r}=row.clearCircle;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]<row.alphaFloor||(x-cx)**2+(y-cy)**2<=r*r)data[i+3]=0;}image=sharp(data,{raw:{width:info.width,height:info.height,channels:4}});}if(row.trim)image=image.trim({background:'#00000000',threshold:5});
const data=await image.resize({width:1008,height:1008,fit:'inside',withoutEnlargement:true}).extend({top:8,bottom:8,left:8,right:8,background:'#00000000'}).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();await fs.writeFile(path.join(out,row.id+'.webp'),data);const meta=await sharp(data).metadata();files.push({...row,width:meta.width,height:meta.height,sha256:createHash('sha256').update(data).digest('hex'),sourceSha256:createHash('sha256').update(input).digest('hex'),processing:'Uniform fit within1008; 8px transparent safe border; preserve alpha; no stretch'});}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({generator:'built-in image_gen; scripts/build-cinematics-v6.mjs',files},null,2)+'\n');console.log(files.map(({id,width,height})=>({id,width,height})));
