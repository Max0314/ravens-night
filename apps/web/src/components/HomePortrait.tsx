import { beginnerRoles } from '@ravens/content';
import { useRef,useState } from 'react';
import { roleArt } from '../role-art.js';
import { roleTypeNames } from '../guide-content.js';

export function HomePortrait(){
  const[index,setIndex]=useState(()=>beginnerRoles.findIndex(role=>role.id==='fortune_teller'));
  const drag=useRef<{id:number;x:number;y:number}|undefined>(undefined);
  const role=beginnerRoles[index]!,art=roleArt(role.id);
  const move=(direction:number)=>setIndex(current=>(current+direction+beginnerRoles.length)%beginnerRoles.length);
  return <section className="home-portrait" aria-label="角色立绘" aria-roledescription="轮播">
    <div className="home-portrait__arch" tabIndex={0} aria-label="左右滑动切换角色" onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}}
      onPointerDown={event=>{if(event.button!==0||event.isPrimary===false)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture?.(event.pointerId);}}
      onPointerUp={event=>{const start=drag.current;drag.current=undefined;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>=36&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);}}
      onPointerCancel={()=>{drag.current=undefined;}} onLostPointerCapture={()=>{drag.current=undefined;}}>
      <img key={role.id} src={art.portraitUrl} srcSet={art.portraitSrcSet} sizes="(max-width: 600px) 80vw, 420px" alt={`${role.name}原画`} draggable={false} decoding="async" onError={event=>{if(event.currentTarget.getAttribute('src')?.endsWith('/concealed.svg'))return;event.currentTarget.removeAttribute('srcset');event.currentTarget.src='/assets/ravens/portraits-a-v1/concealed.svg';}}/>
      <div className="home-portrait__shade"/>
    </div>
    <div className="home-portrait__caption" aria-live="polite" aria-atomic="true"><span>{roleTypeNames[role.type]}</span><h2>{role.name}</h2><p>{role.summary}</p></div>
    <div className="home-portrait__navigation"><button type="button" aria-label="上一位角色" onClick={()=>move(-1)}>‹</button><span>{String(index+1).padStart(2,'0')} <i/> {beginnerRoles.length}</span><button type="button" aria-label="下一位角色" onClick={()=>move(1)}>›</button></div>
  </section>;
}
