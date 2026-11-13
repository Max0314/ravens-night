// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {LobbyMusic,lobbyMusicTrack} from './LobbyMusic.js';
vi.mock('./experience-audio.js',()=>({unlockEffectsAudio:vi.fn(async()=>{})}));
const players:Player[]=[];
class Player{loop=false;preload='';volume=1;paused=true;play=vi.fn(async()=>{this.paused=false;});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){players.push(this);}}
beforeEach(()=>{localStorage.clear();players.length=0;Object.defineProperty(document,'hidden',{configurable:true,value:false});vi.stubGlobal('Audio',Player);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function flush(){await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve();});}
test('M19 persists across lobby and role-confirmation renders and stops only when the shared phase leaves',async()=>{
 const ui=render(<LobbyMusic active/>);await flush();const player=players[0]!;
 expect(lobbyMusicTrack.name).toBe('短暂的人世');expect(player.src.endsWith('/M19.mp3')).toBe(true);expect(player.loop).toBe(true);
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
