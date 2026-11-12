import type {PrivateSceneDescriptor,PresentationDisposition} from '@ravens/contracts';

export interface QueuedScene {historySeq:number;scene:PrivateSceneDescriptor;replay?:boolean}
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
    this.current=this.replays.shift()??[...this.pending.values()].sort((a,b)=>a.historySeq-b.historySeq)[0];
    if(this.current)this.pending.delete(this.current.scene.id);
    return this.current;
  }
  replay(entry:QueuedScene){this.replays.push({...entry,replay:true});}
  finish(disposition:PresentationDisposition){
    const entry=this.current;this.current=undefined;
    if(!entry||entry.replay)return undefined;
    this.seen.add(entry.scene.id);
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
