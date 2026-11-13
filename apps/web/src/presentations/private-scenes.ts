import type {PrivateView} from '../api.js';
import type {PrivateSceneDescriptor,PresentationDisposition} from '@ravens/contracts';

export interface QueuedScene {historySeq:number;scene:PrivateSceneDescriptor;replay?:boolean;local?:boolean}
/** One queue per authenticated game. No payload is stored outside this page. */
export class PrivateSceneQueue {
  private pending=new Map<string,QueuedScene>();
  private seen=new Set<string>();
  private replays:QueuedScene[]=[];
  current:QueuedScene|undefined;
  sync(entries:QueuedScene[]){
    const available=new Set(entries.map(e=>e.scene.id));
    for(const [id]of this.pending)if(!available.has(id))this.pending.delete(id);
    for(const entry of entries)if(!this.seen.has(entry.scene.id)&&this.current?.scene.id!==entry.scene.id)this.pending.set(entry.scene.id,entry);
  }
  get count(){return this.pending.size+this.replays.length+(this.current?1:0);}
  start(){
    if(this.current)return this.current;
    const next=[...this.pending.values()].sort((a,b)=>a.historySeq-b.historySeq)[0];
    this.current=this.replays[0]?.scene.kind==='EVIL_START'&&next?.scene.kind==='IDENTITY'?next:this.replays.shift()??next;
    if(this.current)this.pending.delete(this.current.scene.id);
    return this.current;
  }
  has(id:string){return this.current?.scene.id===id||this.pending.has(id)||this.replays.some(row=>row.scene.id===id);}
  replay(entry:QueuedScene){if(!this.has(entry.scene.id))this.replays.push({...entry,replay:true});}
  finish(disposition:PresentationDisposition){
    const entry=this.current;this.current=undefined;
    if(!entry||entry.replay)return undefined;
    this.seen.add(entry.scene.id);
    if(entry.local)return undefined;
    return{historySeq:entry.historySeq,disposition};
  }
  clear(){this.current=undefined;this.pending.clear();this.replays=[];this.seen.clear();}
}

export const roleSceneDurations:Record<string,number>={washerwoman:4200,librarian:4200,investigator:4200,chef:3800,empath:3800,fortune_teller:4200,undertaker:4200,monk:3600,ravenkeeper:4200,virgin:3600,slayer:3600,soldier:3600,mayor:3600,butler:4000,drunk:4000,recluse:3600,saint:3600,poisoner:4000,spy:4600,scarlet_woman:4600,baron:4000,imp:4200};
export function sceneDuration(scene:PrivateSceneDescriptor,butlerDuration=4000){
  if(scene.kind==='EVIL_START'||scene.kind==='ROLE_CHANGE')return 4600;
  if(scene.kind==='OLD_DEMON_CONTINUATION')return 4200;
  if(scene.themeRoleId==='butler')return butlerDuration;
  if(scene.kind==='IDENTITY')return scene.themeRoleId==='baron'||scene.themeRoleId==='drunk'?4000:3600;
  if(scene.kind==='ACTION_SUBMITTED'&&['fortune_teller','ravenkeeper'].includes(scene.themeRoleId))return 3000;
  return roleSceneDurations[scene.themeRoleId]??3800;
}

/** Legacy views may have startInfo without a presentation envelope; render only that authorized data. */
export function startInfoScene(view:PrivateView):QueuedScene|undefined{
 const info=view.startInfo;if(!info||!view.game||!view.role)return;
 const pending=view.presentations?.pending.find(entry=>entry.scene.shown.type==='EVIL_START'&&entry.scene.shown.infoId===info.infoId);
 if(pending)return pending;
 const recorded=view.history.find(entry=>entry.presentation?.shown.type==='EVIL_START'&&entry.presentation.shown.infoId===info.infoId);
 return {historySeq:recorded?.seq??Math.max(0,...view.history.map(entry=>entry.seq))+1,local:true,scene:recorded?.presentation??{version:1,id:`start-info:${view.game.gameId}:${info.infoId}`,kind:'EVIL_START',themeRoleId:view.role.roleId,shown:{type:'EVIL_START',infoId:info.infoId}}};
}
