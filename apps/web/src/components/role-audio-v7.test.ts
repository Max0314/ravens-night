import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {roleAudioV7} from './role-audio-v7.js';
test('raven and coffin media have intact archived sources and decoded contact measurements',()=>{
 const m=JSON.parse(readFileSync('apps/web/public/audio/effects/v7/manifest.json','utf8'));const source=JSON.parse(readFileSync(m.sourceIndex,'utf8'));const byId=new Map(source.sources.map((s:{id:string})=>[s.id,s]));
 expect(m.files).toHaveLength(6);expect(m.totalDecodedBytes).toBeLessThan(1024*1024);
 for(const file of m.files){expect(createHash('sha256').update(readFileSync('apps/web/public/audio/effects/v7/'+file.file)).digest('hex')).toBe(file.sha256);expect(roleAudioV7[file.id as keyof typeof roleAudioV7]).toEqual({onset:file.onsetOffsetMs,peak:file.peakOffsetMs,duration:file.durationMs});expect(file.peakDbFS).toBeLessThan(-3);for(const id of file.sources)expect(byId.has(id)).toBe(true);}
 for(const s of source.sources){expect(s.license).toBe('CC0-1.0');expect(createHash('sha256').update(readFileSync(s.path)).digest('hex')).toBe(s.sha256);}
});
