// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {GlobalAudioButton} from './GlobalAudioButton.js';
import {useOpeningMusic} from './LobbyMusic.js';
import * as audio from './experience-audio.js';
import {privateAudioAllowed,setParticipationMode} from '../participation-audio.js';
const calls:string[]=[];let player:Media;
class Media extends EventTarget{loop=false;preload='';volume=1;muted=false;paused=true;readyState=0;error=null;constructor(public src:string){super();player=this;}load(){}pause(){this.paused=true;calls.push('pause');}async play(){calls.push('html.play');this.paused=false;this.readyState=4;}}
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}}
class Node{gain=new Param();playbackRate=new Param();buffer:unknown;onended:(()=>void)|null=null;connect(){}disconnect(){}start(){calls.push('sample.start');}stop(){calls.push('sample.stop');}}
class Context{state='suspended';currentTime=0;destination={};resume(){calls.push('web.resume');this.state='running';return Promise.resolve();}createGain(){return new Node();}createBufferSource(){return new Node();}async decodeAudioData(){return{duration:.5};}}
beforeEach(async()=>{localStorage.clear();calls.length=0;setParticipationMode('IN_PERSON');vi.stubGlobal('Audio',Media);vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})));await audio.enableEffectsAudio(false);calls.length=0;});
afterEach(async()=>{cleanup();await audio.enableEffectsAudio(false);vi.unstubAllGlobals();vi.restoreAllMocks();});
async function flush(){await act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});}
test('one compact button synchronously resumes WebAudio and starts HTMLAudio before its click returns',async()=>{
 localStorage.setItem('ravens_lobby_music','off');localStorage.setItem('ravens_book_audio','off');
 function Root(){useOpeningMusic(true);return <GlobalAudioButton onEnable={()=>calls.push('onEnable')}/>;}render(<Root/>);
 fireEvent.click(screen.getByRole('button',{name:'开启声音'}));expect(calls.slice(0,3)).toEqual(['web.resume','html.play','onEnable']);expect(audio.effectsAudioEnabled()).toBe(true);expect(localStorage.getItem('ravens_effects_audio')).toBe('on');expect(privateAudioAllowed()).toBe(false);await flush();
 expect(screen.getByRole('button',{name:'关闭声音'})).toHaveClass('global-audio-button');expect(screen.getByRole('button')).toHaveTextContent('♪');fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));expect(player.paused).toBe(true);expect(audio.effectsAudioEnabled()).toBe(false);
});
test('total mute cancels paper output and book preparation cannot reopen it',async()=>{
 await audio.enableEffectsAudio(true);const owner={};expect(await audio.prepareBookAudio(owner)).toBe(true);audio.playSemantic('paper-turn');await flush();expect(calls).toContain('sample.start');render(<GlobalAudioButton/>);fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));expect(calls).toContain('sample.stop');const count=calls.filter(c=>c==='sample.start').length;expect(await audio.prepareBookAudio(owner)).toBe(false);audio.playSemantic('paper-turn');await flush();expect(calls.filter(c=>c==='sample.start')).toHaveLength(count);audio.releaseBookAudio(owner);
});
test('preview toggles remain isolated from the formal music event and saved total preference',async()=>{
 const leave=audio.beginEffectsPreview(),event=vi.fn();window.addEventListener(audio.globalAudioEvent,event);render(<GlobalAudioButton/>);fireEvent.click(screen.getByRole('button',{name:'开启声音'}));await flush();expect(audio.effectsAudioEnabled()).toBe(true);expect(audio.globalAudioEnabled()).toBe(false);expect(localStorage.getItem('ravens_effects_audio')).toBe('off');expect(event).not.toHaveBeenCalled();cleanup();leave();window.removeEventListener(audio.globalAudioEvent,event);
});
