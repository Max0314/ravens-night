// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const names=['shot','glass','impact','scream','poison','shield','butler','demon','good','evil','night-bell','dawn-bell','paper-turn-1','paper-turn-2','paper-turn-3','paper-turn-4','ui-press','guillotine-tension','guillotine-unlock','guillotine-blade','guillotine-impact','guillotine-wind','glass-hit','glass-shards','gun-cock','hurt-shot-1','hurt-shot-2','hurt-shot-3','hurt-night-1','hurt-night-2','hurt-night-3','role-baron','role-scarlet_woman'];
const started:Array<{sample:number;at:number;stopped:boolean;stopAt?:number}>=[];
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}}
class Node{gain=new Param();frequency=new Param();playbackRate=new Param();buffer:{sample:number}|undefined;onended:(()=>void)|null=null;row:{sample:number;at:number;stopped:boolean;stopAt?:number}|undefined;connect(){}disconnect(){}start(at:number){this.row={sample:this.buffer?.sample??-1,at,stopped:false};started.push(this.row);}stop(at?:number){if(this.row){this.row.stopped=true;this.row.stopAt=at??0;}}}
class Context{state='running';currentTime=10;sampleRate=48000;destination={};async resume(){}createGain(){return new Node();}createBufferSource(){return new Node();}createOscillator(){return new Node();}async decodeAudioData(data:ArrayBuffer){return{sample:new Uint8Array(data)[0],duration:1};}createBuffer(){return{getChannelData:()=>new Float32Array(100)};}}
let audio:typeof import('./experience-audio.js'),preferences:typeof import('../participation-audio.js');
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
beforeEach(async()=>{vi.resetModules();localStorage.clear();started.length=0;vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,arrayBuffer:async()=>new Uint8Array([names.indexOf(url.split('/').at(-1)!.replace('.mp3',''))]).buffer})));audio=await import('./experience-audio.js');preferences=await import('../participation-audio.js');await audio.enableEffectsAudio(true);await flush();});
afterEach(()=>{audio.silenceEffects();vi.unstubAllGlobals();});
test('online enables private samples while mode selection keeps the master preference and offline cancels them',async()=>{
 audio.schedulePrivateCue('private-one','BUTLER',0);await flush();expect(started).toHaveLength(0);
 preferences.setParticipationMode('ONLINE');expect(audio.effectsAudioEnabled()).toBe(true);audio.schedulePrivateCue('private-one','BUTLER',0);await flush();expect(started.map(v=>v.sample)).toContain(names.indexOf('butler'));
 preferences.setParticipationMode('IN_PERSON');expect(started.every(v=>v.stopped)).toBe(true);await audio.enableEffectsAudio(false);preferences.setParticipationMode('ONLINE');expect(audio.effectsAudioEnabled()).toBe(false);
});
test('public impact is scheduled once and a fresh death outcome adds a separate scream without revealing early',async()=>{
 audio.scheduleCue('shot-fresh','SHOT',0,3);await flush();expect(started.filter(v=>v.sample===names.indexOf('shot'))).toHaveLength(1);expect(started.filter(v=>v.sample===names.indexOf('glass'))).toHaveLength(1);expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(0);
 audio.scheduleCue('shot-fresh','SHOT',980,3,false,{outcome:'DEATH',resultVisible:true});await flush();expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(1);
 audio.scheduleCue('shot-fresh','SHOT',1000,3,false,{outcome:'DEATH',resultVisible:true});audio.scheduleCue('shot-stale','SHOT',1500,3,false,{outcome:'DEATH',resultVisible:true});await flush();expect(started.filter(v=>v.sample===names.indexOf('scream'))).toHaveLength(1);
});
test('a surviving shot has the same glass impact, never a death sample; cancelled pending loads never start',async()=>{
 audio.scheduleCue('alive','SHOT',0,3,false,{outcome:'NO_DEATH',resultVisible:false});await flush();expect(started.some(v=>v.sample===names.indexOf('glass'))).toBe(true);expect(started.some(v=>v.sample===names.indexOf('scream'))).toBe(false);
 const count=started.length;preferences.setParticipationMode('ONLINE');audio.schedulePrivateCue('cancel-before-decode','DEMON',0);preferences.setParticipationMode('IN_PERSON');await flush();expect(started.length).toBe(count);
});
test('slow playback positions future cues at the scaled delay and never backfills past gunshots',async()=>{
 audio.scheduleCue('slow','SHOT',400,3,false,{rate:.5});await flush();const shot=started.find(v=>v.sample===names.indexOf('shot'));expect(shot?.at).toBeCloseTo(10+.9);const count=started.length;audio.cancelEventAudio('slow');audio.scheduleCue('late','SHOT',2000,3);await flush();expect(started.length).toBe(count);
});

