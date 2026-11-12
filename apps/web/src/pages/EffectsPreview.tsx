import {useEffect,useRef,useState} from 'react';
import {avatarChoices,experienceTiming,type ExperienceEvent,type PresentationVersion} from '@ravens/contracts';
import type {GameView} from '../api.js';
import {EventStage,privateSceneDuration,type PrivateReceipt} from '../components/EventStage.js';
import {ParticipationAudioChoice} from '../components/ParticipationAudioChoice.js';
import {effectsAudioStatus,silenceEffects} from '../components/experience-audio.js';
import '../styles/effects-preview.css';
type Scenario={id:string;label:string;kind?:ExperienceEvent['kind'];outcome?:ExperienceEvent['outcome'];privateKind?:PrivateReceipt['kind'];message:string;empty?:boolean};
export const effectsScenarios:Scenario[]=[
 {id:'shot-death',kind:'SHOT',outcome:'DEATH',label:'枪击 · 死亡',message:'【玩家1-史泰龙】向【玩家3-皮卡丘】开枪，皮卡丘死亡。'},
 {id:'shot-alive',kind:'SHOT',outcome:'NO_DEATH',label:'枪击 · 无人死亡',message:'枪声散去，无人死亡。'},
 {id:'execution-death',kind:'EXECUTION',outcome:'DEATH',label:'处决 · 死亡',message:'【玩家3-皮卡丘】被处决并死亡。'},
 {id:'execution-alive',kind:'EXECUTION',outcome:'NO_DEATH',label:'处决 · 存活',message:'【玩家3-皮卡丘】被处决，仍然存活。'},
 {id:'execution-empty',kind:'EXECUTION',outcome:'NONE',label:'无人被处决',message:'今天无人被处决。',empty:true},
 {id:'nomination',kind:'NOMINATION',label:'公开提名',message:'【玩家1-史泰龙】提名【玩家3-皮卡丘】。'},
 {id:'vote-block',kind:'VOTE_RESULT',outcome:'ON_BLOCK',label:'投票 · 最高票',message:'本轮4票，皮卡丘暂居处决席。'},
 {id:'vote-tie',kind:'VOTE_RESULT',outcome:'TIED',label:'投票 · 平票',message:'本轮3票，与最高票相同，当前无人将被处决。'},
 {id:'vote-low',kind:'VOTE_RESULT',outcome:'NONE',label:'投票 · 未达标',message:'本轮2票，未达到3票门槛。'},
 {id:'dawn-death',kind:'DAWN',outcome:'DEATH',label:'天亮 · 死亡',message:'昨夜死亡：【玩家3-皮卡丘】。'},
 {id:'dawn-alive',kind:'DAWN',outcome:'NO_DEATH',label:'天亮 · 无人死亡',message:'昨夜无人死亡。'},
 {id:'night',kind:'NIGHT_FALLS',label:'夜幕降临',message:'夜幕降临，请等待自己的行动。'},
 {id:'poison',privateKind:'POISON',label:'下毒',message:'【玩家3-皮卡丘】'},
 {id:'protect',privateKind:'PROTECT',label:'僧人保护',message:'【玩家3-皮卡丘】'},
 {id:'butler',privateKind:'BUTLER',label:'管家认主',message:'【玩家3-皮卡丘】'},
 {id:'demon',privateKind:'DEMON',label:'恶魔攻击',message:'【玩家3-皮卡丘】'},
 {id:'divine',privateKind:'DIVINE',label:'占卜问询',message:'【玩家3-皮卡丘】'},
 {id:'good',kind:'GAME_OVER',outcome:'GOOD',label:'善良胜利',message:'善良阵营获胜。恶魔已被击败。'},
 {id:'evil',kind:'GAME_OVER',outcome:'EVIL',label:'邪恶胜利',message:'邪恶阵营获胜。城镇落入暗夜。'},
];
const names=['史泰龙','犬夜叉','皮卡丘','奥特曼','莎士比亚','赫敏'];
export function EffectsPreview(){
 const[selected,setSelected]=useState<Scenario>(),[version,setVersion]=useState<PresentationVersion>(3),[runId,setRunId]=useState(''),[elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(false),[rate,setRate]=useState(1),[epoch,setEpoch]=useState(0),[audioStatus,setAudioStatus]=useState(effectsAudioStatus);
 const anchor=useRef({elapsed:0,at:performance.now(),paused:true,rate:1}),duration=selected?.privateKind?privateSceneDuration(selected.privateKind):selected?.kind?experienceTiming(selected.kind,version).duration:0;
 function position(){const a=anchor.current;return Math.min(duration,Math.max(0,a.elapsed+(a.paused?0:(performance.now()-a.at)*a.rate)));}
 useEffect(()=>{if(!selected)return;const timer=window.setInterval(()=>setElapsed(position()),32);return()=>window.clearInterval(timer);},[selected?.id,duration]);
 useEffect(()=>{const sync=()=>setAudioStatus(effectsAudioStatus());window.addEventListener('ravens:audio-status',sync);return()=>window.removeEventListener('ravens:audio-status',sync);},[]);
 useEffect(()=>()=>silenceEffects(),[]);
 function start(scenario:Scenario){silenceEffects();anchor.current={elapsed:0,at:performance.now(),paused:false,rate};setSelected(scenario);setRunId(crypto.randomUUID());setElapsed(0);setPaused(false);setEpoch(v=>v+1);}
 function update(next:{paused?:boolean;rate?:number;elapsed?:number}){const at=next.elapsed??position(),p=next.paused??paused,r=next.rate??rate;anchor.current={elapsed:at,at:performance.now(),paused:p,rate:r};setElapsed(at);setPaused(p);setRate(r);setEpoch(v=>v+1);}
 function close(){silenceEffects();setSelected(undefined);setElapsed(0);setPaused(true);anchor.current.paused=true;}
 const event:ExperienceEvent|undefined=selected?.kind?{id:runId,gameId:`preview-${runId}`,seq:1,kind:selected.kind,timingVersion:version,message:selected.message,occurredAt:1000,startsAt:1000,durationMs:duration,actorSeat:1,...(!selected.empty?{targetSeat:3}:{}),seats:selected.outcome==='DEATH'?[3]:[],day:2,votes:selected.id==='vote-block'?4:selected.id==='vote-low'?2:3,threshold:3,...(selected.outcome?{outcome:selected.outcome}:{})}:undefined;
 const receipt:PrivateReceipt|undefined=selected?.privateKind?{id:runId,kind:selected.privateKind,target:selected.message,targetSeats:[3]}:undefined;
 const game:GameView={gameId:`preview-${runId}`,serverNow:1000,phase:'DAY_DISCUSSION',day:2,seats:names.map((nickname,i)=>({seat:i+1,nickname,avatar:avatarChoices[i]!.url,connected:true,alive:true,ghostVoteAvailable:true})),events:event?[event]:[],aliveCount:6,readyCount:0};
 return <main className={`effects-lab${selected?' is-playing':''}`}><header className="effects-lab__header"><a href="/">☾ 鸦钟夜话</a><span>动效演示</span></header><div className="effects-lab__body"><h1>动效与声音</h1><p>选择场景直接播放。此页不创建房间，不提交游戏操作。</p><ParticipationAudioChoice/><label className="effects-lab__version">演出版本<select aria-label="演出版本" value={version} disabled={!!selected} onChange={e=>setVersion(Number(e.target.value) as PresentationVersion)}><option value={3}>当前版本</option><option value={2}>上一版</option><option value={1}>初版</option></select></label><div className="effects-lab__catalog" aria-label="特效演出目录">{effectsScenarios.map(s=><button type="button" key={s.id} onClick={()=>start(s)}><span aria-hidden="true">{s.privateKind?'◈':s.kind==='GAME_OVER'?'♜':s.kind==='SHOT'?'⌁':'☾'}</span><strong>{s.label}</strong><small>{s.privateKind?'仅行动者可见':'公开演出'}<span aria-hidden="true"> ↗</span></small></button>)}</div>{audioStatus?<p role="status">{audioStatus}</p>:null}</div>{selected?<><div className="effects-lab__controls" aria-label="演出播放控制"><div><strong>{selected.label}</strong><button type="button" onClick={close}>返回目录</button></div><label>进度<input type="range" aria-label="演出进度" min={0} max={duration} step={10} value={Math.min(elapsed,duration)} onChange={e=>update({elapsed:Number(e.target.value)})}/></label><div><button type="button" onClick={()=>update({paused:!paused})}>{paused?'继续':'暂停'}</button><button type="button" onClick={()=>start(selected)}>重播</button><label>速度<select aria-label="播放速度" value={rate} onChange={e=>update({rate:Number(e.target.value)})}><option value={.5}>0.5×</option><option value={1}>1×</option></select></label><output>{(elapsed/1000).toFixed(1)} / {(duration/1000).toFixed(1)} 秒</output></div></div><EventStage key={runId} game={game} {...(receipt?{receipt}:{})} preview playback={{now:1000+elapsed,paused,rate,epoch}}/></>:null}</main>;
}
