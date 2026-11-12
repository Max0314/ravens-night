import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {butlerBowFrame,butlerBowTiming} from './ButlerBow.js';

const art = (file:string) => new URL(`../../public/art/effects/v2/${file}`,import.meta.url);
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

test('authored full-body joints have planted feet and fixed bone lengths in every frame',()=>{
  const spec=json(art('butler-pose.json'));
  expect(spec.frames).toHaveLength(56);
  const first=spec.frames[0] as Record<string,number[]>;
  for(const frame of spec.frames as Array<Record<string,number[]>>) {
    for(const key of ['nearAnkle','nearToe','farAnkle','farToe'])expect(frame[key]).toEqual(first[key]);
    for(const [a,b] of spec.bones as [string,string][]) {
      const length=(f:Record<string,number[]>)=>Math.hypot(f[a]![0]!-f[b]![0]!,f[a]![1]!-f[b]![1]!);
      expect(Math.abs(length(frame)/length(first)-1)).toBeLessThan(.02);
    }
  }
});

test('runtime sheet really has 56 complete cells and matches its published hash',async()=>{
  const data=readFileSync(art('butler-bow.webp')),meta=await sharp(data).metadata();
  expect([meta.width,meta.height,meta.hasAlpha]).toEqual([2048,2688,true]);
  const manifest=json(art('manifest.json'));
  const entry=manifest.files.find((file:{file:string})=>file.file==='butler-bow.webp');
  expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
});
