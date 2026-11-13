// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {getRoomResult,type GameView,type RoomResult} from '../api.js';
import {ResultBoard} from './ResultBoard.js';
import {VillageRecords} from './VillageRecords.js';
vi.mock('../api.js',async original=>({...await original<object>(),getRoomResult:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();vi.unstubAllGlobals();});
const seats:GameView['seats']=[{id:'p1',seat:2,nickname:'甲',avatar:'/a.webp',alive:true,connected:true,ghostVoteAvailable:true},{id:'p2',seat:1,nickname:'乙',avatar:'/b.webp',alive:false,connected:true,ghostVoteAvailable:true}];
const result:RoomResult={gameId:'g1',releasedAt:1,winner:'GOOD',reason:'demon-dead',days:2,hadBots:true,rehearsalUsed:true,participants:[{id:'p1',nickname:'甲',avatar:'/saved-a.webp',finalRole:'drunk',perceivedRole:'librarian'},{id:'p2',nickname:'乙',avatar:'/saved-b.webp',finalRole:'imp',controller:'BOT'}]};
const game:GameView={gameId:'g1',phase:'GAME_OVER',day:2,seats,events:[],readyCount:0,aliveCount:1};

test('public records group events and show explicit actor/target portraits without treating voters as targets',()=>{
 const events:GameView['events']=[{seq:1,message:'旧记录中提到 【玩家1-乙】'},{seq:2,kind:'NOMINATION',day:1,actorSeat:2,targetSeat:1,message:'甲提名乙'},{seq:3,kind:'VOTE_RESULT',day:1,targetSeat:1,seats:[1,2],votes:3,threshold:3,message:'乙得到3票'},{seq:4,kind:'DAWN',day:2,seats:[2],outcome:'DEATH',message:'甲死亡'}];
 const ui=render(<VillageRecords events={events} seats={seats}/>);fireEvent.click(screen.getByText('村庄记录'));
 expect(screen.getByRole('heading',{name:'第 2 天'})).toBeVisible();expect(screen.getByRole('heading',{name:'第 1 天'})).toBeVisible();expect(screen.getByRole('heading',{name:'此前记录'})).toBeVisible();
 const nomination=ui.container.querySelector('.village-records__entry--nomination')!;expect(within(nomination as HTMLElement).getByText('提名人')).toBeVisible();expect(nomination.querySelectorAll('img')).toHaveLength(2);expect(nomination.querySelector('img')?.getAttribute('src')).toBe('/a.webp');
 const vote=ui.container.querySelector('.village-records__entry--vote_result')!;expect(vote.querySelectorAll('img')).toHaveLength(1);expect(vote.querySelector('img')?.getAttribute('src')).toBe('/b.webp');expect(within(vote as HTMLElement).getByText('3票 · 3票达标')).toBeVisible();expect(ui.container.querySelector('.village-records__entry--notice img')).toBeNull();
});

test('an unrevealed or no-death dawn has no inferred victim portraits or protection labels',()=>{
 const ui=render(<VillageRecords events={[{seq:1,kind:'DAWN',day:1,message:'黎明将至。'}]} seats={seats}/>);fireEvent.click(screen.getByText('村庄记录'));expect(ui.container.querySelectorAll('img')).toHaveLength(0);
 ui.rerender(<VillageRecords events={[{seq:1,kind:'DAWN',day:1,seats:[],outcome:'NO_DEATH',message:'黎明到来，昨夜无人死亡。'}]} seats={seats}/>);expect(ui.container.querySelectorAll('img')).toHaveLength(0);expect(screen.queryByText(/保护|中毒/)).not.toBeInTheDocument();
});

test('result town uses saved portraits and actual roles, with matching public seats and selectable full details',async()=>{
 vi.mocked(getRoomResult).mockResolvedValue({result});const ui=render(<ResultBoard code="ABCDEF" gameId="g1" game={game}/>);const ring=await screen.findByRole('list',{name:'终局角色圆桌'});
 expect(within(ring).getAllByRole('button')[0]).toHaveAccessibleName('[乙]，真实身份小恶魔');expect(within(ring).getByRole('button',{name:/\[甲\]/}).querySelector('img')?.getAttribute('src')).toBe('/saved-a.webp');expect(ui.container.querySelectorAll('.rn-avatar-state--dead')).toHaveLength(1);
 fireEvent.click(within(ring).getByRole('button',{name:/\[甲\]/}));const center=screen.getByRole('dialog',{name:'甲 · 真实身份'});expect(within(center).getByText('酒鬼')).toBeVisible();expect(within(center).getByText('本局自认 图书管理员')).toBeVisible();expect(within(center).getByText('终局存活')).toBeVisible();fireEvent.click(within(center).getByRole('button',{name:'返回战况'}));expect(within(screen.getByLabelText('结算详情')).getByText('恶魔已死亡')).toBeVisible();
});

test('old results never borrow another games seat numbers or life state',async()=>{
 vi.mocked(getRoomResult).mockResolvedValue({result});const ui=render(<ResultBoard code="ABCDEF" game={{...game,gameId:'g2'}}/>);const button=await screen.findByRole('button',{name:'[乙]，真实身份小恶魔'});expect(ui.container.querySelectorAll('.result-town__number,.rn-avatar-state--dead')).toHaveLength(0);fireEvent.click(button);expect(screen.queryByText('终局已死亡')).not.toBeInTheDocument();
});

test('a short result keeps a circular preview, expands twelve touch targets, and closes full details independently',async()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const expanded=!!this.closest('.round-table-expanded');const width=292,height=expanded?400:200;return {width,height,x:0,y:0,top:0,left:0,right:width,bottom:height,toJSON:()=>({})};});
 const participants=Array.from({length:12},(_,i)=>({...result.participants[i%2]!,id:`p${i+1}`,nickname:`玩家${i+1}`}));
 vi.mocked(getRoomResult).mockResolvedValue({result:{...result,participants}});
 render(<ResultBoard code="ABCDEF" gameId="g1"/>);fireEvent.click(await screen.findByRole('button',{name:'展开圆桌'}));
 const ring=screen.getByRole('list',{name:'终局角色圆桌'});expect(within(ring).getAllByRole('button')).toHaveLength(12);
 fireEvent.click(within(ring).getByRole('button',{name:'[玩家1]，真实身份酒鬼'}));const sheet=screen.getByRole('dialog',{name:'玩家1 · 真实身份'});
 expect(within(sheet).getByText('本局自认 图书管理员')).toBeVisible();expect(within(sheet).getByText('善良阵营')).toBeVisible();
 fireEvent.click(within(sheet).getByRole('button',{name:'关闭玩家1 · 真实身份'}));expect(screen.getByRole('dialog',{name:'圆桌'})).toBeVisible();expect(screen.queryByRole('dialog',{name:'玩家1 · 真实身份'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'关闭圆桌'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a late previous-room response cannot replace the current result; failures retry in place',async()=>{
 let finish!:(value:{result:RoomResult|null})=>void;vi.mocked(getRoomResult).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({result:{...result,gameId:'g2'}});
 const ui=render(<ResultBoard code="ABCDEF" gameId="g1"/>);ui.rerender(<ResultBoard code="BCDEFG" gameId="g2"/>);await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'重新获取战报'}));await screen.findByRole('list',{name:'终局角色圆桌'});await act(async()=>finish({result}));expect(screen.queryByText('战报正在同步')).not.toBeInTheDocument();expect(getRoomResult).toHaveBeenLastCalledWith('BCDEFG');
});

