import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';

test('chef twelve and empath two render large complete digits within their actual prop canvas',async()=>{
 async function frame(role:string,value?:string){let markup=renderToStaticMarkup(<LayeredSceneArt role={role} kind="INFORMATION" elapsedMs={2300} imprint={{label:'',...(value?{value}:{})}}/>);for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return sharp(Buffer.from(markup)).flatten({background:'#666666'}).ensureAlpha().raw().toBuffer();}
 for(const [role,value] of [['chef','12'],['empath','2']] as const){const actual=await frame(role,value),empty=await frame(role);let left=600,right=0,top=500,bottom=0;for(let y=0;y<500;y++)for(let x=0;x<600;x++){const i=(y*600+x)*4;if([0,1,2].reduce((n,ch)=>n+Math.abs(actual[i+ch]!-empty[i+ch]!),0)>15){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
  expect(bottom-top).toBeGreaterThanOrEqual(27);expect(right-left).toBeGreaterThanOrEqual(value==='12'?34:16);expect(left).toBeGreaterThan(250);expect(right).toBeLessThan(350);expect(top).toBeGreaterThan(375);expect(bottom).toBeLessThan(490);
 }
});
