import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {roleMusicCues} from './role-score.js';
const scene=(role:string)=>({version:1 as const,id:'score',kind:'IDENTITY' as const,themeRoleId:role,shown:{type:'IDENTITY' as const,roleId:role,summary:'fixed'}});
test('seven good information roles share M03 while the oracle uses M22 and special/private actions get none',()=>{
 for(const role of ['washerwoman','chef','investigator','librarian','empath','undertaker','ravenkeeper'])expect(roleMusicCues(scene(role))).toEqual([[0,'score:M03',.5,'continuous']]);
 expect(roleMusicCues(scene('fortune_teller'))[0]?.[1]).toBe('score:M22');expect(roleMusicCues(scene('spy'))).toEqual([]);
 const s=scene('fortune_teller');expect(roleMusicCues({...s,kind:'INFORMATION',shown:{type:'DIVINATION',value:'YES',seats:[2,3]}})).toEqual(roleMusicCues({...s,kind:'INFORMATION',shown:{type:'DIVINATION',value:'NO',seats:[2,3]}}));
 expect(roleMusicCues({...s,kind:'EVIL_START',shown:{type:'EVIL_START',infoId:'x'}})).toEqual([]);
});
test('only bounded mono excerpts enter WebAudio and all original music and runtime hashes remain traceable',()=>{
 const m=JSON.parse(readFileSync('apps/web/public/audio/music/v2/manifest.json','utf8'));const excerpts=m.files.filter((r:{excerptSeconds:number|null})=>r.excerptSeconds!==null);expect(excerpts).toHaveLength(2);
 expect(excerpts.reduce((n:number,r:{decodedBytesEstimate:number})=>n+r.decodedBytesEstimate,0)).toBeLessThan(2*1024*1024);
 for(const r of m.files){expect(createHash('sha256').update(readFileSync(r.sourcePath)).digest('hex')).toBe(r.sourceSha256);expect(createHash('sha256').update(readFileSync('apps/web/public/audio/music/v2/'+r.file)).digest('hex')).toBe(r.sha256);if(r.excerptSeconds){expect(r.durationSeconds).toBeLessThan(4.1);expect(r.offsetSeconds).toBe(r.id==='M03'?3:0);}}
 const old=JSON.parse(readFileSync('apps/web/public/audio/music/v1/manifest.json','utf8'));expect(createHash('sha256').update(readFileSync('apps/web/public/audio/music/v1/lobby-m19.mp3')).digest('hex')).toBe(old.sha256);
});
test('fortune divine submission uses M22 while unrelated active submissions remain quiet',()=>{
 const divine={...scene('fortune_teller'),kind:'ACTION_SUBMITTED' as const,shown:{type:'TARGET_SUBMITTED' as const,action:'DIVINE' as const,seats:[2,3]}};
 expect(roleMusicCues(divine)).toEqual([[0,'score:M22',.5,'continuous']]);expect(roleMusicCues({...divine,themeRoleId:'monk'})).toEqual([]);expect(roleMusicCues({...divine,shown:{...divine.shown,action:'PROTECT'}})).toEqual([]);
});
