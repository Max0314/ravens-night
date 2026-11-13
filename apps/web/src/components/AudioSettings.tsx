import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {RoomSheet} from './RoomPage.js';
import {audioPreferences,audioPreferencesEvent,setAudioChannelEnabled,setAudioChannelVolume,type AudioChannel} from './audio-preferences.js';
import {globalAudioEnabled,globalAudioEvent,enableEffectsAudio,effectsPreviewActive,unlockEffectsAudio} from './experience-audio.js';
import './audio-settings.css';

/** Device-local channel settings; the existing note remains the master mute control. */
export function AudioSettings(){
 const[open,setOpen]=useState(false);
 const snapshot=()=>({prefs:audioPreferences(),master:globalAudioEnabled(),preview:effectsPreviewActive()});
 const[state,setState]=useState(snapshot);
 const quiet=(!state.prefs.music.enabled||state.prefs.music.volume===0)&&(!state.prefs.effects.enabled||state.prefs.effects.volume===0);
 const summary=state.master?(quiet?'音乐和音效均静音':`音乐${state.prefs.music.enabled?Math.round(state.prefs.music.volume*100)+'%':'关闭'} · 音效${state.prefs.effects.enabled?Math.round(state.prefs.effects.volume*100)+'%':'关闭'}`):'总静音已开启';
 useEffect(()=>{const sync=()=>setState(snapshot());for(const name of [audioPreferencesEvent,globalAudioEvent,'ravens-effects-audio'])window.addEventListener(name,sync);return()=>{for(const name of [audioPreferencesEvent,globalAudioEvent,'ravens-effects-audio'])window.removeEventListener(name,sync);};},[]);
 const unlock=(name:AudioChannel)=>{if(!state.preview&&globalAudioEnabled()&&audioPreferences()[name].enabled)void unlockEffectsAudio();};
 const toggle=(name:AudioChannel)=>{const next=!audioPreferences()[name].enabled;if(next&&globalAudioEnabled())void unlockEffectsAudio();setAudioChannelEnabled(name,next);};
 return <><button type="button" className="audio-settings-entry" onClick={()=>setOpen(true)}>声音设置<span>{summary}</span></button>{open?createPortal(<RoomSheet title="声音设置" onClose={()=>setOpen(false)}><section className="audio-settings" aria-label="本设备声音设置">{state.preview?<p>预览声音请在演出页调整。</p>:<>
  <div className={`audio-settings__master${state.master?'':' is-muted'}`} role="status"><span>{state.master?(quiet?'音乐和音效均静音':'声音总开关已开启'):'总静音已开启'}</span><button data-audio-settings-control type="button" onClick={()=>void enableEffectsAudio(!globalAudioEnabled())}>{state.master?'开启总静音':'解除总静音'}</button>{!state.master?<small>解除后恢复下列设置</small>:quiet?<small>可开启下列通道或提高音量</small>:null}</div>
  {(['music','effects'] as const).map(name=>{const channel=state.prefs[name],label=name==='music'?'音乐':'音效';return <fieldset key={name} className="audio-settings__channel"><legend>{label}</legend><div className="audio-settings__row"><span>{name==='music'?'背景音乐':'演出、翻页与提示'}</span><button data-audio-settings-control type="button" role="switch" aria-label={`${label}开关`} aria-checked={channel.enabled} onClick={()=>toggle(name)}>{channel.enabled?'开启':'关闭'}</button></div><label className="audio-settings__volume"><span>{label}音量<output>{Math.round(channel.volume*100)}%</output></span><input data-audio-settings-control type="range" aria-label={`${label}音量`} min={0} max={100} step={1} value={Math.round(channel.volume*100)} onPointerDown={()=>unlock(name)} onTouchStart={()=>unlock(name)} onKeyDown={()=>unlock(name)} onChange={event=>setAudioChannelVolume(name,Number(event.target.value)/100)}/></label></fieldset>;})}
  <p className="audio-settings__note">仅保存于本设备。线下加入时，私密动作始终静音。</p>
 </>}</section></RoomSheet>,document.body):null}</>;
}
