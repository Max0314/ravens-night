import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {lanternDetailPose,candleDetailPose} from './role-detail-motion.js';

async function frame(role:string,t:number,reduced=false){let markup=renderToStaticMarkup(<LayeredSceneArt role={role} kind="IDENTITY" elapsedMs={t} reducedMotion={reduced}/>);for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer();}
const region=(data:Buffer,x:number,y:number,w:number,h:number)=>Buffer.concat(Array.from({length:h},(_,i)=>data.subarray(((y+i)*600+x)*4,((y+i)*600+x+w)*4)));
test('the lamp settles at its fixed contact phase and the three real flames flicker independently',()=>{
 expect(lanternDetailPose(350).angle).toBe(0);expect(Math.abs(lanternDetailPose(650).angle)).toBeGreaterThan(3);expect(lanternDetailPose(3000).angle).toBe(0);expect(lanternDetailPose(0,true)).toEqual(lanternDetailPose(4000,true));
 expect(candleDetailPose(1000,0).scaleY).not.toBe(candleDetailPose(1000,1).scaleY);expect(candleDetailPose(649,0).wax).toBe(0);expect(candleDetailPose(1900,2).wax).toBe(1);expect(candleDetailPose(0,0,true)).toEqual(candleDetailPose(4000,0,true));
});
test('real door planks and the oath book remain pixel-still while their attached light layers move',async()=>{
 const door0=await frame('recluse',0),door650=await frame('recluse',650);expect(region(door0,305,180,90,140)).toEqual(region(door650,305,180,90,140));let moving=0;for(let y=150;y<400;y++)for(let x=135;x<300;x++){const i=(y*600+x)*4;if(Math.abs(door0[i]!-door650[i]!)+Math.abs(door0[i+1]!-door650[i+1]!)>15)moving++;}expect(moving).toBeGreaterThan(2000);
 const book0=await frame('saint',0),book1200=await frame('saint',1200);expect(region(book0,120,365,80,95)).toEqual(region(book1200,120,365,80,95));for(const [x,y,w,h] of [[224,85,16,33],[306,25,16,48],[390,145,14,20]]){let alpha=0;for(let j=y!;j<y!+h!;j++)for(let i=x!;i<x!+w!;i++)if(book1200[(j*600+i)*4+3]!>50)alpha++;expect(alpha).toBeGreaterThan(20);}
});
test('ambient identities add no disclosure and missing real flame layers cannot become old paper or fake fire',()=>{
 for(const role of ['recluse','saint']){const markup=renderToStaticMarkup(<LayeredSceneArt role={role} kind="IDENTITY" elapsedMs={1200}/>);expect(markup).not.toContain('data-projection');expect(markup).not.toContain('book-paper.webp');}
 const missing=renderToStaticMarkup(<LayeredSceneArt role="saint" kind="IDENTITY" elapsedMs={1200} readyAssets={new Set(['/art/effects/v8/saint-candle-base.webp'])}/>);expect(missing).not.toContain('data-saint-candles');
});
