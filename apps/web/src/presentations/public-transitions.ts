import type {ExperienceEvent} from '@ravens/contracts';
import type {GameView} from '../api.js';

/** Only transitions observed live on this page may wait for an in-progress private scene. */
export class PublicTransitionQueue {
 private discarded=new Set<string>();
 private completed:string[]=[];
 private pending:Array<{event:ExperienceEvent;at?:number}>=[];
 select(game:GameView|undefined,live:ExperienceEvent|undefined,now:number,blocked:boolean,reading:boolean,seen:ReadonlySet<string>){
  const completed=this.completed;
  const transition=(event:ExperienceEvent)=>event.kind==='DAWN'||event.kind==='NIGHT_FALLS';
  const valid=(event:ExperienceEvent)=>!!game&&event.gameId===game.gameId&&(event.day===undefined||event.day===game.day)&&(event.kind==='NIGHT_FALLS'?['ROLE_REVEAL','FIRST_NIGHT','OTHER_NIGHT'].includes(game.phase):!['FIRST_NIGHT','OTHER_NIGHT','ROLE_REVEAL','ABORTED','GAME_OVER'].includes(game.phase));
  this.pending=this.pending.filter(({event})=>{if(!valid(event)){this.discarded.add(event.id);return false;}return !seen.has(event.id);});
  if(live&&transition(live)&&valid(live)&&!completed.includes(live.id)&&blocked&&!reading&&!this.pending.some(row=>row.event.id===live.id))this.pending.push({event:live});
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
