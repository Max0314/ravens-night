import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { playSetupDetent } from './experience-audio.js';

type Drag = { id: number; x: number; y: number; origin: number; locked: boolean; last: number; at: number; speed: number; distance: number; index: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function DetentWheel({ value, min, max, label, onChange, vertical = false, onPreview, disabled=false }: {
  value: number; min: number; max: number; label: string; onChange: (value: number) => void; vertical?: boolean; onPreview?: (value: number | undefined) => void;disabled?:boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const frame = useRef(0);
  const lastSound = useRef(-Infinity);
  const suppressClick = useRef(false);
  const [live, setLive] = useState<number>();
  const [tracking, setTracking] = useState(false);
  const step = vertical ? 38 : 56;
  const shown = live ?? value;
  const sound = () => {
    const now = performance.now();
    if (now - lastSound.current < 39) return;
    lastSound.current = now;
    playSetupDetent();
  };
  const change = (target: number) => {
    if(disabled)return;
    const next = clamp(target, min, max);
    if (next !== value) { sound(); onChange(next); }
  };
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const cancel = useRef(() => {});
  cancel.current = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = undefined;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setLive(undefined);
    setTracking(false);
    preview.current?.(undefined);
    if (ref.current?.hasPointerCapture(current.id)) ref.current.releasePointerCapture(current.id);
  };

  useEffect(() => {
    const stop = () => cancel.current();
    const secondFinger = (event: globalThis.PointerEvent) => {
      if (drag.current && event.pointerType === 'touch' && event.pointerId !== drag.current.id) stop();
    };
    window.addEventListener('pointerdown', secondFinger, true);
    window.addEventListener('orientationchange', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('pointerdown', secondFinger, true);
      window.removeEventListener('orientationchange', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);
  useEffect(()=>{if(disabled)cancel.current();},[disabled]);

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = current.x - event.clientX, dy = current.y - event.clientY;
    const axis = vertical ? dy : dx, other = vertical ? dx : dy;
    if (!current.locked) {
      if (Math.abs(other) > 8 && Math.abs(other) >= Math.abs(axis)) { cancel.current(); return; }
      if (Math.abs(axis) < 8 || Math.abs(axis) < Math.abs(other) * 1.25) return;
      current.locked = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setTracking(true);
    }
    const time = performance.now();
    current.speed = (axis - current.last) / Math.max(1, time - current.at);
    current.at = time;
    current.last = axis;
    current.distance = axis;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (drag.current !== current) return;
      const position = clamp(current.origin + current.distance / step, min, max);
      setLive(position);
      const next = Math.round(position);
      if (next !== current.index) { current.index = next; sound(); preview.current?.(next); }
    });
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const cancelled = !current.locked;
    const motion = !cancelled && performance.now() - current.at < 76 && !matchMedia('(prefers-reduced-motion: reduce)').matches && Math.abs(current.speed) > .65;
    const next = clamp(Math.round(current.origin + current.distance / step) + (motion ? Math.sign(current.speed) : 0), min, max);
    cancel.current();
    if (cancelled) return;
    if (next !== current.index) sound();
    if (next !== value) onChange(next);
  }

  const keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === (vertical ? 'ArrowUp' : 'ArrowRight')) { event.preventDefault(); change(value + 1); }
    if (event.key === (vertical ? 'ArrowDown' : 'ArrowLeft')) { event.preventDefault(); change(value - 1); }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); change(event.key === 'Home' ? min : max); }
  };
  return <div className={`detent-wheel ${vertical ? 'detent-wheel--vertical' : 'detent-wheel--horizontal'}${tracking ? ' is-tracking' : ''}`}>
    {!vertical && <><span className="detent-wheel__gear" aria-hidden="true" style={{ '--wheel-angle': `${(shown - min) * 29}deg` } as CSSProperties}/><span className="detent-wheel__steam" aria-hidden="true"/></>}
    <button type="button" aria-label={`${label}减少`} disabled={disabled||value===min} onClick={() => change(value - 1)}>{vertical ? '−' : '‹'}</button>
    <div ref={ref} className="detent-wheel__numbers" role="spinbutton" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(shown)}
      onKeyDown={keydown} onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        drag.current = {id:event.pointerId,x:event.clientX,y:event.clientY,origin:value,locked:false,last:0,at:performance.now(),speed:0,distance:0,index:value};
      }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => cancel.current()} onLostPointerCapture={event=>{if(event.target===event.currentTarget)cancel.current();}}>
      {Array.from({length:max-min+1},(_,index)=>index+min).map(item=>{
        const offset=(item-shown)*step*(vertical?-1:1);
        return <span key={item} aria-hidden="true" className="detent-wheel__digit" onClick={() => {if (!suppressClick.current) change(item);}}
          style={{transform:`translate(${vertical?0:offset}px, ${vertical?offset:0}px) scale(${1-Math.min(1,Math.abs(shown-item))*.23})`,opacity:1-Math.min(1,Math.abs(shown-item))*.55}}>{String(item).split('').map((digit,index)=><span className="detent-wheel__glyph" key={index} style={{backgroundPosition:`${(Number(digit)%5)*25}% ${Number(digit)<5?0:100}%`}}/>)}</span>;
      })}
    </div>
    <button type="button" aria-label={`${label}增加`} disabled={disabled||value===max} onClick={() => change(value + 1)}>{vertical ? '+' : '›'}</button>
  </div>;
}
