// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {roundTableLayout} from '@ravens/ui';
import {RoundTable} from './RoundTable.js';
import {RoomSheet} from './RoomPage.js';
import {useState} from 'react';
import {createPortal} from 'react-dom';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

test('5–12 seats keep equal radii, disjoint 44px targets and bounded positions at their minimum and larger diameters',()=>{
 for(let count=5;count<=12;count++)for(const diameter of [roundTableLayout(count,320).minimum,300,360,460]){
  const layout=roundTableLayout(count,diameter),radii=layout.points.map(p=>Math.hypot(p.x-diameter/2,p.y-diameter/2));
  expect(layout.seatSize).toBeGreaterThanOrEqual(44);
  for(const [index,p] of layout.points.entries()){
   expect(radii[index]).toBeCloseTo(radii[0]!,8);
   expect(Math.min(p.x,p.y)-layout.seatSize/2).toBeGreaterThanOrEqual(3.99);
   expect(Math.max(p.x,p.y)+layout.seatSize/2).toBeLessThanOrEqual(diameter-3.99);
   for(const q of layout.points.slice(index+1))expect(Math.max(Math.abs(p.x-q.x),Math.abs(p.y-q.y))).toBeGreaterThanOrEqual(layout.seatSize+.99);
  }
 }
});

test('content-height changes cannot stretch or shrink a stable town table',()=>{
 vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',740);
 let changed=()=>{},height=420;
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){changed=callback;}observe(){}disconnect(){}});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({width:340,height,x:0,y:0,top:0,left:0,right:340,bottom:height,toJSON:()=>({})}));
 const ui=render(<RoundTable count={8} stable className="town-stage">{()=>null}</RoundTable>);
 expect(ui.container.querySelector('.round-table')).toHaveStyle({width:'340px',height:'340px'});
 height=350;act(changed);expect(ui.container.querySelector('.round-table')).toHaveStyle({width:'340px',height:'340px'});
});

test('a constrained circle expands outside its container and unmounts its portal with the private view',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const diameter=this.closest('.round-table-expanded')?300:210;return {width:diameter,height:diameter,x:0,y:0,top:0,left:0,right:diameter,bottom:diameter,toJSON:()=>({})};});
 const ui=render(<div className="spy-town"><RoundTable count={12} className="spy-town__table">{layout=><button type="button" onClick={vi.fn()}>目标 {layout.seatSize}</button>}</RoundTable></div>);
 expect(screen.queryByRole('button',{name:/目标/})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'展开圆桌'}));
 const dialog=screen.getByRole('dialog',{name:'圆桌'});expect(ui.container.contains(dialog)).toBe(false);expect(screen.getByRole('button',{name:/目标/})).toBeVisible();
 ui.unmount();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('the last opened sheet traps focus even when an older portal is later in DOM order',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const diameter=this.closest('.round-table-expanded')?300:210;return {width:diameter,height:diameter,x:0,y:0,top:0,left:0,right:diameter,bottom:diameter,toJSON:()=>({})};});
 function Host(){const[open,setOpen]=useState(false);return <><RoundTable count={12} className="town-stage">{()=> <button onClick={()=>setOpen(true)}>查看线索</button>}</RoundTable>{open?<RoomSheet title="线索" onClose={()=>setOpen(false)}><details><summary>人机与测试</summary><button>隐藏操作</button></details><select aria-label="目标"><option>玩家1</option></select><button>末尾操作</button></RoomSheet>:null}{open?createPortal(<aside className="private-action-notice"><button>返回城镇</button></aside>,document.body):null}</>;}
 render(<Host/>);fireEvent.click(screen.getByRole('button',{name:'展开圆桌'}));fireEvent.click(screen.getByRole('button',{name:'查看线索'}));
 const close=screen.getByRole('button',{name:'关闭线索'});close.focus();fireEvent.keyDown(close,{key:'Tab'});expect(screen.getByText('人机与测试')).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'Tab'});expect(screen.getByRole('combobox',{name:'目标'})).toHaveFocus();const last=screen.getByRole('button',{name:'末尾操作'});last.focus();fireEvent.keyDown(last,{key:'Tab'});const notice=screen.getByRole('button',{name:'返回城镇'});expect(notice).toHaveFocus();fireEvent.keyDown(notice,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();fireEvent.keyDown(last,{key:'Tab'});fireEvent.keyDown(notice,{key:'Tab'});expect(screen.getByRole('button',{name:'关闭线索'})).toHaveFocus();
});


test('a wide display measures a square beyond the phone cap and remains bounded on both axes',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:1100,height:680,x:0,y:0,top:0,left:0,right:1100,bottom:680,toJSON:()=>({})});
 const ui=render(<RoundTable count={12} maxDiameter={820} className="display__table">{()=>null}</RoundTable>);
 expect(ui.container.querySelector('.round-table')).toHaveStyle({width:'680px',height:'680px'});
});
