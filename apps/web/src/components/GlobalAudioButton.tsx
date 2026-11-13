import {useEffect,useState} from 'react';
import {effectsAudioEnabled,effectsAudioStatus,enableEffectsAudio} from './experience-audio.js';
import './global-audio-button.css';

/** One total preference; inside the lab the existing preview scope remains isolated. */
export function GlobalAudioButton({className='',onEnable}:{className?:string;onEnable?:()=>void}){
 const[enabled,setEnabled]=useState(effectsAudioEnabled),[status,setStatus]=useState(effectsAudioStatus);
 useEffect(()=>{const sync=()=>{setEnabled(effectsAudioEnabled());setStatus(effectsAudioStatus());};for(const name of ['ravens-effects-audio','ravens:audio-status','ravens-effects-unlocked'])window.addEventListener(name,sync);return()=>{for(const name of ['ravens-effects-audio','ravens:audio-status','ravens-effects-unlocked'])window.removeEventListener(name,sync);};},[]);
 const label=enabled?'关闭声音':'开启声音';
 return <button data-global-audio-control className={`global-audio-button ${className}`} type="button" aria-label={label} aria-pressed={enabled} title={status||label} onClick={()=>{const next=!effectsAudioEnabled();void enableEffectsAudio(next);if(next)onEnable?.();}}><span aria-hidden="true">{enabled?'♪':'♩'}</span></button>;
}
