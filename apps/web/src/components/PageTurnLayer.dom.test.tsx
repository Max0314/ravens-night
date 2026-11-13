// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {PageTurnLayer} from './PageTurnLayer.js';
import {PageTurnController} from './page-turn.js';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
function controller(renderer:'dom'|'canvas'|'reduced'){
  const result=new PageTurnController<string>({begin:()=>{},finish:()=>{},sound:()=>{}});
  result.begin('one','two',1,renderer,'top');result.track(.3,{x:.7,y:.12});return result;
}
function renderLayer(turn:PageTurnController<string>,textures=false){
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(640);
  const texture=textures?document.createElement('canvas'):undefined;
  return render(<PageTurnLayer controller={turn} outgoing={<div>old page</div>} incoming={<div>new page</div>} fromTexture={texture} toTexture={texture} onSlow={vi.fn()}/>);
}
test('no-texture paper has a diagonal curl on the first paint and follows Y while X stays fixed',()=>{
  const turn=controller('dom'),view=renderLayer(turn),old=view.container.querySelector<HTMLElement>('.page-turn-old')!;
  expect(view.container.querySelectorAll('svg polygon').length).toBeGreaterThan(1);
  expect(view.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 640');
  const first=old.style.clipPath;expect(first).toContain('polygon(');expect(old.style.transform).toBe('');
  act(()=>turn.track(.3,{x:.7,y:.27}));expect(old.style.clipPath).not.toBe(first);
  act(()=>turn.track(0,{x:1,y:0}));expect(old.style.clipPath).toBe('');expect(view.container.querySelectorAll('svg polygon')).toHaveLength(0);
});
test('canvas context or textures being unavailable leaves the simplified curl visible',()=>{
  const getContext=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null),turn=controller('canvas');
  const view=renderLayer(turn,true);expect(getContext).toHaveBeenCalled();expect(view.container.querySelectorAll('svg polygon').length).toBeGreaterThan(1);
  act(()=>turn.track(.4,{x:.6,y:.18}));expect(view.container.querySelector('.page-turn-old')?.getAttribute('style')).toContain('polygon');
});
test('reduced motion keeps a short fade without a bent sheet or canvas',()=>{
  const view=renderLayer(controller('reduced'));
  expect(view.container.querySelector('svg,canvas')).toBeNull();expect(view.container.querySelector<HTMLElement>('.page-turn-old')?.style.opacity).toBe('0.7');
});
