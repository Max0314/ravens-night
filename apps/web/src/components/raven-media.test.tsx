import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {LayeredSceneArt} from './LayeredSceneArt.js';

async function raven(t:number){let markup=renderToStaticMarkup(<LayeredSceneArt role="ravenkeeper" kind="INFORMATION" elapsedMs={t}/>);for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,data=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${data.toString('base64')}"`);}return sharp(Buffer.from(markup)).ensureAlpha();}
test('the real raven feet grip the same fixed perch pixels through spread and settling',async()=>{
 const area={left:311,top:340,width:12,height:12},rest=await (await raven(0)).extract(area).raw().toBuffer();expect([...rest].some((v,i)=>i%4===3&&v>150)).toBe(true);
 for(const t of [950,1225,1800,2400])expect(await(await raven(t)).extract(area).raw().toBuffer()).toEqual(rest);
});
test('incomplete raven resources do not show detached wings or a headless body',()=>{
 const urls=['perch','body','head-neck','tail','wing-left','wing-right'].map(part=>`/art/effects/v8/raven-${part}.webp`),props={role:'ravenkeeper',kind:'INFORMATION' as const,elapsedMs:1225};
 expect(renderToStaticMarkup(<LayeredSceneArt {...props} readyAssets={new Set(urls.filter(url=>!url.includes('head-neck')))}/>)).not.toContain('data-raven-articulated');
 const ready=renderToStaticMarkup(<LayeredSceneArt {...props} readyAssets={new Set(urls)}/>);expect(ready).toContain('data-raven-articulated');expect(ready.match(/<image /g)).toHaveLength(6);expect(ready).not.toContain('/v4/raven');
});
