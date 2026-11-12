// Actual production SVG components, embedded local PNGs, sharp only. No browser.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=process.cwd(),webRequire=createRequire(resolve('apps/web/package.json'));
const out=resolve('artifacts/cinematic-motion-2026-11-12/public');await mkdir(out,{recursive:true});
const bundle=resolve(out,'renderer.mjs');
await build({stdin:{contents:`export {HuntingRifleScene,DemonLayers} from './apps/web/src/components/CinematicPublicArt.tsx';export {GuillotineMechanism,ResultBlood} from './apps/web/src/components/SharpEffects.tsx';export {VictoryArt} from './apps/web/src/components/effects-art.tsx';export {rifleGeometry,demonGeometry,guillotineGeometry} from './apps/web/src/components/public-motion.ts';`,resolveDir:root,loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},jsx:'automatic',plugins:[{name:'web-react',setup(build){build.onResolve({filter:/^react(?:\/|$)/},args=>({path:pathToFileURL(webRequire.resolve(args.path)).href,external:true}));}}]});
const c=await import(pathToFileURL(bundle).href),{createElement}=webRequire('react'),{renderToStaticMarkup}=webRequire('react-dom/server'),{default:sharp}=await import('sharp');
const images=new Map();
async function svg(component,props){let text=renderToStaticMarkup(createElement(component,props));for(const match of text.matchAll(/href="(\/[^\"]+)"/g)){const url=match[1];if(!images.has(url)){const data=await sharp(await readFile(resolve('apps/web/public',url.slice(1)))).png().toBuffer();images.set(url,`data:image/png;base64,${data.toString('base64')}`);}text=text.replaceAll(`href="${url}"`,`href="${images.get(url)}"`);}return text.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');}
const scenes=[
 ['rifle',c.HuntingRifleScene,t=>({elapsedMs:t,fireAt:850}),[600,840,850,878,920,1150,1800],2200,300,250],
 ['demon',c.DemonLayers,t=>({elapsedMs:t}),[0,450,600,850,1100,1450,1750],2700,300,250],
 ['execution',c.GuillotineMechanism,t=>({elapsedMs:t,resultAt:1200,empty:false}),[0,850,900,1050,1190,1200,1320],2200,180,288],
 ['empty-execution',c.GuillotineMechanism,t=>({elapsedMs:t,resultAt:1200,empty:true}),[0,900,1200,2300],2700,180,288],
 ['good-victory',c.VictoryArt,t=>({elapsedMs:t,winner:'GOOD',cause:'DEMON'}),[0,500,1100,2100,3200],3600,300,250],
 ['evil-victory',c.VictoryArt,t=>({elapsedMs:t,winner:'EVIL',cause:'DEMON'}),[0,600,1100,2200,3600],3600,300,250],
 ['execution-blood',c.ResultBlood,t=>({elapsedMs:1200+t,resultAt:1200}),[0,10,80,160,400],1500,300,240],
];
const onlyFrames=process.argv.includes('--frames-only');
const selected=process.argv.slice(2).filter(value=>!value.startsWith('--'));
for(const [name,component,props,times,end,w,h] of scenes){
 if(selected.length&&!selected.includes(name))continue;
 async function raster(t,bg){return sharp(Buffer.from(await svg(component,props(t)))).resize(w,h).flatten({background:bg}).png().toBuffer();}
 for(const bg of ['#090b09','#666666']){const frames=[];for(const t of times)frames.push(await raster(t,bg));await sharp({create:{width:w*frames.length,height:h+28,channels:4,background:bg}}).composite(frames.map((input,i)=>({input,left:i*w,top:28}))).png().toFile(resolve(out,`${name}-${bg==='#090b09'?'black':'gray'}.png`));}
 if(!onlyFrames){const frames=[];for(let t=0;t<=end;t+=62.5)frames.push(await sharp(await raster(t,'#090b09')).ensureAlpha().raw().toBuffer());await sharp(Buffer.concat(frames),{raw:{width:w,height:h*frames.length,channels:4,pageHeight:h}}).gif({delay:63,loop:0}).toFile(resolve(out,`${name}.gif`));}
}
await writeFile(resolve(out,'review.json'),JSON.stringify({method:'Production React SVGs -> renderToStaticMarkup -> local WebP decoded to embedded PNG -> sharp; no browser, no duplicate motion model',scope:'Material SVG art only; HTML avatars/header/footer/safe-area are covered by DOM/CSS checks, not represented as a browser screenshot',rifle:c.rifleGeometry,demon:c.demonGeometry,guillotine:c.guillotineGeometry,scenes:scenes.map(([name,, ,times,end])=>({name,times,end}))},null,2));
await unlink(bundle);console.log(out);
