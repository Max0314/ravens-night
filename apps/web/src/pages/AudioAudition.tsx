import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FeedbackButton } from '@ravens/ui';
import catalog from 'virtual:ravens-audio-preview-catalog';
import type { PreviewTrack } from 'virtual:ravens-audio-preview-catalog';
import { audioControlEnabled, audioSettingsPreferences, enableEffectsAudio, getEffectsAudioContext, setPreviewChannel, unlockEffectsAudio } from '../components/experience-audio.js';

const groups=[['music','背景音乐'],['effects','音效与环境声'],['candidate','候选素材']] as const;
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
function muteReason(item:PreviewTrack){
  if(!audioControlEnabled())return '解除总静音';
  const channel=audioSettingsPreferences()[item.channel];
  return !channel.enabled||channel.volume===0?(item.channel==='music'?'开启音乐':'开启音效'):'';
}

export function AudioAudition({allowed}:{allowed:boolean}) {
  const [group,setGroup]=useState<PreviewTrack['group']>('music'),[query,setQuery]=useState(''),[filter,setFilter]=useState('');
  const [track,setTrack]=useState<PreviewTrack>(),[playing,setPlaying]=useState(false),[progress,setProgress]=useState(0),[duration,setDuration]=useState(0),[problem,setProblem]=useState('');
  const [waiting,setWaiting]=useState(false),[muted,setMuted]=useState('');
  const active=useRef<PreviewTrack|undefined>(undefined), media=useRef<HTMLAudioElement>(null), graph=useRef<{source:MediaElementAudioSourceNode;gain:GainNode}|undefined>(undefined);
  const generation=useRef(0), unlockCheck=useRef<number|undefined>(undefined),permitted=useRef(allowed);permitted.current=allowed;
  function pause(){
    generation.current++;
    window.clearTimeout(unlockCheck.current);
    media.current?.pause();
    setWaiting(false);setPlaying(false);
  }
  const updateGain=()=>{
    const selected=active.current,node=media.current;
    if(!selected||!node)return;
    const channel=audioSettingsPreferences()[selected.channel],volume=audioControlEnabled()&&channel.enabled?channel.volume:0;
    if(graph.current)graph.current.gain.gain.value=volume;else node.volume=volume;
    setMuted(muteReason(selected));
    if(volume===0)pause();
  };
  useEffect(()=>{
    const node=media.current;
    window.addEventListener('ravens-effects-audio',updateGain);window.addEventListener('ravens:preview-settings',updateGain);
    const hide=()=>{if(document.hidden)pause();};
    document.addEventListener('visibilitychange',hide);
    return()=>{generation.current++;window.clearTimeout(unlockCheck.current);node?.pause();node?.removeAttribute('src');node?.load();graph.current?.source.disconnect();graph.current?.gain.disconnect();graph.current=undefined;window.removeEventListener('ravens-effects-audio',updateGain);window.removeEventListener('ravens:preview-settings',updateGain);document.removeEventListener('visibilitychange',hide);};
  },[]);
  useLayoutEffect(()=>{if(!allowed)pause();},[allowed]);
  function play(item:PreviewTrack){
    const node=media.current;
    if(!node||!permitted.current||document.hidden)return;
    if(active.current?.url!==item.url){pause();active.current=item;setTrack(item);setDuration(0);setProgress(0);node.src=item.url;}
    setProblem('');
    updateGain();
    if(muteReason(item))return;
    if(node.error)node.load();
    if(node.ended)node.currentTime=0;
    void unlockEffectsAudio();
    const context=getEffectsAudioContext();
    if(context&&!graph.current)try{
      const source=context.createMediaElementSource(node),gain=context.createGain();
      source.connect(gain);gain.connect(context.destination);graph.current={source,gain};
    }catch{/* Native streaming still works if routing is unavailable. */}
    const request=++generation.current;setWaiting(true);updateGain();
    window.clearTimeout(unlockCheck.current);
    if(context&&graph.current&&context.state!=='running')unlockCheck.current=window.setTimeout(()=>{
      if(request!==generation.current||context.state==='running')return;
      pause();setProblem('浏览器尚未开启声音，请再点一次播放');
    },1100);
    void node.play().then(()=>{
      if(request===generation.current&&(!permitted.current||document.hidden))node.pause();
    }).catch(()=>{if(request===generation.current){pause();setProblem('暂时无法播放，点一下重试');}});
  }
  function toggle(item:PreviewTrack){
    if(active.current?.url===item.url&&(playing||waiting))pause();
    else play(item);
  }
  function playWithSound(item:PreviewTrack){
    const {enabled,volume}=audioSettingsPreferences()[item.channel];
    if(!audioControlEnabled())void enableEffectsAudio(true);
    if(!enabled||volume===0)setPreviewChannel(item.channel,{enabled:true,volume:volume||(item.channel==='music'?.8:.72)});
    play(item);
  }
  function changeGroup(next:PreviewTrack['group']){
    if(next===group)return;
    pause();active.current=undefined;setTrack(undefined);setProblem('');setMuted('');
    const node=media.current;node?.removeAttribute('src');node?.load();
    setGroup(next);setQuery('');setFilter('');
  }
  const words=query.trim().toLowerCase(), groupTracks=catalog.filter(item=>group==='music'?item.channel==='music':item.group===group);
  const filtered=words?catalog.filter(item=>`${item.title} ${item.id} ${item.label} ${item.url} ${item.detail??''}`.toLowerCase().includes(words))
    :groupTracks.filter(item=>!filter||item.detail===filter);
  return <div className="audition-page">
    <div className="effects-lab__body">
      <h1>音频试听</h1>
      <nav className="effects-lab__filters" aria-label="音频分类">{groups.map(([id,label])=><button type="button" key={id} aria-pressed={id===group} onClick={()=>changeGroup(id)}>{label}</button>)}</nav>
      <div className="audition-page__search"><input type="search" aria-label="搜索音频" placeholder="搜索全部名称、编号或版本" value={query} onChange={event=>setQuery(event.target.value)}/>{group==='effects'&&!words&&<select aria-label="音效用途" value={filter} onChange={event=>setFilter(event.target.value)}><option value="">全部用途</option>{[...new Set(groupTracks.map(item=>item.detail))].map(label=><option key={label}>{label}</option>)}</select>}</div>
      <ul className="audition-list">{filtered.map(item=><li key={item.url}>
        <FeedbackButton type="button" feedback="none" disabled={!allowed} onClick={()=>toggle(item)} aria-pressed={track?.url===item.url&&playing}><strong>{item.title}</strong><small>{item.label}{item.detail?` · ${item.detail}`:''}</small><span aria-hidden="true">{track?.url===item.url&&playing?'Ⅱ':'▶'}</span></FeedbackButton>
        {track?.url===item.url&&<div className="audition-list__credits">{item.author&&<span>{item.author}</span>}{item.sources[0]&&<a href={item.sources[0]} target="_blank" rel="noreferrer">来源</a>}{item.licenseUrl?<a href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license??'许可'}</a>:item.license&&<span>{item.license}</span>}{item.metadata&&<a href={item.metadata} target="_blank" rel="noreferrer">素材资料</a>}</div>}
      </li>)}</ul>{filtered.length===0&&<p role="status">没有匹配的音频</p>}
    </div>
    <audio ref={media} preload="none" onPlaying={()=>{if(active.current&&permitted.current&&media.current?.paused===false){setWaiting(false);setPlaying(true);}}} onWaiting={()=>{if(media.current?.paused===false)setWaiting(true);}} onEnded={()=>{setWaiting(false);setPlaying(false);}}
      onError={()=>{if(active.current&&media.current?.error){pause();setProblem('音轨加载失败，请重试');}}} onTimeUpdate={()=>setProgress(media.current?.currentTime??0)}
      onLoadedMetadata={()=>setDuration(media.current?.duration??0)}/>
    {track&&<footer className="audition-transport"><div><strong>{track.title}</strong><FeedbackButton type="button" feedback="none" disabled={!allowed} onClick={()=>muted?playWithSound(track):toggle(track)}>{muted||((playing||waiting)?'暂停':problem?'重试':'播放')}</FeedbackButton></div>
      <label><span>{time(progress)} / {time(Number.isFinite(duration)?duration:0)}</span><input type="range" aria-label="试听进度" min={0} max={Number.isFinite(duration)?duration:0} step=".01" value={progress} disabled={!duration} onChange={event=>{if(media.current)media.current.currentTime=Number(event.target.value);setProgress(Number(event.target.value));}}/></label>
      {(muted||waiting||problem)&&<p role="status">{muted?'已静音，开启声音后可试听':waiting?'正在载入音轨…':problem}</p>}
    </footer>}
  </div>;
}
