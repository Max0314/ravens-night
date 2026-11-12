import {FeedbackButton} from '@ravens/ui';
import {preparePrivateArt} from '../components/PremiumArt.js';
import {useEffect,useRef,useState} from 'react';
import {avatarChoices,experienceTiming,type ExperienceEvent,type PresentationVersion,type PrivateSceneDescriptor,type PrivateShownResult} from '@ravens/contracts';
import {beginnerRoles} from '@ravens/content';
import {PrivateSceneContent} from '../components/PrivateSceneStage.js';
import {sceneDuration} from '../presentations/private-scenes.js';
import {butlerBowTiming} from '../components/ButlerBow.js';
import {GuideOverlay} from '../components/GuideOverlay.js';
import type {PrivateView,GameView} from '../api.js';
import {EventStage,privateSceneDuration,type PrivateReceipt} from '../components/EventStage.js';
import {ParticipationAudioChoice} from '../components/ParticipationAudioChoice.js';
import {effectsAudioStatus,silenceEffects,scheduleRoleCue,cancelEventAudio,auditionSample,prepareRoleAudio} from '../components/experience-audio.js';
import '../styles/effects-preview.css';
type Scenario={id:string;label:string;kind?:ExperienceEvent['kind'];outcome?:ExperienceEvent['outcome'];privateKind?:PrivateReceipt['kind'];message:string;empty?:boolean;scene?:PrivateSceneDescriptor};
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
 {id:'good-mayor',kind:'GAME_OVER',outcome:'GOOD',label:'善良胜利 · 镇长',message:'镇长存活，今天无人被处决。善良阵营获胜。'},
 {id:'evil-saint',kind:'GAME_OVER',outcome:'EVIL',label:'邪恶胜利 · 圣徒',message:'圣徒被处决，邪恶阵营获胜。'},
 {id:'evil',kind:'GAME_OVER',outcome:'EVIL',label:'邪恶胜利',message:'邪恶阵营获胜。城镇落入暗夜。'},
];
const sampleScene=(role:string,kind:PrivateSceneDescriptor['kind'],shown:PrivateShownResult):PrivateSceneDescriptor=>({version:1,id:'preview-'+role+'-'+kind,kind,themeRoleId:role,shown});
export const rolePreviewScenarios:Scenario[]=[...beginnerRoles.map(r=>({id:'identity-'+r.id,label:r.name+' · 身份',message:r.summary,scene:sampleScene(r.id,'IDENTITY',{type:'IDENTITY',roleId:r.id,summary:r.summary})})),
 ...(['washerwoman','librarian','investigator'] as const).map((id,i)=>({id:'info-'+id,label:beginnerRoles.find(r=>r.id===id)!.name+' · 双人线索',message:'收到信息',scene:sampleScene(id,'INFORMATION',{type:'CANDIDATES',roleId:['mayor','saint','baron'][i]!,seats:[2,3]})})),
 ...(['chef','empath'] as const).map(id=>({id:'info-'+id,label:beginnerRoles.find(r=>r.id===id)!.name+' · 数字线索',message:'收到信息',scene:sampleScene(id,'INFORMATION',{type:'COUNT',value:2})})),
 {id:'librarian-none',label:'图书管理员 · 无外来者',message:'信息',scene:sampleScene('librarian','INFORMATION',{type:'NO_OUTSIDER'})},
 ...(['YES','NO'] as const).map(value=>({id:'fortune-'+value,label:'占卜师 · '+(value==='YES'?'是':'否'),message:'占卜结果',scene:sampleScene('fortune_teller','INFORMATION',{type:'DIVINATION',value,seats:[2,3]})})),
 ...(['ravenkeeper','undertaker'] as const).map(id=>({id:'info-'+id,label:beginnerRoles.find(r=>r.id===id)!.name+' · 身份信息',message:'角色',scene:sampleScene(id,'INFORMATION',{type:'SHOWN_ROLE',roleId:'soldier',seat:3})})),
 {id:'spy-snapshot',label:'间谍 · 当夜魔典',message:'魔典',scene:sampleScene('spy','INFORMATION',{type:'GRIMOIRE',historySeq:1})},
 {id:'evil-start',label:'首夜 · 阵营信息',message:'首夜信息',scene:sampleScene('imp','EVIL_START',{type:'EVIL_START',infoId:'lab-first'})},
 {id:'succession',label:'猩红女郎 · 继任者',message:'新恶魔',scene:sampleScene('scarlet_woman','ROLE_CHANGE',{type:'NEW_ROLE',roleId:'imp'})},
 {id:'continuation',label:'原恶魔 · 力量延续',message:'余焰',scene:sampleScene('imp','OLD_DEMON_CONTINUATION',{type:'CONTINUATION'})}
];
function legacyScene(kind:PrivateReceipt['kind'],id:string):PrivateSceneDescriptor{const role=({POISON:'poisoner',PROTECT:'monk',BUTLER:'butler',DEMON:'imp',DIVINE:'fortune_teller',SEALED:'ravenkeeper'} as const)[kind];return{version:1,id,kind:'ACTION_SUBMITTED',themeRoleId:role,shown:{type:'TARGET_SUBMITTED',action:({POISON:'POISON',PROTECT:'PROTECT',BUTLER:'MASTER',DEMON:'KILL',DIVINE:'DIVINE',SEALED:'INSPECT'} as const)[kind],seats:kind==='DIVINE'?[2,3]:[3]}};}
const names=['史泰龙','犬夜叉','皮卡丘','奥特曼','莎士比亚','赫敏'];
export function EffectsPreview(){
 const[selected,setSelected]=useState<Scenario>(),[version,setVersion]=useState<PresentationVersion>(4),[runId,setRunId]=useState(''),[elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(false),[rate,setRate]=useState(1),[epoch,setEpoch]=useState(0),[audioStatus,setAudioStatus]=useState(effectsAudioStatus);
 const [hidden,setHidden]=useState(document.hidden);
 const playbackChoice=useRef(false),audioMode=useRef<'START'|'RESUME'|'SEEK'>('START');
 const [artReady,setArtReady]=useState<{key:string;urls:ReadonlySet<string>}>({key:'',urls:new Set()});
 const [book,setBook]=useState(false),[prepared,setPrepared]=useState(''),[audioEpoch,setAudioEpoch]=useState(0);
 const selectedScene=selected?.scene?{...selected.scene,id:runId}:selected?.privateKind?legacyScene(selected.privateKind,runId):undefined;
 const readyKey=selectedScene?runId:'';
 const anchor=useRef({elapsed:0,at:performance.now(),paused:true,rate:1}),duration=selectedScene?sceneDuration(selectedScene,butlerBowTiming.durationMs):selected?.kind?experienceTiming(selected.kind,version).duration:0;
 function position(){const a=anchor.current;return Math.min(duration,Math.max(0,a.elapsed+(a.paused?0:(performance.now()-a.at)*a.rate)));}
 useEffect(()=>{if(!selected)return;let frame=0;const tick=()=>{setElapsed(position());frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[selected?.id,duration]);
 useEffect(()=>{const sync=()=>setAudioStatus(effectsAudioStatus());window.addEventListener('ravens:audio-status',sync);return()=>window.removeEventListener('ravens:audio-status',sync);},[]);
 useEffect(()=>{const changed=()=>setAudioEpoch(n=>n+1);for(const name of ['ravens-effects-audio','ravens-effects-unlocked','ravens:participation-audio'])window.addEventListener(name,changed);return()=>{silenceEffects();for(const name of ['ravens-effects-audio','ravens-effects-unlocked','ravens:participation-audio'])window.removeEventListener(name,changed);};},[]);
 function start(scenario:Scenario){audioMode.current='START';playbackChoice.current=false;silenceEffects();anchor.current={elapsed:0,at:performance.now(),paused:hidden||!!(scenario.scene||scenario.privateKind),rate};setSelected(scenario);setRunId(crypto.randomUUID());setElapsed(0);setPaused(false);setEpoch(v=>v+1);}
 function update(next:{paused?:boolean;rate?:number;elapsed?:number}){if(next.elapsed!==undefined)audioMode.current='SEEK';else if(audioMode.current!=='SEEK')audioMode.current='RESUME';silenceEffects();const at=next.elapsed??position(),p=next.paused??paused,r=next.rate??rate;playbackChoice.current=p;anchor.current={elapsed:at,at:performance.now(),paused:hidden||p||!!selectedScene&&prepared!==readyKey,rate:r};setElapsed(at);setPaused(p);setRate(r);setEpoch(v=>v+1);}
 function close(){silenceEffects();setSelected(undefined);setElapsed(0);setPaused(true);anchor.current.paused=true;}
 useEffect(()=>{if(selected&&!selectedScene)audioMode.current='RESUME';},[runId,epoch]);
 useEffect(()=>{const visibility=()=>{const at=position(),nextHidden=document.hidden;anchor.current={...anchor.current,elapsed:at,at:performance.now(),paused:nextHidden||playbackChoice.current||!!selectedScene&&prepared!==readyKey};silenceEffects();setElapsed(at);if(audioMode.current!=='SEEK')audioMode.current='RESUME';setHidden(nextHidden);setEpoch(n=>n+1);};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[runId,duration,prepared,readyKey]);
 const event:ExperienceEvent|undefined=selected?.kind?{id:runId,gameId:`preview-${runId}`,seq:1,kind:selected.kind,timingVersion:version,message:selected.message,occurredAt:1000,startsAt:1000,durationMs:duration,actorSeat:1,...(!selected.empty?{targetSeat:3}:{}),seats:selected.outcome==='DEATH'?[3]:[],day:2,votes:selected.id==='vote-block'?4:selected.id==='vote-low'?2:3,threshold:3,...(selected.outcome?{outcome:selected.outcome}:{})}:undefined;
 const receipt:PrivateReceipt|undefined=selected?.privateKind?{id:runId,kind:selected.privateKind,target:selected.message,targetSeats:[3]}:undefined;
 const game:GameView={winReason:selected?.id==='good-mayor'?'镇长存活，三人且无人被处决，善良获胜。':selected?.id==='evil-saint'?'圣徒被处决，邪恶获胜。':'恶魔死亡，善良获胜。',gameId:`preview-${runId}`,serverNow:1000,phase:'DAY_DISCUSSION',day:2,seats:names.map((nickname,i)=>({seat:i+1,nickname,avatar:avatarChoices[i]!.url,connected:true,alive:true,ghostVoteAvailable:true})),events:event?[event]:[],aliveCount:6,readyCount:0};
 const privateView:PrivateView={participant:{id:'preview-player',nickname:names[0]!,seat:1},state:'RUNNING',messages:[],history:[{seq:1,phase:'OTHER_NIGHT',day:1,kind:'INFORMATION',text:'演示魔典',grimoire:{entries:game.seats.map((p,i)=>({seat:p.seat,nickname:p.nickname,avatar:p.avatar!,roleName:beginnerRoles[i]!.name,alive:i!==4,reminders:i===2?['中毒']:[]}))}}],game,startInfo:{infoId:'lab-first',gameId:game.gameId!,team:[{seat:3,nickname:names[2]!,avatar:avatarChoices[2]!.url,kind:'MINION'}],bluffs:beginnerRoles.slice(0,3).map(r=>({roleId:r.id,name:r.name,summary:r.summary})),acknowledged:false,canAcknowledge:false}};
 useEffect(()=>{if(!selectedScene)return;const at=position();anchor.current={...anchor.current,elapsed:at,at:performance.now(),paused:true};setElapsed(at);let cancelled=false;void Promise.allSettled([preparePrivateArt(selectedScene),prepareRoleAudio(selectedScene)]).then(([art])=>{if(cancelled)return;setArtReady({key:readyKey,urls:new Set(art.status==='fulfilled'?art.value?.ready??[]:[])});setPrepared(readyKey);anchor.current={...anchor.current,at:performance.now(),paused:document.hidden||playbackChoice.current};});return()=>{cancelled=true;};},[readyKey]);
 useEffect(()=>{if(!selectedScene||hidden||paused||prepared!==readyKey)return;scheduleRoleCue(selectedScene,elapsed,{rate,mode:audioMode.current});audioMode.current='RESUME';return()=>cancelEventAudio('private:'+selectedScene.id);},[runId,hidden,paused,rate,epoch,prepared,readyKey,audioEpoch]);
 return <main className={`effects-lab${selected?' is-playing':''}`}><header className="effects-lab__header"><a href="/">☾ 鸦钟夜话</a><span>动效演示</span></header><div className="effects-lab__body"><h1>动效与声音</h1><p>选择场景直接播放。此页不创建房间，不提交游戏操作。</p><ParticipationAudioChoice/><label className="effects-lab__version">演出版本<select aria-label="演出版本" value={version} disabled={!!selected} onChange={e=>setVersion(Number(e.target.value) as PresentationVersion)}><option value={4}>当前版本 v4</option><option value={3}>v3</option><option value={2}>上一版</option><option value={1}>初版</option></select></label><div className="effects-lab__catalog" aria-label="特效演出目录">{[...effectsScenarios,...rolePreviewScenarios].map(s=><FeedbackButton type="button" key={s.id} onClick={()=>start(s)}><span aria-hidden="true">{s.privateKind?'◈':s.kind==='GAME_OVER'?'♜':s.kind==='SHOT'?'⌁':'☾'}</span><strong>{s.label}</strong><small>{s.privateKind||s.scene?'仅本人可见':'公开演出'}<span aria-hidden="true"> ↗</span></small></FeedbackButton>)}</div><FeedbackButton type="button" onClick={()=>setBook(true)}>纸张翻页与菜单演示</FeedbackButton><details><summary>单轨试听</summary>{['v4:poison-cork','v4:poison-pour','v4:chef-chop-1','v4:chef-chop-2','v4:chef-chop-3','v4:coffin-open','v4:coffin-settle','v1:shield','v3:slash-left','v3:slash-right','night-bell','dawn-bell','hurt-shot-1','hurt-shot-2','hurt-shot-3','hurt-night-1','hurt-night-2','hurt-night-3','cough-1','cough-2','cough-3','wing-flap','butler-voice','paper-turn-1','paper-turn-2','paper-turn-3','paper-turn-4','ui-press','ui-select','ui-open','ui-close','ui-success','ui-error'].map(id=><FeedbackButton key={id} type="button" onClick={()=>auditionSample(id)}>{({'v1:shield':'僧侣 · 原版钢盾','v3:slash-left':'恶魔 · 左撕裂','v3:slash-right':'恶魔 · 右撕裂'} as Record<string,string>)[id]??id}</FeedbackButton>)}</details>{audioStatus?<p role="status">{audioStatus}</p>:null}</div>{selected?<><div className="effects-lab__controls" aria-label="演出播放控制"><div><strong>{selected.label}</strong><FeedbackButton type="button" onClick={close}>返回目录</FeedbackButton></div><label>进度<input type="range" aria-label="演出进度" min={0} max={duration} step={10} value={Math.min(elapsed,duration)} onChange={e=>update({elapsed:Number(e.target.value)})}/></label><div><FeedbackButton type="button" onClick={()=>update({paused:!paused})}>{paused?'继续':'暂停'}</FeedbackButton><FeedbackButton type="button" onClick={()=>start(selected)}>重播</FeedbackButton><FeedbackButton type="button" onClick={()=>update({paused:true,elapsed:Math.min(duration,position()+1000/24)})}>单步</FeedbackButton><label>速度<select aria-label="播放速度" value={rate} onChange={e=>update({rate:Number(e.target.value)})}><option value={.25}>0.25×</option><option value={.5}>0.5×</option><option value={1}>1×</option></select></label><output>{(elapsed/1000).toFixed(1)} / {(duration/1000).toFixed(1)} 秒</output></div><details className="effects-lab__anchors"><summary>关键帧</summary><div>{[600,700,950,1100,1350,1450,1600,1750,1900,2200,2400].filter(t=>t<=duration).map(t=><FeedbackButton key={t} type="button" onClick={()=>update({paused:true,elapsed:t})}>{t} ms</FeedbackButton>)}</div></details></div>{selectedScene?<section className="private-scene-dialog effects-lab-private" role="region" aria-label="仅本人可见的演示"><div className="private-scene-body"><PrivateSceneContent scene={selectedScene} view={privateView} elapsedMs={elapsed} readyAssets={artReady.key===readyKey?artReady.urls:new Set()}/>{prepared!==readyKey?<div className="private-scene-loading" role="status">正在准备画面与声音…</div>:null}</div></section>:null}<EventStage key={runId} game={game}  preview playback={{now:1000+elapsed,paused:paused||hidden,rate,epoch,mode:audioMode.current}}/></>:null}{book?<GuideOverlay mode="tutorial" onClose={()=>setBook(false)}/>:null}</main>;
}
