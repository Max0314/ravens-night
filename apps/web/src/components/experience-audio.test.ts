// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const names=['shot','glass','impact','scream','poison','shield','butler','demon','good','evil'];
const started:Array<{sample:number;at:number;stopped:boolean}>=[];
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}}
class Node{gain=new Param();frequency=new Param();playbackRate=new Param();buffer:{sample:number}|undefined;onended:(()=>void)|null=null;row:{sample:number;at:number;stopped:boolean}|undefined;connect(){}disconnect(){}start(at:number){this.row={sample:this.buffer?.sample??-1,at,stopped:false};started.push(this.row);}stop(){if(this.row)this.row.stopped=true;}}
class Context{state='running';currentTime=10;sampleRate=48000;destination={};async resume(){}createGain(){return new Node();}createBufferSource(){return new Node();}createOscillator(){return new Node();}async decodeAudioData(data:ArrayBuffer){return{sample:new Uint8Array(data)[0],duration:1};}createBuffer(){return{getChannelData:()=>new Float32Array(100)};}}
let audio:typeof import('./experience-audio.js'),preferences:typeof import('../participation-audio.js');
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
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
