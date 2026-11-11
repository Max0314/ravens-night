// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {SeatOrderGrid} from './components/SeatOrderGrid.js';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function pointer(){class Pointer extends MouseEvent{pointerId:number;constructor(type:string,init:MouseEventInit&{pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;}}vi.stubGlobal('PointerEvent',Pointer);}
const items=[{id:'a',nickname:'甲'},{id:'b',nickname:'乙'},{id:'c',nickname:'丙'}];
function measure(root:HTMLElement){
 const grid=root.querySelector<HTMLElement>('.seat-sort-grid')!;
 Object.assign(grid,{setPointerCapture:vi.fn(),releasePointerCapture:vi.fn(),hasPointerCapture:()=>true});
 for(const node of grid.querySelectorAll<HTMLElement>('[data-player-id]')){const i=()=>Array.from(grid.children).indexOf(node);Object.defineProperties(node,{offsetLeft:{get:()=>i()*100},offsetTop:{get:()=>0},offsetWidth:{get:()=>90},offsetHeight:{get:()=>120}});node.getBoundingClientRect=()=>({left:i()*100,top:0,width:90,height:120,right:0,bottom:0,x:0,y:0,toJSON(){}});}
 return grid;
}
test('fast drop uses final coordinates once, keeps the overlay through its own setup change, and cancels a removed member safely',async()=>{
 pointer();vi.useFakeTimers();let resolve!:(value:any)=>void;const commit=vi.fn(()=>new Promise<any>(r=>{resolve=r;}));const renderCard=(p:typeof items[number])=><button className="seat-card">{p.nickname}</button>;
 const props={items,enabled:true,busy:false,setupId:'one',instanceId:'instance',onCommit:commit,renderCard};const ui=render(<SeatOrderGrid {...props}/>),grid=measure(ui.container),handle=screen.getByRole('button',{name:'甲'});
 fireEvent.pointerDown(handle,{button:0,pointerId:1,clientX:10,clientY:10});act(()=>vi.advanceTimersByTime(600));fireEvent.pointerMove(grid,{pointerId:1,clientX:210,clientY:10});fireEvent.pointerUp(grid,{pointerId:1,clientX:210,clientY:10});
 expect(commit).toHaveBeenCalledExactlyOnceWith(['b','c','a']);expect(grid.setPointerCapture).toHaveBeenCalledWith(1);const overlay=document.querySelector('.seat-sort-overlay');expect(overlay).toBeTruthy();
 const next=[items[1]!,items[2]!,items[0]!];ui.rerender(<SeatOrderGrid {...props} items={next} setupId="two"/>);expect(document.querySelector('.seat-sort-overlay')).toBe(overlay);
 await act(async()=>{resolve({participants:next.map((p,i)=>({...p,mode:'PLAYER',seat:i+1}))});});act(()=>vi.advanceTimersByTime(500));expect(document.querySelector('.seat-sort-overlay')).toBeNull();
 fireEvent.pointerDown(screen.getByRole('button',{name:'甲'}),{button:0,pointerId:2,clientX:210,clientY:10});act(()=>vi.advanceTimersByTime(600));fireEvent.pointerMove(grid,{pointerId:2,clientX:10,clientY:10});expect(()=>ui.rerender(<SeatOrderGrid {...props} items={next.slice(0,2)} setupId="three"/>)).not.toThrow();expect(document.querySelector('.seat-sort-overlay')).toBeNull();expect(commit).toHaveBeenCalledTimes(1);
});
test('keyboard grab and cancel leaves focus on the original handle and sends no command',()=>{
 const commit=vi.fn(),ui=render(<SeatOrderGrid items={items} enabled busy={false} onCommit={commit} renderCard={p=><button className="seat-card">{p.nickname}</button>}/>);measure(ui.container);
 const handle=screen.getByRole('button',{name:'甲'});handle.focus();fireEvent.keyDown(handle,{key:' '});fireEvent.keyDown(handle,{key:'ArrowRight'});expect(handle).toHaveFocus();fireEvent.keyDown(handle,{key:'Escape'});expect(commit).not.toHaveBeenCalled();expect(handle).toHaveFocus();
});

test('short taps never capture pointers; holds activate after 600ms and ignore a child implicit-capture transfer',()=>{
 pointer();vi.useFakeTimers();const click=vi.fn(),commit=vi.fn(),ui=render(<SeatOrderGrid items={items} enabled busy={false} onCommit={commit} renderCard={p=><button className="seat-card" onClick={click}>{p.nickname}</button>}/>),grid=measure(ui.container),card=screen.getByRole('button',{name:'甲'});
 fireEvent.pointerDown(card,{button:0,pointerId:1,clientX:10,clientY:10});act(()=>vi.advanceTimersByTime(599));expect(grid.setPointerCapture).not.toHaveBeenCalled();expect(document.querySelector('.seat-sort-overlay')).toBeNull();fireEvent.pointerUp(card,{pointerId:1,clientX:10,clientY:10});fireEvent.click(card);expect(click).toHaveBeenCalledOnce();
 fireEvent.pointerDown(card,{button:0,pointerId:2,clientX:10,clientY:10});act(()=>vi.advanceTimersByTime(600));expect(grid.setPointerCapture).toHaveBeenCalledWith(2);expect(document.querySelector('.seat-sort-overlay')).not.toBeNull();fireEvent(card,new Event('lostpointercapture',{bubbles:true}));expect(document.querySelector('.seat-sort-overlay')).not.toBeNull();fireEvent.pointerCancel(grid,{pointerId:2});expect(document.querySelector('.seat-sort-overlay')).toBeNull();expect(commit).not.toHaveBeenCalled();
});
