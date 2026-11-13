import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {PrivateAvatarClaw} from './PrivateAvatarClaw.js';
import {LayeredSceneArt} from './LayeredSceneArt.js';
import {magnifierPose} from './private-prop-motion.js';

const publicFile=(url:string)=>readFileSync(new URL(`../../public${url}`,import.meta.url));
async function embed(markup:string){for(const match of [...markup.matchAll(/href="(\/[^"]+)"/g)]){const url=match[1]!,png=await sharp(publicFile(url)).png().toBuffer();markup=markup.replaceAll(`href="${url}"`,`href="data:image/png;base64,${png.toString('base64')}"`);}return markup;}
test('3.2x slashes keep the measured centre and visibly overflow 64px and 42px avatars',async()=>{
 const css=readFileSync(new URL('./private-scene-marks.css',import.meta.url),'utf8'),scale=Number(css.match(/private-avatar-claw\{[^}]*width:(\d+)%;height:\1%/)?.[1])/100;expect(scale).toBeGreaterThanOrEqual(3);
 async function ink(side:'left'|'right',size:number){const markup=(await embed(renderToStaticMarkup(<PrivateAvatarClaw side={side}/>))).replace('<svg ','<svg width="'+size+'" height="'+size+'" '),{data}=await sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let mass=0,xMass=0,yMass=0,left=size,right=0,top=size,bottom=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;if(data[i+3]!>120&&data[i]!>data[i+1]!*1.6&&data[i]!>data[i+2]!*1.45&&data[i]!>75){mass+=data[i+3]!;xMass+=x*data[i+3]!;yMass+=y*data[i+3]!;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
  return{mass,x:xMass/mass,y:yMass/mass,left,right,top,bottom};
 }
 for(const size of [64,42])for(const side of ['left','right'] as const){const baseline=await ink(side,size),fullSize=Math.round(size*scale),large=await ink(side,fullSize);
  expect(large.mass).toBeGreaterThan(fullSize*fullSize*8);
  expect(Math.abs(large.x-fullSize/2)).toBeLessThan(fullSize*.08);expect(Math.abs(large.y-fullSize/2)).toBeLessThan(fullSize*.08);
  expect((large.right-large.left)/(baseline.right-baseline.left)).toBeGreaterThanOrEqual(3);expect((large.bottom-large.top)/(baseline.bottom-baseline.top)).toBeGreaterThanOrEqual(3);
  expect(large.left).toBeLessThan((fullSize-size)/2);expect(large.right).toBeGreaterThan((fullSize+size)/2);
 }
});
test('wet candidate ink waits for lifting and stays legible on the settled fabric',async()=>{
 const avatar=async(fill:string)=>'data:image/png;base64,'+(await sharp({create:{width:68,height:68,channels:4,background:fill}}).png().toBuffer()).toString('base64');
 const imprint={label:'获知候选',marks:[{label:'甲',name:'甲',avatar:await avatar('#fa0000')},{label:'乙',name:'乙',avatar:await avatar('#0000fa')}]};
 async function colorCounts(t:number){let markup=renderToStaticMarkup(<LayeredSceneArt role="washerwoman" kind="INFORMATION" elapsedMs={t} imprint={imprint}/>);markup=await embed(markup);const {data}=await sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({resolveWithObject:true});let red=0,blue=0;for(let i=0;i<data.length;i+=4){if(data[i]!>180&&data[i+1]!<50&&data[i+2]!<50)red++;if(data[i+2]!>180&&data[i]!<50&&data[i+1]!<70)blue++;}return{red,blue};}
 const sunk=await colorCounts(1300),raised=await colorCounts(2300);
 expect(sunk.red).toBeLessThan(100);expect(sunk.blue).toBe(0);
 expect(raised.red).toBeGreaterThan(2000);expect(raised.blue).toBeGreaterThan(2000);expect(await colorCounts(3000)).toEqual(raised);
});

test('the independent lens has a real transparent optical hole and magnifies the evidence beneath it',async()=>{
 const {data:hardware,info}=await sharp(publicFile('/art/effects/v8/investigator-magnifier.webp')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 expect([info.width,info.height]).toEqual([600,500]);
 for(let y=123;y<=287;y++)for(let x=218;x<=382;x++)if(Math.hypot(x-300,y-205)<=82)expect(hardware[(y*600+x)*4+3]).toBe(0);
 const t=1800,p=magnifierPose(t),c=p.centre,zoom=1.2+p.focus*.38,material=(await sharp(publicFile('/art/effects/v8/investigator-evidence.webp')).png().toBuffer()).toString('base64');
 const image=`<image href="data:image/png;base64,${material}" width="600" height="500"/>`,raster=async(svg:string)=>(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()),wrap=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500">${body}</svg>`;
 const actual=await raster(await embed(renderToStaticMarkup(<LayeredSceneArt role="investigator" kind="INFORMATION" elapsedMs={t}/>))),expected=await raster(wrap(`${image}<g transform="translate(${c.x} ${c.y}) scale(${zoom}) translate(${-c.x} ${-c.y})">${image}</g>`)),unmagnified=await raster(wrap(image));
 let error=0,unchangedError=0;
 // Right-of-centre stays inside clear glass and away from the independent left reflection.
 for(let y=Math.round(c.y)-20;y<=Math.round(c.y)+20;y++)for(let x=Math.round(c.x)+10;x<=Math.round(c.x)+35;x++)for(let ch=0;ch<3;ch++){const i=(y*600+x)*4+ch;error+=Math.abs(actual[i]!-expected[i]!);unchangedError+=Math.abs(actual[i]!-unmagnified[i]!);}
 expect(unchangedError).toBeGreaterThan(1000);expect(error).toBeLessThan(unchangedError*.15);
});
