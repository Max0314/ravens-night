import {useEffect,useState} from 'react';
import {audioControlEnabled,audioChannelsSilent,effectsAudioStatus,enableEffectsAudio} from './experience-audio.js';
import {audioPreferencesEvent} from './audio-preferences.js';
import './global-audio-button.css';

/** One total preference; inside the lab the existing preview scope remains isolated. */
export function GlobalAudioButton({className='',onEnable}:{className?:string;onEnable?:()=>void}){
 const[enabled,setEnabled]=useState(audioControlEnabled),[status,setStatus]=useState(effectsAudioStatus);
 const[,refresh]=useState(0);
 useEffect(()=>{const sync=()=>{setEnabled(audioControlEnabled());setStatus(effectsAudioStatus());refresh(v=>v+1);};for(const name of ['ravens-effects-audio','ravens:audio-status','ravens-effects-unlocked',audioPreferencesEvent])window.addEventListener(name,sync);return()=>{for(const name of ['ravens-effects-audio','ravens:audio-status','ravens-effects-unlocked',audioPreferencesEvent])window.removeEventListener(name,sync);};},[]);
 const quiet=enabled&&audioChannelsSilent(),label=enabled?(quiet?'音乐和音效均静音，关闭声音总开关':'关闭声音'):'开启声音';
 return <button data-global-audio-control className={`global-audio-button ${className}`} type="button" aria-label={label} aria-pressed={enabled} title={status||label} onClick={()=>{const next=!audioControlEnabled();void enableEffectsAudio(next);if(next)onEnable?.();}}><span aria-hidden="true">{enabled&&!quiet?'♪':'♩'}</span></button>;
}
