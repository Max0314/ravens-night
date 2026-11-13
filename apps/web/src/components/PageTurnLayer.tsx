import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore,type ReactNode,type CSSProperties} from 'react';
import {bendSheetPoint,clipSheet,pageCurl,PageTurnController,sheetBands,sheetDistance,sheetRectangle,type CurlGeometry,type SheetPoint} from './page-turn.js';

export function sampleDrawCost(budget:{count:number;total:number},started:number,ended:number){
  budget.total+=Math.max(0,ended-started);budget.count++;
  return budget.count>=4&&budget.total/budget.count>25;
}

/** Each narrow fold-parallel band has one affine map; the fixed sheet is drawn once. */
export function bandMatrix(points:SheetPoint[],g:CurlGeometry):[number,number,number,number,number,number]{
  const distances=points.map(point=>sheetDistance(point,g)),low=Math.min(...distances),high=Math.max(...distances);
  const projected=(d:number)=>{const p={x:g.middle.x+g.normal.x*d,y:g.middle.y+g.normal.y*d};return sheetDistance(bendSheetPoint(p,g),g);};
  const q=projected(low),scale=high-low>.0001?(projected(high)-q)/(high-low):1,n=g.normal;
  const offset=(1-scale)*(g.middle.x*n.x+g.middle.y*n.y)+q-scale*low;
  return [1+(scale-1)*n.x*n.x,(scale-1)*n.x*n.y,(scale-1)*n.x*n.y,1+(scale-1)*n.y*n.y,offset*n.x,offset*n.y];
}
const polygon=(points:SheetPoint[])=>points.map(point=>`${point.x},${point.y}`).join(' ');
const paperColor=(back:boolean,shade:number)=>`rgb(${(back?[197,175,135]:[70,60,43]).map(channel=>Math.round(channel*(1-shade))).join(' ')})`;
export function PageTurnLayer<T>({controller,outgoing,incoming,fromTexture,toTexture,onSlow}:{controller:PageTurnController<T>;outgoing:ReactNode;incoming:ReactNode;fromTexture?:HTMLCanvasElement|undefined;toTexture?:HTMLCanvasElement|undefined;onSlow:()=>void}){
  const turn=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),canvasRef=useRef<HTMLCanvasElement>(null),hostRef=useRef<HTMLDivElement>(null),timing=useRef({count:0,total:0}),[size,setSize]=useState({width:1,height:1});
  useLayoutEffect(()=>{const host=hostRef.current;if(host)setSize({width:host.clientWidth||1,height:host.clientHeight||1});},[]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!turn||turn.renderer!=='canvas'||!fromTexture?.width||!toTexture?.width)return;
    const context=canvas.getContext('2d');if(!context)return;
    const started=performance.now(),width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    const dpr=Math.min(1.5,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.scale(dpr,dpr);
    context.clearRect(0,0,width,height);context.drawImage(toTexture,0,0,width,height);
    const geometry=pageCurl(width,height,turn);
    for(const band of sheetBands(geometry,24)){
      const matrix=bandMatrix(band.points,geometry);
      context.save();context.transform(...matrix);context.beginPath();band.points.forEach((point,i)=>{if(i)context.lineTo(point.x,point.y);else context.moveTo(point.x,point.y);});context.closePath();context.clip();
      if(band.back){context.fillStyle='#c5af87';context.fillRect(0,0,width,height);context.globalAlpha=.065;context.drawImage(fromTexture,0,0,width,height);context.globalAlpha=1;}
      else context.drawImage(fromTexture,0,0,width,height);
      if(band.shade){context.fillStyle=`rgba(0,0,0,${band.shade})`;context.fillRect(0,0,width,height);}
      context.restore();
    }
    if(sampleDrawCost(timing.current,started,performance.now()))onSlow();
  },[turn,fromTexture,toTexture,onSlow]);
  if(!turn)return null;
  // Normalized geometry keeps the no-texture path available from its very first frame.
  const {width,height}=size;
  const geometry=pageCurl(width,height,turn),bands=sheetBands(geometry,24),front=clipSheet(sheetRectangle(geometry),geometry,-geometry.arc/2);
  const frontClip=front.length>=3?`polygon(${front.map(point=>`${point.x/width*100}% ${point.y/height*100}%`).join(',')})`:'polygon(0 0,0 0,0 0)';
  return <div ref={hostRef} className={`page-turn-layer page-turn-layer--${turn.renderer}`} aria-hidden="true" inert data-turn-corner={turn.corner} style={{'--page-progress':turn.progress,'--page-direction':turn.direction} as CSSProperties}>
    <div className="page-turn-next">{incoming}</div>
    <div className="page-turn-old" style={turn.renderer==='reduced'?{opacity:1-turn.progress}:{clipPath:geometry.flat?undefined:frontClip}}>{outgoing}</div>
    {turn.renderer!=='reduced'?<svg className="page-turn-curl" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><g>{bands.filter(band=>band.shade>0).map((band,i)=><polygon key={i} points={polygon(band.points.map(point=>bendSheetPoint(point,geometry)))} fill={paperColor(band.back,band.shade)} stroke={paperColor(band.back,band.shade)} strokeWidth={.7} vectorEffect="non-scaling-stroke"/>)}</g></svg>:null}
    {turn.renderer==='canvas'?<canvas ref={canvasRef}/>:null}
  </div>;
}
