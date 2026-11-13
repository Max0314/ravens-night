// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import type {GameView} from '../api.js';
import {createGameScorePlayer,gameScoreTrack} from './game-score.js';
const events=(kind:'NIGHT_FALLS'|'DAWN'|'GAME_OVER',startsAt:number,day:number,outcome?:'GOOD'|'EVIL')=>({seq:startsAt,message:'public',kind,startsAt,day,timingVersion:4 as const,...(outcome?{outcome}:{})});
const game=(patch:Partial<GameView>={}):GameView=>({phase:'FIRST_NIGHT',day:0,seats:[],events:[],readyCount:0,aliveCount:7,...patch});
test('public chronology uses day/night tracks until the third night, then sticks through later dawns',()=>{
 const history=[events('NIGHT_FALLS',0,0),events('DAWN',1000,1),events('NIGHT_FALLS',2000,1),events('DAWN',3000,2),events('NIGHT_FALLS',4000,2),events('DAWN',5000,3)];
 for(const [now,track]of [[500,'M19'],[1000,'M15'],[2000,'M18'],[3000,'M15'],[4000,'M19'],[5000,'M19']] as const)expect(gameScoreTrack(game({events:history}),now)).toBe(track);
 expect(gameScoreTrack(game({day:2,phase:'DAY_DISCUSSION',events:history}),3500)).toBe('M15');
 expect(gameScoreTrack(game({day:3,phase:'DAY_DISCUSSION'}),6000)).toBe('M19');expect(gameScoreTrack(undefined,0)).toBe('M19');
});
test('GAME_OVER and a predicted winner alone do not switch; publicly revealed GOOD/EVIL do',()=>{
 const base=game({phase:'GAME_OVER',day:1,winner:'GOOD',events:[events('DAWN',1000,1),events('GAME_OVER',2000,1,'GOOD')]});
 expect(gameScoreTrack(base,2899)).toBe('M15');expect(gameScoreTrack(base,2900)).toBe('M01');
 expect(gameScoreTrack({...base,revealComplete:true,events:[]},9000)).toBe('M01');
 expect(gameScoreTrack({...base,events:[events('DAWN',1000,1),events('GAME_OVER',2000,1,'EVIL')]},2900)).toBe('M19');
});
const shared=vi.hoisted(()=>({context:undefined as Context|undefined,unlock:vi.fn(async()=>{})}));
vi.mock('./experience-audio.js',()=>({getEffectsAudioContext:()=>shared.context,unlockEffectsAudio:shared.unlock,globalAudioEnabled:()=>true,globalAudioEvent:'ravens:global-audio',enableEffectsAudio:async()=>{}}));
class Gain {gain={value:0};connect=vi.fn();disconnect=vi.fn();}
class Context extends EventTarget {state='running';destination={};gains=new Map<Player,Gain>();createGain(){return new Gain();}createMediaElementSource(audio:Player){return{connect:vi.fn((gain:Gain)=>{this.gains.set(audio,gain);}),disconnect:vi.fn()};}}
const level=(player:Player)=>shared.context!.gains.get(player)!.gain.value;
const players:Player[]=[];
class Player extends EventTarget{loop=false;preload='';volume=1;muted=false;paused=true;currentTime=0;readyState=4;error:null|{code:number}=null;load=vi.fn();play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){super();players.push(this);}}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
beforeEach(()=>{vi.useFakeTimers();players.length=0;shared.context=new Context();shared.unlock.mockReset().mockResolvedValue(undefined);vi.stubGlobal('Audio',Player);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
test('one M19 playhead survives menu/room and reconnection, crossfades two seconds, and returns without restart',async()=>{
 const p=createGameScorePlayer(),state={track:'M19' as const,active:true,ducked:false,context:'menu'};p.update(state);await flush();vi.advanceTimersByTime(2000);const first=players[0]!;first.currentTime=42;expect(level(first)).toBe(.8);
 p.update({...state,context:'room:game'});p.update({...state,context:'room:game'});await flush();vi.advanceTimersByTime(240);expect(players).toHaveLength(1);expect(first.currentTime).toBe(42);expect(first.play).toHaveBeenCalledOnce();
 p.update({...state,context:'room:game',track:'M15'});await flush();vi.advanceTimersByTime(1000);expect(level(first)).toBeCloseTo(.4);expect(level(players[1]!)).toBeCloseTo(.4);vi.advanceTimersByTime(1000);expect(first.paused).toBe(true);
 p.update({...state,context:'room:game'});await flush();vi.advanceTimersByTime(2000);expect(players).toHaveLength(2);expect(first.currentTime).toBe(42);const calls=first.play.mock.calls.length;p.update({...state,context:'room:game'});expect(first.play).toHaveBeenCalledTimes(calls);p.dispose();expect(vi.getTimerCount()).toBe(0);
});
test('duck restores volume without seeking, master/background stop and late media cannot revive it',async()=>{
 const p=createGameScorePlayer(),state={track:'M19' as const,active:true,ducked:false,context:'one'};p.update(state);await flush();vi.advanceTimersByTime(2000);const a=players[0]!;a.currentTime=11;
 p.update({...state,ducked:true});vi.advanceTimersByTime(240);expect(level(a)).toBeCloseTo(.26);p.update(state);vi.advanceTimersByTime(240);expect(level(a)).toBe(.8);expect(a.currentTime).toBe(11);expect(a.play).toHaveBeenCalledOnce();
 p.update({...state,active:false});expect(a.paused).toBe(true);expect(level(a)).toBe(0);let finish:()=>void=()=>{};a.play.mockImplementationOnce(()=>new Promise<void>(r=>{finish=()=>{a.paused=false;r();};}));p.update(state);p.update({...state,active:false});finish();await flush();expect(a.paused).toBe(true);expect(level(a)).toBe(0);p.dispose();
});
test('bounded load failure exposes retry, and a new room cancels an obsolete pending song',async()=>{
 const report=vi.fn(),p=createGameScorePlayer(report),state={track:'M15' as const,active:true,ducked:false,context:'one'};p.update(state);await flush();vi.advanceTimersByTime(2000);const a=players[0]!;a.paused=true;a.readyState=0;a.play.mockResolvedValueOnce();p.gesture();await flush();vi.advanceTimersByTime(8000);expect(report).toHaveBeenLastCalledWith(expect.stringContaining('重试'));expect(a.paused).toBe(true);
 a.readyState=4;p.gesture();await flush();vi.advanceTimersByTime(2000);expect(level(a)).toBe(.8);
 p.update({...state,track:'M19',context:'two'});await flush();vi.advanceTimersByTime(2000);expect(a.paused).toBe(true);expect(level(players[1]!)).toBe(.8);p.dispose();
});
test('playing plus Promise confirmation stays idempotent and ducking preserves the two-second crossfade',async()=>{
 const p=createGameScorePlayer(),state={track:'M19' as const,active:true,ducked:false,context:'one'};p.update(state);await flush();vi.advanceTimersByTime(2000);
 p.update({...state,track:'M15'});const next=players[1]!;next.dispatchEvent(new Event('playing'));await flush();vi.advanceTimersByTime(500);p.update({...state,track:'M15',ducked:true});vi.advanceTimersByTime(500);
 expect(level(players[0]!)).toBeCloseTo(.13);expect(level(next)).toBeCloseTo(.13);expect(players[0]!.paused).toBe(false);vi.advanceTimersByTime(1000);expect(level(next)).toBeCloseTo(.26);expect(players[0]!.paused).toBe(true);p.dispose();
});
test('stalled with healthy media buffers never starts a failure timeout or interrupts music',async()=>{
 const report=vi.fn(),p=createGameScorePlayer(report);p.update({track:'M19',active:true,ducked:false,context:'one'});await flush();vi.advanceTimersByTime(2000);const a=players[0]!;a.dispatchEvent(new Event('stalled'));vi.advanceTimersByTime(8000);expect(a.paused).toBe(false);expect(report).toHaveBeenLastCalledWith('');expect(vi.getTimerCount()).toBe(0);p.dispose();
});
test('iOS read-only element volume still crossfades and ducks through shared streaming GainNodes',async()=>{
 class PhonePlayer extends Player{constructor(src:string){super(src);Object.defineProperty(this,'volume',{get:()=>1,set:()=>{throw Error('iOS element volume is not writable');}});}}
 vi.stubGlobal('Audio',PhonePlayer);const context=shared.context!,p=createGameScorePlayer(),state={track:'M19' as const,active:true,ducked:false,context:'phone'};
 context.state='suspended';p.update(state);await flush();vi.advanceTimersByTime(500);const first=players[0]!;expect(first.play).toHaveBeenCalledOnce();expect(level(first)).toBe(0);context.state='running';context.dispatchEvent(new Event('statechange'));vi.advanceTimersByTime(2000);expect(level(first)).toBe(.8);first.currentTime=42;
 p.update({...state,track:'M15'});await flush();vi.advanceTimersByTime(1000);expect(level(first)).toBeCloseTo(.4);expect(level(players[1]!)).toBeCloseTo(.4);p.update({...state,track:'M15',ducked:true});vi.advanceTimersByTime(240);expect(level(first)+level(players[1]!)).toBeCloseTo(.26);vi.advanceTimersByTime(760);expect(level(players[1]!)).toBeCloseTo(.26);expect(first.paused).toBe(true);
 p.update({...state,track:'M15'});vi.advanceTimersByTime(240);expect(level(players[1]!)).toBe(.8);expect(players.every(a=>a.volume===1)).toBe(true);p.update(state);await flush();vi.advanceTimersByTime(2000);expect(first.currentTime).toBe(42);expect(context.gains.size).toBe(2);p.dispose();expect(vi.getTimerCount()).toBe(0);
});
test('returning with an existing suspended context starts shared resume before media play',async()=>{
 const context=shared.context!,p=createGameScorePlayer(),state={track:'M19' as const,active:true,ducked:false,context:'resume'};p.update(state);await flush();vi.advanceTimersByTime(2000);const a=players[0]!,order:string[]=[];p.update({...state,active:false});context.state='suspended';
 shared.unlock.mockImplementation(async()=>{order.push('resume');context.state='running';context.dispatchEvent(new Event('statechange'));});a.play.mockImplementationOnce(async()=>{order.push('play');a.paused=false;});p.update(state);expect(order).toEqual(['resume','play']);await flush();vi.advanceTimersByTime(2000);expect(level(a)).toBe(.8);expect(a.paused).toBe(false);expect(players).toHaveLength(1);p.dispose();
});
