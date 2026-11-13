import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';

test('only the two real jewel interiors brighten while the original chain velvet and candle stay fixed',async()=>{
 const material='data:image/png;base64,'+(await sharp(readFileSync(new URL('../../public/art/effects/v3/empath.webp',import.meta.url))).png().toBuffer()).toString('base64'),frame=async(t:number)=>sharp(Buffer.from(renderToStaticMarkup(<LayeredSceneArt role="empath" kind="IDENTITY" elapsedMs={t} resolveAsset={()=>material}/>))).ensureAlpha().raw().toBuffer();
 const left=await frame(650),right=await frame(1050),base=await frame(1850);let changed=0,red=0;
 for(let y=0;y<500;y++)for(let x=0;x<600;x++){const at=(y*600+x)*4,delta=[0,1,2].reduce((n,ch)=>n+Math.abs(left[at+ch]!-right[at+ch]!),0);if(delta>5){changed++;expect((x>=233&&x<=277&&y>=210&&y<=270)||(x>=366&&x<=410&&y>=202&&y<=265)).toBe(true);if(base[at]!>base[at+1]!*1.6&&base[at]!>base[at+2]!*1.2)red++;}}
 expect(changed).toBeGreaterThan(500);expect(red/changed).toBeGreaterThan(.8);
});
