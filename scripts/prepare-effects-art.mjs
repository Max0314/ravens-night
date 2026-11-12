import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Inputs are the three original PNGs returned by the built-in imagegen tool.
const inputs=process.argv.slice(2);
if(inputs.length!==3)throw Error('Usage: node scripts/prepare-effects-art.mjs demon.png butler.png evil-town.png');
const root=path.resolve(import.meta.dirname,'../apps/web/public/art/effects/v1');
await fs.mkdir(root,{recursive:true});
const names=['demon-wings','butler','evil-town'];
const sizes=[{width:1600,height:1000},{width:960,height:1440},{width:960,height:1710}];
const records=[];
for(const [i,source]of inputs.entries()){
 const info=await sharp(source).metadata();
 if(i<2&&!info.hasAlpha)throw Error(`${names[i]} must retain the generated alpha channel`);
 const dest=path.join(root,names[i]+'.webp');
 await sharp(source).resize({...sizes[i],fit:'inside',withoutEnlargement:true}).webp({quality:i===2?84:88,alphaQuality:100,effort:6}).toFile(dest);
 const bytes=await fs.readFile(dest),meta=await sharp(bytes).metadata();
 const {data,info:raw}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let transparent=0,opaque=0;
 for(let n=3;n<data.length;n+=raw.channels){if(data[n]===0)transparent++;if(data[n]===255)opaque++;}
 if(i<2&&(transparent===0||opaque===0))throw Error(`${names[i]} alpha must contain both transparent background and visible subject`);
 records.push({file:names[i]+'.webp',bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,transparentPixels:transparent,opaquePixels:opaque,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),originalSha256:crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')});
}
await fs.writeFile(path.join(root,'files.json'),JSON.stringify({version:1,generatedBy:'Built-in imagegen; resized and encoded with sharp, no creative image edits',files:records},null,2)+'\n');
console.log(JSON.stringify(records,null,2));
