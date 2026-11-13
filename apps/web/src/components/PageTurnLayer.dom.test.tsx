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
function renderLayer(turn:PageTurnController<string>,textures=false,live=false){
  vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(640);
  const texture=textures?document.createElement('canvas'):undefined;
  return render(<PageTurnLayer controller={turn} outgoing={live?undefined:<div>old page</div>} incoming={<div>new page</div>} fromTexture={texture} onSlow={vi.fn()}/>);
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


test('the live layer reveals only the lifted area and fades incoming content for reduced motion',()=>{
  const turn=controller('dom');turn.track(0,{x:1,y:0});const view=renderLayer(turn,false,true),incoming=view.container.querySelector<HTMLElement>('.page-turn-next')!;
  expect(view.container.querySelector('.page-turn-old')).toBeNull();expect(incoming.style.clipPath).toBe('polygon(0 0,0 0,0 0)');
  act(()=>turn.track(.3,{x:.7,y:.12}));expect(incoming.style.clipPath).not.toBe('polygon(0 0,0 0,0 0)');expect(view.container.querySelector('svg polygon')).not.toBeNull();
  view.unmount();const reduced=renderLayer(controller('reduced'),false,true);expect(reduced.container.querySelector<HTMLElement>('.page-turn-next')!.style.opacity).toBe('0.3');expect(reduced.container.querySelector('.page-turn-old,svg')).toBeNull();
});

test('the canvas never repaints the flat original page and keeps its backing size while tracking',()=>{
  const context={setTransform:vi.fn(),clearRect:vi.fn(),save:vi.fn(),transform:vi.fn(),beginPath:vi.fn(),lineTo:vi.fn(),moveTo:vi.fn(),closePath:vi.fn(),clip:vi.fn(),fillRect:vi.fn(),drawImage:vi.fn(),restore:vi.fn(),fillStyle:'',globalAlpha:1};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const width=vi.spyOn(HTMLCanvasElement.prototype,'width','set'),height=vi.spyOn(HTMLCanvasElement.prototype,'height','set'),turn=controller('canvas');turn.track(0,{x:1,y:0});
  renderLayer(turn,true,true);expect(context.drawImage).not.toHaveBeenCalled();width.mockClear();height.mockClear();
  act(()=>turn.track(.3,{x:.7,y:.12}));expect(context.drawImage).toHaveBeenCalled();expect(width).not.toHaveBeenCalled();expect(height).not.toHaveBeenCalled();
  context.drawImage.mockClear();act(()=>turn.track(0,{x:1,y:0}));expect(context.drawImage).not.toHaveBeenCalled();
});
