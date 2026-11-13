import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const here=import.meta.dirname,root=path.resolve(here,'../..');
const out=path.join(root,'apps/web/public/assets/ravens/frames-a-v1');
const spec=JSON.parse(await fs.readFile(path.join(here,'final-prompts.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const frames=[],allRoles=new Set();
await fs.mkdir(out,{recursive:true});
for(const frame of spec.frames){
  const source=await fs.readFile(path.join(here,'originals',frame.id+'.png'));
  const meta=await sharp(source).metadata();
  assert(meta.hasAlpha&&meta.width>=960&&meta.width*4===meta.height*3,`${frame.id}: expected RGBA 3:4 source`);
  const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=(x,y)=>data[(y*info.width+x)*4+3];
  assert.equal(alpha(Math.floor(info.width/2),Math.floor(info.height/2)),0,`${frame.id}: centre must be empty`);
  let centralMax=0;
  for(let y=Math.ceil(info.height*.32);y<info.height*.9;y++)for(let x=Math.ceil(info.width*.15);x<info.width*.85;x++)centralMax=Math.max(centralMax,alpha(x,y));
  assert(centralMax<=1,`${frame.id}: unexpected paint in central aperture`);
  const variants=[];
  for(const format of ['png','webp']){
    const file=frame.id+'.'+format;
    const encoded=sharp(source).resize({width:960});
    if(format==='png')encoded.png({compressionLevel:9});else encoded.webp({lossless:true,effort:6});
    const result=await encoded.toFile(path.join(out,file));
    const bytes=await fs.readFile(path.join(out,file));
    variants.push({file,width:result.width,height:result.height,bytes:bytes.length,sha256:sha(bytes)});
  }
  const sources=[];
  for(const role of frame.roles){
    assert(!allRoles.has(role),`duplicate source classification: ${role}`);allRoles.add(role);
    const relative=`artifacts/character-production-a-2026-09-29/originals/${role}.png`;
    sources.push({role,file:relative,sha256:sha(await fs.readFile(path.join(root,relative)))});
  }
  frames.push({id:frame.id,name:frame.name,structure:frame.structure,roles:frame.roles,styleReference:`artifacts/character-production-a-2026-09-29/originals/${frame.reference}.png`,historicalSources:sources,source:`artifacts/independent-frames-2026-11-13/originals/${frame.id}.png`,sourceSha256:sha(source),sourceWidth:meta.width,sourceHeight:meta.height,sourceCentreAlpha:0,sourceCentralRegionMaxAlpha:centralMax,variants});
}
assert.equal(allRoles.size,22,'expected all 22 historical roles exactly once');
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({collection:'historical-a-independent-frames-v1',createdAt:'2026-11-13',tool:'built-in image_gen',sourceRevision:'9a07e75',processing:'Whole-image proportional resize and lossless encoding; original alpha preserved. New complete painted reconstruction, not a pixel extraction of old portraits.',aspectRatio:'3:4',integration:'Independent overlay art only; not enabled in UI here. Use one frame overlay, avoid an additional decorative CSS border. Player avatars and town dead-seat frames are outside this collection.',frames},null,2)+'\n');
console.log(JSON.stringify({frames:frames.length,historicalRoles:allRoles.size,images:6}));
