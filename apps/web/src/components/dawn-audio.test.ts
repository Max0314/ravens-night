import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dawnAudio} from './dawn-audio.js';
test('dawn environment cue preserves source provenance and measured contacts within a small media budget',()=>{
 const m=JSON.parse(readFileSync('apps/web/public/audio/ambience/v1/manifest.json','utf8'));const source=JSON.parse(readFileSync(m.sourceIndex,'utf8'));const byId=new Map(source.sources.map((s:{id:string})=>[s.id,s]));
 expect(m.files).toHaveLength(1);expect(m.totalDecodedBytes).toBeLessThan(512*1024);
 for(const file of m.files){expect(createHash('sha256').update(readFileSync('apps/web/public/audio/ambience/v1/'+file.file)).digest('hex')).toBe(file.sha256);expect(dawnAudio[file.id as keyof typeof dawnAudio]).toEqual({onset:file.onsetOffsetMs,peak:file.peakOffsetMs,duration:file.durationMs});expect(file.peakDbFS).toBeLessThan(-3);for(const id of file.sources)expect(byId.has(id)).toBe(true);}
 for(const s of source.sources){expect(s.license).toBe('CC0-1.0');expect(createHash('sha256').update(readFileSync(s.path)).digest('hex')).toBe(s.sha256);}
});
