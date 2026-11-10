import { beginnerRoles } from '@ravens/content';
import { useEffect,useRef,useState } from 'react';
import { roleArt } from '../role-art.js';
import { roleTypeNames } from '../guide-content.js';

const wrap=(index:number)=>(index+beginnerRoles.length)%beginnerRoles.length;
const DURATION=320;
export function HomePortrait(){
  const[index,setIndex]=useState(()=>beginnerRoles.findIndex(role=>role.id==='fortune_teller'));
  const[settling,setSettling]=useState(false);
  const stage=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null),caption=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),frame=useRef<number|undefined>(undefined);
  const pending=useRef<number|null>(null);
  const drag=useRef<{id:number;x:number;y:number;dx:number;width:number;time:number;velocity:number;axis?:'x'|'y'}|undefined>(undefined);
  const role=beginnerRoles[index]!;
  function commit(){const direction=pending.current;if(direction===null)return;pending.current=null;clearTimeout(timer.current);if(track.current){track.current.style.transition='none';track.current.style.transform='translate3d(-100%,0,0)';}setIndex(current=>wrap(current+direction));setSettling(false);}
  function settle(direction:number,width=stage.current?.getBoundingClientRect().width||240){
    if(pending.current!==null)return;
    if(frame.current!==undefined)cancelAnimationFrame(frame.current);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    pending.current=direction;setSettling(true);
    if(caption.current){caption.current.style.animation='none';caption.current.style.transition=reduced?'none':'opacity 140ms ease, transform 220ms ease';caption.current.style.opacity=direction?'0':'1';caption.current.style.transform=direction?'translateY(-5px)':'translateY(0)';}
    if(track.current){track.current.style.transition=reduced?'none':`transform ${DURATION}ms cubic-bezier(.22,.82,.24,1)`;track.current.style.transform=`translate3d(calc(-100% + ${-direction*width}px),0,0)`;}
    if(reduced)commit();else timer.current=setTimeout(commit,DURATION+40);
  }
  function follow(dx:number,width:number){
    const offset=dx/(1+Math.abs(dx)/(width*2));
    const paint=()=>{if(track.current){track.current.style.transition='none';track.current.style.transform=`translate3d(calc(-100% + ${offset}px),0,0)`;}if(caption.current){const progress=Math.min(1,Math.abs(offset)/(width*.35));caption.current.style.animation='none';caption.current.style.transition='none';caption.current.style.opacity=String(1-progress);caption.current.style.transform=`translateY(${-progress*5}px)`;}frame.current=undefined;};
    if(frame.current!==undefined)cancelAnimationFrame(frame.current);
    if(typeof requestAnimationFrame==='function')frame.current=requestAnimationFrame(paint);else paint();
  }
  function cancel(){const d=drag.current;if(!d)return;drag.current=undefined;if(d.axis==='x')settle(0,d.width);}
  useEffect(()=>{const hide=()=>{if(document.hidden)cancel();};window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',hide);return()=>{clearTimeout(timer.current);if(frame.current!==undefined)cancelAnimationFrame(frame.current);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',hide);};},[]);
  return <section className="home-portrait" aria-label="角色立绘" aria-roledescription="轮播">
    <div ref={stage} className="home-portrait__viewport" tabIndex={0} aria-label="左右滑动切换角色" aria-busy={settling} onKeyDown={event=>{if(pending.current!==null)return;if(event.key==='ArrowLeft'){event.preventDefault();settle(-1);}if(event.key==='ArrowRight'){event.preventDefault();settle(1);}}}
      onPointerDown={event=>{if(event.button!==0||event.isPrimary===false||pending.current!==null)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,width:event.currentTarget.getBoundingClientRect().width||240,time:event.timeStamp,velocity:0};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerMove={event=>{const d=drag.current;if(!d||d.id!==event.pointerId)return;const dx=event.clientX-d.x,dy=event.clientY-d.y;if(!d.axis&&Math.hypot(dx,dy)>6)d.axis=Math.abs(dx)>Math.abs(dy)*1.15?'x':'y';d.velocity=(dx-d.dx)/Math.max(1,event.timeStamp-d.time);d.time=event.timeStamp;d.dx=dx;if(d.axis==='x')follow(Math.max(-d.width*.95,Math.min(d.width*.95,dx)),d.width);}}
      onPointerUp={event=>{const d=drag.current;if(!d||d.id!==event.pointerId)return;drag.current=undefined;const dx=event.clientX-d.x,dy=event.clientY-d.y;const horizontal=d.axis!=='y'&&Math.abs(dx)>Math.abs(dy)*1.15;const velocity=event.timeStamp-d.time>80?0:d.velocity;const crossed=Math.abs(dx)>=Math.max(36,d.width*.18)||Math.abs(dx)>12&&Math.abs(velocity)>.45;const direction=horizontal&&crossed?(dx<0?1:-1):0;if(direction||d.axis==='x')settle(direction,d.width);}}
      onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <div ref={track} className="home-portrait__track" onTransitionEnd={event=>{if(event.target===event.currentTarget&&event.propertyName==='transform')commit();}}>
        {[-1,0,1].map(offset=>{const item=beginnerRoles[wrap(index+offset)]!,art=roleArt(item.id);return <div className="home-portrait__slide" key={item.id} aria-hidden={offset!==0}><div className="home-portrait__arch"><img src={art.portraitUrl} srcSet={art.portraitSrcSet} sizes="(max-width:600px) 76vw,420px" alt={`${item.name}原画`} draggable={false} decoding="async" onError={event=>{if(event.currentTarget.getAttribute('src')?.endsWith('/concealed.svg'))return;event.currentTarget.removeAttribute('srcset');event.currentTarget.src='/assets/ravens/portraits-a-v1/concealed.svg';}}/><div className="home-portrait__shade"/></div></div>;})}
      </div>
    </div>
    <div className="home-portrait__caption" aria-live="polite" aria-atomic="true"><div className="home-portrait__caption-body" key={role.id} ref={caption}><span>{roleTypeNames[role.type]}</span><h2>{role.name}</h2><p>{role.summary}</p></div></div>
    <div className="home-portrait__navigation"><button type="button" aria-label="上一位角色" disabled={settling} onClick={()=>settle(-1)}>‹</button><span>{String(index+1).padStart(2,'0')} <i/> {beginnerRoles.length}</span><button type="button" aria-label="下一位角色" disabled={settling} onClick={()=>settle(1)}>›</button></div>
  </section>;
}
