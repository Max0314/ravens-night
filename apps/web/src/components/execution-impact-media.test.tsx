import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {ExecutionBloodScreen} from './SharpEffects.js';
test('actual reused blood textures reach both screen sides and lower area in portrait and landscape',async()=>{
 for(const [width,height] of [[320,568],[844,390]])for(const reduced of [false,true]){
  let svg=renderToStaticMarkup(<ExecutionBloodScreen elapsedMs={1250} resultAt={1000} death empty={false} resultVisible reduced={reduced}/>).replace('<svg ',`<svg width="${width}" height="${height}" `);
  for(const match of [...svg.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();svg=svg.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}
  const {data}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=0,right=0,bottom=0;
  for(let y=0;y<height!;y++)for(let x=0;x<width!;x++){const i=(y*width!+x)*4;if(data[i+3]!>100&&data[i]!>80&&data[i]!>data[i+1]!*2){if(x<width!*.25)left++;if(x>width!*.75)right++;if(y>height!*.75)bottom++;}}
  expect(left).toBeGreaterThan(100);expect(right).toBeGreaterThan(100);expect(bottom).toBeGreaterThan(100);
 }
});
