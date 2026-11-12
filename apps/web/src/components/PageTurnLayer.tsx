import {useEffect,useRef,useSyncExternalStore,type ReactNode,type CSSProperties} from 'react';
import {curlPoint,PageTurnController} from './page-turn.js';

export function sampleDrawCost(budget:{count:number;total:number},started:number,ended:number){
  budget.total+=Math.max(0,ended-started);budget.count++;
  return budget.count===20&&budget.total/budget.count>25;
}

export function PageTurnLayer<T>({controller,outgoing,incoming,fromTexture,toTexture,onSlow}:{controller:PageTurnController<T>;outgoing:ReactNode;incoming:ReactNode;fromTexture?:HTMLCanvasElement|undefined;toTexture?:HTMLCanvasElement|undefined;onSlow:()=>void}){
  const turn=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),canvasRef=useRef<HTMLCanvasElement>(null),timing=useRef({count:0,total:0});
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!turn||turn.renderer!=='canvas'||!fromTexture||!toTexture)return;
    const context=canvas.getContext('2d');if(!context)return;
    const started=performance.now();
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    const dpr=Math.min(1.5,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.scale(dpr,dpr);
    context.clearRect(0,0,width,height);context.drawImage(toTexture,0,0,width,height);
    const reverse=turn.direction<0;
    context.save();if(reverse){context.translate(width,0);context.scale(-1,1);}
    const strips=24,stripWidth=width/strips;
    for(let i=0;i<strips;i++){
      const u=i*stripWidth,a=curlPoint(u,width,turn.progress),b=curlPoint(u+stripWidth,width,turn.progress),perspective=2*width/(2*width+(a.z+b.z)/2),left=Math.min(a.x,b.x),span=Math.abs(b.x-a.x)+1;
      if(span<.1||left>width||left+span<0)continue;
      const top=(height-height*perspective)/2;
      if(a.back){context.fillStyle='#b7a078';context.fillRect(left,top,span,height*perspective);context.globalAlpha=.08;context.drawImage(fromTexture,i*fromTexture.width/strips,0,fromTexture.width/strips,fromTexture.height,left,top,span,height*perspective);context.globalAlpha=1;}
      else{
        context.save();if(reverse){context.translate(left+span,0);context.scale(-1,1);context.drawImage(fromTexture,(strips-i-1)*fromTexture.width/strips,0,fromTexture.width/strips,fromTexture.height,0,top,span,height*perspective);}
        else context.drawImage(fromTexture,i*fromTexture.width/strips,0,fromTexture.width/strips,fromTexture.height,left,top,span,height*perspective);
        context.restore();
      }
      if(a.z>0){context.fillStyle=`rgba(0,0,0,${Math.min(.5,a.z/(width*.12))})`;context.fillRect(left,top,span,height*perspective);}
    }
    const fold=width-(width+width*.16)*turn.progress;const shadow=context.createLinearGradient(fold-12,0,fold+width*.16,0);shadow.addColorStop(0,'#0000');shadow.addColorStop(.35,'#0006');shadow.addColorStop(.5,'#fff2');shadow.addColorStop(1,'#0000');context.fillStyle=shadow;context.fillRect(fold-12,0,width*.16+12,height);context.restore();
    if(sampleDrawCost(timing.current,started,performance.now()))onSlow();
  },[turn,fromTexture,toTexture,onSlow]);
  if(!turn)return null;
  return <div className={`page-turn-layer page-turn-layer--${turn.renderer}`} aria-hidden="true" inert style={{'--page-progress':turn.progress,'--page-direction':turn.direction} as CSSProperties}>
    {turn.renderer==='canvas'?<canvas ref={canvasRef}/>:<><div className="page-turn-next">{incoming}</div><div className="page-turn-old" style={{transform:turn.renderer==='reduced'?undefined:`perspective(1200px) rotateY(${-turn.direction*turn.progress*110}deg)`,transformOrigin:turn.direction>0?'left center':'right center',opacity:turn.renderer==='reduced'?1-turn.progress:1}}>{outgoing}<span className="page-turn-paper-back"/></div></>}
  </div>;
}
