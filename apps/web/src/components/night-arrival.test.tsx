// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,test} from 'vitest';
import {AtmosphericSky} from './AtmosphericSky.js';
afterEach(cleanup);
test('night darkens and lights windows in sequence without a rising celestial disc; seeking is deterministic',()=>{
 const ui=render(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={0} durationMs={6200}/>),windows=()=>[...ui.container.querySelectorAll('.night-arrival__window')].map(node=>Number(node.getAttribute('data-light')));
 expect(ui.container.querySelector('.atmospheric-sky__disc,image')).toBeNull();expect([...ui.container.querySelectorAll('.night-arrival__window rect')].every(node=>Number(node.getAttribute('width'))>0&&Number(node.getAttribute('height'))>0)).toBe(true);expect(windows().every(value=>value===0)).toBe(true);expect(Number(ui.container.querySelector('.night-arrival__window-dark')?.getAttribute('opacity'))).toBeGreaterThan(.8);const start=ui.container.innerHTML;
 ui.rerender(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={2000} durationMs={6200}/>);const middle=windows();expect(middle[0]).toBe(1);expect(middle.at(-1)).toBe(0);expect(middle.every((value,index)=>index===0||value<=middle[index-1]!)).toBe(true);
 const dim=Number(ui.container.querySelector('.night-arrival__dusk')?.getAttribute('opacity'));expect(dim).toBeGreaterThan(0);expect(dim).toBeLessThan(1);
 ui.rerender(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={6200} durationMs={6200}/>);expect(windows().every(value=>value===1)).toBe(true);expect(Number(ui.container.querySelector('.night-arrival__window-dark')?.getAttribute('opacity'))).toBe(0);expect(Number(ui.container.querySelector('.night-arrival__dusk')?.getAttribute('opacity'))).toBe(1);expect(Number(ui.container.querySelector<HTMLElement>('.night-arrival__mist')?.style.opacity)).toBeLessThanOrEqual(.2);
 ui.rerender(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={0} durationMs={6200}/>);expect(ui.container.innerHTML).toBe(start);
});
test('reduced night uses one still pose across elapsed times and keeps every window lit',()=>{
 const ui=render(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={0} durationMs={6200} reduced/>),start=ui.container.innerHTML;
 expect([...ui.container.querySelectorAll('.night-arrival__window')].every(node=>node.getAttribute('data-light')==='1')).toBe(true);
 ui.rerender(<AtmosphericSky phase="NIGHT_FALLS" elapsedMs={6200} durationMs={6200} reduced/>);expect(ui.container.innerHTML).toBe(start);expect(ui.container.querySelector('.atmospheric-sky__disc,image')).toBeNull();
});
