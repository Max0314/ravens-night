import { beginnerRoles } from '@ravens/content';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { roleArt } from '../role-art.js';
import { roleTypeNames } from '../guide-content.js';

const count = beginnerRoles.length;
const wrap = (value: number) => (value + count) % count;
const relative = (value: number, center: number) => (value - center + count + Math.floor(count / 2)) % count - Math.floor(count / 2);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const duration = 300;
export function HomePortrait() {
  const [index, setIndex] = useState(() => beginnerRoles.findIndex(role => role.id === 'fortune_teller'));
  const [settling, setSettling] = useState(false);
  const stage = useRef<HTMLDivElement>(null), cards = useRef<Array<HTMLDivElement | null>>([]), captions = useRef<Array<HTMLDivElement | null>>([]);
  const center = useRef(index), offset = useRef(0), stride = useRef(180), motion = useRef<number | undefined>(undefined), fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{direction: number} | null>(null);
  const drag = useRef<{id: number; x: number; y: number; dx: number; time: number; velocity: number; axis?: 'x' | 'y'} | undefined>(undefined);

  // Stable cards and captions share one progress value. Snapping never remounts or reorders them.
  function paint(value: number) {
    offset.current = value;
    const rect = stage.current?.getBoundingClientRect();
    const width = Math.max(1, Math.min((rect?.width || 320) * .76, ((rect?.height || 320) - 16) * .75));
    stride.current = width + 12;
    const progress = value / stride.current;
    beginnerRoles.forEach((_, item) => {
      const distance = relative(item, center.current) + progress;
      const proximity = clamp(1 - Math.abs(distance));
      const card = cards.current[item], caption = captions.current[item];
      if (card) {
        card.style.width = `${width}px`;
        card.style.visibility = Math.abs(distance)<2?'visible':'hidden';
        card.style.willChange = Math.abs(distance)<2?'transform':'auto';
        card.style.transform = `translate3d(calc(-50% + ${distance * stride.current}px),-50%,0) scale(${.9 + .1 * proximity})`;
      }
      if (caption) {
        const visibility = clamp((proximity - .42) / .58);
        caption.style.opacity = String(visibility * visibility * (3 - 2 * visibility));
        caption.style.transform = `translate3d(${distance * 18}px,${(1 - proximity) * 5}px,0)`;
        caption.style.pointerEvents = item === center.current ? 'auto' : 'none';
      }
    });
  }
  function stopMotion() {
    if (motion.current !== undefined) cancelAnimationFrame(motion.current);
    clearTimeout(fallback.current);
  }
  function settle(direction: number) {
    if (pending.current) return;
    drag.current = undefined;
    stopMotion();
    const operation = {direction}; pending.current = operation; setSettling(true);
    const from = offset.current, target = -direction * stride.current;
    const finish = () => {
      if (pending.current !== operation) return;
      stopMotion(); pending.current = null;
      center.current = wrap(center.current + direction);
      paint(0); setIndex(center.current); setSettling(false);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const start = performance.now();
    const tick = (now: number) => {
      if (pending.current !== operation) return;
      const progress = clamp((now - start) / duration);
      paint(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress === 1) finish(); else motion.current = requestAnimationFrame(tick);
    };
    motion.current = requestAnimationFrame(tick);
    fallback.current = setTimeout(finish, duration + 60);
  }
  function cancel() { const current = drag.current; drag.current = undefined; if (current?.axis === 'x') settle(0); }
  function reset() { stopMotion(); pending.current = null; drag.current = undefined; setSettling(false); paint(0); }
  useLayoutEffect(() => { paint(0); }, [index]);
  useEffect(() => {
    const hide = () => { if (document.hidden) reset(); };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(reset);
    if (stage.current) observer?.observe(stage.current);
    window.addEventListener('resize', reset); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hide);
    return () => { stopMotion(); observer?.disconnect(); window.removeEventListener('resize', reset); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hide); };
  }, []);
  return <section className="home-portrait" aria-label="角色立绘" aria-roledescription="轮播">
    <div ref={stage} className="home-portrait__viewport" tabIndex={0} aria-label="左右滑动切换角色" aria-busy={settling}
      onKeyDown={event => { if (pending.current) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); settle(event.key === 'ArrowLeft' ? -1 : 1); } }}
      onPointerDown={event => { if (event.button !== 0 || event.isPrimary === false || pending.current) return; drag.current = {id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,time:event.timeStamp,velocity:0}; event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onPointerMove={event => {
        const current = drag.current; if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX-current.x, dy = event.clientY-current.y;
        if (!current.axis && Math.hypot(dx,dy)>6) current.axis = Math.abs(dx)>Math.abs(dy)*1.15?'x':'y';
        current.velocity=(dx-current.dx)/Math.max(1,event.timeStamp-current.time);current.time=event.timeStamp;current.dx=dx;
        if (current.axis==='x') {
          const value=dx/(1+Math.abs(dx)/(stride.current*4));
          stopMotion(); motion.current=requestAnimationFrame(()=>paint(Math.max(-stride.current,Math.min(stride.current,value))));
        }
      }}
      onPointerUp={event => {
        const current=drag.current;if(!current||current.id!==event.pointerId)return;drag.current=undefined;
        const dx=event.clientX-current.x,dy=event.clientY-current.y;
        const velocity=event.timeStamp-current.time>80?0:current.velocity;
        const horizontal=current.axis!=='y'&&Math.abs(dx)>Math.abs(dy)*1.15;
        const crossed=Math.abs(dx)>=Math.max(32,stride.current*.2)||Math.abs(dx)>12&&Math.abs(velocity)>.45;
        const direction=horizontal&&crossed?(dx<0?1:-1):0;
        if(direction||current.axis==='x')settle(direction);
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <div className="home-portrait__track">{beginnerRoles.map((role,item)=>{
        const art=roleArt(role.id),near=Math.abs(relative(item,index))<=2;
        return <div ref={node=>{cards.current[item]=node;}} className="home-portrait__slide" key={role.id} aria-hidden={item!==index}><div className="home-portrait__arch">
          <img src={near?art.portraitUrl:undefined} srcSet={near?art.portraitSrcSet:undefined} sizes="(max-width:600px) 76vw,420px" alt={`${role.name}原画`} draggable={false} decoding="async" onError={event=>{if(event.currentTarget.getAttribute('src')?.endsWith('/concealed.svg'))return;event.currentTarget.removeAttribute('srcset');event.currentTarget.src='/assets/ravens/portraits-a-v1/concealed.svg';}}/><div className="home-portrait__shade"/>
        </div></div>;
      })}</div>
    </div>
    <div className="home-portrait__caption" aria-live="polite" aria-atomic="true">{beginnerRoles.map((role,item)=><div ref={node=>{captions.current[item]=node;}} className="home-portrait__caption-body" key={role.id} aria-hidden={item!==index}><span>{roleTypeNames[role.type]}</span><h2>{role.name}</h2><p>{role.summary}</p></div>)}</div>
    <div className="home-portrait__navigation"><button type="button" aria-label="上一位角色" disabled={settling} onClick={()=>settle(-1)}>‹</button><span>{String(index+1).padStart(2,'0')} <i/> {count}</span><button type="button" aria-label="下一位角色" disabled={settling} onClick={()=>settle(1)}>›</button></div>
  </section>;
}
