import {FeedbackButton} from '@ravens/ui';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {beginnerRoles} from '@ravens/content';
import type {PrivateSceneDescriptor,PresentationDisposition} from '@ravens/contracts';
import {playerLabel} from '@ravens/ui';
import {acknowledgePresentations,ApiError,type PrivateView} from '../api.js';
import {PrivateSceneQueue,sceneDuration,type QueuedScene} from '../presentations/private-scenes.js';
import {scheduleRoleCue,cancelEventAudio,prepareRoleAudio} from './experience-audio.js';
import {RoleSceneArt} from './RoleSceneArt.js';
import {butlerBowTiming} from './ButlerBow.js';
import {DemonSlashes,ClawDecal,preparePrivateArt} from './PremiumArt.js';
import {Avatar} from './Avatar.js';
import {roleArt} from '../role-art.js';
import type {SceneImprint} from './LayeredSceneArt.js';
import {privateAssetUrl} from './private-art-assets.js';
import '../styles/private-scenes.css';
const roleName=(id:string)=>beginnerRoles.find(r=>r.id===id)?.name??'角色';
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

export function PrivateSceneStage({view,code,reading,covered,onActivityChange,onHandleTask}:{view:PrivateView;code:string;reading:boolean;covered:boolean;onActivityChange:(value:boolean)=>void;onHandleTask:()=>void}){
 const queue=useRef(new PrivateSceneQueue()),[revision,redraw]=useState(0),[open,setOpen]=useState(false),[elapsed,setElapsed]=useState(0),[hidden,setHidden]=useState(document.hidden),[audioEpoch,setAudioEpoch]=useState(0),[keyboard,setKeyboard]=useState(()=>document.documentElement.dataset.keyboard==='open'),[replayFeedback,setReplayFeedback]=useState('');
 const playbackRun=useRef(0),clock=useRef(0),paused=useRef(false),frame=useRef(0),snapshot=useRef<PrivateView|undefined>(undefined),manualPause=useRef(false),outbox=useRef(new Map<number,PresentationDisposition>()),alive=useRef(true),sending=useRef(false),retry=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),attempt=useRef(0),latest=useRef(view);latest.current=view;
 const [obscured,setObscured]=useState(()=>!!document.querySelector('.room-sheet-backdrop,.player-wheel-backdrop'));
 const current=queue.current.current;
 const [media,setMedia]=useState<{key:string;ready:ReadonlySet<string>}>({key:'',ready:new Set()});
 const mediaKey=current?`${current.scene.id}:play:${playbackRun.current}`:'';
 const loading=!!current&&media.key!==mediaKey;
 const pausedNow=hidden||covered||keyboard||obscured||!open||loading;
 useEffect(()=>{if(!current)return;let cancelled=false;void Promise.allSettled([preparePrivateArt(current.scene),prepareRoleAudio(current.scene)]).then(([art])=>{if(!cancelled)setMedia({key:mediaKey,ready:new Set(art.status==='fulfilled'?art.value?.ready??[]:[])});});return()=>{cancelled=true;};},[mediaKey]);
 const duration=current?sceneDuration(current.scene,butlerBowTiming.durationMs):0;
 function launch(){if(!queue.current.current){if(!queue.current.start())return;playbackRun.current++;snapshot.current=structuredClone(latest.current);clock.current=0;setElapsed(0);}manualPause.current=false;window.dispatchEvent(new Event('ravens:release-book-textures'));setOpen(true);redraw(n=>n+1);}
 function suspend(){manualPause.current=true;setOpen(false);}
 async function flush(){
  if(sending.current||!alive.current||!outbox.current.size||!view.game?.gameId||!view.roomInstanceId)return;sending.current=true;
  const entries=[...outbox.current].slice(0,16).map(([historySeq,disposition])=>({historySeq,disposition}));
  try{await acknowledgePresentations(code,{roomInstanceId:view.roomInstanceId,gameId:view.game.gameId,entries});if(!alive.current)return;for(const e of entries)outbox.current.delete(e.historySeq);attempt.current=0;}
  catch(error){if(!alive.current)return;if(error instanceof ApiError&&[401,403,404,409].includes(error.status)){outbox.current.clear();return;}attempt.current++;}
  finally{sending.current=false;if(alive.current&&outbox.current.size){clearTimeout(retry.current);retry.current=setTimeout(()=>void flush(),[1000,3000,10000][Math.min(attempt.current,2)]!);}}
 }
 function finish(disposition:PresentationDisposition){const ack=queue.current.finish(disposition);if(ack){outbox.current.set(ack.historySeq,ack.disposition);void flush();}setOpen(false);clock.current=0;setElapsed(0);manualPause.current=false;redraw(n=>n+1);}
 useEffect(()=>{queue.current.sync((view.presentations?.pending??[]).filter(entry=>entry.scene.kind!=='IDENTITY'||view.roleConfirmed===true));if(view.game?.phase==='ABORTED'){queue.current.clear();setOpen(false);}redraw(n=>n+1);},[view.revision,view.presentations,view.game?.phase,view.roleConfirmed]);
 useEffect(()=>{const sync=()=>setObscured(!!document.querySelector('.room-sheet-backdrop:not([hidden]),.player-wheel-backdrop:not([hidden])'));sync();const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','aria-hidden']});return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!open&&!reading&&!covered&&!hidden&&!keyboard&&!obscured&&!manualPause.current&&view.game?.phase!=='GAME_OVER'&&view.game?.phase!=='ABORTED'&&queue.current.count)launch();},[revision,open,reading,covered,hidden,keyboard,obscured,view.game?.phase]);
 useEffect(()=>{onActivityChange(open&&!!current);if(!open)window.dispatchEvent(new Event('ravens:resume-book-textures'));return()=>onActivityChange(false);},[open,current?.scene.id]);
 useEffect(()=>{const visibility=()=>setHidden(document.hidden),online=()=>void flush(),audio=()=>setAudioEpoch(n=>n+1);document.addEventListener('visibilitychange',visibility);window.addEventListener('online',online);window.addEventListener('ravens-effects-unlocked',audio);window.addEventListener('ravens-effects-audio',audio);window.addEventListener('ravens:participation-audio',audio);return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',online);window.removeEventListener('ravens-effects-unlocked',audio);window.removeEventListener('ravens-effects-audio',audio);window.removeEventListener('ravens:participation-audio',audio);};},[]);
 useEffect(()=>{const town=()=>{if(queue.current.current)suspend();};const keys=(event:Event)=>setKeyboard((event as CustomEvent<{open:boolean}>).detail.open);window.addEventListener('ravens:return-town',town);window.addEventListener('ravens:keyboard',keys);return()=>{window.removeEventListener('ravens:return-town',town);window.removeEventListener('ravens:keyboard',keys);};},[]);
 useEffect(()=>{const replay=(event:Event)=>{const seq=(event as CustomEvent<number>).detail,entry=latest.current.history.find(e=>e.seq===seq);if(!entry?.presentation||(entry.presentation.kind==='IDENTITY'&&latest.current.roleConfirmed!==true))return;queue.current.replay({historySeq:seq,scene:entry.presentation});if(!queue.current.current)launch();else{setReplayFeedback('已加入重播队列，当前段结束后可查看。');redraw(n=>n+1);}};window.addEventListener('ravens:replay-private-scene',replay);return()=>window.removeEventListener('ravens:replay-private-scene',replay);},[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(retry.current);outbox.current.clear();queue.current.clear();snapshot.current=undefined;};},[]);
 useEffect(()=>{paused.current=pausedNow;let previous=performance.now();if(!current||pausedNow)return;const tick=(now:number)=>{const dt=Math.max(0,now-previous);previous=now;clock.current=Math.min(duration,clock.current+dt);setElapsed(clock.current);if(clock.current>=duration){finish('COMPLETE');return;}frame.current=requestAnimationFrame(tick);};frame.current=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame.current);},[current?.scene.id,pausedNow,duration]);
 useEffect(()=>{if(!current||pausedNow)return;const playbackId=current.scene.id+':play:'+playbackRun.current,id='private:'+playbackId;scheduleRoleCue(current.scene,clock.current,{mode:clock.current>0?'RESUME':'START',playbackId});return()=>cancelEventAudio(id);},[current?.scene.id,pausedNow,audioEpoch]);
 const count=queue.current.count;
 return <>{replayFeedback?<p data-private-feedback="true" className="private-replay-feedback" role="status">{replayFeedback}<FeedbackButton type="button" aria-label="收起重播提示" onClick={()=>setReplayFeedback('')}>×</FeedbackButton></p>:null}{count&&!open&&!covered?<aside data-private-feedback="true" className="private-scenes-inbox private-action-notice" aria-label="待看的完整演出"><span>{current?'演出已暂停':`新情报 ${count} 条`}</span><FeedbackButton type="button" onClick={launch}>{current?'继续演出':'查看'}</FeedbackButton></aside>:null}{current&&open&&!covered?<section data-private-feedback="true" className="private-scene-dialog" role="dialog" aria-modal="false" aria-label="仅你可见的完整演出"><header><span>仅你可见 · {current.replay?'重播':current.scene.kind==='ACTION_SUBMITTED'?'行动回执':'身份与情报'}</span><FeedbackButton type="button" onClick={()=>finish('SKIP')}>跳过本段 ×</FeedbackButton></header><div className="private-scene-body"><PrivateSceneContent scene={current.scene} view={snapshot.current??view} elapsedMs={elapsed} reducedMotion={reduced()} readyAssets={media.key===mediaKey?media.ready:new Set()}/>{loading?<div className="private-scene-loading" role="status">正在准备画面与声音…</div>:null}</div><footer><FeedbackButton type="button" onClick={()=>{suspend();onHandleTask();}}>处理当前操作</FeedbackButton><span>{Math.max(0,Math.ceil((duration-elapsed)/1000))} 秒</span><FeedbackButton type="button" onClick={suspend}>稍后继续</FeedbackButton></footer>{hidden?<div className="private-scene-curtain">私密内容已遮住</div>:null}</section>:null}</>;
}

export function PrivateSceneContent({scene,view,elapsedMs,reducedMotion=false,readyAssets}:{scene:PrivateSceneDescriptor;view:PrivateView;elapsedMs:number;reducedMotion?:boolean;readyAssets?:ReadonlySet<string>}){
 const shown=scene.shown,revealed=elapsedMs>=(shown.type==='DIVINATION'||shown.type==='GRIMOIRE'?2200:1900),submitted=shown.type==='TARGET_SUBMITTED',name=roleName(scene.themeRoleId),art=roleArt(scene.themeRoleId);
 const targets=submitted||revealed?('seats'in shown?shown.seats:shown.type==='SHOWN_ROLE'?[shown.seat]:[]):[];
 const person=(seat:number)=>view.game?.seats.find(p=>p.seat===seat);
 const persons=(seats:readonly number[])=>seats.map(seat=>{const p=person(seat);return <div className="private-scene-person" key={seat}><Avatar id={p?.id??String(seat)} name={p?.nickname??`${seat}号`} url={p?.avatar}/>{scene.kind==='ACTION_SUBMITTED'&&scene.themeRoleId==='imp'?(['left','right'] as const).map((side,i)=>elapsedMs>=1450+i*300&&(!readyAssets||readyAssets.has(privateAssetUrl('claw-avatar-'+side)))?<ClawDecal key={side} variant={`avatar-${side}`}/>:null):null}<span>{playerLabel(seat,p?.nickname)}</span></div>;});
 let result='';
 switch(shown.type){
  case'IDENTITY':result=shown.summary;break;
  case'TARGET_SUBMITTED':result='选择已提交，实际结果以规则结算为准。';break;
  case'CANDIDATES':result=`二人中有一位是${roleName(shown.roleId)}`;break;
  case'NO_OUTSIDER':result='你获知：场上没有外来者。';break;
  case'COUNT':result=scene.themeRoleId==='empath'?`相邻存活玩家中有 ${shown.value} 位邪恶阵营`:`相邻邪恶玩家的对数：${shown.value}`;break;
  case'DIVINATION':result=shown.value==='YES'?'是，其中有恶魔。':'否。';break;
  case'SHOWN_ROLE':result=`你看到的身份：${roleName(shown.roleId)}`;break;
  case'GRIMOIRE':result='这是你在当夜获得的魔典快照。';break;
  case'EVIL_START':result='首夜阵营信息';break;
  case'NEW_ROLE':result='你已成为小恶魔。';break;
  case'CONTINUATION':result='你的生命已终结，力量仍在延续。';break;
 }
 // No semantic information or candidate/avatar node exists before its reveal gate.
 const grimoire=revealed&&shown.type==='GRIMOIRE'?view.history.find(e=>e.seq===shown.historySeq)?.grimoire:undefined;
 const info=revealed&&shown.type==='EVIL_START'&&view.startInfo?.infoId===shown.infoId?view.startInfo:undefined;
 const imprint:SceneImprint|undefined=scene.kind!=='IDENTITY'&&(revealed||submitted)?{label:result,...(shown.type==='COUNT'?{value:String(shown.value)}:shown.type==='DIVINATION'?{value:shown.value}:{}),marks:grimoire?grimoire.entries.map(p=>({label:playerLabel(p.seat,p.nickname),avatar:p.avatar,detail:p.roleName})):info?info.team.map(p=>({label:playerLabel(p.seat,p.nickname),avatar:p.avatar,detail:p.kind==='DEMON'?'恶魔':'爪牙'})):targets.map(seat=>{const p=person(seat);return{label:playerLabel(seat,p?.nickname),avatar:p?.avatar,...(shown.type==='CANDIDATES'||shown.type==='SHOWN_ROLE'?{detail:roleName(shown.roleId)}:{})};}),...(info&&elapsedMs>=2400?{bluffs:info.bluffs.map(r=>r.name)}:{})}:undefined;
 const slashes=scene.kind==='ACTION_SUBMITTED'&&scene.themeRoleId==='imp'&&(!readyAssets||['claw-screen-left','claw-screen-right'].every(n=>readyAssets.has(privateAssetUrl(n))));
 return <div data-kind={scene.kind} className={`private-scene-content private-theme--${scene.themeRoleId}${reducedMotion?' is-reduced':''}`} style={{'--private-duration':`${sceneDuration(scene,butlerBowTiming.durationMs)}ms`,'--scene-duration':`${sceneDuration(scene,butlerBowTiming.durationMs)}ms`} as CSSProperties}>
 {slashes?<DemonSlashes elapsedMs={elapsedMs} reduced={reducedMotion}/>:null}{scene.themeRoleId!=='butler'?<img className="private-scene-portrait" src={art.portraitUrl} alt=""/>:null}<div className="private-scene-art" aria-hidden="true"><RoleSceneArt scene={scene} elapsedMs={elapsedMs} reducedMotion={reducedMotion} imprint={imprint} readyAssets={readyAssets}/></div><h2>{scene.kind==='OLD_DEMON_CONTINUATION'?'余焰未熄':scene.kind==='ROLE_CHANGE'?'身份更替':name}</h2>
 {revealed||submitted?<div className="private-scene-result"><div className="private-scene-targets">{persons(targets)}</div><p>{result}</p>{grimoire?<div className="private-grimoire" aria-label="当夜获得的魔典">{grimoire.entries.map(p=><div key={p.seat}><Avatar id={String(p.seat)} name={p.nickname} url={p.avatar}/><strong>{playerLabel(p.seat,p.nickname)}</strong><span>{p.roleName} · {p.alive?'存活':'死亡'}</span><small>{p.reminders.join(' · ')}</small></div>)}</div>:null}{info?<div className="private-start-cards">{info.team.map(p=><div key={p.seat}><Avatar id={String(p.seat)} name={p.nickname} url={p.avatar}/><span>{playerLabel(p.seat,p.nickname)} · {p.kind==='DEMON'?'恶魔':'爪牙'}</span></div>)}{elapsedMs>=2400&&info.bluffs.length?<p>可用伪装：{info.bluffs.map(r=>r.name).join('、')}</p>:null}</div>:null}</div>:<div className="private-scene-result private-scene-result--pending" aria-hidden="true"/>}</div>;
}
