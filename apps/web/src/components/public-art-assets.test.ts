import {readFileSync} from 'node:fs';
import {expect,test} from 'vitest';
import sharp from 'sharp';
import {publicArtUrls} from './public-art-assets.js';

test('prewarming uses the same finite URL set regardless of hidden death, winner or cause',()=>{
 for(const kind of ['DAWN','SHOT','EXECUTION','GAME_OVER'] as const){const unknown=publicArtUrls(kind);for(const outcome of ['DEATH','NO_DEATH','GOOD','EVIL'] as const)expect(publicArtUrls(kind,outcome)).toEqual(unknown);expect(unknown.length).toBeLessThanOrEqual(10);}
 expect(publicArtUrls('NIGHT_FALLS')).toEqual(['/art/effects/v5/night-town.webp']);expect(publicArtUrls('NOTICE')).toEqual([]);
});
test('every public prewarm URL decodes and each public scene stays within the cache byte budget',async()=>{
 for(const kind of ['DAWN','NIGHT_FALLS','SHOT','EXECUTION','GAME_OVER','NOMINATION'] as const){let bytes=0;for(const url of publicArtUrls(kind)){const image=await sharp(readFileSync(new URL(`../../public${url}`,import.meta.url))).metadata();bytes+=image.width!*image.height!*4;}expect(bytes,kind).toBeLessThan(32*1024*1024);}
});
