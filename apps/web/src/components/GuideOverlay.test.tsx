// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {PageTextureCache} from './page-textures.js';
import {enableEffectsAudio,effectsAudioEnabled} from './experience-audio.js';
import { GuideOverlay } from "./GuideOverlay.js";
import { tutorialSteps } from "../guide-content.js";
import {StrictMode} from 'react';
const audio=vi.hoisted(()=>({prepare:vi.fn(async()=>true),turn:vi.fn(),silence:vi.fn(),dispose:vi.fn()}));
vi.mock("./book-audio.js",()=>({createBookAudio:()=>audio}));
beforeEach(async()=>{await enableEffectsAudio(true);});

afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();vi.unstubAllGlobals();localStorage.clear();window.history.replaceState({},"","/");});

function installPointer(){
  class Pointer extends MouseEvent {
    pointerId:number;isPrimary:boolean;
    constructor(type:string,init:MouseEventInit&{pointerId?:number;isPrimary?:boolean}={}){super(type,init);this.pointerId=init.pointerId??1;this.isPrimary=init.isPrimary??true;}
  }
  vi.stubGlobal('PointerEvent',Pointer);
}
function swipePage(element:Element,direction:'next'|'back',cancel=false){
  const x=direction==='next'?50:250;
  fireEvent.pointerDown(element,{pointerId:1,button:0,clientX:150,clientY:100});
  fireEvent.pointerMove(element,{pointerId:1,clientX:x,clientY:105});
  if(cancel)fireEvent.pointerCancel(element,{pointerId:1,clientX:x,clientY:105});
  else fireEvent.pointerUp(element,{pointerId:1,clientX:x,clientY:105});
}

test("live room refreshes preserve help focus and Escape uses the current close handler", () => {
  const firstClose = vi.fn();
  const nextClose = vi.fn();
  const view = render(<GuideOverlay mode="roles" onClose={firstClose} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: /镇长/ })).toHaveFocus();
  const rolesTab = screen.getByRole("button", { name: "角色表" });
  rolesTab.focus();
  view.rerender(<GuideOverlay mode="roles" onClose={nextClose} />);
  expect(rolesTab).toHaveFocus();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(nextClose).toHaveBeenCalledOnce();
  expect(firstClose).not.toHaveBeenCalled();
});


test("role category tabs expose one group, support keyboard switching and constrain detail navigation", () => {
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("button",{name:"查看洗衣妇详情"})).toBeVisible();
  expect(screen.queryByRole("button",{name:"查看管家详情"})).not.toBeInTheDocument();
  const town=screen.getByRole("tab",{name:/镇民/});
  fireEvent.keyDown(town,{key:"ArrowRight"});
  expect(screen.getByRole("tab",{name:/外来者/})).toHaveFocus();
  expect(screen.getByRole("button",{name:"查看管家详情"})).toBeVisible();
  expect(screen.queryByRole("button",{name:"查看洗衣妇详情"})).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("tab",{name:/外来者/}),{key:"End"});
  fireEvent.click(screen.getByRole("button",{name:"查看小恶魔详情"}));
  expect(screen.getByRole("button",{name:"上一位"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"下一位"})).toBeDisabled();
});


test('page turns follow the global preference even with a stale book mute and retain top-focused role artwork',()=>{
  localStorage.setItem('ravens_book_audio','off');render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));fireEvent.click(screen.getByRole('button',{name:'角色表'}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('tab',{name:/镇民/}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));expect(screen.getByRole('img',{name:'洗衣妇角色立绘'})).toHaveStyle({objectPosition:'50% 0%'});
});

test('tutorial swipes share button turns, stop at the first page and enter roles after the last page',()=>{
  installPointer();render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);
  const book=document.querySelector('.guide-book')!;
  swipePage(book,'back');expect(audio.turn).not.toHaveBeenCalled();
  swipePage(book,'next');expect(screen.getByText(`规则 2 / ${tutorialSteps.length}`)).toBeVisible();expect(book).toHaveAttribute('data-page-key','tutorial:1');expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'上一条'}));expect(book).toHaveAttribute('data-page-key','tutorial:0');
  fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));
  for(let i=0;i<tutorialSteps.length;i++)swipePage(book,'next');
  expect(screen.getByRole('tab',{name:/镇民/})).toHaveAttribute('aria-selected','true');expect(audio.turn).toHaveBeenCalledTimes(2);
});

