import {FeedbackButton} from '@ravens/ui';
import {preparePrivateArt} from '../components/PremiumArt.js';
import {useEffect,useRef,useState} from 'react';
import {avatarChoices,experienceTiming,type ExperienceEvent,type PrivateSceneDescriptor,type PrivateShownResult} from '@ravens/contracts';
import {beginnerRoles} from '@ravens/content';
import {PrivateSceneContent} from '../components/PrivateSceneStage.js';
import {sceneDuration} from '../presentations/private-scenes.js';
import {butlerBowTiming} from '../components/ButlerBow.js';
import {GuideOverlay} from '../components/GuideOverlay.js';
import type {PrivateView,GameView} from '../api.js';
import {EventStage,privateSceneDuration,type PrivateReceipt} from '../components/EventStage.js';
import {PublicNominationAudio} from '../components/PublicNominationAudio.js';
import {nominationSoundDuration,prepareNominationAudio,beginEffectsPreview,effectsAudioStatus,silenceEffects,scheduleRoleCue,cancelEventAudio,prepareRoleAudio,unlockEffectsAudio} from '../components/experience-audio.js';
import {AudioAudition} from './AudioAudition.js';
import {GlobalAudioButton} from '../components/GlobalAudioButton.js';
import {useBackLayer} from '../use-back-layer.js';
import '../styles/effects-preview.css';
type Scenario={id:string;label:string;kind?:ExperienceEvent['kind'];outcome?:ExperienceEvent['outcome'];privateKind?:PrivateReceipt['kind'];message:string;empty?:boolean;scene?:PrivateSceneDescriptor};
export const effectsScenarios:Scenario[]=[
 {id:'shot-death',kind:'SHOT',outcome:'DEATH',label:'枪击 · 死亡',message:'【玩家1-史泰龙】向【玩家3-皮卡丘】开枪，皮卡丘死亡。'},
 {id:'shot-alive',kind:'SHOT',outcome:'NO_DEATH',label:'枪击 · 无人死亡',message:'枪声散去，无人死亡。'},
 {id:'execution-death',kind:'EXECUTION',outcome:'DEATH',label:'处决 · 死亡',message:'【玩家3-皮卡丘】被处决并死亡。'},
 {id:'execution-alive',kind:'EXECUTION',outcome:'NO_DEATH',label:'处决 · 存活',message:'【玩家3-皮卡丘】被处决，仍然存活。'},
 {id:'execution-empty',kind:'EXECUTION',outcome:'NONE',label:'无人被处决',message:'今天无人被处决。',empty:true},
 {id:'virgin',kind:'EXECUTION',outcome:'DEATH',label:'提名 · 处女能力',message:'处女的能力触发：[史泰龙]立即被处决。'},
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
 {id:'raven-inspect',privateKind:'SEALED',label:'守鸦人查验',message:'查验已提交'},
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
 ...beginnerRoles.filter(role=>role.type==='MINION').map(role=>({id:`minion-start-${role.id}`,label:`${role.name} · 首夜同伴`,message:'首夜信息',scene:sampleScene(role.id,'EVIL_START',{type:'EVIL_START',infoId:'lab-first'})})),
 {id:'succession',label:'猩红女郎 · 继任者',message:'新恶魔',scene:sampleScene('scarlet_woman','ROLE_CHANGE',{type:'NEW_ROLE',roleId:'imp'})},
 {id:'continuation',label:'原恶魔 · 力量延续',message:'余焰',scene:sampleScene('imp','OLD_DEMON_CONTINUATION',{type:'CONTINUATION'})}
];
function legacyScene(kind:PrivateReceipt['kind'],id:string):PrivateSceneDescriptor{const role=({POISON:'poisoner',PROTECT:'monk',BUTLER:'butler',DEMON:'imp',DIVINE:'fortune_teller',SEALED:'ravenkeeper'} as const)[kind];return{version:1,id,kind:'ACTION_SUBMITTED',themeRoleId:role,shown:{type:'TARGET_SUBMITTED',action:({POISON:'POISON',PROTECT:'PROTECT',BUTLER:'MASTER',DEMON:'KILL',DIVINE:'DIVINE',SEALED:'INSPECT'} as const)[kind],seats:kind==='DIVINE'?[2,3]:[3]}};}
const names=['史泰龙','犬夜叉','皮卡丘','奥特曼','莎士比亚','赫敏'];
const roleForScenario=(scenario:Scenario)=>scenario.scene?.themeRoleId??(scenario.privateKind?legacyScene(scenario.privateKind,'').themeRoleId:undefined);
const roleFilters=[['TOWNSFOLK','镇民'],['OUTSIDER','外来者'],['MINION','爪牙'],['DEMON','恶魔']] as const;
const kinds=(scenario:Scenario)=>[
 ...(scenario.scene?.kind==='EVIL_START'||scenario.scene?.kind==='INFORMATION'&&['washerwoman','librarian','investigator','chef','empath','fortune_teller','spy'].includes(scenario.scene.themeRoleId)?['首夜']:[]),
 ...(scenario.scene?.kind==='IDENTITY'?['身份']:[]),
 ...(scenario.scene?.kind==='EVIL_START'||scenario.scene?.kind==='INFORMATION'?['信息获取']:[]),
 ...(scenario.privateKind||scenario.scene?.kind==='ROLE_CHANGE'||scenario.scene?.kind==='OLD_DEMON_CONTINUATION'?['行动']:[])
];
export function EffectsPreview({onClose=()=>undefined,allowed=true,initialTab='animations'}:{onClose?:()=>void;allowed?:boolean;initialTab?:'animations'|'audio'}={}){
 const[selected,setSelected]=useState<Scenario>(),[runId,setRunId]=useState(''),[elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(false),[rate,setRate]=useState(1),[epoch,setEpoch]=useState(0),[audioStatus,setAudioStatus]=useState(effectsAudioStatus);
 const version=4;
 const [tab,setTab]=useState(initialTab);
 const [scope,setScope]=useState<'public'|'roles'>('roles'),[category,setCategory]=useState(''),[kind,setKind]=useState('');
 const allowedRef=useRef(allowed);allowedRef.current=allowed;
 useBackLayer(true,onClose,true);
 useEffect(()=>beginEffectsPreview(),[]);
 const [hidden,setHidden]=useState(document.hidden);
 const playbackChoice=useRef(false),audioMode=useRef<'START'|'RESUME'|'SEEK'>('START');
 const [artReady,setArtReady]=useState<{key:string;urls:ReadonlySet<string>}>({key:'',urls:new Set()});
 const [book,setBook]=useState(false),[prepared,setPrepared]=useState(''),[audioEpoch,setAudioEpoch]=useState(0),[longPrepared,setLongPrepared]=useState('');
 const selectedScene=selected?.scene?{...selected.scene,id:runId}:selected?.privateKind?legacyScene(selected.privateKind,runId):undefined;
 const readyKey=selectedScene?runId:'';
 const longNomination=selected?.kind==='NOMINATION'||selected?.kind==='VOTE_RESULT';
 const anchor=useRef({elapsed:0,at:performance.now(),paused:true,rate:1}),duration=selectedScene?sceneDuration(selectedScene,butlerBowTiming.durationMs):selected?.kind?nominationSoundDuration(selected.kind,selected.outcome)||experienceTiming(selected.kind,version).duration:0;
 function position(){const a=anchor.current;return Math.min(duration,Math.max(0,a.elapsed+(a.paused?0:(performance.now()-a.at)*a.rate)));}
 useEffect(()=>{
   if(!selected||hidden||paused||!allowed||selectedScene&&prepared!==readyKey||longNomination&&longPrepared!==runId)return;
   let frame=0;
   const tick=()=>{const at=position();setElapsed(at);if(at<duration&&!anchor.current.paused)frame=requestAnimationFrame(tick);};
   frame=requestAnimationFrame(tick);
   return()=>cancelAnimationFrame(frame);
 },[runId,duration,allowed,hidden,paused,epoch,prepared,readyKey,longPrepared]);
 useEffect(()=>{const sync=()=>setAudioStatus(effectsAudioStatus());window.addEventListener('ravens:audio-status',sync);return()=>window.removeEventListener('ravens:audio-status',sync);},[]);
 useEffect(()=>{const changed=()=>{setAudioEpoch(n=>n+1);};for(const name of ['ravens-effects-audio','ravens-effects-unlocked','ravens:participation-audio'])window.addEventListener(name,changed);return()=>{silenceEffects();for(const name of ['ravens-effects-audio','ravens-effects-unlocked','ravens:participation-audio'])window.removeEventListener(name,changed);};},[]);
 function start(scenario:Scenario){if(!allowed||document.hidden)return;void unlockEffectsAudio();setLongPrepared('');audioMode.current='START';playbackChoice.current=false;silenceEffects();anchor.current={elapsed:0,at:performance.now(),paused:hidden||!!(scenario.scene||scenario.privateKind)||scenario.kind==='NOMINATION'||scenario.kind==='VOTE_RESULT',rate};setSelected(scenario);setRunId(crypto.randomUUID());setElapsed(0);setPaused(false);setEpoch(v=>v+1);}
 function update(next:{paused?:boolean;rate?:number;elapsed?:number}){if(next.elapsed!==undefined)audioMode.current='SEEK';else if(audioMode.current!=='SEEK')audioMode.current='RESUME';silenceEffects();const at=next.elapsed??position(),p=next.paused??paused,r=next.rate??rate;playbackChoice.current=p;anchor.current={elapsed:at,at:performance.now(),paused:!allowed||hidden||p||!!selectedScene&&prepared!==readyKey||longNomination&&longPrepared!==runId,rate:r};setElapsed(at);setPaused(p);setRate(r);setEpoch(v=>v+1);}
 function close(){silenceEffects();setSelected(undefined);setElapsed(0);setPaused(true);anchor.current.paused=true;}
 useEffect(()=>{if(selected&&!selectedScene)audioMode.current='RESUME';},[runId,epoch]);
 useEffect(()=>{const visibility=()=>{const at=position(),nextHidden=document.hidden;anchor.current={...anchor.current,elapsed:at,at:performance.now(),paused:nextHidden||!allowedRef.current||playbackChoice.current||!!selectedScene&&prepared!==readyKey||longNomination&&longPrepared!==runId};silenceEffects();setElapsed(at);if(audioMode.current!=='SEEK')audioMode.current='RESUME';setHidden(nextHidden);setEpoch(n=>n+1);};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[runId,duration,prepared,readyKey,longNomination,longPrepared]);
 const event:ExperienceEvent|undefined=selected?.kind?{id:runId,gameId:`preview-${runId}`,seq:selected.id==='virgin'?2:1,kind:selected.kind,timingVersion:version,message:selected.message,occurredAt:1000,startsAt:1000,durationMs:experienceTiming(selected.kind,version).duration,actorSeat:1,...(!selected.empty?{targetSeat:selected.id==='virgin'?1:3}:{}),seats:selected.outcome==='DEATH'?[selected.id==='virgin'?1:3]:[],day:2,votes:selected.id==='vote-block'?4:selected.id==='vote-low'?2:3,threshold:3,...(selected.outcome?{outcome:selected.outcome}:{})}:undefined;
 const receipt:PrivateReceipt|undefined=selected?.privateKind?{id:runId,kind:selected.privateKind,target:selected.message,targetSeats:[3]}:undefined;
 const game:GameView={winReason:selected?.id==='good-mayor'?'镇长存活，三人且无人被处决，善良获胜。':selected?.id==='evil-saint'?'圣徒被处决，邪恶获胜。':'恶魔死亡，善良获胜。',gameId:`preview-${runId}`,serverNow:1000,phase:'DAY_DISCUSSION',day:2,seats:names.map((nickname,i)=>({seat:i+1,nickname,avatar:avatarChoices[i]!.url,connected:true,alive:true,ghostVoteAvailable:true})),events:event?(selected?.id==='virgin'?[{...event,id:runId+'-nomination',seq:1,kind:'NOMINATION',targetSeat:3,message:'[史泰龙]提名[皮卡丘]。'},event]:[event]):[],aliveCount:6,readyCount:0};
 const minionFirstNight=selectedScene?.kind==='EVIL_START'&&selectedScene.themeRoleId!=='imp';
 const privateView:PrivateView={participant:{id:'preview-player',nickname:names[0]!,seat:1},state:'RUNNING',messages:[],history:[{seq:1,phase:'OTHER_NIGHT',day:1,kind:'INFORMATION',text:'演示魔典',grimoire:{entries:game.seats.map((p,i)=>({seat:p.seat,nickname:p.nickname,avatar:p.avatar!,roleName:beginnerRoles[i]!.name,alive:i!==4,reminders:i===2?['中毒']:[]}))}}],game,startInfo:{infoId:'lab-first',gameId:game.gameId!,team:[{seat:3,nickname:names[2]!,avatar:avatarChoices[2]!.url,kind:minionFirstNight?'DEMON':'MINION'}],bluffs:(minionFirstNight?[]:beginnerRoles.slice(0,3)).map(r=>({roleId:r.id,name:r.name,summary:r.summary})),acknowledged:false,canAcknowledge:false}};
 useEffect(()=>{if(!longNomination||!runId)return;let cancelled=false;anchor.current={...anchor.current,paused:true};void prepareNominationAudio().then(()=>{if(cancelled)return;setLongPrepared(runId);anchor.current={...anchor.current,at:performance.now(),paused:document.hidden||!allowedRef.current||playbackChoice.current};});return()=>{cancelled=true;};},[runId,longNomination]);
 useEffect(()=>{if(!selectedScene)return;const at=position();anchor.current={...anchor.current,elapsed:at,at:performance.now(),paused:true};setElapsed(at);let cancelled=false;void Promise.allSettled([preparePrivateArt(selectedScene),prepareRoleAudio(selectedScene)]).then(([art])=>{if(cancelled)return;setArtReady({key:readyKey,urls:new Set(art.status==='fulfilled'?art.value?.ready??[]:[])});setPrepared(readyKey);anchor.current={...anchor.current,at:performance.now(),paused:document.hidden||!allowedRef.current||playbackChoice.current};});return()=>{cancelled=true;};},[readyKey]);
 useEffect(()=>{if(!selectedScene||!allowed||hidden||paused||prepared!==readyKey)return;scheduleRoleCue(selectedScene,elapsed,{rate,mode:audioMode.current});audioMode.current='RESUME';return()=>cancelEventAudio('private:'+selectedScene.id);},[runId,allowed,hidden,paused,rate,epoch,prepared,readyKey,audioEpoch]);
 useEffect(()=>{if(!allowed&&selected)update({paused:true});},[allowed]);
 useBackLayer(!!selected,close);
 const scenes=[...effectsScenarios,...rolePreviewScenarios].filter(scenario=>{
   const role=roleForScenario(scenario);
   return scope==='public'?!role:!!role&&(!category||beginnerRoles.some(item=>item.id===role&&item.type===category))&&(!kind||kinds(scenario).includes(kind));
 });
 return <main className={`effects-lab${selected?' is-playing':''}`}>
  <header className="effects-lab__header" inert={book}><button type="button" onClick={()=>{if(selected)close();onClose();}}>‹ 返回游戏</button><nav aria-label="预览类型"><button type="button" aria-pressed={tab==='animations'} onClick={()=>setTab('animations')}>动画</button><button type="button" aria-pressed={tab==='audio'} onClick={()=>{close();setBook(false);setTab('audio');}}>音频</button></nav><GlobalAudioButton/></header>
  {tab==='audio'?<AudioAudition allowed={allowed&&!hidden}/>:<div className="effects-lab__body" inert={!!selected||book}>
    <h1>动画演示</h1>
    <nav className="effects-lab__filters" aria-label="演出分类"><button type="button" aria-pressed={scope==='roles'} onClick={()=>setScope('roles')}>角色专属</button><button type="button" aria-pressed={scope==='public'} onClick={()=>setScope('public')}>通用</button></nav>
    {scope==='roles'&&<><nav className="effects-lab__filters" aria-label="角色分类"><button type="button" aria-pressed={!category} onClick={()=>setCategory('')}>全部</button>{roleFilters.map(([id,label])=><button key={id} type="button" aria-pressed={category===id} onClick={()=>setCategory(id)}>{label}</button>)}</nav><nav className="effects-lab__filters" aria-label="角色演出类型">{['','身份','信息获取','行动','首夜'].map(label=><button type="button" key={label} aria-pressed={kind===label} onClick={()=>setKind(label)}>{label||'全部'}</button>)}</nav></>}
    <div className="effects-lab__catalog" aria-label="特效演出目录">{scenes.map(s=><FeedbackButton type="button" disabled={!allowed} key={s.id} onClick={()=>start(s)}><span aria-hidden="true">{roleForScenario(s)?'◈':s.kind==='GAME_OVER'?'♜':s.kind==='SHOT'?'⌁':'☾'}</span><strong>{s.label}</strong><small>{roleForScenario(s)?'角色演出':'公开演出'}</small></FeedbackButton>)}</div>
    {scenes.length===0&&<p role="status">这个分类暂无演出</p>}
    {scope==='public'&&<FeedbackButton type="button" disabled={!allowed} onClick={()=>{void unlockEffectsAudio();setBook(true);}}>纸张翻页与菜单演示</FeedbackButton>}
    {!allowed?<p role="status">正在同步大厅，稍后可继续试听。</p>:audioStatus?<button className="effects-lab__unlock" type="button" onClick={()=>void unlockEffectsAudio()}>{audioStatus}</button>:null}
  </div>}
  {selected?<><div className="effects-lab__controls" aria-label="演出播放控制"><div><strong>{selected.label}</strong><FeedbackButton type="button" onClick={close}>返回目录</FeedbackButton></div><label>进度<input type="range" aria-label="演出进度" min={0} max={duration} step={10} value={Math.min(elapsed,duration)} onChange={e=>update({elapsed:Number(e.target.value)})}/></label><div><FeedbackButton type="button" onClick={()=>update({paused:!paused})}>{paused?'继续':'暂停'}</FeedbackButton><FeedbackButton type="button" onClick={()=>start(selected)}>重播</FeedbackButton><FeedbackButton type="button" onClick={()=>update({paused:true,elapsed:Math.min(duration,position()+1000/24)})}>单步</FeedbackButton><label>速度<select aria-label="播放速度" value={rate} onChange={e=>update({rate:Number(e.target.value)})}><option value={.25}>0.25×</option><option value={.5}>0.5×</option><option value={1}>1×</option></select></label><output>{(elapsed/1000).toFixed(1)} / {(duration/1000).toFixed(1)} 秒</output></div><details className="effects-lab__anchors"><summary>关键帧</summary><div>{[600,700,950,1100,1350,1450,1600,1750,1900,2200,2400].filter(t=>t<=duration).map(t=><FeedbackButton key={t} type="button" onClick={()=>update({paused:true,elapsed:t})}>{t} ms</FeedbackButton>)}</div></details></div>{selectedScene?<section className="private-scene-dialog effects-lab-private" role="region" aria-label="仅本人可见的演示"><div className="private-scene-body"><PrivateSceneContent scene={selectedScene} view={privateView} elapsedMs={elapsed} readyAssets={artReady.key===readyKey?artReady.urls:new Set()}/>{prepared!==readyKey?<div className="private-scene-loading" role="status">正在准备画面与声音…</div>:null}</div></section>:null}<>{longNomination?<PublicNominationAudio key={'sound:'+runId} game={game} playback={{now:1000+elapsed,paused:!allowed||paused||hidden||longPrepared!==runId,rate,epoch,mode:audioMode.current}}/>:null}<EventStage key={'visual:'+runId} game={game}  preview playback={{now:1000+elapsed,paused:!allowed||paused||hidden,rate,epoch,mode:audioMode.current}}/></></>:null}{book?<GuideOverlay mode="tutorial" onClose={()=>setBook(false)}/>:null}</main>;
}
