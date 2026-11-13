import {useLayoutEffect,useRef,type CSSProperties} from 'react';
import './styles/role-portrait-frame.css';

export interface RolePortraitFrameProps {
  url?:string|undefined;
  label:string;
  className?:string;
  srcSet?:string|undefined;
  sizes?:string;
  position?:string;
  loading?:'eager'|'lazy';
  frameUrl?:string|undefined;
  frameSrcSet?:string|undefined;
  fallbackUrl?:string;
}

/** Decorative artwork only. Callers supply an already-public or own-role frame. */
export function RolePortraitFrame({url,label,className='',srcSet,sizes,position='50% 20%',loading='eager',frameUrl,frameSrcSet,fallbackUrl}:RolePortraitFrameProps){
  const hostRef=useRef<HTMLSpanElement>(null),canvasRef=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    if(typeof CSS!=='undefined'&&CSS.supports?.('width','1cqw')&&CSS.supports?.('height','1cqh')&&CSS.supports?.('container-type','size'))return;
    const host=hostRef.current,canvas=canvasRef.current;if(!host||!canvas)return;
    const fit=()=>{
      // Layout sizes exclude the carousel's transform scale.
      const width=Math.min(host.clientWidth,host.clientHeight*.75);
      if(width<=0)return;
      canvas.style.width=`${width}px`;canvas.style.height=`${width*4/3}px`;
    };
    fit();
    if(typeof ResizeObserver!=='undefined'){
      const observer=new ResizeObserver(fit);observer.observe(host);return()=>observer.disconnect();
    }
    window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
  },[]);
  return <span ref={hostRef} className={`rn-portrait-frame ${className}`}>
    <span ref={canvasRef} className="rn-portrait-frame__canvas">
      <img className="rn-portrait-frame__image" src={url} srcSet={srcSet} sizes={sizes} alt={label} width={960} height={1280} loading={loading} decoding="async" draggable={false} style={{objectPosition:position} as CSSProperties} onError={fallbackUrl?event=>{const image=event.currentTarget;if(image.getAttribute('src')===fallbackUrl)return;image.removeAttribute('srcset');image.src=fallbackUrl;}:undefined}/>
      {frameUrl?<img className="rn-portrait-frame__ornament" src={frameUrl} srcSet={frameSrcSet} sizes={sizes} alt="" aria-hidden="true" width={960} height={1280} loading={loading} decoding="async" draggable={false}/>:null}
    </span>
  </span>;
}
