import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ButlerBow} from './ButlerBow.js';
import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {butlerBowFrame,butlerBowTiming} from './ButlerBow.js';
import {sceneDuration} from '../presentations/private-scenes.js';

const art = (file:string) => new URL(`../../public/art/effects/v4/${file}`,import.meta.url);
const json = (url:URL) => JSON.parse(readFileSync(url,'utf8'));

test('runtime visits all 24 authored poses and rises through the same poses to standing',()=>{
  const frames=new Set<number>();
  for(let ms=0;ms<=butlerBowTiming.durationMs+1000;ms++) {
    const frame=butlerBowFrame(ms);frames.add(frame);
    expect(frame).toBeGreaterThanOrEqual(0);expect(frame).toBeLessThan(24);
  }
  expect(frames.size).toBe(24);expect(butlerBowFrame(-1)).toBe(0);
  expect(butlerBowFrame(butlerBowTiming.durationMs)).toBe(0);
  expect(sceneDuration({version:1,id:'butler-identity',kind:'IDENTITY',themeRoleId:'butler',shown:{type:'IDENTITY',roleId:'butler',summary:''}},butlerBowTiming.durationMs)).toBe(butlerBowTiming.durationMs);
});

test('complete accepted spoken stem fits inside the low bow and audio/art timing agrees',()=>{
  const timing=json(new URL('../../public/audio/effects/v2/butler-timing.json',import.meta.url));
  expect(timing).toEqual(butlerBowTiming);
  for(let ms=timing.voiceAt;ms<timing.voiceAt+timing.spokenDurationMs;ms++) {
    expect(butlerBowFrame(ms)).toBe(23);
  }
  expect(timing.riseAt).toBeGreaterThanOrEqual(timing.voiceAt+timing.spokenDurationMs+50);
});

test('skinned frames keep pelvis, knees, ankles and trouser pixels stationary, not just the feet',async()=>{
 const spec=json(art('butler-motion.json'));expect(spec.contract.frames).toBe(24);
 for(const frame of spec.frames)for(const joint of spec.contract.fixed)expect(frame.joints[joint]).toEqual(spec.frames[0].joints[joint]);
 const {data,info}=await sharp(readFileSync(art('butler-bow.webp'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const at=(f:number,x:number,y:number)=>((Math.floor(f/6)*448+y)*info.width+(f%6*320+x))*4;
 for(let f=0;f<24;f++){
  let bottom=0,left=320,right=0,error=0,count=0;
  for(let y=0;y<448;y++)for(let x=0;x<320;x++)if(data[at(f,x,y)+3]!>180){bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  for(let y=225;y<410;y+=2)for(let x=84;x<122;x+=2)for(let c=0;c<4;c++){error+=Math.abs(data[at(f,x,y)+c]!-data[at(0,x,y)+c]!);count++;}
  expect(error/count).toBeLessThan(5);
  expect(bottom).toBeGreaterThanOrEqual(425);expect(bottom).toBeLessThanOrEqual(430);expect(left).toBeGreaterThan(4);expect(right).toBeLessThan(315);
 }
});

test('runtime atlas stays under the declared 20MB decoded budget',async()=>{
  const data=readFileSync(art('butler-bow.webp')),meta=await sharp(data).metadata();
  expect([meta.width,meta.height,meta.hasAlpha]).toEqual([1920,1792,true]);
  expect(meta.width!*meta.height!*4).toBeLessThan(20*1024*1024);
});

// Rasterize the complete runtime SVG at mismatched container ratios.
test('runtime viewport clips exactly one person in wide and tall containers',async()=>{
 const atlas=readFileSync(art('butler-bow.webp')).toString('base64');
 for(const elapsedMs of [0,1100,1800,2600])for(const [width,height] of [[800,240],[240,600]]){
  const markup=renderToStaticMarkup(createElement(ButlerBow,{elapsedMs})).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" ').replace('/art/effects/v4/butler-bow.webp','data:image/webp;base64,'+atlas);
  const {data,info}=await sharp(Buffer.from(markup)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const scale=Math.min(width!/320,height!/448),left=(width!-320*scale)/2,right=left+320*scale,top=(height!-448*scale)/2,bottom=top+448*scale;
  let outside=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<Math.floor(left)||x>=Math.ceil(right)||y<Math.floor(top)||y>=Math.ceil(bottom))outside+=data[(y*info.width+x)*4+3]!;
  expect(outside).toBe(0);
 }
});
