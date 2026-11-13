// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import type {PrivateHistoryEntry} from '../api.js';
import {SpyTownBoard} from './SpyTownBoard.js';
afterEach(cleanup);
function entry(seq:number,day:number,role='僧侣'):PrivateHistoryEntry{return {seq,phase:day===0?'FIRST_NIGHT':'OTHER_NIGHT',day,kind:'INFORMATION',text:'当夜魔典',grimoire:{entries:[{seat:1,nickname:'甲',avatar:`/night-${seq}.webp`,roleName:'酒鬼',alive:true,reminders:['存活','酒鬼自认厨师']},{seat:2,nickname:'乙',roleName:role,alive:seq===1,reminders:seq===1?['存活','红鲱鱼','僧侣保护']:['死亡','中毒','洗衣妇线索目标','管家主人','一次能力已用']}]}};}
test('private town defaults to latest night, shows received markers and switches to the preserved previous snapshot',()=>{
 const first=entry(1,0),second=entry(2,1);render(<SpyTownBoard entries={[first,second]} onReturn={vi.fn()}/>);
 expect(screen.getByText('第 2 夜 · 魔典')).toBeVisible();expect(screen.getByRole('button',{name:'下一夜魔典'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:/\[乙\]，魔典所示僧侣，已死亡/}));expect(screen.getByText('当夜已死亡')).toBeVisible();expect(within(screen.getByRole('list',{name:'2号魔典标记'})).getByText('中毒')).toBeVisible();expect(screen.getByText('洗衣妇线索目标')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'上一夜魔典'}));expect(screen.getByText('首夜 · 魔典')).toBeVisible();expect(screen.queryByText('当夜已死亡')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/\[乙\]，魔典所示僧侣，存活/}));expect(screen.getByText('当夜存活')).toBeVisible();expect(screen.getByText('红鲱鱼')).toBeVisible();expect(screen.getByText('僧侣保护')).toBeVisible();expect(screen.getByRole('button',{name:/^\[甲\]/}).querySelector('img')?.getAttribute('src')).toBe('/night-1.webp');
});
test('new snapshots do not overwrite an explicitly selected earlier night or invent data for old text records',()=>{
 const first=entry(1,0),second=entry(2,1),legacy:PrivateHistoryEntry={seq:0,phase:'FIRST_NIGHT',day:0,kind:'INFORMATION',text:'旧文本没有结构'};
 const ui=render(<SpyTownBoard entries={[legacy,first,second]} onReturn={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'上一夜魔典'}));ui.rerender(<SpyTownBoard entries={[legacy,first,second,entry(3,2,'士兵')]} onReturn={vi.fn()}/>);
 expect(screen.getByText('首夜 · 魔典')).toBeVisible();expect(screen.getByRole('button',{name:'上一夜魔典'})).toBeDisabled();expect(screen.queryByRole('button',{name:/魔典所示士兵/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'下一夜魔典'}));fireEvent.click(screen.getByRole('button',{name:'下一夜魔典'}));expect(screen.getByText('第 3 夜 · 魔典')).toBeVisible();expect(screen.getByRole('button',{name:/魔典所示士兵/})).toBeVisible();
});
test('text-only legacy history offers return instead of manufacturing a live grimoire',()=>{
 const back=vi.fn();render(<SpyTownBoard entries={[{seq:1,day:0,phase:'FIRST_NIGHT',kind:'INFORMATION',text:'旧魔典文本'}]} onReturn={back}/>);
 expect(screen.getByText('尚未收到魔典快照。')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'返回公开城镇'}));expect(back).toHaveBeenCalledOnce();
});

test('opening the latest grimoire pins that night while the next snapshot arrives',()=>{
 const first=entry(1,0),ui=render(<SpyTownBoard entries={[first]} onReturn={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/^\[乙\]/}));
 ui.rerender(<SpyTownBoard entries={[first,entry(2,1,'士兵')]} onReturn={vi.fn()}/>);
 expect(screen.getByText('首夜 · 魔典')).toBeVisible();expect(screen.queryByRole('button',{name:/魔典所示士兵/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'下一夜魔典'}));expect(screen.getByRole('button',{name:/魔典所示士兵/})).toBeVisible();
});


test('snapshot marks move off portraits into a separate clickable lane and keep the selected old night',()=>{
 const first=entry(1,0),second=entry(2,1,'小恶魔');const ui=render(<SpyTownBoard entries={[first,second]} initialSeq={1} onReturn={vi.fn()}/>);
 const table=ui.container.querySelector('.round-table')!,rail=screen.getByLabelText('当夜魔典标记');expect(table).not.toContainElement(rail);expect(table.querySelector('.spy-town__markers')).toBeNull();
 for(const portrait of ui.container.querySelectorAll('.spy-town__portrait'))expect(portrait.querySelector('.spy-town__number')).toBeNull();
 fireEvent.click(within(rail).getByRole('button',{name:'查看[乙]的当夜标记'}));expect(screen.getByRole('list',{name:'2号魔典标记'})).toHaveTextContent('红鲱鱼');expect(screen.getByText('当夜存活')).toBeVisible();expect(screen.queryByRole('button',{name:/魔典所示小恶魔/})).not.toBeInTheDocument();
});