test('unlocking an already running context does not rebroadcast or stop a private scene',async()=>{
 preferences.setParticipationMode('ONLINE');audio.schedulePrivateCue('touch-running','DEMON',0);await flush();const listener=vi.fn();window.addEventListener('ravens-effects-unlocked',listener);await audio.unlockEffectsAudio();await audio.unlockEffectsAudio();expect(listener).not.toHaveBeenCalled();expect(started.some(v=>v.sample===names.indexOf('demon')&&!v.stopped)).toBe(true);window.removeEventListener('ravens-effects-unlocked',listener);
});

test('v4 night rings three times, dawn twice, and natural visual completion preserves the tail',async()=>{
 audio.scheduleCue('night-four','NIGHT_FALLS',0,4);await flush();const night=started.filter(s=>s.sample===names.indexOf('night-bell'));expect(night.map(s=>s.at)).toEqual([10.35,11.9,13.45]);audio.completeEventAudio('night-four');expect(night.every(s=>!s.stopped)).toBe(true);
 audio.scheduleCue('dawn-four','DAWN',0,4);await flush();expect(night.every(s=>s.stopped)).toBe(true);const dawn=started.filter(s=>s.sample===names.indexOf('dawn-bell'));expect(dawn.map(s=>s.at)).toEqual([10.35,12.95]);audio.cancelEventAudio('dawn-four');expect(dawn.every(s=>s.stopped)).toBe(true);
});
test('master mute always wins over paper sound and explicit book cancel stops pending sources',async()=>{
 await audio.enableEffectsAudio(false);audio.playSemantic('paper-turn',{variant:0,scope:'book'});await flush();expect(started).toHaveLength(0);await audio.enableEffectsAudio(true);audio.playSemantic('paper-turn',{variant:0,scope:'book'});await flush();expect(started.map(s=>s.sample)).toContain(names.indexOf('paper-turn-1'));audio.cancelSemantic('book');expect(started.every(s=>s.stopped)).toBe(true);
});
test('v4 empty execution has the blade and wind but no false victim scream',async()=>{
 audio.scheduleCue('empty-four','EXECUTION',0,4,true);await flush();expect(started.some(s=>s.sample===names.indexOf('guillotine-unlock'))).toBe(true);expect(started.some(s=>s.sample===names.indexOf('guillotine-impact'))).toBe(true);expect(started.some(s=>s.sample===names.indexOf('guillotine-wind'))).toBe(true);expect(started.some(s=>names[s.sample]?.startsWith('hurt-'))).toBe(false);
});

test('pause immediately cancels a cue that was due less than 40ms in the future',async()=>{audio.scheduleCue('near-future','SHOT',825,4);await flush();const future=started.filter(s=>s.at>10);expect(future.length).toBeGreaterThan(0);audio.cancelEventAudio('near-future');expect(future.every(s=>s.stopped&&s.stopAt===10)).toBe(true);});
test('a former Baron inherits with the succession theme instead of disclosing old prop audio',async()=>{preferences.setParticipationMode('ONLINE');audio.scheduleRoleCue({version:1,id:'succession',kind:'ROLE_CHANGE',themeRoleId:'baron',shown:{type:'NEW_ROLE',roleId:'imp'}},0);await flush();expect(started.some(s=>s.sample===names.indexOf('role-scarlet_woman'))).toBe(true);expect(started.some(s=>s.sample===names.indexOf('role-baron'))).toBe(false);});

test('in-person mode suppresses private button feedback while public UI and paper remain available',async()=>{audio.playSemantic('press',{scope:'private'});await flush();expect(started).toHaveLength(0);audio.playSemantic('press',{scope:'ui'});await flush();expect(started.some(s=>s.sample===names.indexOf('ui-press'))).toBe(true);preferences.setParticipationMode('ONLINE');const count=started.length;audio.playSemantic('press',{scope:'private'});await flush();expect(started.length).toBe(count+1);});
