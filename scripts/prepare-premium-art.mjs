import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Copy/encode approved generated art; no model credentials or source cache in Git.
const input=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const out=path.resolve('apps/web/public/art/effects/v3');
await fs.mkdir(out,{recursive:true});
const files=[];
for(const row of input){
 const source=await fs.readFile(row.source),m=await sharp(source).metadata();
 const name=row.id+'.webp',limit=row.id.startsWith('scene-')?1440:row.id==='butler-bow'?2048:900;
 await sharp(source).resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:6}).toFile(path.join(out,name));
 const bytes=await fs.readFile(path.join(out,name));
 files.push({id:row.id,file:name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),sourceWidth:m.width,sourceHeight:m.height,hasAlpha:m.hasAlpha,prompt:row.prompt});
 const atlases={
  'claws-atlas':[2,3,['claw-screen-left','claw-screen-right','claw-avatar-left','claw-avatar-right','claw-dawn','claw-town']],
  'blood-atlas':[2,2,['blood-right','blood-left','blood-burst','blood-stain']],
  'poison-fx-atlas':[2,3,['bubble-single','bubble-cluster','bubble-burst','poison-wisp','poison-cloud','poison-stain']],
  'glass-atlas':[2,2,['glass-hole','glass-cloud','glass-shard','glass-splinters']],
  'guillotine-parts':[2,1,['guillotine-frame','guillotine-blade']],
  'chef-parts':[2,1,['chef-board','chef-cleaver']],
  'washerwoman-parts':[2,1,['washer-tub','washer-cloth']],
 };
 const atlas=atlases[row.id];
 if(atlas)for(const [i,id]of atlas[2].entries()){
  const [cols,rows]=atlas,x=Math.round(i%cols*m.width/cols),y=Math.round(Math.floor(i/cols)*m.height/rows);
  const file=id+'.webp';await sharp(source).extract({left:x,top:y,width:Math.round((i%cols+1)*m.width/cols)-x,height:Math.round((Math.floor(i/cols)+1)*m.height/rows)-y}).resize({width:700,height:700,fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100,effort:6}).toFile(path.join(out,file));
  const b=await fs.readFile(path.join(out,file));files.push({id,file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),derivedFrom:row.id,cell:i,columns:cols,rows});
 }
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({version:3,generator:'built-in image_gen',files},null,2)+'\n');
console.log(JSON.stringify({count:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)}));
