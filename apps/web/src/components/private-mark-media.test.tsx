import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {PrivateAvatarClaw} from './PrivateAvatarClaw.js';
import {LayeredSceneArt} from './LayeredSceneArt.js';

const publicFile=(url:string)=>readFileSync(new URL(`../../public${url}`,import.meta.url));
async function embed(markup:string){for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(publicFile(url)).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return markup;}
test('both measured slash alpha cores land on 64px and 42px portraits',async()=>{
 for(const size of [64,42])for(const side of ['left','right'] as const){
  const markup=(await embed(renderToStaticMarkup(<PrivateAvatarClaw side={side}/>))).replace('<svg ','<svg width="'+size+'" height="'+size+'" ');
  const {data}=await sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let mass=0,xMass=0,yMass=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;if(data[i+3]!>120&&data[i]!>data[i+1]!*1.6&&data[i]!>data[i+2]!*1.45&&data[i]!>75){mass+=data[i+3]!;xMass+=x*data[i+3]!;yMass+=y*data[i+3]!;}}
  expect(mass).toBeGreaterThan(size*size*8);
  expect(Math.abs(xMass/mass-size/2)).toBeLessThan(size*.08);expect(Math.abs(yMass/mass-size/2)).toBeLessThan(size*.08);
  expect(data[3]).toBe(0);expect(data[(size*size-1)*4+3]).toBe(0);
 }
});
test('actual printed avatars follow fabric slices and disappear behind the basin when submerged',async()=>{
 const avatar=async(fill:string)=>'data:image/png;base64,'+(await sharp({create:{width:68,height:68,channels:4,background:fill}}).png().toBuffer()).toString('base64');
 const imprint={label:'获知候选',marks:[{label:'甲',name:'甲',avatar:await avatar('#fa0000')},{label:'乙',name:'乙',avatar:await avatar('#0000fa')}]};
 async function colorCounts(t:number){let markup=renderToStaticMarkup(<LayeredSceneArt role="washerwoman" kind="INFORMATION" elapsedMs={t} imprint={imprint}/>);markup=await embed(markup);const {data}=await sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let red=0,blue=0;for(let i=0;i<data.length;i+=4){if(data[i]!>180&&data[i+1]!<50&&data[i+2]!<50)red++;if(data[i+2]!>180&&data[i]!<50&&data[i+1]!<70)blue++;}return{red,blue};}
 const sunk=await colorCounts(1300),raised=await colorCounts(2300);
 expect(sunk.red).toBeGreaterThan(1000);expect(sunk.blue).toBe(0);
 expect(raised.red).toBeGreaterThan(2000);expect(raised.blue).toBeGreaterThan(2000);
});
