// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {GameView} from '../api.js';
const names=['L03','L04','L02','A03','nomination','vote-stamp'],durations=[16,20,15,8,.13,.16];
class Param{value=0;ramps:number[]=[];setValueAtTime(){}linearRampToValueAtTime(value:number){this.ramps.push(value);}}
class Node{gain=new Param();playbackRate=new Param();buffer:{index:number;duration:number}|undefined;at=0;offset=0;stops:number[]=[];onended:(()=>void)|null=null;connect(){}disconnect(){}start(at:number,offset=0){this.at=at;this.offset=offset;started.push(this);}stop(at?:number){this.stops.push(at??context.currentTime);}}
const started:Node[]=[],gains:Node[]=[];let context:Context;
class Context extends EventTarget{state='running';currentTime=10;destination={};constructor(){super();context=this;}async resume(){}createGain(){const n=new Node();gains.push(n);return n;}createBufferSource(){return new Node();}async decodeAudioData(data:ArrayBuffer){const index=new Uint8Array(data)[0]!;return{index,duration:durations[index]!,length:44100*durations[index]!,numberOfChannels:1};}}
let audio:typeof import('./experience-audio.js');async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
beforeEach(async()=>{vi.resetModules();localStorage.clear();started.length=0;gains.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,arrayBuffer:async()=>new Uint8Array([names.indexOf(url.split('/').at(-1)!.replace('.mp3',''))]).buffer})));audio=await import('./experience-audio.js');await audio.enableEffectsAudio(true);});
afterEach(()=>{audio.silenceEffects();vi.restoreAllMocks();vi.unstubAllGlobals();});
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

test('a live packet 1.5s late and a further 2.6s decode delay retain one complete attack',async()=>{
 let finish!:()=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=()=>resolve({ok:true,arrayBuffer:async()=>new Uint8Array([0]).buffer} as Response);}));
 const time=vi.spyOn(performance,'now').mockReturnValue(0),owner=audio.createNominationAudio('slow');owner.update([],0);
 const e={...event('live','NOMINATION',1000),seq:2};owner.update([e],2500);await flush();expect(started).toHaveLength(0);
 time.mockReturnValue(2600);context.currentTime=12.6;finish();await flush();expect(started.map(sample)).toEqual(['L03']);expect(started[0]!.offset).toBe(0);expect(started[0]!.at).toBe(12.6);expect(started[0]!.buffer!.duration).toBe(16);
 owner.update([e],5200);await flush();expect(started).toHaveLength(1);expect(started[0]!.stops).toEqual([]);owner.dispose();
});

test('an interrupted WeChat context keeps the admitted event until its actual running state, not resume resolution',async()=>{
 const owner=audio.createNominationAudio('wechat');owner.update([],0);context.state='interrupted';owner.update([event('fresh')],1000);await flush();expect(started).toHaveLength(0);
 const resume=vi.spyOn(context,'resume');document.dispatchEvent(new Event('WeixinJSBridgeReady'));await flush();expect(resume).toHaveBeenCalledOnce();expect(started).toHaveLength(0);
 context.state='running';context.dispatchEvent(new Event('statechange'));await flush();expect(started.map(sample)).toEqual(['L03']);context.dispatchEvent(new Event('statechange'));expect(started).toHaveLength(1);owner.dispose();
});

test('a later result supersedes a still-loading nomination without cutting an already started result tail',async()=>{
 let finish!:()=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=()=>resolve({ok:true,arrayBuffer:async()=>new Uint8Array([0]).buffer} as Response);}));const owner=audio.createNominationAudio('round');owner.update([],0);
 const n={...event('n'),seq:1},r={...event('r','VOTE_RESULT',4000,'ON_BLOCK'),seq:2};owner.update([n],1000);await flush();owner.update([n,r],4000);await flush();expect(started.map(sample)).toEqual(['L04']);finish();await flush();expect(started.map(sample)).toEqual(['L04']);
 owner.update([n,r,{...event('next','NOMINATION',5000),seq:3}],5000);await flush();expect(started.map(sample)).toEqual(['L04','L03']);expect(started[0]!.stops).toEqual([]);owner.dispose();
});

test('reconnected history, obsolete days and lower revisions never add attacks; a current late result does',async()=>{
 const owner=audio.createNominationAudio('history');owner.update([event('initial','NOMINATION',900)],1000,{revision:4,day:1,context:'1'});
 owner.update([event('ancient','VOTE_RESULT',1500,'NONE')],30000,{revision:5,day:1,context:'1'});
 owner.update([{...event('prior-day','NOMINATION',30000),day:0}],30000,{revision:6,day:1,context:'1'});
 owner.update([event('stale','NOMINATION',30000)],30000,{revision:3,day:1,context:'1'});await flush();expect(started).toHaveLength(0);
 owner.update([{...event('latest','VOTE_RESULT',32000,'TIED'),day:1}],35000,{revision:7,day:1,context:'1'});await flush();expect(started.map(sample)).toEqual(['L02']);owner.dispose();
});

