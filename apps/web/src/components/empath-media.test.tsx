import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';

test('only the real jewel interiors and independent loose chain change over the fixed heart velvet and candle',async()=>{
 const materials=new Map<string,string>();for(const name of ['empath-heart-base','empath-chain'])materials.set(`/art/effects/v8/${name}.webp`,'data:image/png;base64,'+(await sharp(readFileSync(new URL(`../../public/art/effects/v8/${name}.webp`,import.meta.url))).png().toBuffer()).toString('base64'));
 const chain=await sharp(readFileSync(new URL('../../public/art/effects/v8/empath-chain.webp',import.meta.url))).ensureAlpha().raw().toBuffer(),frame=async(t:number)=>sharp(Buffer.from(renderToStaticMarkup(<LayeredSceneArt role="empath" kind="IDENTITY" elapsedMs={t} resolveAsset={url=>materials.get(url)??url}/>))).flatten({background:'#666666'}).ensureAlpha().raw().toBuffer(),insideGem=(x:number,y:number)=>(Math.abs(x-261)<=21&&Math.abs(y-221)<=27)||(Math.abs(x-380)<=21&&Math.abs(y-217)<=27),nearChain=(x:number,y:number)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(x+dx>=0&&x+dx<600&&y+dy>=0&&y+dy<500&&chain[((y+dy)*600+x+dx)*4+3]!>8)return true;return false;};
 const left=await frame(650),right=await frame(1050),base=await frame(1850),after=await frame(730);let gemChanged=0,red=0,chainMoved=0;const unexpected:{x:number;y:number;delta:number}[]=[];
 for(let y=0;y<500;y++)for(let x=0;x<600;x++){const at=(y*600+x)*4,delta=[0,1,2].reduce((n,ch)=>n+Math.abs(left[at+ch]!-right[at+ch]!),0);if(delta>5){if(!insideGem(x,y)&&!nearChain(x,y))unexpected.push({x,y,delta});if(insideGem(x,y)){gemChanged++;if(base[at]!>base[at+1]!*1.6&&base[at]!>base[at+2]!*1.2)red++;}}if(!insideGem(x,y)&&Math.abs(after[at]!-base[at]!)+Math.abs(after[at+1]!-base[at+1]!)>15)chainMoved++;if(x>=380&&x<415&&y>=88&&y<108)expect(after.subarray(at,at+4)).toEqual(base.subarray(at,at+4));}
 expect(unexpected.slice(0,12)).toEqual([]);expect(gemChanged).toBeGreaterThan(500);expect(red/gemChanged).toBeGreaterThan(.8);expect(chainMoved).toBeGreaterThan(300);
});
