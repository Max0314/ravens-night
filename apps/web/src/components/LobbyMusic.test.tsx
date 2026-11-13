// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {LobbyMusic,lobbyMusicTrack} from './LobbyMusic.js';
vi.mock('./experience-audio.js',()=>({unlockEffectsAudio:vi.fn(async()=>{})}));
const players:Player[]=[];
class Player extends EventTarget{loop=false;preload='';volume=1;muted=false;paused=true;readyState=0;error:{code:number}|null=null;load=vi.fn(()=>{this.error=null;});play=vi.fn(async()=>{this.paused=false;this.readyState=4;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){super();players.push(this);}}
beforeEach(()=>{localStorage.clear();players.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Player);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
async function flush(){await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve();});}
test('M19 persists across lobby and role-confirmation renders and stops only when the shared phase leaves',async()=>{
 const ui=render(<LobbyMusic active/>);await flush();const player=players[0]!;
 expect(lobbyMusicTrack.name).toBe('短暂的人世');expect(player.src.endsWith('/lobby-m19.mp3')).toBe(true);expect(player.loop).toBe(true);
 ui.rerender(<LobbyMusic active/>);await flush();expect(players).toHaveLength(1);expect(player.pause).not.toHaveBeenCalled();expect(player.play).toHaveBeenCalledOnce();
 ui.rerender(<LobbyMusic active={false}/>);expect(player.pause).toHaveBeenCalled();expect(screen.queryByRole('button')).toBeNull();
});
test('autoplay rejection keeps a nonblocking gesture entry and off preference survives other gestures',async()=>{
 render(<LobbyMusic active/>);await flush();const player=players[0]!;fireEvent.click(screen.getByRole('button',{name:/关闭/}));expect(player.paused).toBe(true);fireEvent.pointerDown(document.body);await flush();expect(player.play).toHaveBeenCalledOnce();
 player.play.mockRejectedValueOnce(new Error('NotAllowedError'));fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(screen.getByRole('status')).toHaveTextContent('可继续游戏');
 fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(screen.getByRole('button',{name:/关闭/})).toHaveAttribute('aria-pressed','true');
});
test('a late play cannot restart after phase exit and visibility pauses then resumes the same track',async()=>{
 const ui=render(<LobbyMusic active/>);await flush();const player=players[0]!;
 Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(player.paused).toBe(true);
 Object.defineProperty(document,'hidden',{configurable:true,value:false});let finish:()=>void=()=>{};player.play.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=()=>{player.paused=false;resolve();};}));act(()=>document.dispatchEvent(new Event('visibilitychange')));
 ui.rerender(<LobbyMusic active={false}/>);await act(async()=>{finish();await Promise.resolve();});expect(player.paused).toBe(true);
});

test('pending enable can be cancelled and a stale rejection cannot overwrite a newer successful playback',async()=>{
 const ui=render(<LobbyMusic active/>);await flush();const player=players[0]!;
 fireEvent.click(screen.getByRole('button',{name:/关闭/}));let rejectOld:(error:Error)=>void=()=>{};
 player.play.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOld=reject;}));fireEvent.click(screen.getByRole('button',{name:/开启/}));expect(screen.getByRole('button',{name:'取消开启大厅音乐'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'取消开启大厅音乐'}));expect(localStorage.getItem('ravens_lobby_music')).toBe('off');
 fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(player.paused).toBe(false);
 await act(async()=>{rejectOld(new Error('stale rejection'));await Promise.resolve();});expect(screen.queryByRole('status')).toBeNull();expect(screen.getByRole('button',{name:/关闭/})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:/关闭/}));expect(player.paused).toBe(true);ui.unmount();
});


test('resolved play without actual media readiness stays loading and recovers after a bounded retry',async()=>{
 vi.useFakeTimers();localStorage.setItem('ravens_lobby_music','off');render(<LobbyMusic active/>);const player=players[0]!;player.play.mockResolvedValueOnce();fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(screen.getByRole('button')).toHaveAttribute('aria-pressed','false');
 act(()=>vi.advanceTimersByTime(8000));expect(screen.getByRole('button',{name:/开启/})).toHaveAttribute('aria-busy','false');expect(screen.getByRole('status')).toHaveTextContent('尚未开始');
 fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(screen.getByRole('button',{name:/关闭/})).toHaveAttribute('aria-pressed','true');
});
test('touchend retries a pending automatic request in the same gesture without waiting on the old promise',async()=>{
 localStorage.setItem('ravens_lobby_music','off');render(<LobbyMusic active/>);const player=players[0]!;let rejectOld:(error:Error)=>void=()=>{};
 player.play.mockImplementationOnce(()=>new Promise<void>((_resolve,reject)=>{rejectOld=reject;}));fireEvent.click(screen.getByRole('button',{name:/开启/}));expect(player.play).toHaveBeenCalledOnce();
 fireEvent.touchEnd(document.body);expect(player.play).toHaveBeenCalledTimes(2);await flush();expect(screen.getByRole('button',{name:/关闭/})).toBeVisible();await act(async()=>{rejectOld(new Error('old blocked request'));await Promise.resolve();});expect(screen.queryByRole('status')).toBeNull();
});
test('media pause, buffering and load errors cannot keep a false playing badge, and retry reloads failed media',async()=>{
 render(<LobbyMusic active/>);await flush();const player=players[0]!;expect(player.volume).toBe(.8);expect(player.muted).toBe(false);expect(player.preload).toBe('auto');
 player.paused=true;act(()=>player.dispatchEvent(new Event('pause')));expect(screen.getByRole('button',{name:/开启/})).toHaveAttribute('aria-pressed','false');
 player.paused=false;player.readyState=1;act(()=>player.dispatchEvent(new Event('waiting')));expect(screen.getByRole('status')).toHaveTextContent('缓冲');expect(screen.getByRole('button')).toHaveAttribute('aria-pressed','false');
 player.readyState=4;act(()=>player.dispatchEvent(new Event('playing')));expect(screen.getByRole('button',{name:/关闭/})).toBeVisible();
 player.error={code:2};act(()=>player.dispatchEvent(new Event('error')));expect(screen.getByRole('button',{name:/开启/})).toHaveAttribute('aria-pressed','false');expect(screen.getByRole('status')).toHaveTextContent('连接中断');fireEvent.click(screen.getByRole('button',{name:/开启/}));await flush();expect(player.load).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:/关闭/})).toBeVisible();
});