test('opening an initially collapsed report measures its narrow table without ResizeObserver',async()=>{
 vi.stubGlobal('ResizeObserver',undefined);
 const bounds=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const open=this.closest('details')?.open;const width=open?268:0,height=open?220:0;return {width,height,x:0,y:0,top:0,left:0,right:width,bottom:height,toJSON:()=>({})};});
 const participants=Array.from({length:12},(_,i)=>({...result.participants[i%2]!,id:`p${i+1}`,nickname:`玩家${i+1}`}));
 vi.mocked(getRoomResult).mockResolvedValue({result:{...result,participants}});
 const ui=render(<details><summary>上局战报</summary><ResultBoard code="ABCDEF"/></details>);
 await waitFor(()=>expect(ui.container.querySelector('.result-town__table')).not.toBeNull());
 const table=ui.container.querySelector('.result-town__table')!,disclosure=ui.container.querySelector('details')!;
 expect(table).toHaveStyle({width:'320px',height:'320px'});fireEvent.click(screen.getByText('上局战报'));
 await waitFor(()=>expect(ui.container.querySelector('.round-table-slot')).toHaveAttribute('data-diameter','220'));
 expect(screen.getByRole('button',{name:'展开圆桌'})).toBeVisible();expect(ui.container.querySelector('.round-table-preview')).toHaveAttribute('inert');
 ui.unmount();bounds.mockClear();fireEvent(disclosure,new Event('toggle'));expect(bounds).not.toHaveBeenCalled();
});
