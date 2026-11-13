import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const faces=process.argv.includes('--faces-20261113');
const root=path.resolve(import.meta.dirname,'..'),src=path.join(root,faces?'artifacts/character-production-b-faces-2026-11-13/originals':'artifacts/character-production-b-revisions-2026-11-12/originals'),out=path.join(root,faces?'apps/web/public/assets/ravens/portraits-b-v4':'apps/web/public/assets/ravens/portraits-b-v3');
await fs.mkdir(out,{recursive:true});const portraits=[];
for(const [id,file] of faces?[['undertaker','undertaker.png'],['monk','monk.png']]:[['spy','spy.png'],['virgin','virgin.png']]){
 const data=await fs.readFile(path.join(src,file)),meta=await sharp(data).metadata(),variants=[];
 if(faces&&(meta.width<960||meta.width*4!==meta.height*3))throw new Error(`${id}: expected 3:4 source at least 960px wide`);
 for(const [suffix,width,quality] of [['',960,88],['-small',240,80]]){const name=id+suffix+'.webp',info=await sharp(data).rotate().resize({width,withoutEnlargement:true}).webp({quality,effort:6}).toFile(path.join(out,name)),bytes=await fs.readFile(path.join(out,name));variants.push({file:name,width:info.width,height:info.height,sha256:createHash('sha256').update(bytes).digest('hex')});}
 portraits.push({id,source:file,sourceSha256:createHash('sha256').update(data).digest('hex'),sourceWidth:meta.width,sourceHeight:meta.height,processing:'Encode full image at native aspect ratio; no painting, cropping, reframing or recolouring. Existing UI crop remains.',variants});
}
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({collection:faces?'gothic-b-faces-v4':'gothic-b-revisions-v3',selectedAt:faces?'2026-11-13':'2026-11-12',portraits},null,2)+'\n');console.log(JSON.stringify({portraits:portraits.length,images:4}));
