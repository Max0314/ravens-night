export type TurnDirection = -1 | 1;
export type TurnRenderer = 'canvas' | 'dom' | 'reduced';
export interface TurnState<T> { from:T; to:T; direction:TurnDirection; progress:number; renderer:TurnRenderer; completing:boolean }
export const turnProgress=(dx:number,width:number,direction:TurnDirection)=>Math.max(0,Math.min(1,-direction*dx/Math.max(1,width)));
export const shouldCompleteTurn=(progress:number,dx:number,velocity:number,direction:TurnDirection)=>progress>=.28||(-direction*velocity>=.45&&-direction*dx>=24);

/** One immutable source/target pair per gesture. Renderer changes only between turns. */
export class PageTurnController<T> {
  state:TurnState<T>|undefined;
  private frame=0; private listeners=new Set<()=>void>(); private sounded=false;
  constructor(private readonly options:{begin:(state:TurnState<T>)=>void;finish:(target:T|undefined)=>void;sound:()=>void;clock?:()=>number;requestFrame?:(cb:FrameRequestCallback)=>number;cancelFrame?:(id:number)=>void}){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getSnapshot=()=>this.state;
  private now(){return this.options.clock?.()??performance.now();}
  private request(cb:FrameRequestCallback){return this.options.requestFrame?.(cb)??requestAnimationFrame(cb);}
  private cancelFrame(){if(this.frame)(this.options.cancelFrame??cancelAnimationFrame)(this.frame);this.frame=0;}
  private publish(){for(const listener of this.listeners)listener();}
  begin(from:T,to:T,direction:TurnDirection,renderer:TurnRenderer){
    if(this.state)return false;
    this.sounded=false;this.state={from,to,direction,progress:0,renderer,completing:false};this.options.begin(this.state);this.publish();return true;
  }
  track(progress:number){if(!this.state||this.state.completing)return;this.state={...this.state,progress:Math.max(0,Math.min(1,progress))};this.publish();}
  settle(complete:boolean,button=false){
    const current=this.state;if(!current)return;
    this.cancelFrame();const initial=current.progress,start=this.now(),duration=current.renderer==='reduced'?120:button?360:complete?160+120*(1-initial):180;
    this.state={...current,completing:true};
    const animate=()=>{
      const state=this.state;if(!state)return;
      const t=Math.min(1,(this.now()-start)/duration),ease=1-Math.pow(1-t,3),progress=initial+((complete?1:0)-initial)*ease;
      this.state={...state,progress};
      if(complete&&!this.sounded&&progress>=.35){this.sounded=true;this.options.sound();}
      this.publish();
      if(t<1)this.frame=this.request(animate);
      else{this.frame=0;const target=complete?state.to:undefined;this.state=undefined;this.options.finish(target);this.publish();}
    };
    this.frame=this.request(animate);
  }
  cancel(){if(!this.state)return;this.cancelFrame();this.state=undefined;this.options.finish(undefined);this.publish();}
  finishImmediately(complete:boolean){const state=this.state;if(!state)return;this.cancelFrame();if(complete&&!this.sounded){this.sounded=true;this.options.sound();}this.state=undefined;this.options.finish(complete?state.to:undefined);this.publish();}
  dispose(){this.cancelFrame();this.state=undefined;this.listeners.clear();}
}

/** Sheet geometry in CSS pixels. p=0 is flat; p=1 is entirely outside the viewport. */
export function curlPoint(u:number,width:number,progress:number){
  const arc=.16*width,radius=arc/Math.PI,fold=width-(width+arc)*progress;
  if(u<fold)return{x:u,z:0,back:false};
  if(u<=fold+arc){const angle=Math.PI*(u-fold)/arc;return{x:fold+radius*Math.sin(angle),z:radius*(1-Math.cos(angle)),back:angle>Math.PI/2};}
  return{x:2*fold+arc-u,z:2*radius,back:true};
}
