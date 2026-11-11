import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import type {RoomView} from '../api.js';
import {insertionSlot,moveSeat,spring,type Slot} from '../seat-sort.js';
interface Drag {id:string;pointer:number|undefined;x:number;y:number;startX:number;startY:number;offsetX:number;offsetY:number;active:boolean;submitted:boolean;settled:boolean;confirmed:boolean;dropAt:number;preview:string[];slots:Slot[];width:number;height:number;float:{x:number;y:number;vx:number;vy:number};positions:Record<string,{x:number;y:number;vx:number;vy:number}>}
export function SeatOrderGrid<T extends {id:string;nickname:string}>({items,total=items.length,enabled,busy,setupId,instanceId,onCommit,onRetry,renderCard,renderEmpty,onInteraction}:{items:T[];total?:number;enabled:boolean;busy:boolean;setupId?:string|undefined;instanceId?:string|undefined;onCommit?:((ids:string[])=>void|RoomView|Promise<void|RoomView>)|undefined;onRetry?:(()=>Promise<RoomView>)|undefined;renderCard:(p:T,index:number)=>ReactNode;renderEmpty?:(index:number)=>ReactNode;onInteraction?:(active:boolean)=>void}){
  const grid=useRef<HTMLDivElement>(null),drag=useRef<Drag|undefined>(undefined),raf=useRef(0),last=useRef(0),suppress=useRef(0),latest=useRef({items,enabled,busy,setupId,instanceId,onCommit,onRetry,onInteraction});latest.current={items,enabled,busy,setupId,instanceId,onCommit,onRetry,onInteraction};
  const[,paint]=useState(0),[announcement,setAnnouncement]=useState(''),[retry,setRetry]=useState(false),[retrying,setRetrying]=useState(false);
  const ids=items.map(p=>p.id),raw=drag.current,d=raw&&raw.preview.length===ids.length&&raw.preview.every(id=>ids.includes(id))?raw:undefined,order=d?.active?d.preview:ids;
  function clear(){const current=drag.current;drag.current=undefined;cancelAnimationFrame(raf.current);raf.current=0;if(current?.pointer!==undefined&&grid.current?.hasPointerCapture?.(current.pointer))grid.current.releasePointerCapture(current.pointer);latest.current.onInteraction?.(false);setRetry(false);paint(n=>n+1);}
  function announce(value:string){setAnnouncement(value);}
  const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(time:number){
    const a=drag.current,node=grid.current;if(!a||!node)return;
    const dt=Math.min(32,time-(last.current||time-16))/1000;last.current=time;
    const scroller=node.closest<HTMLElement>('.lobby-content,.room-page__content')??node.parentElement;
    if(a.active&&!a.submitted&&a.pointer!==undefined&&scroller){const bounds=scroller.getBoundingClientRect(),v=a.y<bounds.top+40?-Math.min(1,(bounds.top+40-a.y)/40)*360:a.y>bounds.bottom-40?Math.min(1,(a.y-bounds.bottom+40)/40)*360:0;scroller.scrollTop+=v*dt;}
    const bounds=node.getBoundingClientRect();
    if(a.active&&!a.submitted&&a.pointer!==undefined){const center={x:a.x-a.offsetX+a.width/2-bounds.left,y:a.y-a.offsetY+a.height/2-bounds.top},index=insertionSlot(a.slots,center,a.preview.indexOf(a.id));if(index!==a.preview.indexOf(a.id)){a.preview=moveSeat(a.preview,a.id,index);announce(`移到第 ${index+1} 位`);}}
    for(const [i,id]of a.preview.entries()){const pos=a.positions[id]!,slot=a.slots[i]!;if(reduced()){pos.x=slot.x;pos.y=slot.y;pos.vx=pos.vy=0;}else{const x=spring(pos.x,pos.vx,slot.x,dt),y=spring(pos.y,pos.vy,slot.y,dt);pos.x=x.position;pos.vx=x.velocity;pos.y=y.position;pos.vy=y.velocity;}}
    if(a.submitted&&!a.settled){const target=a.slots[a.preview.indexOf(a.id)]!,x=spring(a.float.x,a.float.vx,bounds.left+target.x,dt),y=spring(a.float.y,a.float.vy,bounds.top+target.y,dt);a.float={x:x.position,y:y.position,vx:x.velocity,vy:y.velocity};if(reduced()||time-a.dropAt>=240){a.settled=true;a.float.x=bounds.left+target.x;a.float.y=bounds.top+target.y;}}
    if(a.submitted&&a.settled&&a.confirmed&&latest.current.items.map(p=>p.id).join()===a.preview.join()){clear();return;}
    paint(n=>n+1);if(a.submitted&&a.settled&&Object.values(a.positions).every(p=>p.vx===0&&p.vy===0)){raf.current=0;return;}raf.current=requestAnimationFrame(frame);
  }
  function start(id:string,x:number,y:number,pointer?:number){
    if(!latest.current.enabled||latest.current.busy||drag.current)return;
    const node=grid.current!,nodes=Array.from(node.querySelectorAll<HTMLElement>(':scope > [data-player-id]')),bounds=node.getBoundingClientRect(),rect=nodes.find(n=>n.dataset.playerId===id)!.getBoundingClientRect();
    const slots=nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop,width:n.offsetWidth||n.getBoundingClientRect().width,height:n.offsetHeight||n.getBoundingClientRect().height}));
    // offsetLeft is relative to the positioned grid, never the animated rect.
    drag.current={id,pointer,x,y,startX:x,startY:y,offsetX:x-rect.left,offsetY:y-rect.top,active:pointer===undefined,submitted:false,settled:false,confirmed:false,dropAt:0,preview:[...ids],slots,width:rect.width,height:rect.height,float:{x:rect.left,y:rect.top,vx:0,vy:0},positions:Object.fromEntries(ids.map((id,i)=>[id,{x:slots[i]!.x,y:slots[i]!.y,vx:0,vy:0}]))};
    if(pointer!==undefined)node.setPointerCapture?.(pointer);else{latest.current.onInteraction?.(true);announce(`已抓取${items.find(p=>p.id===id)!.nickname}，第 ${ids.indexOf(id)+1} 位`);}
    last.current=0;raf.current=requestAnimationFrame(frame);paint(n=>n+1);
  }
  function move(e:PointerEvent){const a=drag.current;if(!a||a.pointer!==e.pointerId||a.submitted)return;a.x=e.clientX;a.y=e.clientY;if(!a.active&&Math.hypot(a.x-a.startX,a.y-a.startY)>=8){a.active=true;latest.current.onInteraction?.(true);announce(`已抓取${items.find(p=>p.id===a.id)!.nickname}`);}if(a.active){a.float.x=a.x-a.offsetX;a.float.y=a.y-a.offsetY;e.preventDefault();}}
  async function drop(){
    const a=drag.current;if(!a||a.submitted)return;if(!a.active){clear();return;}
    if(a.pointer!==undefined){const bounds=grid.current!.getBoundingClientRect(),index=insertionSlot(a.slots,{x:a.x-a.offsetX+a.width/2-bounds.left,y:a.y-a.offsetY+a.height/2-bounds.top},a.preview.indexOf(a.id));a.preview=moveSeat(a.preview,a.id,index);}
    suppress.current=performance.now()+300;
    a.submitted=true;a.dropAt=performance.now();
    if(a.pointer!==undefined&&grid.current?.hasPointerCapture?.(a.pointer))grid.current.releasePointerCapture(a.pointer);
    if(a.preview.join()===ids.join()){a.confirmed=true;return;}
    try{const result=await latest.current.onCommit?.([...a.preview]);if(drag.current!==a)return;const own=result?.participants.filter(p=>p.mode==='PLAYER').sort((x,y)=>(x.seat??0)-(y.seat??0)).map(p=>p.id);if(own&&own.join()!==a.preview.join()){clear();return;}a.confirmed=true;announce('座序已保存');}catch(error){if(drag.current===a&&!a.confirmed){announce('座序未保存，请重试');if(!(error instanceof Error&&'status'in error&&Number(error.status)<500)&&latest.current.onRetry)setRetry(true);else clear();}}
  }
  function keyboard(e:KeyboardEvent,id:string){
    const a=drag.current;if(e.key==='Escape'){if(a&&!a.submitted){e.preventDefault();announce('已取消');clear();}return;}
    if(e.key==='Tab'){if(a&&!a.submitted)clear();return;}
    if([' ','Enter'].includes(e.key)){e.preventDefault();if(a)void drop();else{const rect=grid.current!.querySelector<HTMLElement>(`[data-player-id="${id}"]`)!.getBoundingClientRect();start(id,rect.left,rect.top);}return;}
    if(!a||a.pointer!==undefined||a.submitted||!e.key.startsWith('Arrow'))return;e.preventDefault();const columns=a.slots.filter(s=>Math.abs(s.y-a.slots[0]!.y)<2).length,index=a.preview.indexOf(id),offset=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-columns:columns,next=index+offset;if(next>=0&&next<ids.length){a.preview=moveSeat(a.preview,id,next);announce(`移到第 ${next+1} 位`);}
  }
  useLayoutEffect(()=>{const a=drag.current;if(!a)return;const current=items.map(p=>p.id);if(a.submitted&&current.join()===a.preview.join()&&enabled){a.confirmed=true;if(a.settled)clear();return;}clear();},[setupId,instanceId,ids.join(),enabled]);
  useLayoutEffect(()=>{if(d?.active&&!d.submitted)grid.current?.querySelector<HTMLButtonElement>(`[data-player-id="${d.id}"]>.seat-drag-handle`)?.focus({preventScroll:true});},[order.join(),d?.id]);
  useEffect(()=>{if(busy&&drag.current&&!drag.current.submitted)clear();},[busy]);
  useEffect(()=>{const cancel=()=>{if(drag.current&&!drag.current.submitted){announce('已取消');clear();}},hidden=()=>{if(document.hidden)cancel();},key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape')cancel();};window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',key);const observer=typeof ResizeObserver==='function'?new ResizeObserver(cancel):undefined;if(grid.current)observer?.observe(grid.current);return()=>{cancelAnimationFrame(raf.current);observer?.disconnect();window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('keydown',key);};},[]);
  const source=items.find(p=>p.id===d?.id);
  return <><div ref={grid} className="lobby-seat-grid seat-sort-grid" aria-label="玩家座位" onPointerMove={move} onPointerUp={e=>{if(drag.current?.pointer===e.pointerId){move(e);void drop();}}} onPointerCancel={()=>{if(!drag.current?.submitted)clear();}} onLostPointerCapture={()=>{if(!drag.current?.submitted)clear();}} onClickCapture={e=>{if(performance.now()<suppress.current){e.stopPropagation();e.preventDefault();}}}>{order.map((id,i)=>{const item=items.find(p=>p.id===id)!;const position=d?.active?d.positions[id]:undefined,slot=d?.slots[i];return <article key={id} data-player-id={id} className={d?.active&&d.id===id&&!d.settled?'seat-sort-placeholder':''} style={position&&slot&&id!==d?.id?{transform:`translate(${position.x-slot.x}px,${position.y-slot.y}px)`}:undefined}>{renderCard(item,i)}{enabled&&onCommit?<button className="seat-drag-handle" type="button" aria-label={`拖动${item.nickname}`} aria-pressed={d?.active&&d.id===id} disabled={busy&&!d?.submitted} onPointerDown={e=>{if(e.button!==0||e.isPrimary===false)return;start(id,e.clientX,e.clientY,e.pointerId);}} onKeyDown={e=>keyboard(e,id)}>⠿</button>:null}</article>;})}{Array.from({length:Math.max(0,total-items.length)},(_,i)=><article className="seat-empty" key={`empty-${i}`}>{renderEmpty?.(items.length+i)}</article>)}</div>{retry?<button type="button" disabled={retrying} onClick={async()=>{const a=drag.current;if(!a)return;setRetrying(true);try{await latest.current.onRetry?.();if(drag.current===a){a.confirmed=true;setRetry(false);if(a.settled&&latest.current.items.map(p=>p.id).join()===a.preview.join())clear();}}catch{announce('结果待确认，请继续重试');}finally{setRetrying(false);}}}>重试排序</button>:null}<span className="seat-sort-announcement" role="status" aria-live="polite">{announcement}</span>{d?.active&&!d.settled&&source?createPortal(<div className="seat-sort-overlay" aria-hidden="true" inert style={{left:d.float.x,top:d.float.y,width:d.width,height:d.height}}>{renderCard(source,d.preview.indexOf(source.id))}</div>,document.body):null}</>;
}
