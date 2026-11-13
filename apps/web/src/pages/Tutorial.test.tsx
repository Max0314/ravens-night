// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {Tutorial} from './Tutorial.js';
import {tutorialSteps} from '../guide-content.js';
import {enableEffectsAudio} from '../components/experience-audio.js';
const audio=vi.hoisted(()=>({prepare:vi.fn(async()=>true),turn:vi.fn(),silence:vi.fn(),dispose:vi.fn()}));
vi.mock('../components/book-audio.js',()=>({createBookAudio:()=>audio}));
beforeEach(async()=>{await enableEffectsAudio(true);});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();vi.unstubAllGlobals();localStorage.clear();});
function pointerClock(){
  class Pointer extends MouseEvent{pointerId:number;isPrimary=true;constructor(type:string,init:MouseEventInit&{pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;}}
  vi.stubGlobal('PointerEvent',Pointer);vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
}
function nextPages(){for(let i=0;i<tutorialSteps.length-1;i++)fireEvent.click(screen.getByRole('button',{name:'下一步'}));}

test('startup reads the shared seven pages, has no role-grid exit and only explicitly completes on its last page',()=>{
  const done=vi.fn();render(<Tutorial hideBack onBack={vi.fn()} onDone={done}/>);
  expect(screen.getByRole('button',{name:'上一页'})).toBeDisabled();expect(screen.queryByRole('button',{name:'角色表'})).toBeNull();expect(screen.queryByRole('button',{name:'关闭游戏帮助'})).toBeNull();
  for(let i=0;i<tutorialSteps.length;i++){
    expect(screen.getByRole('heading',{name:tutorialSteps[i]!.title})).toBeVisible();expect(screen.getByText(`教学 ${i+1} / ${tutorialSteps.length}`)).toBeVisible();expect(screen.getByRole('button',{name:'跳过教学'})).toBeEnabled();
    if(i<tutorialSteps.length-1)fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  }
  expect(done).not.toHaveBeenCalled();expect(document.querySelector('.guide-page-preload [data-role-id]')).toBeNull();
  // A forward swipe at the end neither enters roles nor submits completion.
  pointerClock();const book=document.querySelector('.guide-book')!;fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:250,clientY:50});fireEvent.pointerMove(book,{pointerId:1,clientX:50,clientY:55});fireEvent.pointerUp(book,{pointerId:1,clientX:50,clientY:55});
  expect(book).toHaveAttribute('data-page-key',`tutorial:${tutorialSteps.length-1}`);expect(done).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'完成教学'}));expect(done).toHaveBeenCalledOnce();
});

test('startup swipes use the same live curl, stable warmed sheet and prepared paper audio as handbook navigation',()=>{
  pointerClock();render(<Tutorial hideBack onBack={vi.fn()} onDone={vi.fn()}/>);const book=document.querySelector<HTMLElement>('.guide-book')!,warmed=document.querySelector('[data-guide-page="tutorial:1"]')!;
  Object.defineProperties(book,{clientWidth:{value:360},clientHeight:{value:600}});
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:300,clientY:60});fireEvent.pointerMove(book,{pointerId:1,clientX:100,clientY:100});
  expect(document.querySelector('.page-turn-layer')).toHaveAttribute('data-turn-corner','top');expect(document.querySelector('.page-turn-curl polygon')).not.toBeNull();expect(document.querySelector('.guide-page-incoming')).toBe(warmed);expect(audio.prepare).toHaveBeenCalled();
  fireEvent.pointerUp(book,{pointerId:1,clientX:100,clientY:100});act(()=>vi.advanceTimersByTime(400));expect(document.querySelector('.guide-page-surface')).toBe(warmed);expect(audio.turn).toHaveBeenCalledOnce();expect(audio.prepare.mock.invocationCallOrder[0]).toBeLessThan(audio.turn.mock.invocationCallOrder[0]!);
  fireEvent.pointerDown(book,{pointerId:2,button:0,clientX:80,clientY:550});fireEvent.pointerMove(book,{pointerId:2,clientX:260,clientY:510});fireEvent.pointerUp(book,{pointerId:2,clientX:260,clientY:510});act(()=>vi.advanceTimersByTime(400));expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).toHaveBeenCalledTimes(2);
});

test('multiplayer count refreshes, busy submission and failed completion keep the current reading page and allow retry',()=>{
  const done=vi.fn(),props={hideBack:true,onBack:vi.fn(),onDone:done,total:6,completeCount:1};const view=render(<Tutorial {...props}/>);nextPages();const book=document.querySelector('.guide-book')!,sheet=document.querySelector('.guide-page-surface')!;
  view.rerender(<Tutorial {...props} busy completeCount={2}/>);expect(screen.getByText('2/6 人已完成')).toBeVisible();expect(screen.getByRole('status')).toHaveTextContent('正在提交');expect(screen.getByRole('button',{name:'正在提交…'})).toBeDisabled();expect(screen.getByRole('button',{name:'跳过教学'})).toBeDisabled();expect(document.querySelector('.guide-page-surface')).toBe(sheet);
  fireEvent.click(screen.getByRole('button',{name:'跳过教学'}));expect(done).not.toHaveBeenCalled();
  view.rerender(<Tutorial {...props} completeCount={2} error="提交失败，请重试"/>);expect(screen.getByRole('alert')).toHaveTextContent('提交失败，请重试');expect(book).toHaveAttribute('data-page-key',`tutorial:${tutorialSteps.length-1}`);fireEvent.click(screen.getByRole('button',{name:'完成教学'}));expect(done).toHaveBeenCalledOnce();
  view.rerender(<Tutorial {...props} busy completeCount={2}/>);view.rerender(<Tutorial {...props} completeCount={3} error="仍未提交，请重试"/>);fireEvent.click(screen.getByRole('button',{name:'完成教学'}));expect(done).toHaveBeenCalledTimes(2);expect(screen.getByText('3/6 人已完成')).toBeVisible();
});

test('skip cancels an unfinished curl once and startup does not dismiss on Escape or trap the room menu',()=>{
  pointerClock();const back=vi.fn(),done=vi.fn();render(<><button type="button">房间菜单</button><Tutorial hideBack onBack={back} onDone={done}/></>);const book=document.querySelector<HTMLElement>('.guide-book')!;Object.defineProperty(book,'clientWidth',{value:360});
  expect(screen.getByRole('main',{name:'开局教学'})).not.toHaveAttribute('aria-modal');expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByRole('button',{name:'返回首页'})).toBeNull();fireEvent.keyDown(window,{key:'Escape'});expect(back).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
  screen.getByRole('button',{name:'房间菜单'}).focus();const tab=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});window.dispatchEvent(tab);expect(tab.defaultPrevented).toBe(false);
  fireEvent.pointerDown(book,{pointerId:1,button:0,clientX:250,clientY:70});fireEvent.pointerMove(book,{pointerId:1,clientX:140,clientY:80});expect(document.querySelector('.page-turn-layer')).not.toBeNull();fireEvent.click(screen.getByRole('button',{name:'跳过教学'}));act(()=>vi.advanceTimersByTime(500));expect(done).toHaveBeenCalledOnce();expect(document.querySelector('.page-turn-layer')).toBeNull();expect(book).toHaveAttribute('data-page-key','tutorial:0');expect(audio.turn).not.toHaveBeenCalled();
});
