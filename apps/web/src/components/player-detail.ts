import {experienceTiming} from '@ravens/contracts';
import type {GameView,PrivateView} from '../api.js';
type Event=GameView['events'][number];
const nightLabel=(e:{phase:string;day:number})=>e.phase==='FIRST_NIGHT'?'首夜':e.phase==='OTHER_NIGHT'?`第${Math.max(2,e.day+1)}夜`:`第${Math.max(1,e.day)}天`;
export function publishedPlayerResults(game:GameView,now:number){return game.events.filter(e=>{
 if(!e.kind||e.startsAt===undefined)return false;
 return now>=e.startsAt+experienceTiming(e.kind,e.timingVersion??1).resultOffset;
 });}
/** Public causes use the first published fatal event only; vote seats are never death targets. */
export function publicPlayerDetail(game:GameView,seat:number,now:number){
 const player=game.seats.find(p=>p.seat===seat),events=publishedPlayerResults(game,now),today=events.filter(e=>e.kind==='VOTE_RESULT'&&e.day===game.day&&e.targetSeat!==undefined&&e.votes!==undefined);
 const votes=today.filter(e=>e.targetSeat===seat).map(e=>({seq:e.seq,votes:e.votes!})),highest=Math.max(0,...today.map(e=>e.votes!),game.onBlock?.votes??0);
 let death:Event|undefined;
 if(player&&!player.alive)death=[...events].sort((a,b)=>(a.startsAt!+experienceTiming(a.kind!,a.timingVersion??1).resultOffset)-(b.startsAt!+experienceTiming(b.kind!,b.timingVersion??1).resultOffset)||a.seq-b.seq).find(e=>e.outcome==='DEATH'&&(e.kind==='DAWN'?e.seats?.includes(seat):(e.kind==='SHOT'||e.kind==='EXECUTION')&&e.targetSeat===seat));
 return {votes,highest,deathReason:!player||player.alive?undefined:death?.kind==='DAWN'?'夜间死亡（黎明公布）':death?.kind==='SHOT'?'公开枪击':death?.kind==='EXECUTION'?'公开处决':'公开死亡原因未记录或尚未公布',ghost:!player||player.alive?'存活，鬼票尚未启用':player.ghostVoteAvailable?'剩余1枚鬼票':'鬼票已使用'};
}
/** All inputs are this viewer's received records. No nickname matching or hidden truth lookup. */
export function knownPlayerClues(view:PrivateView,seat:number){
 const clues:{key:string;when:string;text:string}[]=[];
 const team=view.startInfo?.team.find(p=>p.seat===seat);if(team)clues.push({key:'team',when:'首夜获知',text:team.kind==='DEMON'?'恶魔同伴':'爪牙同伴'});
 if(view.butler?.masterSeat===seat)clues.push({key:'master',when:'本轮',text:'你已选择的主人'});
 for(const e of view.history){
  const snapshot=e.grimoire?.entries.find(p=>p.seat===seat);
  if(snapshot){clues.push({key:`history-${e.seq}`,when:`${nightLabel(e)}魔典快照`,text:`当夜所见：${snapshot.roleName} · ${snapshot.alive?'当夜存活':'当夜已死亡'}${snapshot.reminders.length?' · '+snapshot.reminders.join(' · '):''}`});continue;}
  if(e.kind!=='INFORMATION'&&e.kind!=='ACTION')continue;
  if(e.candidateGroup?.seats.includes(seat))clues.push({key:`history-${e.seq}`,when:nightLabel(e),text:`可能是${e.candidateGroup.roleName}。原信息：${e.text}`});
  else if(e.targetSeats?.includes(seat))clues.push({key:`history-${e.seq}`,when:nightLabel(e),text:e.text});
 }
 return clues;
}
