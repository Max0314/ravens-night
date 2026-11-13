// @vitest-environment jsdom
import {cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {RolePortraitFrame} from './RolePortraitFrame.js';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const portrait=()=> <RolePortraitFrame label="角色" url="/role.webp" frameUrl="/frame.webp"/>;

test.each([[300,400,300,400],[400,300,225,300],[300,375,281.25,375],[240,600,240,320]])('legacy canvas contains both layers within %sx%s',(width,height,expectedWidth,expectedHeight)=>{
  vi.stubGlobal('CSS',{supports:()=>false});
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(height);
  const view=render(portrait()),canvas=view.container.querySelector<HTMLElement>('.rn-portrait-frame__canvas')!;
  expect(canvas.style.width).toBe(`${expectedWidth}px`);expect(canvas.style.height).toBe(`${expectedHeight}px`);
  expect(canvas.querySelectorAll(':scope > img')).toHaveLength(2);
});

test('legacy ResizeObserver refits unscaled layout sizes and disconnects',()=>{
  vi.stubGlobal('CSS',{supports:()=>false});
  let width=400,height=300,resize=()=>{};
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockImplementation(()=>height);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>{throw new Error('transformed bounds must not size the canvas');});
  const observe=vi.fn(),disconnect=vi.fn();
  vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){resize=callback;}observe=observe;disconnect=disconnect;});
  const view=render(portrait()),canvas=view.container.querySelector<HTMLElement>('.rn-portrait-frame__canvas')!;
  expect(observe).toHaveBeenCalledWith(view.container.firstElementChild);
  width=300;height=400;resize();expect(canvas.style.width).toBe('300px');expect(canvas.style.height).toBe('400px');
  view.unmount();expect(disconnect).toHaveBeenCalledOnce();
});

test('legacy window resize fallback is removed on unmount',()=>{
  vi.stubGlobal('CSS',{supports:()=>false});vi.stubGlobal('ResizeObserver',undefined);
  let width=400;
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(400);
  const view=render(portrait()),canvas=view.container.querySelector<HTMLElement>('.rn-portrait-frame__canvas')!;
  width=240;fireEvent.resize(window);expect(canvas.style.width).toBe('240px');
  view.unmount();width=120;fireEvent.resize(window);expect(canvas.style.width).toBe('240px');
});

test('container-unit browsers do not measure or observe the canvas',()=>{
  vi.stubGlobal('CSS',{supports:()=>true});
  const measure=vi.spyOn(HTMLElement.prototype,'clientWidth','get'),observer=vi.fn();
  vi.stubGlobal('ResizeObserver',observer);
  const view=render(portrait());
  expect(measure).not.toHaveBeenCalled();expect(observer).not.toHaveBeenCalled();
  expect(view.container.querySelector<HTMLElement>('.rn-portrait-frame__canvas')!.style.width).toBe('');
});
