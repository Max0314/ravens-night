// Explicit source rectangles only; never divide an atlas by guessed cell counts.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'apps/web/public/art/effects/v4');
const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
fs.mkdirSync(out,{recursive:true});
const files=[];
for(const row of spec){
 const src=fs.readFileSync(row.source),meta=await sharp(src).metadata();
 const crop={left:0,top:0,...row.rect};crop.width??=meta.width-crop.left;crop.height??=meta.height-crop.top;
 let input=src;
 if(row.keepRects){const mask=Buffer.from(`<svg width="${meta.width}" height="${meta.height}">${row.keepRects.map(r=>`<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" fill="white"/>`).join('')}</svg>`);input=await sharp(input).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();}
 // Materialise the crop before trim: libvips otherwise reorders trim/extract.
 let image=sharp(await sharp(input).extract(crop).ensureAlpha().png().toBuffer());
 if(row.trim!==false)image=image.trim({threshold:5,background:'#00000000'});
 const edge=(row.max??1024)-16;
 const data=await image.resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).extend({top:8,bottom:8,left:8,right:8,background:'#00000000'}).webp({quality:94,alphaQuality:100,effort:6}).toBuffer();
 const final=await sharp(data).metadata(),file=row.id+'.webp';
 fs.writeFileSync(path.join(out,file),data);
 files.push({id:row.id,file,width:final.width,height:final.height,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),sourceSha256:createHash('sha256').update(src).digest('hex'),source:path.basename(row.source),sourceRect:crop,keepRects:row.keepRects,prompt:row.prompt,processing:'Explicit source rectangle; optional atlas isolation mask; trim transparent margin; one uniform scale; preserve alpha; 8px transparent safe border',...row.anchor?{anchor:row.anchor}:{}});
}
fs.writeFileSync(path.join(out,spec[0]?.manifest??'root-sources.json'),JSON.stringify({generator:'built-in image_gen',files},null,2)+'\n');
process.stdout.write(JSON.stringify(files.map(({id,width,height,bytes})=>({id,width,height,bytes})),null,2)+'\n');
