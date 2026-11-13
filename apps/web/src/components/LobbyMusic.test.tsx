// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {LobbyMusic,OpeningMusic,GlobalAudioButton,OpeningMusicControl,useOpeningMusic,lobbyMusicTrack,type OpeningMusicController,type OpeningMusicProps} from './LobbyMusic.js';
const shared=vi.hoisted(()=>({enabled:true,unlock:vi.fn(async()=>{})}));
vi.mock('./experience-audio.js',()=>({unlockEffectsAudio:shared.unlock,globalAudioEvent:'ravens:global-audio',globalAudioEnabled:()=>shared.enabled,effectsAudioEnabled:()=>shared.enabled,effectsAudioStatus:()=>'',enableEffectsAudio:(value:boolean)=>{shared.enabled=value;localStorage.setItem('ravens_effects_audio',value?'on':'off');window.dispatchEvent(new CustomEvent('ravens:global-audio',{detail:{enabled:value}}));window.dispatchEvent(new Event('ravens-effects-audio'));return Promise.resolve();}}));
const players:Player[]=[];let controller:OpeningMusicController;
class Player extends EventTarget{loop=false;preload='';volume=1;muted=false;paused=true;currentTime=0;readyState=0;error:{code:number}|null=null;load=vi.fn(()=>{this.error=null;});play=vi.fn(async()=>{this.paused=false;this.readyState=4;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){super();players.push(this);}}
function Harness({active,...options}:OpeningMusicProps){controller=useOpeningMusic(active,options);return <GlobalAudioButton/>;}
function total(value:boolean){shared.enabled=value;act(()=>window.dispatchEvent(new CustomEvent('ravens:global-audio',{detail:{enabled:value}})));}
beforeEach(()=>{localStorage.clear();shared.enabled=true;players.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Player);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
async function flush(){await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve();});}
test('invisible compatibility layers never create a visible long control',async()=>{
 const ui=render(<LobbyMusic active/>);await flush();expect(ui.container).toBeEmptyDOMElement();expect(screen.queryByRole('button')).toBeNull();ui.rerender(<OpeningMusic active/>);await flush();expect(screen.queryByRole('button')).toBeNull();
});
test('the same M19 playhead survives surface renders, and explicit total off pauses immediately',async()=>{
 const ui=render(<Harness active/>);await flush();const player=players[0]!;player.currentTime=42;
 expect(lobbyMusicTrack.name).toBe('短暂的人世');expect(player.src.endsWith('/lobby-m19.mp3')).toBe(true);ui.rerender(<Harness active/>);expect(players).toHaveLength(1);expect(player.play).toHaveBeenCalledOnce();expect(player.currentTime).toBe(42);
 total(false);expect(player.paused).toBe(true);fireEvent.touchEnd(document.body);await flush();expect(player.play).toHaveBeenCalledOnce();total(true);expect(player.play).toHaveBeenCalledTimes(2);await flush();expect(controller.playing).toBe(true);
});
test('autoplay rejection keeps truthful state and a new global enable retries synchronously',async()=>{
 shared.enabled=false;render(<Harness active/>);const player=players[0]!;player.play.mockRejectedValueOnce(new Error('NotAllowedError'));total(true);await flush();expect(controller.blocked).toBe(true);expect(controller.playing).toBe(false);
 total(true);expect(player.play).toHaveBeenCalledTimes(2);await flush();expect(controller.playing).toBe(true);expect(controller.blocked).toBe(false);
});
test('an old pending rejection cannot overwrite newer playback or revive total off',async()=>{
 shared.enabled=false;render(<Harness active/>);const player=players[0]!;let rejectOld:(error:Error)=>void=()=>{};player.play.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOld=reject;}));total(true);total(false);total(true);await flush();expect(controller.playing).toBe(true);
 await act(async()=>{rejectOld(new Error('stale rejection'));await Promise.resolve();});expect(controller.playing).toBe(true);total(false);expect(player.paused).toBe(true);
});
test('resolved play without media readiness stays loading then exposes bounded failure',async()=>{
 vi.useFakeTimers();shared.enabled=false;render(<Harness active/>);const player=players[0]!;player.play.mockResolvedValueOnce();total(true);await flush();expect(controller.playing).toBe(false);act(()=>vi.advanceTimersByTime(8000));expect(controller.blocked).toBe(true);expect(controller.starting).toBe(false);
 fireEvent.touchEnd(document.body);await flush();expect(controller.playing).toBe(true);
});
test('media pause, buffer and error events cannot leave a false playing state; failed media reloads',async()=>{
 render(<Harness active/>);await flush();const player=players[0]!;expect(player.volume).toBe(.8);expect(player.muted).toBe(false);player.paused=true;act(()=>player.dispatchEvent(new Event('pause')));expect(controller.playing).toBe(false);
 player.paused=false;player.readyState=1;act(()=>player.dispatchEvent(new Event('waiting')));expect(controller.starting).toBe(true);expect(controller.playing).toBe(false);player.readyState=4;act(()=>player.dispatchEvent(new Event('playing')));expect(controller.playing).toBe(true);
 player.error={code:2};act(()=>player.dispatchEvent(new Event('error')));expect(controller.blocked).toBe(true);total(true);await flush();expect(player.load).toHaveBeenCalledTimes(2);expect(controller.playing).toBe(true);
});
test('duck and 800ms cutoff preserve playhead and cannot be restarted by later gestures',async()=>{
 vi.useFakeTimers();const ui=render(<Harness active/>);await flush();const player=players[0]!;player.currentTime=42;ui.rerender(<Harness active ducked/>);act(()=>vi.advanceTimersByTime(240));expect(player.volume).toBeCloseTo(.26);expect(player.play).toHaveBeenCalledOnce();
 ui.rerender(<Harness active ducked fadeOut/>);act(()=>vi.advanceTimersByTime(400));expect(player.volume).toBeCloseTo(.13);expect(player.paused).toBe(false);ui.rerender(<Harness active fadeOut/>);act(()=>vi.advanceTimersByTime(400));expect(player.volume).toBe(0);expect(player.paused).toBe(true);const calls=player.play.mock.calls.length;fireEvent.touchEnd(document.body);total(true);expect(player.play).toHaveBeenCalledTimes(calls);
 ui.rerender(<Harness active/>);await flush();act(()=>vi.advanceTimersByTime(240));expect(player.currentTime).toBe(42);expect(player.volume).toBeCloseTo(.8);expect(players).toHaveLength(1);
});
test('late readiness cannot revive cutoff or unmount, and background resumes the same player',async()=>{
 vi.useFakeTimers();const ui=render(<Harness active/>);await flush();const player=players[0]!;Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(player.paused).toBe(true);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});let finish:()=>void=()=>{};player.play.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=()=>{player.paused=false;player.readyState=4;resolve();};}));act(()=>document.dispatchEvent(new Event('visibilitychange')));ui.rerender(<Harness active fadeOut/>);await act(async()=>{finish();await Promise.resolve();});expect(player.paused).toBe(true);ui.unmount();expect(vi.getTimerCount()).toBe(0);
});
test('moving the shared global button between surfaces does not own or restart music',async()=>{
 function Shell({page}:{page:string}){const music=useOpeningMusic(true);return page==='HOME'?<header><OpeningMusicControl controller={music}/></header>:<section><OpeningMusicControl controller={music}/></section>;}
 const ui=render(<Shell page="HOME"/>);await flush();const player=players[0]!;player.currentTime=23;for(const page of ['CREATE','JOIN','LOBBY','FIRST_NIGHT'])ui.rerender(<Shell page={page}/>);expect(players).toHaveLength(1);expect(player.play).toHaveBeenCalledOnce();expect(player.pause).not.toHaveBeenCalled();expect(player.currentTime).toBe(23);expect(screen.getByRole('button',{name:'关闭声音'})).toHaveClass('global-audio-button');
});
test('re-enabling the total switch restores a duck target interrupted by an immediate mute',async()=>{
 vi.useFakeTimers();const ui=render(<Harness active/>);await flush();const player=players[0]!;ui.rerender(<Harness active ducked/>);act(()=>vi.advanceTimersByTime(80));total(false);total(true);await flush();act(()=>vi.advanceTimersByTime(240));expect(player.volume).toBeCloseTo(.26);expect(player.paused).toBe(false);
});
test('published cutoff and preview-only preference events never start opening music',async()=>{
 const ui=render(<Harness active fadeOut/>);await flush();expect(players[0]?.play).not.toHaveBeenCalled();act(()=>window.dispatchEvent(new Event('ravens-effects-audio')));expect(players[0]?.play).not.toHaveBeenCalled();ui.unmount();
});
