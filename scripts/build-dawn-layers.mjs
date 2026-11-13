import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import sharp from 'sharp';

// Bake the approved SVG filters once, with a one-source-pixel sampling guard at warm window edges. Runtime only samples a tiny atlas and moves an image.
const out=resolve('apps/web/public/art/effects/v9');await mkdir(out,{recursive:true});
const bundle=await build({entryPoints:['apps/web/src/components/dawn-arrival-motion.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {dawnTownPlate,dawnWindowRegions}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source=await readFile(resolve('apps/web/public',dawnTownPlate.url.slice(1)));
if(createHash('sha256').update(source).digest('hex')!==dawnTownPlate.sha256)throw new Error('Approved dawn source changed');
const plate='data:image/png;base64,'+(await sharp(source).png().toBuffer()).toString('base64');
const svg=body=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="688" height="1024" viewBox="0 0 688 1024">${body}</svg>`);
const glass=await sharp(svg(`<defs><image id="town" href="${plate}" width="688" height="1024"/><filter id="lit" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3 1 -3 0 -1.1"/><feComponentTransfer><feFuncA type="linear" slope="20"/></feComponentTransfer><feMorphology operator="dilate" radius="1"/></filter><filter id="unlit" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".12"/><feComponentTransfer><feFuncR type="linear" slope=".22"/><feFuncG type="linear" slope=".26"/><feFuncB type="linear" slope=".3"/></feComponentTransfer></filter><mask id="warm" maskUnits="userSpaceOnUse" x="0" y="0" width="688" height="1024" style="mask-type:alpha"><use href="#town" filter="url(#lit)"/></mask></defs><use href="#town" filter="url(#unlit)" mask="url(#warm)"/>`)).png().toBuffer();
const tiles=await Promise.all(dawnWindowRegions.map(async(r,i)=>({input:await sharp(glass).extract({left:r.x,top:r.y,width:r.width,height:r.height}).png().toBuffer(),left:(i%5)*32+1,top:Math.floor(i/5)*24+1})));
await sharp({create:{width:160,height:72,channels:4,background:'#00000000'}}).composite(tiles).webp({lossless:true,effort:6}).toFile(resolve(out,'dawn-window-glass.webp'));
// Original seed/frequency/blur, including the stationary vertical fog envelope. Extra width permits its small drift.
const fog=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="738" height="1024" viewBox="-25 0 738 1024"><defs><linearGradient id="band" x2="0" y2="1"><stop offset=".26" stop-color="#000"/><stop offset=".43" stop-color="#fff"/><stop offset=".82" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="mask" maskUnits="userSpaceOnUse" x="-25" y="0" width="738" height="1024" style="mask-type:luminance"><rect x="-25" width="738" height="1024" fill="url(#band)"/></mask><filter id="fog" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".006 .018" numOctaves="3" seed="29"/><feColorMatrix values="0 0 0 0 .58 0 0 0 0 .64 0 0 0 0 .66 0 0 1.25 0 -.35"/><feGaussianBlur stdDeviation="3"/></filter></defs><g mask="url(#mask)"><rect x="-25" width="738" height="1024" filter="url(#fog)"/></g></svg>`);
await sharp(fog).resize(369,512).webp({lossless:true,effort:6}).toFile(resolve(out,'dawn-mist.webp'));
const layers=[];for(const name of ['dawn-window-glass','dawn-mist']){const data=await readFile(resolve(out,`${name}.webp`)),m=await sharp(data).metadata();layers.push({url:`/art/effects/v9/${name}.webp`,width:m.width,height:m.height,bytes:data.length,decodedBytes:m.width*m.height*4,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(resolve(out,'dawn-layers.json'),JSON.stringify({source:dawnTownPlate,baker:'scripts/build-dawn-layers.mjs',atlas:{columns:5,tileWidth:32,tileHeight:24,padding:1,windowSamplingGuard:1},fog:{seed:29,frequency:[.006,.018],octaves:3,blur:3,scale:.5,maskMovesWithTexture:true},layers},null,2)+'\n');
console.log(JSON.stringify(layers));