test('vertical scrolling, cancelled gestures and a changed page cannot trigger a horizontal turn',()=>{
  installPointer();render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);
  const book=document.querySelector('.guide-book')!;
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:100,clientY:100});
  fireEvent.pointerMove(book,{pointerId:1,clientX:105,clientY:150});
  fireEvent.pointerMove(book,{pointerId:1,clientX:250,clientY:155});
  fireEvent.pointerUp(book,{pointerId:1,clientX:250,clientY:155});
  swipePage(book,'next',true);
  expect(audio.turn).not.toHaveBeenCalled();expect(screen.getByRole('tab',{name:/镇民/})).toHaveAttribute('aria-selected','true');
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:150,clientY:100});
  fireEvent.pointerMove(book,{pointerId:1,clientX:50,clientY:105});
  fireEvent.click(screen.getByRole('button',{name:'新手教程'}));
  fireEvent.pointerUp(book,{pointerId:1,clientX:50,clientY:105});
  expect(screen.getByText(`规则 1 / ${tutorialSteps.length}`)).toBeVisible();expect(audio.turn).toHaveBeenCalledOnce();
});

test('category swipes are bounded and suppress the card click left behind by a drag',()=>{
  installPointer();render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);
  const book=document.querySelector('.guide-book')!;
  const washerwoman=screen.getByRole('button',{name:'查看洗衣妇详情'});
  fireEvent.pointerDown(washerwoman,{pointerId:1,button:0,clientX:150,clientY:100});
  fireEvent.pointerMove(washerwoman,{pointerId:1,clientX:50,clientY:105});
  // A touched card loses its implicit capture when the book takes over the drag.
  fireEvent(washerwoman,new Event('lostpointercapture',{bubbles:true}));
  fireEvent.pointerUp(book,{pointerId:1,clientX:50,clientY:105});
  expect(screen.getByRole('tab',{name:/外来者/})).toHaveAttribute('aria-selected','true');expect(audio.turn).toHaveBeenCalledOnce();
  swipePage(book,'next');swipePage(book,'next');
  const imp=screen.getByRole('button',{name:'查看小恶魔详情'});
  swipePage(imp,'next');fireEvent.click(imp,{detail:1});
  expect(screen.queryByRole('article',{name:'小恶魔详情'})).not.toBeInTheDocument();expect(audio.turn).toHaveBeenCalledTimes(3);
  swipePage(imp,'next');
  fireEvent.pointerDown(imp,{pointerId:2,button:0,clientX:100,clientY:100});fireEvent.pointerUp(imp,{pointerId:2,clientX:100,clientY:100});
  fireEvent.click(imp,{detail:1});expect(screen.getByRole('article',{name:'小恶魔详情'})).toBeVisible();
});

test('the fixed detail return restores category, list position and focus without closing the handbook',()=>{
  vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));
  const close=vi.fn();render(<GuideOverlay mode="roles" onClose={close}/>);
  fireEvent.click(screen.getByRole('tab',{name:/外来者/}));
  const list=document.querySelector<HTMLElement>('.role-compendium')!;
  list.scrollTop=210;
  fireEvent.click(screen.getByRole('button',{name:'查看管家详情'}));
  list.scrollTop=600;
  const back=screen.getByRole('button',{name:'返回外来者角色表'});
  expect(back.closest('.guide-book')).toBeNull();expect(screen.getByRole('button',{name:'关闭游戏帮助'})).toHaveTextContent('关闭手册');
  fireEvent.click(back);act(()=>{vi.advanceTimersByTime(20);});
  expect(screen.getByRole('tab',{name:/外来者/})).toHaveAttribute('aria-selected','true');expect(list.scrollTop).toBe(210);expect(screen.getByRole('button',{name:'查看管家详情'})).toHaveFocus();expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'关闭游戏帮助'}));expect(close).toHaveBeenCalledOnce();
});

test('blank space first returns from a role detail and leaves the close control independent',()=>{
  const close=vi.fn();render(<GuideOverlay mode="roles" onClose={close}/>);
  fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));
  fireEvent.click(document.querySelector('.role-compendium')!);
  expect(screen.queryByRole('article',{name:'洗衣妇详情'})).not.toBeInTheDocument();expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));
  fireEvent.mouseDown(document.querySelector('.guide-backdrop')!);
  expect(screen.queryByRole('article',{name:'洗衣妇详情'})).not.toBeInTheDocument();expect(close).not.toHaveBeenCalled();
});

