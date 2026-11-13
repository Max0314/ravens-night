import {FeedbackButton} from '@ravens/ui';
import {useEffect,useState} from 'react';
import {participationMode,setParticipationMode,type ParticipationMode} from '../participation-audio.js';
import {effectsAudioEnabled,unlockEffectsAudio} from './experience-audio.js';
import './participation-audio.css';
export function ParticipationAudioChoice(){
 const[mode,setMode]=useState(participationMode),[sound,setSound]=useState(effectsAudioEnabled),[message,setMessage]=useState('');
 useEffect(()=>{const sync=()=>{setMode(participationMode());setSound(effectsAudioEnabled());};window.addEventListener('ravens:participation-audio',sync);window.addEventListener('ravens-effects-audio',sync);return()=>{window.removeEventListener('ravens:participation-audio',sync);window.removeEventListener('ravens-effects-audio',sync);};},[]);
 function choose(value:ParticipationMode){setParticipationMode(value);setMode(value);setMessage('');if(value==='ONLINE')void unlockEffectsAudio().catch(()=>setMessage('声音尚未启用，可再次点击开启。'));}
 return <fieldset className="participation-audio"><legend>参与方式</legend><div className="participation-audio__choices"><FeedbackButton type="button" aria-pressed={mode==='ONLINE'} onClick={()=>choose('ONLINE')}><span aria-hidden="true">◉</span><strong>线上加入</strong><small>私密动作有音效</small></FeedbackButton><FeedbackButton type="button" aria-pressed={mode==='IN_PERSON'} onClick={()=>choose('IN_PERSON')}><span aria-hidden="true">◌</span><strong>线下加入</strong><small>私密动作静音</small></FeedbackButton></div><small>仅影响本设备私密动作音效，局内可切换。</small>{!sound?<div className="participation-audio__muted"><span>声音已关闭，可用页头音符开启全部声音。</span></div>:null}{message?<p role="status">{message}</p>:null}</fieldset>;
}