test('failed live fetch retries after backoff and a completed load cannot escape an explicit cancellation',async()=>{
 const time=vi.spyOn(performance,'now').mockReturnValue(0),owner=audio.createNominationAudio('retry');owner.update([],0);vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
 owner.update([event('retry')],1000);await flush();owner.update([event('retry')],1500);await flush();expect(fetch).toHaveBeenCalledTimes(1);
 time.mockReturnValue(1000);owner.update([event('retry')],2000);await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
 let finish!:()=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=()=>resolve({ok:true,arrayBuffer:async()=>new Uint8Array([1]).buffer} as Response);}));const second=audio.createNominationAudio('cancel');second.update([],0);second.update([event('pending','VOTE_RESULT',2000,'ON_BLOCK')],2000);await flush();audio.silenceEffects();finish();await flush();expect(started.map(sample)).toEqual(['L03']);second.dispose();
});

test('a pending delivery is cancelled on a new day or inactive phase and is never revived by later snapshots',async()=>{
 context.state='suspended';const owner=audio.createNominationAudio('context');owner.update([],0,{context:'1',day:1});const e={...event('old'),day:1};owner.update([e],1000,{context:'1',day:1});await flush();
 owner.update([e],1200,{context:'2',day:2,active:false});context.state='running';context.dispatchEvent(new Event('statechange'));owner.update([e],1500,{context:'2',day:2});await flush();expect(started).toHaveLength(0);owner.dispose();
});

test('four concurrent unrelated loads can queue a live attack without losing its delivery',async()=>{
 const releases:Array<()=>void>=[];vi.mocked(fetch).mockImplementation(async url=>{
  if(!String(url).includes('/audio-candidates/'))await new Promise<void>(resolve=>releases.push(resolve));
  return{ok:true,arrayBuffer:async()=>new Uint8Array([String(url).includes('/audio-candidates/')?0:4]).buffer} as Response;
 });
 const tasks=['v3:shot','v3:glass','v3:impact','v3:scream'].map(id=>audio.auditionSample(id));await flush();expect(releases).toHaveLength(4);
 const owner=audio.createNominationAudio('queue');owner.update([],0);owner.update([event('queued')],1000);await flush();expect(fetch).toHaveBeenCalledTimes(4);
 context.currentTime=14;releases.forEach(release=>release());await Promise.all(tasks);await flush();expect(started.filter(n=>sample(n)==='L03')).toHaveLength(1);expect(started.find(n=>sample(n)==='L03')!.offset).toBe(0);expect(fetch).toHaveBeenCalledWith('/audio-candidates/2026-11-12-v1/L03.mp3');owner.dispose();
});

test('a hot-cache attack scheduled in the future is still cancellable by a newer round',async()=>{
 await audio.prepareNominationAudio();const time=vi.spyOn(performance,'now').mockReturnValue(0),owner=audio.createNominationAudio('scheduled');owner.update([],0);const e={...event('future','NOMINATION',2000),seq:1};owner.update([e],1000);await flush();expect(started[0]!.at).toBe(11);
 time.mockReturnValue(500);context.currentTime=10.5;owner.update([e,{...event('next','NOMINATION',2500),seq:2}],1500);await flush();expect(started[0]!.stops).toEqual([10.5]);expect(started[1]!.at).toBe(11.5);owner.dispose();
});

test('a day or phase transition preserves an already audible full tail',async()=>{
 await audio.prepareNominationAudio();const owner=audio.createNominationAudio('tail');const e={...event('result','VOTE_RESULT',1000,'NONE'),day:1};owner.update([e],1000,{day:1,context:'1'});await flush();context.currentTime=11;
 owner.update([e],2000,{day:2,context:'2',active:false});expect(started[0]!.stops).toEqual([]);expect(started[0]!.buffer!.duration).toBe(15);owner.dispose();
});

test('cache pressure never evicts an in-flight decode and starts duplicate fetches for the same candidate',async()=>{
 let release!:()=>void;const decode=context.decodeAudioData.bind(context);vi.spyOn(context,'decodeAudioData').mockImplementation(async data=>{
  const index=new Uint8Array(data)[0]!;if(index===0)await new Promise<void>(resolve=>{release=resolve;});const buffer=await decode(data);return{...buffer,length:10*1024*1024};
 });
 const preparation=audio.prepareNominationAudio();await flush();expect(release).toBeDefined();const owner=audio.createNominationAudio('cache');owner.update([],0);owner.update([event('pending')],1000);await flush();expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/L03.mp3'))).toHaveLength(1);
 release();await preparation;await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
});