test('a real-width drag reverses to the original page and a completed drag commits once under StrictMode',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<StrictMode><GuideOverlay mode="tutorial" onClose={vi.fn()}/></StrictMode>);const book=document.querySelector<HTMLElement>('.guide-book')!;
  Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:180,clientY:100});fireEvent.pointerMove(book,{pointerId:1,clientX:80,clientY:100});
  expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(document.querySelector('.page-turn-layer')).not.toBeNull();
  fireEvent.pointerMove(book,{pointerId:1,clientX:210,clientY:100});fireEvent.pointerUp(book,{pointerId:1,clientX:210,clientY:100});act(()=>vi.advanceTimersByTime(200));
  expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();
  fireEvent.pointerDown(book,{pointerId:2,button:0,clientX:180,clientY:100});fireEvent.pointerMove(book,{pointerId:2,clientX:20,clientY:100});fireEvent.pointerUp(book,{pointerId:2,clientX:20,clientY:100});
  act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:1');expect(audio.turn).toHaveBeenCalledOnce();expect(document.querySelector('.page-turn-layer')).toBeNull();
});

test('closing a handbook during a turn cancels it rather than allowing a late page commit',()=>{
  vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  const close=vi.fn();render(<GuideOverlay mode="tutorial" onClose={close}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperty(book,'clientWidth',{value:360});
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));fireEvent.click(screen.getByRole('button',{name:'关闭游戏帮助'}));act(()=>vi.advanceTimersByTime(500));
  expect(close).toHaveBeenCalledOnce();expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();
});

test('a full private scene can release book textures without closing or losing its reading position',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!,list=document.querySelector<HTMLElement>('.guide-page-surface .role-compendium')!;list.scrollTop=170;Object.defineProperty(book,'clientWidth',{value:360});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:180,clientY:100});fireEvent.pointerMove(book,{pointerId:1,clientX:20,clientY:100});
  fireEvent(window,new Event('ravens:release-book-textures'));act(()=>vi.advanceTimersByTime(400));
  expect(screen.getByRole('dialog')).toBeVisible();expect(book).toHaveAttribute('data-page-key','roles:TOWNSFOLK:grid');expect(list.scrollTop).toBe(170);expect(audio.turn).not.toHaveBeenCalled();
  fireEvent(window,new Event('ravens:resume-book-textures'));swipePage(book,'next');act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','roles:OUTSIDER:grid');
});

test('hiding a page cancels its unfinished turn and paper sound',()=>{
  vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperty(book,'clientWidth',{value:360});fireEvent.click(screen.getByRole('button',{name:'下一条'}));
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);fireEvent(document,new Event('visibilitychange'));act(()=>vi.advanceTimersByTime(500));
  expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();expect(audio.silence).toHaveBeenCalled();hidden.mockRestore();
});

test('tutorial, grid, detail and own-role keep one fixed toolbar outside the shared book viewport',()=>{
  const ownRole={roleId:'soldier',name:'士兵',alignment:'GOOD' as const,type:'TOWNSFOLK',summary:'你免受恶魔攻击',beginnerTip:'游玩建议'};
  const ui=render(<GuideOverlay mode="tutorial" ownRole={ownRole} onClose={vi.fn()}/>);
  const book=ui.container.querySelector('.guide-book')!,slot=ui.container.querySelector('.guide-page-toolbar')!;
  const sameViewport=(kind:string)=>{expect(ui.container.querySelectorAll('.guide-page-toolbar')).toHaveLength(1);expect(ui.container.querySelector('.guide-page-toolbar')).toBe(slot);expect(slot).toHaveAttribute('data-guide-toolbar',kind);expect(slot.nextElementSibling).toBe(book);expect(slot.closest('.guide-book')).toBeNull();};
  sameViewport('tutorial');expect(screen.getByText(`规则 1 / ${tutorialSteps.length}`)).toBeVisible();
  for(let i=0;i<tutorialSteps.length;i++)fireEvent.click(screen.getByRole('button',{name:i===tutorialSteps.length-1?'继续看角色表':'下一条'}));
  sameViewport('grid');expect(slot).toContainElement(screen.getByRole('tablist',{name:'角色分类'}));
  fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));sameViewport('detail');expect(slot).toContainElement(screen.getByRole('button',{name:'返回镇民角色表'}));
  fireEvent.click(screen.getByRole('button',{name:'返回镇民角色表'}));sameViewport('grid');
  fireEvent.click(screen.getByRole('button',{name:'我的角色'}));sameViewport('mine');expect(screen.getByRole('heading',{name:'士兵'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'新手教程'}));sameViewport('tutorial');
});

