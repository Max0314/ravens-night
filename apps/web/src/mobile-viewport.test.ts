// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {installMobileViewport} from './mobile-viewport.js';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML='';});
test('keyboard uses the visible height and restores the bounded panel without scrolling the document',()=>{
  let frame:FrameRequestCallback|undefined,height=800;const listeners=new Map<string,()=>void>();
  vi.stubGlobal('innerHeight',800);vi.stubGlobal('innerWidth',390);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('visualViewport',{get height(){return height;},offsetTop:0,addEventListener:(name:string,callback:()=>void)=>listeners.set(name,callback),removeEventListener:vi.fn()});
  const panel=document.createElement('div');panel.className='form-panel';panel.scrollTop=32;panel.innerHTML='<input aria-label="昵称">';document.body.append(panel);const input=panel.querySelector('input')!;
  panel.getBoundingClientRect=()=>({top:0,bottom:250} as DOMRect);input.getBoundingClientRect=()=>({top:280,bottom:320} as DOMRect);
  const changed=vi.fn();window.addEventListener('ravens:keyboard',changed);const dispose=installMobileViewport();input.focus();height=400;listeners.get('resize')?.();frame?.(0);
  expect(document.documentElement.dataset.keyboard).toBe('open');expect(document.documentElement.style.getPropertyValue('--viewport-height')).toBe('400px');expect(panel.scrollTop).toBeGreaterThan(32);
  input.blur();height=800;listeners.get('resize')?.();frame?.(0);expect(panel.scrollTop).toBe(32);expect(document.documentElement.dataset.keyboard).toBe('closed');expect(changed).toHaveBeenCalledTimes(2);
  dispose();window.removeEventListener('ravens:keyboard',changed);
});

test('focused rotation uses the new orientation baseline and keyboard closing does not require blur',()=>{
  let frame:FrameRequestCallback|undefined,height=800;const listeners=new Map<string,()=>void>();
  vi.stubGlobal('innerHeight',800);vi.stubGlobal('innerWidth',390);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('visualViewport',{get height(){return height;},offsetTop:0,addEventListener:(name:string,callback:()=>void)=>listeners.set(name,callback),removeEventListener:vi.fn()});
  const input=document.createElement('input');document.body.append(input);const dispose=installMobileViewport();input.focus();height=400;listeners.get('resize')?.();frame?.(0);expect(document.documentElement.dataset.keyboard).toBe('open');
  window.dispatchEvent(new Event('orientationchange'));frame?.(0);expect(document.documentElement.dataset.keyboard).toBe('closed');
  vi.stubGlobal('innerWidth',800);vi.stubGlobal('innerHeight',400);height=200;listeners.get('resize')?.();frame?.(0);expect(document.documentElement.dataset.keyboard).toBe('open');
  height=400;listeners.get('resize')?.();frame?.(0);expect(document.activeElement).toBe(input);expect(document.documentElement.dataset.keyboard).toBe('closed');expect(document.documentElement.style.getPropertyValue('--viewport-height')).toBe('400px');dispose();
});
