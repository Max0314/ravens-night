// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {AudioSettings} from './AudioSettings.js';
import {GlobalAudioButton} from './GlobalAudioButton.js';
import {GameScoreOwner} from './GameScoreOwner.js';
import * as audio from './experience-audio.js';
import * as prefs from './audio-preferences.js';
import {setParticipationMode} from '../participation-audio.js';
import {Display} from '../pages/Display.js';
import {getRoom,type RoomView} from '../api.js';
import type {RoomPacket} from '../room-live.js';
const publicFeed=vi.hoisted(()=>({receive:undefined as ((packet:RoomPacket)=>void)|undefined}));
vi.mock('../api.js',async original=>({...await original<object>(),getRoom:vi.fn()}));
vi.mock('../room-live.js',()=>({connectRoomFeed:(_code:string,_mode:string,receive:(packet:RoomPacket)=>void)=>{publicFeed.receive=receive;return()=>{};}}));
vi.mock('../invite.js',()=>({invitationQr:async()=>'/test-qr.png'}));
vi.mock('./EventStage.js',()=>({EventStage:()=>null,publicEventsAt:(events:unknown[])=>events}));
const calls:string[]=[],players:Media[]=[],buffers:Node[]=[],musicGains=new Map<Media,Node>();let context:Context|undefined;
class Media extends EventTarget{loop=false;preload='';volume=1;muted=false;paused=true;readyState=4;currentTime=0;duration=100;error=null;constructor(public src:string){super();players.push(this);}load(){}pause(){this.paused=true;}play(){calls.push('play');this.paused=false;return Promise.resolve();}}
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}}
class Node{gain=new Param();playbackRate=new Param();buffer:unknown;onended:(()=>void)|null=null;stopped=false;connect(){}disconnect(){}start(){buffers.push(this);}stop(){this.stopped=true;}}
class Context extends EventTarget{state='suspended';currentTime=10;destination={};constructor(){super();context=this;}resume(){calls.push('resume');this.state='running';this.dispatchEvent(new Event('statechange'));return Promise.resolve();}createGain(){return new Node();}createBufferSource(){return new Node();}createMediaElementSource(media:Media){return{connect:(gain:Node)=>musicGains.set(media,gain),disconnect:()=>{}};}async decodeAudioData(){return{duration:12,length:529200,numberOfChannels:1};}}
const flush=async()=>{await act(async()=>{for(let i=0;i<25;i++)await Promise.resolve();});};
beforeEach(async()=>{vi.useFakeTimers();vi.stubGlobal('Audio',Media);vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})));Object.defineProperty(document,'hidden',{configurable:true,value:false});setParticipationMode('IN_PERSON');prefs.setAudioChannelEnabled('music',true);prefs.setAudioChannelEnabled('effects',true);prefs.setAudioChannelVolume('music',.8);prefs.setAudioChannelVolume('effects',.72);await audio.enableEffectsAudio(false);players.length=0;buffers.length=0;musicGains.clear();calls.length=0;});
afterEach(async()=>{cleanup();await audio.enableEffectsAudio(false);vi.unstubAllGlobals();vi.useRealTimers();});
test('menu channels persist, master restores choices, and channel changes never stop the other output',async()=>{
 render(<><GameScoreOwner screen="HOME"/><GlobalAudioButton/><AudioSettings/></>);fireEvent.click(screen.getByRole('button',{name:/^声音设置/}));expect(screen.getByRole('dialog',{name:'声音设置'})).toBeVisible();expect(screen.getByRole('dialog').parentElement?.parentElement).toBe(document.body);expect(within(screen.getByRole('dialog')).getByText('总静音已开启')).toBeVisible();expect(screen.getByRole('slider',{name:'音乐音量'})).toHaveValue('80');expect(screen.getByRole('slider',{name:'音效音量'})).toHaveValue('72');
 fireEvent.click(screen.getByRole('switch',{name:'音乐开关'}));expect(prefs.audioPreferences().music.enabled).toBe(false);fireEvent.click(screen.getByRole('button',{name:'解除总静音'}));await flush();expect(players).toHaveLength(0);expect(audio.globalAudioEnabled()).toBe(true);audio.playSemantic('paper-turn');await flush();expect(buffers.some(n=>!n.stopped)).toBe(true);
 context!.state='suspended';calls.length=0;fireEvent.keyDown(document,{key:'Enter'});expect(calls[0]).toBe('resume');expect(players).toHaveLength(0);
 context!.state='suspended';calls.length=0;fireEvent.click(screen.getByRole('switch',{name:'音乐开关'}));expect(calls.slice(0,2)).toEqual(['resume','play']);await flush();act(()=>vi.advanceTimersByTime(2000));const music=players[0]!,gain=musicGains.get(music)!;music.currentTime=42;expect(gain.gain.value).toBe(.8);
 fireEvent.change(screen.getByRole('slider',{name:'音乐音量'}),{target:{value:'40'}});expect(gain.gain.value).toBe(.4);expect(buffers.every(n=>!n.stopped)).toBe(true);expect(players).toHaveLength(1);expect(music.currentTime).toBe(42);
 audio.scheduleCue('settings-bell','NIGHT_FALLS',0,4);await flush();context!.currentTime+=.6;act(()=>vi.advanceTimersByTime(80));act(()=>vi.advanceTimersByTime(240));expect(gain.gain.value).toBeCloseTo(.13);fireEvent.click(screen.getByRole('switch',{name:'音效开关'}));act(()=>vi.advanceTimersByTime(240));expect(buffers.every(n=>n.stopped)).toBe(true);expect(music.paused).toBe(false);expect(gain.gain.value).toBeCloseTo(.4);expect(screen.getByRole('button',{name:'关闭声音'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'开启总静音'}));expect(music.paused).toBe(true);fireEvent.click(screen.getByRole('button',{name:'解除总静音'}));await flush();act(()=>vi.advanceTimersByTime(240));expect(prefs.audioPreferences()).toMatchObject({music:{enabled:true,volume:.4},effects:{enabled:false,volume:.72}});expect(music.currentTime).toBe(42);expect(players).toHaveLength(1);expect(JSON.parse(localStorage.getItem(prefs.audioPreferencesKey)!)).toEqual(prefs.audioPreferences());fireEvent.click(screen.getByRole('button',{name:'关闭声音设置'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('preview exposes no formal setting controls and its sound changes cannot overwrite saved channels',async()=>{
 prefs.setAudioChannelEnabled('music',false);prefs.setAudioChannelEnabled('effects',false);prefs.setAudioChannelVolume('music',.22);const saved=localStorage.getItem(prefs.audioPreferencesKey),leave=audio.beginEffectsPreview();await audio.enableEffectsAudio(true);audio.setEffectsPreviewVolume(.61);render(<><GlobalAudioButton/><AudioSettings/></>);fireEvent.click(screen.getByRole('button',{name:/^声音设置/}));expect(screen.getByText('预览声音请在演出页调整。')).toBeVisible();expect(screen.queryByRole('switch')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));expect(audio.globalAudioEnabled()).toBe(false);expect(localStorage.getItem(prefs.audioPreferencesKey)).toBe(saved);cleanup();leave();
});
test('master-on with silent channels is explicit and restoring master does not reset either user choice',async()=>{
 prefs.setAudioChannelEnabled('music',false);prefs.setAudioChannelVolume('effects',0);await audio.enableEffectsAudio(true);render(<><GlobalAudioButton/><AudioSettings/></>);expect(screen.getByRole('button',{name:'音乐和音效均静音，关闭声音总开关'})).toHaveTextContent('♩');fireEvent.click(screen.getByRole('button',{name:/^声音设置/}));expect(within(screen.getByRole('dialog')).getByText('音乐和音效均静音')).toBeVisible();expect(screen.getByText('可开启下列通道或提高音量')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'开启总静音'}));fireEvent.click(screen.getByRole('button',{name:'解除总静音'}));expect(prefs.audioPreferences()).toMatchObject({music:{enabled:false},effects:{enabled:true,volume:0}});expect(screen.getByRole('button',{name:'音乐和音效均静音，关闭声音总开关'})).toHaveAttribute('aria-pressed','true');
});

test('public display owns music from its live public room through day, night and the revealed finale',async()=>{
 const room:RoomView={code:'TV1234',roomInstanceId:'tv',revision:1,state:'RUNNING',playerCount:6,participants:[],game:{gameId:'tv-game',phase:'DAY_DISCUSSION',day:1,serverNow:Date.now(),aliveCount:6,readyCount:0,events:[],seats:[]}};
 vi.mocked(getRoom).mockResolvedValue(room);await audio.enableEffectsAudio(true);render(<Display code={room.code} onBack={()=>{}} onRoomClosed={()=>{}}/>);await flush();
 const day=players.find(p=>p.src.endsWith('background-m15.mp3'));expect(day?.paused).toBe(false);
 const night:RoomView={...room,revision:2,game:{...room.game!,phase:'OTHER_NIGHT'}};
 act(()=>publicFeed.receive!({type:'view',room:night,serverNow:Date.now()}));await flush();act(()=>vi.advanceTimersByTime(2100));expect(players.find(p=>p.src.endsWith('background-m18.mp3'))?.paused).toBe(false);expect(day?.paused).toBe(true);
 const finale:RoomView={...night,revision:3,game:{...night.game!,phase:'GAME_OVER',winner:'GOOD',revealComplete:true}};
 act(()=>publicFeed.receive!({type:'view',room:finale,serverNow:Date.now()}));await flush();expect(players.find(p=>p.src.endsWith('background-m01.mp3'))?.paused).toBe(false);
});

test('public display exposes independent music and effects settings on the projecting device',async()=>{
 vi.mocked(getRoom).mockResolvedValue({code:'TV1234',state:'LOBBY',playerCount:6,participants:[]});render(<Display code="TV1234" onBack={()=>{}} onRoomClosed={()=>{}}/>);await flush();
 fireEvent.click(screen.getByRole('button',{name:'声音设置'}));expect(screen.getByRole('dialog',{name:'声音设置'})).toBeVisible();expect(screen.getByLabelText('本设备声音设置')).toHaveClass('audio-settings--display');
 fireEvent.change(screen.getByRole('slider',{name:'音乐音量'}),{target:{value:'37'}});fireEvent.change(screen.getByRole('slider',{name:'音效音量'}),{target:{value:'22'}});expect(prefs.audioPreferences()).toMatchObject({music:{volume:.37},effects:{volume:.22}});expect(screen.getByText('仅保存于这台投屏设备，不影响玩家手机。')).toBeVisible();
});
