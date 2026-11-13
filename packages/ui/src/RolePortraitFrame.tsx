import type {CSSProperties} from 'react';
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
  return <span className={`rn-portrait-frame ${className}`}>
    <span className="rn-portrait-frame__canvas">
      <img className="rn-portrait-frame__image" src={url} srcSet={srcSet} sizes={sizes} alt={label} width={960} height={1280} loading={loading} decoding="async" draggable={false} style={{objectPosition:position} as CSSProperties} onError={fallbackUrl?event=>{const image=event.currentTarget;if(image.getAttribute('src')===fallbackUrl)return;image.removeAttribute('srcset');image.src=fallbackUrl;}:undefined}/>
      {frameUrl?<img className="rn-portrait-frame__ornament" src={frameUrl} srcSet={frameSrcSet} sizes={sizes} alt="" aria-hidden="true" width={960} height={1280} loading={loading} decoding="async" draggable={false}/>:null}
    </span>
  </span>;
}
