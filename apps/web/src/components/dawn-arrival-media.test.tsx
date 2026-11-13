import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {DawnSkyArt} from './DawnSkyArt.js';
import {dawnTownPlate,dawnWindowRegions} from './dawn-arrival-motion.js';

const source=readFileSync(new URL(`../../public${dawnTownPlate.url}`,import.meta.url));
test('every window sample is a real warm pixel on the unchanged approved town plate',async()=>{
 expect(createHash('sha256').update(source).digest('hex')).toBe(dawnTownPlate.sha256);const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect([info.width,info.height]).toEqual([688,1024]);for(const area of dawnWindowRegions){const i=(area.sample.y*688+area.sample.x)*4;expect((3*data[i]!+data[i+1]!-3*data[i+2]!)/255-1.1).toBeGreaterThan(.05);expect(data[i+3]).toBeGreaterThan(200);}
});
test('real window light fades at the same cover-cropped pixels in phone portrait and landscape',async()=>{
 const material='data:image/png;base64,'+(await sharp(source).png().toBuffer()).toString('base64');
 async function frame(t:number,width:number,height:number){const svg=renderToStaticMarkup(<DawnSkyArt elapsedMs={t} durationMs={6600}/>).replace('width="100%" height="100%"',`width="${width}" height="${height}"`).replace(`href="${dawnTownPlate.url}"`,`href="${material}"`);return sharp(Buffer.from(svg)).flatten({background:'#101619'}).ensureAlpha().raw().toBuffer();}
 for(const [width,height] of [[320,640],[640,360]]){const first=await frame(0,width!,height!),last=await frame(6600,width!,height!),scale=Math.max(width!/688,height!/1024),at=(x:number,y:number)=>({x:Math.floor((width!-688*scale)/2+(x+.5)*scale),y:Math.floor((y+.5)*scale)}),warm=(pixels:Buffer,x:number,y:number)=>{const i=(y*width!+x)*4;return pixels[i]!+pixels[i+1]!-2*pixels[i+2]!;};
  for(const sample of [{x:245,y:319},{x:499,y:375}]){const p=at(sample.x,sample.y),before=warm(first,p.x,p.y),after=warm(last,p.x,p.y);expect(before).toBeGreaterThan(15);expect(after,JSON.stringify({width,height,sample,p,before,after,first:[...first.subarray((p.y*width!+p.x)*4,(p.y*width!+p.x)*4+4)],last:[...last.subarray((p.y*width!+p.x)*4,(p.y*width!+p.x)*4+4)]})).toBeLessThan(before*.7);}
  const horizon=at(340,260);expect(warm(last,horizon.x,horizon.y)).toBeGreaterThan(warm(first,horizon.x,horizon.y));
 }
});
