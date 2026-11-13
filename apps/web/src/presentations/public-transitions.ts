import {experienceTiming,type ExperienceEvent} from '@ravens/contracts';
import type {GameView} from '../api.js';

/** Only transitions observed live on this page may wait for an in-progress private scene. */
export class PublicTransitionQueue {
 private discarded=new Set<string>();
 private completed:string[]=[];
 private pending:Array<{event:ExperienceEvent;at?:number}>=[];
 select(game:GameView|undefined,live:ExperienceEvent|undefined,now:number,blocked:boolean,reading:boolean,seen:ReadonlySet<string>){
  const completed=this.completed;
  const transition=(event:ExperienceEvent)=>event.kind==='DAWN'||event.kind==='NIGHT_FALLS';
  const earlyDawn=(event:ExperienceEvent)=>!!game&&event.kind==='DAWN'&&['FIRST_NIGHT','OTHER_NIGHT'].includes(game.phase)&&event.day===game.day+1;
  const valid=(event:ExperienceEvent)=>!!game&&event.gameId===game.gameId&&(event.kind==='NIGHT_FALLS'?(event.day===undefined||event.day===game.day)&&['ROLE_REVEAL','FIRST_NIGHT','OTHER_NIGHT'].includes(game.phase):earlyDawn(event)||(event.day===undefined||event.day===game.day)&&!['FIRST_NIGHT','OTHER_NIGHT','ROLE_REVEAL','ABORTED','GAME_OVER'].includes(game.phase));
  this.pending=this.pending.filter(row=>{
   const latest=game?.events.find(event=>event.id===row.event.id);
   if(latest?.kind===row.event.kind&&latest.gameId===row.event.gameId&&latest.startsAt!==undefined&&latest.durationMs!==undefined)row.event=latest as ExperienceEvent;
   if(!valid(row.event)){this.discarded.add(row.event.id);return false;}return !seen.has(row.event.id);
  });
  // A delayed atmospheric scene must not swallow a newly public execution or finale.
  if(live&&(live.kind==='EXECUTION'||live.kind==='GAME_OVER')){
   for(const row of this.pending){this.discarded.add(row.event.id);completed.push(row.event.id);}
   this.pending=[];
  }
  const withinOpening=live&&(!earlyDawn(live)||now<live.startsAt+experienceTiming(live.kind,live.timingVersion??1).resultOffset);
  if(live&&transition(live)&&valid(live)&&withinOpening&&!completed.includes(live.id)&&blocked&&!reading&&!this.pending.some(row=>row.event.id===live.id))this.pending.push({event:live});
  let row=this.pending[0];
  while(row&&row.at!==undefined&&now-row.at>=row.event.durationMs){completed.push(row.event.id);this.pending.shift();row=this.pending[0];}
  // Genuine reading retains its lightweight behavior; it never schedules a later surprise movie.
  if(reading&&row&&row.at===undefined){if(live?.id!==row.event.id)completed.push(row.event.id);this.pending.shift();row=undefined;}
  if(row){
   if(row.at===undefined&&!blocked)row.at=Math.max(now,row.event.startsAt);
   if(row.at!==undefined)return{active:row.event,elapsed:now-row.at,deferred:true,waitingId:row.event.id,completed};
  }
  const active=live&&!this.discarded.has(live.id)&&!(transition(live)&&['ABORTED','GAME_OVER'].includes(game?.phase??''))&&!completed.includes(live.id)&&!(blocked&&!reading&&transition(live))?live:undefined;
  return{active,elapsed:active?now-active.startsAt:0,deferred:false,waitingId:row?.event.id,completed};
 }
}
