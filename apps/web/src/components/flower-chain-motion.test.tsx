import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {flowerPetalPoint,ribbonMaterialPoint,virginBind,empathChainPoint} from './role-detail-motion.js';

test('outer petals unfold before the inner layer while stem and ribbon attachment remain fixed',()=>{
 const outer={x:150,y:102},inner={x:200,y:205};expect(flowerPetalPoint(outer,650)).not.toEqual(flowerPetalPoint(outer,0));expect(flowerPetalPoint(inner,650)).toEqual(flowerPetalPoint(inner,0));expect(flowerPetalPoint(inner,1750)).toEqual(inner);
 for(const t of [0,650,1200,1750,2200]){expect(flowerPetalPoint(virginBind.stem,t)).toEqual(virginBind.stem);expect(flowerPetalPoint(virginBind.tip,t)).toEqual(virginBind.tip);expect(ribbonMaterialPoint(virginBind.ribbon,t)).toEqual(virginBind.ribbon);}
 expect(flowerPetalPoint(outer,0,true)).toEqual(outer);
});
test('the true loose chain keeps both original bail connections and moves only its hanging part',()=>{
 for(const t of [0,650,730,1050,1130,1850])for(const end of [{x:388,y:93},{x:406,y:96}])expect(empathChainPoint(end,t)).toEqual(end);
 expect(empathChainPoint({x:300,y:348},730)).not.toEqual({x:300,y:348});expect(empathChainPoint({x:300,y:348},1850)).toEqual({x:300,y:348});
});
test('the real document stays pixel-still as the separate flower and embroidered ribbon unfold',async()=>{
 async function frame(t:number){let markup=renderToStaticMarkup(<LayeredSceneArt role="virgin" kind="IDENTITY" elapsedMs={t}/>);for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer();}
 const early=await frame(0),open=await frame(1200);let moving=0;for(let y=0;y<500;y++)for(let x=0;x<600;x++){const i=(y*600+x)*4;if(x>=350&&x<450&&y>=405&&y<440)expect(early.subarray(i,i+4)).toEqual(open.subarray(i,i+4));if(y<300&&Math.abs(early[i]!-open[i]!)+Math.abs(early[i+1]!-open[i+1]!)>15)moving++;}expect(moving).toBeGreaterThan(500);
});
