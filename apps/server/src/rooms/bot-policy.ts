import type {PrivateView} from '@ravens/contracts';
import {randomAt} from '@ravens/game-engine';
import type {BotKind,BotMemory,BotTask} from './bot-types.js';
export interface BotObservation {view:PrivateView;memory:BotMemory;seed:string;now:number;slow:boolean}
export interface BotIntent {kind:BotKind;args:BotTask['args'];delay:number;latest?:number}
/** Pure, intentionally modest policy. No room snapshots or hidden assignments enter here. */
export function chooseBotAction({view:v,memory:m,seed,now,slow}:BotObservation):BotIntent|undefined{
  const g=v.game,seat=v.participant.seat,newPace=g?.presentationVersion===2;
  const delay=(old:number,latest:number)=>newPace?latest:old;
  const make=(kind:BotKind,args:BotTask['args'],ms:number):BotIntent=>({kind,args,delay:ms*(slow?3:1)});
  if(v.state==='LOBBY')return v.room?.participants.find(p=>p.id===v.participant.id)?.ready?undefined:make('READY',{},g?delay(300,500):500);
  if(v.state==='TUTORIAL')return v.participant.tutorialComplete?undefined:make('TUTORIAL_COMPLETE',{},1500);
  if(!g||['GAME_OVER','ABORTED'].includes(g.phase))return;
  if((g.presentationUntil??0)>now)return;
  if(g.phase==='ROLE_REVEAL')return v.roleConfirmed?undefined:make('CONFIRM_ROLE',{},delay(700,1500));
  if(v.startInfo?.canAcknowledge)return make('ACK_START_INFO',{infoId:v.startInfo.infoId},1800);
  const self=g.seats.find(p=>p.seat===seat),alive=(s:number)=>g.seats.some(p=>p.seat===s&&p.alive);
  const random=(tag:string)=>randomAt(`${seed}:${v.participant.id}:${g.gameId}:${g.contextId}:${g.nomination?.ballotId??''}:${tag}`,0);
  const score=(s:number)=>g.events.reduce((n,e)=>n+(e.kind==='NOMINATION'&&e.actorSeat===s&&e.targetSeat===seat?2:0)+(e.kind==='VOTE_RESULT'&&e.targetSeat===seat&&e.seats?.includes(s)?1:0),0)+(g.onBlock?.seat===s?1:0);
  const select=(legal:number[],count:number,night=true)=>{
    const role=v.role?.roleId,attack=['imp','poisoner'].includes(role??'');
    const tier=(s:number)=>!night?0:s!==seat&&alive(s)&&(!attack||!m.knownTeamSeats.includes(s))?0:s!==seat?1:2;
    const priority=(s:number)=>!night?score(s):tier(s)>0?0:['imp','poisoner','monk'].includes(role??'')?g.events.filter(e=>e.kind==='NOMINATION'&&e.actorSeat===s).length:role==='butler'?g.events.filter(e=>e.kind==='VOTE_RESULT'&&e.seats?.includes(s)).length:score(s);
    return legal.map(s=>({s,tier:tier(s),score:priority(s),tie:random(`pick:${s}`)})).sort((a,b)=>a.tier-b.tier||b.score-a.score||b.tie-a.tie).slice(0,count).map(p=>p.s);
  };
  if(v.action?.kind==='SELECT_ONE'||v.action?.kind==='SELECT_TWO')return make('NIGHT_ACTION',{targets:select(v.action.legalSeats,v.action.maxTargets)},delay(1200,2500));
  if(g.phase==='VOTING'&&g.nomination&&v.canVote){
    const nominee=g.nomination.nomineeSeat;
    let raised=self?.alive?(g.nomination.nominatorSeat===seat||nominee!==seat&&score(nominee)>=1||random('vote')<.5):score(nominee)>=2;
    if(v.role?.alignment==='EVIL'&&m.knownTeamSeats.includes(nominee))raised=false;
    if(self?.alive&&v.role?.roleId==='butler')raised=raised&&v.butler?.masterRaised===true;
    const prior=m.ballot?.ballotId===g.nomination.ballotId?m.ballot:undefined;
    if(!prior?.initialSubmitted||v.role?.roleId==='butler'&&prior.correctionCount===0&&raised!==prior.lastRaised){
      const index=g.nomination.voterOrder?.indexOf(seat)??-1,counted=g.nomination.countedSeats?.length??0;
      return{kind:'VOTE',args:{raised},delay:Math.min(1500,500*(slow?3:1)),...(index>=counted&&g.nomination.nextCountAt!==undefined?{latest:g.nomination.nextCountAt+(index-counted)*1500}:{})};
    }
    return;
  }
  if(['DAY_DISCUSSION','NOMINATION'].includes(g.phase)){
    const since=now-(g.publishedPhaseStartedAt??now);
    if(v.role?.roleId==='slayer'&&v.action?.kind==='SLAYER'&&g.day>=2){const targets=select(v.action.legalSeats,1,false);if(targets[0]!==undefined&&score(targets[0])>=2)return make('SLAYER',{targets},delay(1200,2500));}
    if(v.canNominate&&since>=10000){let legal=v.nominationTargets??[];if(v.role?.alignment==='EVIL'){const others=legal.filter(s=>!m.knownTeamSeats.includes(s));if(others.length)legal=others;}const targets=select(legal,1,false);if(targets.length)return make('NOMINATE',{targets},0);}
    if(v.canEndDay&&!v.dayReady&&since>=18000)return make('DAY_READY',{},0);
    const invite=v.social?.invitations.find(i=>i.toSeat===seat&&v.room?.participants.some(p=>p.seat===i.fromSeat&&p.controller!=='BOT'));
    if(invite)return make('WHISPER_ACCEPT',{whisperId:invite.id},delay(800,1200));
    const whisper=v.social?.activeWhisper,message=whisper?.messages.find(message=>message.seat!==seat&&!m.ackedHumanMessageIds.includes(message.id));
    if(whisper&&message)return make('WHISPER_REPLY',{whisperId:whisper.id,messageId:message.id},delay(800,1200));
  }
}
