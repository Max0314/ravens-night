import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {roundTableLayout} from '@ravens/ui';
import {createPortal} from 'react-dom';
import {RoomSheet} from './RoomPage.js';

type Layout = ReturnType<typeof roundTableLayout>;
/** Measure the available slot, then put a square inside it instead of stretching either axis. */
export function RoundTable({count, className, children, expandedView=false, stable=false}: {stable?:boolean;expandedView?:boolean;count:number; className:string; children:(layout:Layout)=>ReactNode}) {
  const slot = useRef<HTMLDivElement>(null), [diameter, setDiameter] = useState(320), [expanded, setExpanded] = useState(false);
  useEffect(()=>{const close=()=>setExpanded(false);window.addEventListener("ravens:return-town",close);return()=>window.removeEventListener("ravens:return-town",close);},[]);
  useLayoutEffect(() => {
    const node = slot.current;
    if (!node) return;
    const measure = () => {const rect = node.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const viewport=window.visualViewport;const height=viewport?.height??window.innerHeight,width=viewport?.width??window.innerWidth;const page=node.closest('.game-page--town'),padding=page?getComputedStyle(page):undefined,insets=(parseFloat(padding?.paddingTop??'0')||0)+(parseFloat(padding?.paddingBottom??'0')||0);const budget=stable?Math.max(120,height-(width>height?132:300)-insets):rect.height;setDiameter(Math.floor(Math.min(rect.width,budget,460)));};
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(node); window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    const disclosures:HTMLElement[] = [];
    for (let parent=node.parentElement; parent; parent=parent.parentElement) if(parent.tagName==='DETAILS'){parent.addEventListener('toggle',measure);disclosures.push(parent);}
    return () => {observer?.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);disclosures.forEach(parent=>parent.removeEventListener('toggle',measure));};
  }, [stable]);
  const layout=roundTableLayout(count,diameter), compact=!expandedView&&diameter<layout.minimum;
  const draw=(value:Layout)=><div className={`round-table ${className}`} style={{width:value.diameter,height:value.diameter,'--round-seat':`${value.seatSize}px`,'--round-portrait':`${value.portrait}px`} as CSSProperties}>{children(value)}</div>;
  return <div ref={slot} className="round-table-slot" data-diameter={diameter}>
    {compact?<><div className="round-table-preview" aria-hidden="true" inert style={{width:diameter,height:diameter}}><div style={{transform:`scale(${diameter/layout.minimum})`,transformOrigin:'top left'}}>{draw(roundTableLayout(count,layout.minimum))}</div></div><button type="button" className="round-table-expand" onClick={()=>setExpanded(true)} aria-label="展开圆桌"><span>展开圆桌</span></button></>:draw(layout)}
    {expanded?createPortal(<div className="round-table-expanded game-content--town remote-town-board"><RoomSheet title="圆桌" onClose={()=>setExpanded(false)}><RoundTable expandedView count={count} className={className}>{children}</RoundTable></RoomSheet></div>,document.body):null}
  </div>;
}
