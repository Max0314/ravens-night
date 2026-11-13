// Offline SVG review of the actual runtime component. No browser or duplicate animation.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const webRequire=createRequire(resolve('apps/web/package.json'));
const out=resolve('artifacts/cinematic-motion-2026-11-12/private');await mkdir(out,{recursive:true});
const bundle=resolve(out,'renderer.mjs');
await build({stdin:{contents:`export {LayeredSceneArt} from './apps/web/src/components/LayeredSceneArt.tsx';`,resolveDir:process.cwd(),loader:'tsx'},outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},jsx:'automatic',plugins:[{name:'web-react',setup(build){build.onResolve({filter:/^react(?:\/|$)/},args=>({path:pathToFileURL(webRequire.resolve(args.path)).href,external:true}));}}]});
const {LayeredSceneArt}=await import(pathToFileURL(bundle).href);const {createElement}=webRequire('react');const {renderToStaticMarkup}=webRequire('react-dom/server');const {default:sharp}=await import('sharp');
const assets=new Map();async function material(url){if(assets.has(url))return;try{const data=await sharp(await readFile(resolve('apps/web/public',url.slice(1)))).png().toBuffer();assets.set(url,`data:image/png;base64,${data.toString('base64')}`);}catch{assets.set(url,'data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'));}}
const scenes=[['librarian',[0,850,1000,1150,1250,1400,1550,1950]],['spy',[0,850,1000,1150,1250,1400,1850,2300]],['undertaker',[0,650,1100,1600,1950]],['washerwoman',[0,800,1300,1850,2300]],['chef',[400,650,700,880,1000,1050,1350,1400,1900]],['fortune_teller',[0,800,1400,1900,2300]],['poisoner',[0,700,1000,1300,1700,2200]],['drunk',[0,700,900,1900,2200,2600]],['ravenkeeper',[0,700,1000,1500,2000]],['scarlet_woman',[0,700,1150,1750,1900,2200]],['investigator',[0,700,1100,1400,2000]],['empath',[0,700,1000,1300,2100]],['virgin',[0,800,1200,1800]],['mayor',[0,700,850,1200,1650,2100]],['monk',[0,700,725,800,1050,1600]],['soldier',[0,700,725,800,1050,1600]],['sealed-letter',[0,650,900,1100,1450,1800,2150,2500]]];
const framesOnly=process.argv.includes('--frames-only'),chosen=process.argv.slice(2).filter(value=>!value.startsWith('--'));for(const [role,times] of scenes){if(chosen.length&&!chosen.includes(role))continue;
 const props=t=>({role,kind:role==='sealed-letter'?'EVIL_START':role==='poisoner'?'ACTION_SUBMITTED':'INFORMATION',elapsedMs:t,...(t>=(role==='spy'||role==='fortune_teller'?2200:1900)?{imprint:{label:role==='undertaker'?'你看到的身份：士兵':'二人中有一位是镇长',value:role==='fortune_teller'?'YES':undefined,marks:[{label:'玩家2-史泰龙',detail:'镇长'},{label:'玩家3-皮卡丘',detail:'镇长'}]}}:{}),resolveAsset:url=>assets.get(url)??url});
 for(const at of [...times,2400]){const inspect=renderToStaticMarkup(createElement(LayeredSceneArt,props(at)));for(const match of inspect.matchAll(/href="(\/[^\"]+)"/g))await material(match[1]);}
 async function raster(t,bg){const svg=renderToStaticMarkup(createElement(LayeredSceneArt,props(t)));return sharp(Buffer.from(svg)).flatten({background:bg}).png().toBuffer();}
 for(const bg of ['#090b09','#666666']){const frames=[];for(const t of times)frames.push(await sharp(await raster(t,bg)).resize(300,250).png().toBuffer());const contact=await sharp({create:{width:300*frames.length,height:280,channels:4,background:bg}}).composite(frames.map((input,i)=>({input,left:i*300,top:25}))).png().toBuffer();await writeFile(resolve(out,`${role}-${bg==='#090b09'?'black':'gray'}.png`),contact);}
 if(framesOnly){await writeFile(resolve(out,`${role}-frames.json`),JSON.stringify({renderer:'LayeredSceneArt',method:'renderToStaticMarkup + embedded PNG material + sharp; current contact sheets only (no browser)',times},null,2));continue;}
 const frames=[];for(let t=0;t<=3000;t+=1000/12)frames.push(await sharp(await raster(t,'#090b09')).resize(300,250).ensureAlpha().raw().toBuffer());await sharp(Buffer.concat(frames),{raw:{width:300,height:250*frames.length,channels:4,pageHeight:250}}).gif({delay:83,loop:0}).toFile(resolve(out,`${role}.gif`));
 await writeFile(resolve(out,`${role}-frames.json`),JSON.stringify({renderer:'LayeredSceneArt',method:'renderToStaticMarkup + embedded local raster images + sharp (no browser)',times,frames:frames.length},null,2));
}
await unlink(bundle);console.log(out);