test('a short fast drag held still expires its flick velocity before release',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperty(book,'clientWidth',{value:360});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:180,clientY:100});fireEvent.pointerMove(book,{pointerId:1,clientX:120,clientY:100});act(()=>vi.advanceTimersByTime(1000));
  fireEvent.pointerUp(book,{pointerId:1,clientX:120,clientY:100});act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();
  fireEvent.pointerDown(book,{pointerId:2,button:0,clientX:180,clientY:100});fireEvent.pointerMove(book,{pointerId:2,clientX:120,clientY:100});fireEvent.pointerUp(book,{pointerId:2,clientX:120,clientY:100});
  act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:1');expect(audio.turn).toHaveBeenCalledOnce();
});

test('live guide pointer wiring selects the starting vertical corner and tracks Y without changing X',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;
  Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:300,clientY:40});fireEvent.pointerMove(book,{pointerId:1,clientX:220,clientY:90});
  expect(document.querySelector('.page-turn-layer')?.getAttribute('data-turn-corner')).toBe('top');
  const first=document.querySelector<HTMLElement>('.guide-page-incoming')!.style.clipPath;
  fireEvent.pointerMove(book,{pointerId:1,clientX:220,clientY:140});expect(document.querySelector<HTMLElement>('.guide-page-incoming')!.style.clipPath).not.toBe(first);
  fireEvent.pointerCancel(book,{pointerId:1,clientX:220,clientY:140});act(()=>vi.advanceTimersByTime(200));expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();
  fireEvent.pointerDown(book,{pointerId:2,button:0,clientX:300,clientY:550});fireEvent.pointerMove(book,{pointerId:2,clientX:140,clientY:500});
  expect(document.querySelector('.page-turn-layer')?.getAttribute('data-turn-corner')).toBe('bottom');
  fireEvent.pointerUp(book,{pointerId:2,clientX:140,clientY:500});act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:1');expect(audio.turn).toHaveBeenCalledOnce();
});


test('a held touch keeps the original decoded role images and never starts a second outgoing grid',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!,surface=document.querySelector('.guide-page-surface')!,images=[...surface.querySelectorAll('img')];
  Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:300,clientY:60});
  expect(document.querySelector('.page-turn-layer')).toBeNull();expect([...surface.querySelectorAll('img')]).toEqual(images);
  fireEvent.pointerMove(book,{pointerId:1,clientX:200,clientY:90});expect(document.querySelector('.page-turn-layer--live')).not.toBeNull();expect(document.querySelector('.page-turn-old')).toBeNull();
  expect([...surface.querySelectorAll('img')].every((image,i)=>image===images[i])).toBe(true);
  fireEvent.pointerCancel(book,{pointerId:1,clientX:200,clientY:90});act(()=>vi.advanceTimersByTime(200));
  expect(book).toHaveAttribute('data-page-key','roles:TOWNSFOLK:grid');expect([...surface.querySelectorAll('img')].every((image,i)=>image===images[i])).toBe(true);
});

test('pressing a suspended book does not resume offscreen texture cloning before the scene releases it',async()=>{
  installPointer();const prepare=vi.spyOn(PageTextureCache.prototype,'prepare').mockResolvedValue(undefined);
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});
  fireEvent(window,new Event('ravens:release-book-textures'));prepare.mockClear();
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.pointerUp(book,{pointerId:1,clientX:150,clientY:100});
  expect(prepare).not.toHaveBeenCalled();
  await act(async()=>{fireEvent(window,new Event('ravens:resume-book-textures'));});expect(prepare).toHaveBeenCalled();cleanup();prepare.mockRestore();
});

