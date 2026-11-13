// @vitest-environment jsdom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {GameScoreOwner} from './GameScoreOwner.js';
const sound=vi.hoisted(()=>({enabled:false,preview:false,duck:false,context:undefined as unknown as AudioContext}));
vi.mock('./experience-audio.js',()=>({getEffectsAudioContext:()=>sound.context,unlockEffectsAudio:vi.fn(async()=>{}),globalAudioEvent:'ravens:global-audio',globalAudioEnabled:()=>sound.enabled,effectsPreviewActive:()=>sound.preview,scoreDuckingActive:()=>sound.duck,reportAudioStatus:()=>{}}));
const players:Player[]=[];
class Player extends EventTarget{loop=false;preload='';volume=0;muted=false;paused=true;readyState=4;currentTime=0;error=null;load=vi.fn();play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){super();players.push(this);}}
const flush=async()=>{await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});};
beforeEach(()=>{sound.context=Object.assign(new EventTarget(),{state:'running',destination:{},createGain:()=>({gain:{value:0},connect:()=>{},disconnect:()=>{}}),createMediaElementSource:()=>({connect:()=>{},disconnect:()=>{}})}) as unknown as AudioContext;vi.useFakeTimers();players.length=0;sound.enabled=false;sound.preview=false;sound.duck=false;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Player);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
test('global enable plays in the same event stack once, and page renders keep the same owner',async()=>{
 const ui=render(<><GameScoreOwner screen="HOME"/><button data-global-audio-control onClick={()=>{sound.enabled=true;window.dispatchEvent(new Event('ravens:global-audio'));}}>sound</button></>);expect(players).toHaveLength(0);fireEvent.click(ui.getByRole('button'));expect(players).toHaveLength(1);expect(players[0]!.play).toHaveBeenCalledOnce();await flush();players[0]!.currentTime=25;ui.rerender(<GameScoreOwner screen="JOIN"/>);expect(players).toHaveLength(1);expect(players[0]!.currentTime).toBe(25);expect(players[0]!.play).toHaveBeenCalledOnce();
});
test('preview and background suspend formal music, then restore without altering the master',async()=>{
 sound.enabled=true;render(<GameScoreOwner screen="HOME"/>);await flush();const p=players[0]!;sound.preview=true;act(()=>window.dispatchEvent(new Event('ravens-effects-audio')));expect(p.paused).toBe(true);expect(sound.enabled).toBe(true);sound.preview=false;act(()=>window.dispatchEvent(new Event('ravens-effects-audio')));await flush();expect(players).toHaveLength(1);expect(p.paused).toBe(false);Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(p.paused).toBe(true);
});
