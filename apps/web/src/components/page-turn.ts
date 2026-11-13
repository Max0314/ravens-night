export type TurnDirection = -1 | 1;
export type TurnRenderer = 'canvas' | 'dom' | 'reduced';
export type TurnCorner = 'top' | 'bottom';
export interface TurnGrip {x:number;y:number}
export interface TurnState<T> { from:T; to:T; direction:TurnDirection; progress:number; renderer:TurnRenderer; completing:boolean; corner:TurnCorner; grip:TurnGrip }
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
/** Canonical x starts at the turning edge; reverse turns mirror it at render time. */
export function dragTurnGrip(dx:number,dy:number,width:number,height:number,direction:TurnDirection,corner:TurnCorner):TurnGrip{
  const progress=turnProgress(dx,width,direction),bend=Math.min(.025,progress*.1);
  if(!progress)return {x:1,y:corner==='top'?0:1};
  return {x:clamp(1+direction*dx/Math.max(1,width),-1.16,1),y:corner==='top'?clamp(dy/Math.max(1,height),bend,.9):clamp(1+dy/Math.max(1,height),.1,1-bend)};
}
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
  begin(from:T,to:T,direction:TurnDirection,renderer:TurnRenderer,corner:TurnCorner='bottom'){
    if(this.state)return false;
    this.sounded=false;this.state={from,to,direction,progress:0,renderer,completing:false,corner,grip:{x:1,y:corner==='top'?0:1}};this.options.begin(this.state);this.publish();return true;
  }
  track(progress:number,grip?:TurnGrip){if(!this.state||this.state.completing)return;const p=clamp(progress,0,1);this.state={...this.state,progress:p,grip:grip??{x:1-2.16*p,y:this.state.corner==='top'?.12*Math.sin(p*Math.PI):1-.12*Math.sin(p*Math.PI)}};this.publish();}
  settle(complete:boolean,button=false){
    const current=this.state;if(!current)return;
    this.cancelFrame();const initial=current.progress,start=this.now(),duration=current.renderer==='reduced'?120:button?360:complete?160+120*(1-initial):180;
    this.state={...current,completing:true};
    const animate=()=>{
      const state=this.state;if(!state)return;
      const t=Math.min(1,(this.now()-start)/duration),ease=1-Math.pow(1-t,3),progress=initial+((complete?1:0)-initial)*ease;
      const cornerY=current.corner==='top'?0:1,targetX=complete?-1.16:1;
      const lift=button?Math.sin(t*Math.PI)*.16*(current.corner==='top'?1:-1):0;
      this.state={...state,progress,grip:{x:current.grip.x+(targetX-current.grip.x)*ease,y:current.grip.y+(cornerY-current.grip.y)*ease+lift}};
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

export interface SheetPoint {x:number;y:number}
export interface CurlGeometry {width:number;height:number;normal:SheetPoint;middle:SheetPoint;arc:number;flat:boolean}
/** The fold is the perpendicular bisector of the original corner and its live XY grip. */
export function pageCurl(width:number,height:number,turn:Pick<TurnState<unknown>,'direction'|'corner'|'grip'>):CurlGeometry{
  const corner={x:turn.direction>0?width:0,y:turn.corner==='top'?0:height};
  const grip={x:(turn.direction>0?turn.grip.x:1-turn.grip.x)*width,y:turn.grip.y*height};
  const vx=corner.x-grip.x,vy=corner.y-grip.y,length=Math.hypot(vx,vy);
  return {width,height,normal:{x:length?vx/length:turn.direction,y:length?vy/length:0},middle:{x:(corner.x+grip.x)/2,y:(corner.y+grip.y)/2},arc:Math.min(width*.12,length*.35),flat:length<.01};
}
export function sheetDistance(point:SheetPoint,g:CurlGeometry){return (point.x-g.middle.x)*g.normal.x+(point.y-g.middle.y)*g.normal.y;}
/** Clip source paper against one fold-parallel half plane. */
export function clipSheet(points:SheetPoint[],g:CurlGeometry,offset:number,less=true):SheetPoint[]{
  const output:SheetPoint[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[i]!,b=points[(i+1)%points.length]!,da=sheetDistance(a,g)-offset,db=sheetDistance(b,g)-offset,inside=less?da<=0:da>=0,next=less?db<=0:db>=0;
    if(inside)output.push(a);
    if(inside!==next){const t=da/(da-db);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
  }
  return output;
}
export function sheetRectangle(g:CurlGeometry):SheetPoint[]{return [{x:0,y:0},{x:g.width,y:0},{x:g.width,y:g.height},{x:0,y:g.height}];}
/** Orthographic cylinder, then reflected paper. Tangential coordinates never change. */
export function bendSheetPoint(point:SheetPoint,g:CurlGeometry):SheetPoint&{z:number;back:boolean}{
  if(g.flat)return {...point,z:0,back:false};
  const distance=sheetDistance(point,g),s=distance+g.arc/2,radius=g.arc/Math.PI;
  if(s<=0)return {...point,z:0,back:false};
  const curved=s<g.arc,angle=Math.PI*s/g.arc,projected=curved?radius*Math.sin(angle):g.arc-s,shift=projected-s;
  return {x:point.x+shift*g.normal.x,y:point.y+shift*g.normal.y,z:curved?radius*(1-Math.cos(angle)):2*radius,back:s>g.arc/2};
}
export function sheetBands(g:CurlGeometry,count:number){
  const rectangle=sheetRectangle(g);
  if(g.flat)return [{points:rectangle,back:false,shade:0}];
  const bands=[{points:clipSheet(rectangle,g,-g.arc/2),back:false,shade:0}];
  for(let i=0;i<count;i++){
    const start=-g.arc/2+g.arc*i/count,end=-g.arc/2+g.arc*(i+1)/count;
    bands.push({points:clipSheet(clipSheet(rectangle,g,start,false),g,end),back:i>=count/2,shade:.16+.32*Math.sin(Math.PI*(i+.5)/count)});
  }
  bands.push({points:clipSheet(rectangle,g,g.arc/2,false),back:true,shade:.08});
  return bands.filter(band=>band.points.length>=3);
}