test('the first role category returns rightward to the last tutorial and comes back leftward with its saved scroll',()=>{
  installPointer();render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const book=document.querySelector('.guide-book')!,list=document.querySelector<HTMLElement>('.guide-page-surface .role-compendium')!;
  list.scrollTop=180;swipePage(book,'back');expect(book).toHaveAttribute('data-page-key',`tutorial:${tutorialSteps.length-1}`);expect(screen.getByText(`规则 ${tutorialSteps.length} / ${tutorialSteps.length}`)).toBeVisible();
  swipePage(book,'next');expect(book).toHaveAttribute('data-page-key','roles:TOWNSFOLK:grid');expect(document.querySelector<HTMLElement>('.guide-page-surface .role-compendium')!.scrollTop).toBe(180);
  swipePage(book,'next');expect(book).toHaveAttribute('data-page-key','roles:OUTSIDER:grid');
  fireEvent.click(screen.getByRole('button',{name:'新手教程'}));fireEvent.click(screen.getByRole('button',{name:'继续看角色表'}));expect(book).toHaveAttribute('data-page-key','roles:TOWNSFOLK:grid');
});


test('book audio prepares synchronously on pointer, click and navigation keys before turn playback',()=>{
  installPointer();render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector('.guide-book')!;
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:150,clientY:100});expect(audio.prepare).toHaveBeenCalledWith();expect(audio.turn).not.toHaveBeenCalled();fireEvent.pointerUp(book,{pointerId:1,clientX:150,clientY:100});
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.prepare.mock.invocationCallOrder.at(-1)).toBeLessThan(audio.turn.mock.invocationCallOrder.at(-1)!);
  fireEvent.click(screen.getByRole('button',{name:'角色表'}));audio.prepare.mockClear();audio.turn.mockClear();
  fireEvent.keyDown(screen.getByRole('tab',{name:/镇民/}),{key:'ArrowRight'});expect(audio.prepare).toHaveBeenCalledOnce();expect(audio.prepare.mock.invocationCallOrder[0]).toBeLessThan(audio.turn.mock.invocationCallOrder[0]!);
});

test('the global sound button primes feedback on enable and total mute blocks stale local permission',async()=>{
  await enableEffectsAudio(false);installPointer();localStorage.setItem('ravens_book_audio','on');render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector('.guide-book')!;
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:150,clientY:100});fireEvent.pointerUp(book,{pointerId:1,clientX:150,clientY:100});fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'开启声音'}));expect(audio.prepare).toHaveBeenCalledExactlyOnceWith(true);expect(localStorage.getItem('ravens_effects_audio')).toBe('on');expect(document.querySelectorAll('[data-global-audio-control]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'关闭声音'}));expect(audio.silence).toHaveBeenCalledOnce();expect(localStorage.getItem('ravens_effects_audio')).toBe('off');expect(localStorage.getItem('ravens_book_audio')).toBe('on');audio.prepare.mockClear();
  fireEvent.keyDown(screen.getByRole('button',{name:'下一条'}),{key:'Enter'});fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.prepare).not.toHaveBeenCalled();
});


test('an external global mute silences the book and prevents a pending turn from playing without blocking navigation',()=>{
  vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperty(book,'clientWidth',{value:360});
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.turn).not.toHaveBeenCalled();
  act(()=>{void enableEffectsAudio(false);});expect(audio.silence).toHaveBeenCalledOnce();expect(effectsAudioEnabled()).toBe(false);expect(screen.getByRole('button',{name:'开启声音'})).toBeVisible();
  act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:1');expect(audio.turn).not.toHaveBeenCalled();audio.prepare.mockClear();
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.prepare).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:2');expect(audio.turn).not.toHaveBeenCalled();
});


test('one warmed incoming sheet and its painting/frame nodes survive cancellation and promotion to the current page',()=>{
  installPointer();vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!,source=document.querySelector<HTMLElement>('.guide-page-surface')!,list=source.querySelector<HTMLElement>('.role-compendium')!,warmed=document.querySelector<HTMLElement>('[data-guide-page="roles:OUTSIDER:grid"]')!,images=[...warmed.querySelectorAll('img')];
  Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});list.scrollTop=144;
  expect(images.length).toBeGreaterThan(0);expect(images.every(image=>image.getAttribute('loading')==='eager')).toBe(true);
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:300,clientY:60});fireEvent.pointerMove(book,{pointerId:1,clientX:180,clientY:100});
  expect(document.querySelector('.guide-page-incoming')).toBe(warmed);expect(document.querySelector('.page-turn-layer .role-grid')).toBeNull();expect([...warmed.querySelectorAll('img')].every((image,i)=>image===images[i])).toBe(true);
  fireEvent.pointerCancel(book,{pointerId:1,clientX:180,clientY:100});act(()=>vi.advanceTimersByTime(200));
  expect(document.querySelector('.guide-page-surface')).toBe(source);expect(list.scrollTop).toBe(144);expect(document.querySelector('.guide-page-preload')).toBe(warmed);
  fireEvent.pointerDown(book,{pointerId:2,button:0,clientX:300,clientY:60});fireEvent.pointerMove(book,{pointerId:2,clientX:100,clientY:100});fireEvent.pointerUp(book,{pointerId:2,clientX:100,clientY:100});act(()=>vi.advanceTimersByTime(400));
  expect(document.querySelector('.guide-page-surface')).toBe(warmed);expect([...warmed.querySelectorAll('img')].every((image,i)=>image===images[i])).toBe(true);expect(warmed.style.clipPath).toBe('');expect(warmed.style.opacity).toBe('');expect(document.querySelectorAll('.guide-book>[data-guide-page]')).toHaveLength(2);
});

