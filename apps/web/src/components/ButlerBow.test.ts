import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {butlerBowFrame,butlerBowTiming} from './ButlerBow.js';

const art = (file:string) => new URL(`../../public/art/effects/v3/${file}`,import.meta.url);
const json = (url:URL) => JSON.parse(readFileSync(url,'utf8'));

test('runtime visits all 56 frames and finishes standing without overflowing the sheet',()=>{
  const frames=new Set<number>();
  for(let ms=0;ms<=butlerBowTiming.durationMs+1000;ms++) {
    const frame=butlerBowFrame(ms);frames.add(frame);
    expect(frame).toBeGreaterThanOrEqual(0);expect(frame).toBeLessThan(56);
  }
  expect(frames.size).toBe(56);expect(butlerBowFrame(-1)).toBe(0);
  expect(butlerBowFrame(butlerBowTiming.durationMs)).toBe(55);
});

test('complete accepted spoken stem fits inside the low bow and audio/art timing agrees',()=>{
  const timing=json(new URL('../../public/audio/effects/v2/butler-timing.json',import.meta.url));
  expect(timing).toEqual(butlerBowTiming);
  for(let ms=timing.voiceAt;ms<timing.voiceAt+timing.spokenDurationMs;ms++) {
    expect(butlerBowFrame(ms)).toBeGreaterThanOrEqual(24);expect(butlerBowFrame(ms)).toBeLessThan(36);
  }
  expect(timing.riseAt).toBeGreaterThanOrEqual(timing.voiceAt+timing.spokenDurationMs+50);
});

test('generated full-body frames keep the boots anchored and never clip at cell edges',async()=>{
 const spec=json(art('butler-motion.json'));expect(spec.frames).toBe(56);expect(spec.sourceAnchors).toHaveLength(8);
 const {data,info}=await sharp(readFileSync(art('butler-bow.webp'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let f=0;f<56;f++){
  let bottom=0,left=256,right=0;
  for(let y=0;y<448;y++)for(let x=0;x<256;x++)if(data[((Math.floor(f/8)*448+y)*info.width+(f%8*256+x))*4+3]!>180){bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
  expect(bottom).toBeGreaterThanOrEqual(428);expect(bottom).toBeLessThanOrEqual(432);expect(left).toBeGreaterThan(0);expect(right).toBeLessThan(255);
 }
});

test('runtime sheet really has 56 complete cells and matches its published hash',async()=>{
  const data=readFileSync(art('butler-bow.webp')),meta=await sharp(data).metadata();
  expect([meta.width,meta.height,meta.hasAlpha]).toEqual([2048,3136,true]);
  const manifest=json(art('manifest.json'));
  const entry=manifest.files.find((file:{file:string})=>file.file==='butler-bow.webp');
  expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
});
