import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { RoomSheet } from './RoomPage.js';
import { audioPreferencesEvent,setAudioChannelEnabled,setAudioChannelVolume,type AudioChannel } from './audio-preferences.js';
import { audioControlEnabled,audioSettingsPreferences,globalAudioEvent,enableEffectsAudio,effectsPreviewActive,setPreviewChannel,unlockEffectsAudio } from './experience-audio.js';
import { privateAudioAllowed,setParticipationMode } from '../participation-audio.js';
import './audio-settings.css';

export function AudioSettings({display=false,privateControls=false,asNote=false,className='',onEnable}:{display?:boolean;privateControls?:boolean;asNote?:boolean;className?:string;onEnable?:()=>void}={}) {
  const [open,setOpen]=useState(false);
  const snapshot=()=>({prefs:audioSettingsPreferences(),master:audioControlEnabled(),preview:effectsPreviewActive(),privateSound:privateAudioAllowed()});
  const [state,setState]=useState(snapshot);
  const trigger=useRef<HTMLButtonElement>(null);
  const quiet=(!state.prefs.music.enabled||state.prefs.music.volume===0)&&(!state.prefs.effects.enabled||state.prefs.effects.volume===0);
  useEffect(()=>{
    const sync=()=>setState(snapshot());
    const events=[audioPreferencesEvent,globalAudioEvent,'ravens-effects-audio','ravens:participation-audio','ravens:preview-settings'];
    for(const event of events)window.addEventListener(event,sync);
    const hide=()=>{if(document.hidden)setOpen(false);};
    document.addEventListener('visibilitychange',hide);
    return()=>{for(const event of events)window.removeEventListener(event,sync);document.removeEventListener('visibilitychange',hide);};
  },[]);
  useLayoutEffect(()=>{
    if(!open)return;
    const app=trigger.current?.closest<HTMLElement>('.app-viewport');
    if(!app)return;
    const wasInert=app.inert;
    app.inert=true;
    return()=>{app.inert=wasInert;requestAnimationFrame(()=>{if(trigger.current?.isConnected&&trigger.current.getClientRects().length&&!trigger.current.closest('[inert]'))trigger.current.focus({preventScroll:true});});};
  },[open]);
  function unlock(){if(audioControlEnabled()){void unlockEffectsAudio();if(!effectsPreviewActive())window.dispatchEvent(new Event(globalAudioEvent));onEnable?.();}}
  function toggle(name:AudioChannel){
    const enabled=!audioSettingsPreferences()[name].enabled;
    if(state.preview)setPreviewChannel(name,{enabled});else setAudioChannelEnabled(name,enabled);
    if(enabled)unlock();
  }
  function setVolume(name:AudioChannel,volume:number){if(state.preview)setPreviewChannel(name,{volume});else setAudioChannelVolume(name,volume);}
  return <><button ref={trigger} data-global-audio-control className={asNote?`global-audio-button ${className}`:`audio-settings-entry ${className}`} type="button" aria-label="声音设置" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{unlock();setOpen(true);}}>{asNote?<span aria-hidden="true">{state.master&&!quiet?'♪':'♩'}</span>:'声音设置'}</button>
    {open&&createPortal(<RoomSheet title="声音设置" className="audio-settings-host" onClose={()=>setOpen(false)}><section className={`audio-settings${display?' audio-settings--display':''}`} aria-label={state.preview?'仅本次预览的声音':'本设备声音设置'}>
      <div className={`audio-settings__master${state.master?'':' is-muted'}`}><span>{state.master?(quiet?'音乐和音效均静音':'声音总开关'):'总静音已开启'}</span><button data-audio-settings-control type="button" onClick={()=>{const next=!audioControlEnabled();void enableEffectsAudio(next);if(next)onEnable?.();}}>{state.master?'开启总静音':'解除总静音'}</button></div>
      {(['music','effects'] as const).map(name=>{
        const channel=state.prefs[name],label=name==='music'?'音乐':'音效';
        return <fieldset key={name} className="audio-settings__channel"><legend>{label}</legend><div className="audio-settings__row"><span>{name==='music'?'背景音乐':'演出、翻页与提示'}</span><button data-audio-settings-control type="button" role="switch" aria-label={`${label}开关`} aria-checked={channel.enabled} onClick={()=>toggle(name)}>{channel.enabled?'开启':'关闭'}</button></div>
          <label className="audio-settings__volume"><span>{label}音量<output>{Math.round(channel.volume*100)}%</output></span><input data-audio-settings-control type="range" aria-label={`${label}音量`} min={0} max={100} step={1} value={Math.round(channel.volume*100)} onPointerDown={unlock} onKeyDown={unlock} onChange={event=>setVolume(name,Number(event.target.value)/100)}/></label></fieldset>;
      })}
      {privateControls&&!state.preview&&<div className="audio-settings__row"><span>私密操作音效</span><button type="button" role="switch" aria-label="私密操作音效" aria-checked={state.privateSound} onClick={()=>{setParticipationMode(state.privateSound?'IN_PERSON':'ONLINE');if(!state.privateSound)unlock();}}>{state.privateSound?'开启':'关闭'}</button></div>}
      <p className="audio-settings__note">{state.preview?'仅在本次预览中生效。':display?'仅保存于这台投屏设备。':'设置保存在本设备。'}</p>
    </section></RoomSheet>,document.body)}
  </>;
}
