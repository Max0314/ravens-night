import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {roleAudioV6} from './role-audio-v6.js';
test('role detail media and archived originals match their provenance and generated lead index',()=>{
 const m=JSON.parse(readFileSync('apps/web/public/audio/effects/v6/manifest.json','utf8'));const source=JSON.parse(readFileSync(m.sourceIndex,'utf8'));const byId=new Map(source.sources.map((s:{id:string})=>[s.id,s]));
 expect(m.files).toHaveLength(11);expect(m.totalDecodedBytes).toBeLessThan(4*1024*1024);
 for(const file of m.files){expect(createHash('sha256').update(readFileSync('apps/web/public/audio/effects/v6/'+file.file)).digest('hex')).toBe(file.sha256);expect(roleAudioV6[file.id as keyof typeof roleAudioV6]).toEqual({onset:file.onsetOffsetMs,peak:file.peakOffsetMs,duration:file.durationMs});expect(file.durationMs).toBeGreaterThan(150);expect(file.peakDbFS).toBeLessThan(-3);for(const id of file.sources)expect(byId.has(id)).toBe(true);}
 for(const s of source.sources){expect(s.license).toBe('CC0-1.0');expect(createHash('sha256').update(readFileSync('artifacts/cinematic-motion-2026-11-12/sources/role-audio-v6/'+s.file)).digest('hex')).toBe(s.sha256);}
});