test('a source start failure retains the admitted event and retries without a false played claim',async()=>{
 const time=vi.spyOn(performance,'now').mockReturnValue(0),start=Node.prototype.start;vi.spyOn(Node.prototype,'start').mockImplementationOnce(()=>{throw Error('interrupted during start');}).mockImplementation(start);
 const owner=audio.createNominationAudio('start-retry');owner.update([event('same')],1000);await flush();expect(started).toHaveLength(0);owner.update([event('same')],1500);expect(started).toHaveLength(0);
 time.mockReturnValue(1000);owner.update([event('same')],2000);await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
});

test('withdrawing a nomination changes the authoritative context and cancels its unstarted attack',async()=>{
 context.state='interrupted';const owner=audio.createNominationAudio('withdrawn');owner.update([],0,{context:'day:discussion'});const e=event('withdrawn');owner.update([e],1000,{context:'day:ballot-a'});await flush();owner.update([e],1500,{context:'day:withdrawn'});context.state='running';context.dispatchEvent(new Event('statechange'));await flush();expect(started).toHaveLength(0);owner.dispose();
});

test('the same stable owner consumes a reconnect history floor, then accepts later delayed live events',async()=>{
 const delivery=await import('../room-audio-delivery.js'),owner=audio.createNominationAudio('same-owner');owner.update([],0);
 delivery.roomAudioFeedLive('ABCDEF','PLAYER');delivery.roomAudioFeedClosed('ABCDEF','PLAYER');const old={...event('missed-result','VOTE_RESULT',10000,'ON_BLOCK'),seq:2},game={gameId:'g',events:[old]} as GameView;
 delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:2,game},'PLAYER');owner.update([old],20000,{delivery:delivery.roomAudioDelivery(game)!});await flush();expect(started).toHaveLength(0);
 const e={...event('new-live','NOMINATION',21000),seq:3},live={gameId:'g',events:[old,e]} as GameView;delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:3,game:live},'PLAYER');owner.update(live.events,23000,{delivery:delivery.roomAudioDelivery(live)!});await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
});

test('an unrendered public recovery baseline does not swallow a newer private snapshot event',async()=>{
 const delivery=await import('../room-audio-delivery.js'),owner=audio.createNominationAudio('coalesced');owner.update([],0);delivery.roomAudioRequestFailed('ABCDEF','PLAYER');
 const history={...event('history','VOTE_RESULT',10000,'NONE'),seq:2};delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:2,game:{gameId:'g',events:[history]} as GameView},'PLAYER');
 const live={gameId:'g',events:[history,{...event('fresh','NOMINATION',21000),seq:3}]} as GameView;delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:3,game:live},'PLAYER');owner.update(live.events,23000,{delivery:delivery.roomAudioDelivery(live)!});await flush();expect(started.map(sample)).toEqual(['L03']);owner.dispose();
});

test('a command broadcast that beats its ACK can be confirmed once without reviving muted history',async()=>{
 const delivery=await import('../room-audio-delivery.js'),owner=audio.createNominationAudio('broadcast-first');owner.update([],0);delivery.roomAudioRequestFailed('ABCDEF','PLAYER');
 const e={...event('my-command','NOMINATION',1000),seq:3},broadcast={gameId:'g',events:[e]} as GameView;
 delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:3,serverNow:1200,game:broadcast},'PLAYER');owner.update([e],1200,{delivery:delivery.roomAudioDelivery(broadcast)!});await flush();expect(started).toHaveLength(0);
 // The same-revision ACK may have been serialized before a newer WS serverNow sample.
 delivery.observeRoomAudioDelivery('ABCDEF',{roomInstanceId:'room',revision:3,serverNow:1100,game:{...broadcast}},'PLAYER',{liveKind:'NOMINATION',afterSeq:2});owner.update([e],1300,{delivery:delivery.roomAudioDelivery(broadcast)!});await flush();expect(started.map(sample)).toEqual(['L03']);owner.update([e],1400,{delivery:delivery.roomAudioDelivery(broadcast)!});expect(started).toHaveLength(1);owner.dispose();
 const muted=audio.createNominationAudio('muted-confirmation');muted.update([],0);muted.update([e],1200,{delivery:{generation:0,historyThrough:3,historyIds:new Set([e.id]),liveIds:new Set()}});muted.update([e],1300,{paused:true});muted.update([e],1400,{delivery:{generation:0,historyThrough:3,historyIds:new Set([e.id]),liveIds:new Set([e.id])}});await flush();expect(started).toHaveLength(1);muted.dispose();
});
