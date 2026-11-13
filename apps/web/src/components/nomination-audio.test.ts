// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const names=['L03','L04','L02','A03','nomination','vote-stamp'],durations=[16,20,15,8,.13,.16];
class Param{value=0;ramps:number[]=[];setValueAtTime(){}linearRampToValueAtTime(value:number){this.ramps.push(value);}}
class Node{gain=new Param();playbackRate=new Param();buffer:{index:number;duration:number}|undefined;at=0;offset=0;stops:number[]=[];onended:(()=>void)|null=null;connect(){}disconnect(){}start(at:number,offset=0){this.at=at;this.offset=offset;started.push(this);}stop(at?:number){this.stops.push(at??context.currentTime);}}
const started:Node[]=[],gains:Node[]=[];let context:Context;
class Context{state='running';currentTime=10;destination={};constructor(){context=this;}async resume(){}createGain(){const n=new Node();gains.push(n);return n;}createBufferSource(){return new Node();}async decodeAudioData(data:ArrayBuffer){const index=new Uint8Array(data)[0]!;return{index,duration:durations[index]!,length:44100*durations[index]!,numberOfChannels:1};}}
let audio:typeof import('./experience-audio.js');async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
beforeEach(async()=>{vi.resetModules();localStorage.clear();started.length=0;gains.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,arrayBuffer:async()=>new Uint8Array([names.indexOf(url.split('/').at(-1)!.replace('.mp3',''))]).buffer})));audio=await import('./experience-audio.js');await audio.enableEffectsAudio(true);});
afterEach(()=>{audio.silenceEffects();vi.unstubAllGlobals();});
const event=(id:string,kind='NOMINATION',startsAt=1000,outcome?:string)=>({id,kind,startsAt,durationMs:kind==='NOMINATION'?800:1200,...(outcome?{outcome}:{})});
const sample=(n:Node)=>names[n.buffer!.index];
test('runtime provenance pins complete 16/20/15/8 second archived MP3s',()=>{
 const m=JSON.parse(readFileSync('apps/web/public/audio/nomination/v1/manifest.json','utf8'));expect(m.files.map((x:{durationSeconds:number})=>x.durationSeconds)).toEqual([16,20,15,8]);for(const file of m.files){const bytes=readFileSync('apps/web/public'+file.url);expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);}
});
test('full nomination tails survive short notice completion, next nominations and public-source limits',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('game');owner.update([event('n1')],1000);await flush();expect(started.map(sample)).toEqual(['L03']);expect(started[0]!.buffer!.duration).toBe(16);
 audio.cancelEventAudio('n1');audio.completeEventAudio('n1');context.currentTime=11.2;owner.update([event('n1'),event('r1','VOTE_RESULT',2200,'ON_BLOCK')],2200);await flush();expect(started.map(sample)).toEqual(['L03','L04']);expect(started[0]!.stops).toEqual([]);expect(gains.some(g=>g.gain.ramps.includes(.12))).toBe(true);
 owner.update([event('r1','VOTE_RESULT',2200,'ON_BLOCK'),...Array.from({length:5},(_,i)=>event('next'+i,'NOMINATION',2200))],2200);await flush();expect(started).toHaveLength(7);expect(started.every(s=>s.stops.length===0)).toBe(true);owner.dispose();expect(started.every(s=>s.stops.length>0)).toBe(true);
});
test('NONE and TIED use L02; recovered history and repeated revisions do not replay old attacks',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('game');owner.update([event('old','NOMINATION',0)],10000);await flush();expect(started).toHaveLength(0);
 owner.update([event('none','VOTE_RESULT',10000,'NONE'),event('tied','VOTE_RESULT',10000,'TIED')],10000);await flush();expect(started.map(sample)).toEqual(['L02','L02']);owner.update([],10050);owner.update([event('none','VOTE_RESULT',10000,'NONE')],10100);await flush();expect(started).toHaveLength(2);owner.dispose();
});
test('the dedicated owner suppresses legacy short hits without changing other public cues',async()=>{
 const owner=audio.createNominationAudio('game');audio.scheduleCue('short','NOMINATION',0,4);audio.scheduleCue('short-result','VOTE_RESULT',0,4);await flush();expect(started).toHaveLength(0);owner.dispose();audio.scheduleCue('legacy-after','NOMINATION',0,4);await flush();expect(started.map(sample)).toEqual(['nomination']);
});
test('preview pause and seek resume a tail offset rather than replaying the attack',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('preview'),e=event('lab');owner.preview(e,0,{seekKey:0});await flush();owner.preview(e,8000,{paused:true,seekKey:1});owner.preview(e,8000,{rate:.5,seekKey:1,mode:'SEEK'});await flush();expect(started.map(s=>s.offset)).toEqual([0,8]);expect(started[1]!.playbackRate.value).toBe(.5);expect(started[1]!.stops).toEqual([]);owner.dispose();
});
test('A03 is scheduled for the absolute final window once and always stops at its common deadline',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createBallotCountdownAudio('g'),window={id:'b1',startsAt:20000,endsAt:28000};owner.update(window,0);await flush();expect(started).toHaveLength(1);expect(sample(started[0]!)).toBe('A03');expect(started[0]!.at).toBe(30);expect(started[0]!.stops).toEqual([38]);context.currentTime=11;owner.update(window,1000);await flush();expect(started).toHaveLength(1);owner.dispose();
});
test('late/reconnected playback seeks into the remaining ticks; pause and a shifted window do not restart at zero',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createBallotCountdownAudio('g'),window={id:'b',startsAt:20000,endsAt:28000};owner.update(window,23000);await flush();expect(started[0]!.offset).toBe(3);expect(started[0]!.stops).toEqual([15]);context.currentTime=11;owner.update(window,24000,{paused:true});expect(started[0]!.stops.at(-1)).toBe(11);context.currentTime=12;owner.update({...window,startsAt:25000,endsAt:33000},28000,{epoch:2});await flush();expect(started[1]!.offset).toBe(3);expect(started[1]!.stops.at(-1)).toBe(17);owner.dispose();
});
test('epoch corrections seek the current round and fast forward beyond cutoff never backfills it',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createBallotCountdownAudio('g'),window={id:'b',startsAt:0,endsAt:8000};owner.update(window,0,{epoch:0});await flush();context.currentTime=12;owner.update(window,2000,{epoch:0});await flush();expect(started).toHaveLength(1);context.currentTime=13;owner.update(window,5000,{epoch:1});await flush();expect(started[1]!.offset).toBe(5);expect(started[1]!.stops).toEqual([16]);owner.update(window,9000,{epoch:2});owner.update(window,7000,{epoch:3});await flush();expect(started).toHaveLength(2);owner.dispose();
});
test('late decode cannot play an obsolete ballot or a window already crossed by fast-forward',async()=>{
 let finish:()=>void=()=>{};vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=()=>resolve({ok:true,arrayBuffer:async()=>new Uint8Array([3]).buffer} as Response);}));const owner=audio.createBallotCountdownAudio('g');owner.update({id:'a',startsAt:0,endsAt:8000},1000);await flush();owner.update({id:'b',startsAt:10000,endsAt:18000},11000);context.currentTime=20;owner.update({id:'b',startsAt:10000,endsAt:18000},11000);finish();await flush();expect(started).toHaveLength(1);expect(started[0]!.offset).toBe(1);expect(started[0]!.stops.at(-1)).toBe(27);owner.dispose();
});
test('master mute and hidden visibility suppress these public sounds without enabling private participation',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('g');await audio.enableEffectsAudio(false);owner.update([event('muted')],1000);await audio.enableEffectsAudio(true);owner.update([event('muted')],1100);await flush();expect(started).toHaveLength(0);Object.defineProperty(document,'hidden',{configurable:true,value:true});owner.update([event('hidden')],1000);await flush();expect(started).toHaveLength(0);owner.dispose();
});

test('initial recovery does not replay even a recently published history hit; later fresh deliveries still play',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('g');owner.update([event('history','NOMINATION',900)],1000);await flush();expect(started).toHaveLength(0);owner.update([event('new','NOMINATION',1900)],2000);await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
});


test('a pre-window load failure can recover in the same round without restarting the eight-second clip',async()=>{
 vi.mocked(fetch).mockRejectedValueOnce(new Error('temporary network loss'));const owner=audio.createBallotCountdownAudio('g'),window={id:'same-round',startsAt:20000,endsAt:28000};owner.update(window,0);await flush();expect(started).toHaveLength(0);owner.update(window,100);await flush();expect(fetch).toHaveBeenCalledTimes(1);
 owner.update(window,23000);await flush();expect(started).toHaveLength(1);expect(started[0]!.offset).toBe(3);expect(started[0]!.stops.at(-1)).toBe(15);owner.dispose();
});
