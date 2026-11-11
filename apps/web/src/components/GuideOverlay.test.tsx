// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GuideOverlay } from "./GuideOverlay.js";
import { tutorialSteps } from "../guide-content.js";
const audio=vi.hoisted(()=>({turn:vi.fn(),silence:vi.fn(),dispose:vi.fn()}));
vi.mock("./book-audio.js",()=>({createBookAudio:()=>audio}));
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


test('page turns follow actual navigation, allow muting and retain top-focused role artwork',()=>{
  render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'下一条'}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'关闭翻页音效'}));fireEvent.click(screen.getByRole('button',{name:'角色表'}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('tab',{name:/镇民/}));expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'查看洗衣妇详情'}));expect(screen.getByRole('img',{name:'洗衣妇角色立绘'})).toHaveStyle({objectPosition:'50% 0%'});
});

test('tutorial swipes share button turns, stop at the first page and enter roles after the last page',()=>{
  installPointer();render(<GuideOverlay mode="tutorial" onClose={vi.fn()}/>);
  const book=document.querySelector('.guide-book')!;
  swipePage(book,'back');expect(audio.turn).not.toHaveBeenCalled();
  swipePage(book,'next');expect(screen.getByText(`规则 2 / ${tutorialSteps.length}`)).toBeVisible();expect(book).toHaveAttribute('data-turn','forward');expect(audio.turn).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'上一条'}));expect(book).toHaveAttribute('data-turn','back');
  fireEvent.click(screen.getByRole('button',{name:'关闭翻页音效'}));
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