test('role details use one unframed painting with no hidden full category, while returning keeps the original framed list',()=>{
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);const list=document.querySelector('.guide-page-surface .role-browser')!,images=[...list.querySelectorAll('img')];
  expect(list.querySelector('.rn-portrait-frame__ornament')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));
  const detail=screen.getByRole('article',{name:'洗衣妇详情'}),image=screen.getByRole('img',{name:'洗衣妇角色立绘'});
  expect(image.tagName).toBe('IMG');expect(image).toHaveClass('role-detail__portrait');expect(detail.querySelector('.rn-portrait-frame')).toBeNull();expect(detail.closest('.role-compendium')?.querySelector('.role-browser')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'返回镇民角色表'}));expect(document.querySelector('.guide-page-surface .role-browser')).toBe(list);expect([...list.querySelectorAll('img')].every((node,i)=>node===images[i])).toBe(true);
});

test('only the current bend gets a raster capture while the neighbor keeps its real prewarmed DOM',async()=>{
  const width=vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(360),height=vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(600),prepare=vi.spyOn(PageTextureCache.prototype,'prepare').mockResolvedValue(undefined);
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);await act(async()=>{});
  expect(prepare).toHaveBeenCalledOnce();expect(prepare.mock.calls[0]?.[1]).toBe(document.querySelector('.guide-page-surface'));expect(document.querySelector('.guide-page-preload .rn-portrait-frame__ornament')).not.toBeNull();cleanup();prepare.mockRestore();width.mockRestore();height.mockRestore();
});


test('suspending a book keeps detail nodes and scroll, releases keyboard/focus and restores the original category',async()=>{
 const close=vi.fn(),ui=render(<GuideOverlay mode="roles" onClose={close}/>);
 fireEvent.click(screen.getByRole('tab',{name:/外来者/}));
 const grid=document.querySelector<HTMLElement>('.guide-page-surface [data-page-scroll]')!;grid.scrollTop=147;fireEvent.scroll(grid);
 fireEvent.click(screen.getByRole('button',{name:'查看管家详情'}));
 const dialog=screen.getByRole('dialog'),detail=screen.getByRole('article',{name:'管家详情'}),scroller=detail.closest<HTMLElement>('[data-page-scroll]')!,advice=detail.querySelector('details')!;
 scroller.scrollTop=263;fireEvent.scroll(scroller);advice.open=true;fireEvent(advice,new Event('toggle'));
 const stage=document.createElement('button');stage.textContent='公演控制';document.body.append(stage);stage.focus();
 ui.rerender(<GuideOverlay mode="roles" onClose={close} suspended/>);await act(async()=>{});
 expect(dialog).not.toBeVisible();expect(document.querySelector('.guide-backdrop')).toBeNull();expect(stage).toHaveFocus();
 fireEvent.keyDown(window,{key:'Escape'});fireEvent.keyDown(window,{key:'Tab'});expect(close).not.toHaveBeenCalled();expect(stage).toHaveFocus();
 // A hidden-layout scroll event must not replace the saved reading position.
 scroller.scrollTop=0;fireEvent.scroll(scroller);
 ui.rerender(<GuideOverlay mode="roles" onClose={close}/>);
 expect(screen.getByRole('dialog')).toBe(dialog);expect(screen.getByRole('article',{name:'管家详情'})).toBe(detail);expect(scroller.scrollTop).toBe(263);expect(advice.open).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'返回外来者角色表'}));expect(screen.getByRole('tab',{name:/外来者/})).toHaveAttribute('aria-selected','true');expect(document.querySelector<HTMLElement>('.guide-page-surface [data-page-scroll]')!.scrollTop).toBe(147);stage.remove();
});
