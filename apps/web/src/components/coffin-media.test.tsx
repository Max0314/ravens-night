import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';

test('the real thick lid hides its contents when closed and the portrait stays inside the actual lining when open',async()=>{
 const avatar='data:image/png;base64,'+(await sharp({create:{width:100,height:100,channels:4,background:'#fb0000'}}).png().toBuffer()).toString('base64'),lining=await sharp(readFileSync(new URL('../../public/art/effects/v8/coffin-oblique-lining.webp',import.meta.url))).ensureAlpha().raw().toBuffer();
 async function frame(t:number,showAvatar:boolean){let markup=renderToStaticMarkup(<LayeredSceneArt role="undertaker" kind="INFORMATION" elapsedMs={t} imprint={{label:'收到的身份',marks:[{label:'甲',...(showAvatar?{avatar}:{})}]}}/>);for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer();}
 for(const t of [0,2300]){const actual=await frame(t,true),base=await frame(t,false);let red=0;for(let i=0;i<actual.length;i+=4)if(actual[i+3]!>200&&actual[i]!>235&&actual[i+1]!<10&&actual[i+2]!<10&&actual[i]!-base[i]!>30){red++;expect(lining[i+3]).toBeGreaterThan(20);}if(t===0)expect(red).toBe(0);else expect(red).toBeGreaterThan(2000);}
});
test('a missing physical lid layer never leaves an open shell and floating disclosure',()=>{
 const markup=renderToStaticMarkup(<LayeredSceneArt role="undertaker" kind="INFORMATION" elapsedMs={2300} imprint={{label:'收到身份'}} readyAssets={new Set(['/art/effects/v8/coffin-oblique-base.webp','/art/effects/v8/coffin-oblique-lining.webp'])}/>);expect(markup).not.toContain('data-coffin-oblique');expect(markup).not.toContain('data-projection');
});
