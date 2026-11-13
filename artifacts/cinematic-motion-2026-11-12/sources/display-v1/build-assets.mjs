import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Run from repository root. Generated originals remain byte-for-byte untouched.
const root=process.cwd(),sourceDir=dirname(fileURLToPath(import.meta.url)),out=resolve(root,'apps/web/public/art/display/v1');await mkdir(out,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex'),repoPath=path=>relative(root,path).replaceAll('\\','/'),sources=[],files=[];
for(const phase of ['day','night']){
 const path=resolve(sourceDir,`town-${phase}-source.png`),data=await readFile(path),source=await sharp(data).metadata();
 sources.push({id:phase,path:repoPath(path),width:source.width,height:source.height,bytes:data.length,sha256:sha(data),generator:'built-in image_gen',promptFile:repoPath(resolve(sourceDir,'prompts.json')),promptKey:phase,mode:phase==='day'?'reference-guided landscape generation':'lighting-weather edit of day original',alpha:false});
 for(const width of [1600,2560]){
  const height=width*9/16,name=`town-${phase}${width===1600?'':'-2560'}.webp`,output=resolve(out,name),quality=width===1600?88:92;
  await sharp(data).resize(width,height,{fit:'cover',position:'centre',kernel:'lanczos3'}).webp({quality,effort:6,smartSubsample:true}).toFile(output);
  const bytes=await readFile(output),meta=await sharp(bytes).metadata();
  files.push({id:phase,url:`/art/display/v1/${name}`,path:repoPath(output),width:meta.width,height:meta.height,bytes:bytes.length,decodedBytes:width*height*4,sha256:sha(bytes),sourceSha256:sha(data),upscaled:width>source.width,processing:{resize:'uniform cover to exact 16:9; subpixel height trim only; no stretching, recoloring, compositing or burned UI shade',kernel:'lanczos3',format:'webp',quality,effort:6,smartSubsample:true,metadata:'stripped'},alpha:meta.hasAlpha??false});
 }
}
const references=[];for(const phase of ['dawn','night']){const path=resolve(root,`apps/web/public/art/effects/v5/${phase}-town.webp`),data=await readFile(path);references.push({role:'approved existing style/architecture reference',path:repoPath(path),sha256:sha(data)});}
const manifest={version:1,scope:'TV/public Display route only; never include in phone CSS or shared public/private prewarm lists',aspectRatio:'16:9',generator:'built-in image_gen; no CLI/API fallback',buildCommand:'node artifacts/cinematic-motion-2026-11-12/sources/display-v1/build-assets.mjs',prompts:repoPath(resolve(sourceDir,'prompts.json')),sources,references,files,srcset:Object.fromEntries(['day','night'].map(phase=>[phase,`/art/display/v1/town-${phase}.webp 1600w, /art/display/v1/town-${phase}-2560.webp 2560w`])),visualIntent:{view:'matching elevated gothic clocktower town; clocktower left quarter; bridges and layered roofs retained across day/night',center:'natural low-contrast mist valley for overlaid table; no artificial empty oval',day:'muted antique-gold overcast morning, dark stone and foreground',night:'deep blue-charcoal clouds and fine mist, small amber lamp windows',avoid:'people, readable text, UI, frame, logo, stripes, visible sun/moon discs'},deliveryBoundary:'Assets only. Flow/Root own Display responsive selection and local UI shade. No phone/EventStage/component/CSS/audio change. 2560 outputs are resized derivatives, not native 4K generations.'};
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await writeFile(resolve(sourceDir,'sources.json'),JSON.stringify({generator:manifest.generator,prompts:manifest.prompts,sources,references,opsPolicy:{sha:'964c0ba2357810506ba4d9e883d217f377ea0615',checkedAt:'2026-11-13T13:33:02.772280+00:00',state:'github-main-fetched after one network retry'},runtimeManifest:'apps/web/public/art/display/v1/manifest.json'},null,2)+'\n');
console.log(JSON.stringify({sources,files},null,2));
