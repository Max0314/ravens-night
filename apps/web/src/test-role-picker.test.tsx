// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {useState} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TestRolePicker} from './components/TestRolePicker.js';
import {Lobby} from './pages/Lobby.js';
import {hasPendingCommand,observeRoomView,resetAccountContext,retryPendingCommand,setRehearsalRole,type RoomView} from './api.js';
afterEach(()=>{cleanup();vi.unstubAllGlobals();resetAccountContext();sessionStorage.clear();window.history.replaceState({},'','/');});
const eligible={eligible:true,canChooseRole:true};
test('choosing a role is explicit, can be cleared to random and closes only after a successful save',async()=>{
 const choose=vi.fn().mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValue(undefined);const ui=render(<TestRolePicker rehearsal={eligible} busy={false} onChoose={choose}/>);
 fireEvent.click(screen.getByRole('button',{name:/我的身份：随机/}));fireEvent.click(screen.getByRole('tab',{name:'爪牙'}));fireEvent.click(screen.getByRole('button',{name:'间谍'}));expect(choose).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'使用间谍'}));await screen.findByRole('alert');expect(screen.getByRole('dialog',{name:'选择测试身份'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'使用间谍'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(choose).toHaveBeenLastCalledWith('spy');
 ui.rerender(<TestRolePicker rehearsal={{...eligible,selectedRoleId:'spy'}} busy={false} onChoose={choose}/>);fireEvent.click(screen.getByRole('button',{name:/我的身份：间谍/}));fireEvent.click(screen.getByRole('button',{name:'随机身份'}));fireEvent.click(screen.getByRole('button',{name:'使用随机身份'}));await waitFor(()=>expect(choose).toHaveBeenLastCalledWith(null));
});
test('another human or a started game closes the picker and blocks stale selection',()=>{
 const choose=vi.fn(),ui=render(<TestRolePicker rehearsal={eligible} busy={false} onChoose={choose}/>);fireEvent.click(screen.getByRole('button',{name:/我的身份：随机/}));fireEvent.click(screen.getByRole('tab',{name:'外来者'}));fireEvent.click(screen.getByRole('button',{name:'酒鬼'}));expect(screen.getByText(/开局显示一个未在场镇民身份/)).toBeVisible();
 ui.rerender(<TestRolePicker rehearsal={{eligible:false,canChooseRole:false}} busy={false} onChoose={choose}/>);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(choose).not.toHaveBeenCalled();
});
test('lobby surfaces server-confirmed test mode and exposes the configured role before start',()=>{
 const room:RoomView={code:'ABCDEF',state:'LOBBY',playerCount:5,roomInstanceId:'r',setupId:'s',organizerId:'p1',activeHumanCount:1,botCount:4,participants:Array.from({length:5},(_,i)=>({id:`p${i+1}`,seat:i+1,nickname:`玩家${i+1}`,mode:'PLAYER',controller:i===0?'HUMAN':'BOT',connected:true,ready:true}))};
 const ui=render(<Lobby room={room} participantId="p1" rehearsal={{...eligible,selectedRoleId:'imp'}} onChooseRole={vi.fn()} onBegin={vi.fn()} onLeave={vi.fn()} onTutorial={vi.fn()} onRoles={vi.fn()} canBegin busy={false}/>);expect(screen.getByRole('button',{name:/我的身份：小恶魔/})).toBeVisible();expect(screen.getByRole('button',{name:'开始游戏'})).toBeEnabled();
 ui.rerender(<Lobby room={room} participantId="p1" rehearsal={{...eligible,selectedRoleId:'imp'}} onChooseRole={vi.fn()} onBegin={vi.fn()} onLeave={vi.fn()} onTutorial={vi.fn()} onRoles={vi.fn()} canBegin busy/>);expect(screen.getByRole('button',{name:/我的身份：小恶魔/})).toBeDisabled();
});
test('test-role command carries both room and control versions and retries a lost response with the same intent',async()=>{
 observeRoomView('ABCDEF',{roomInstanceId:'r',setupId:'s',revision:1,self:{participantId:'p1',mode:'PLAYER',commandVersion:8},botControl:{requestedMode:'RUNNING',effectiveMode:'RUNNING',pace:'NORMAL',version:3,attentionRequired:false}});
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockResolvedValue({ok:true,status:200,json:async()=>({state:'LOBBY',participant:{id:'p1',nickname:'甲',seat:1},history:[],messages:[]})});vi.stubGlobal('fetch',fetcher);await setRehearsalRole('ABCDEF','spy');expect(fetcher).toHaveBeenCalledTimes(2);const first=fetcher.mock.calls[0]!,second=fetcher.mock.calls[1]!;expect(first[0]).toBe('/api/rooms/ABCDEF/rehearsal/role');expect(JSON.parse(first[1].body)).toMatchObject({roomInstanceId:'r',setupId:'s',roleId:'spy',expectedCommandVersion:8,expectedControlVersion:3});expect(new Headers(first[1].headers).get('x-command-id')).toBe(new Headers(second[1].headers).get('x-command-id'));expect(second[1].body).toBe(first[1].body);
});


test('an uncertain selection can retry its original command inside the picker without replacing the draft intent',async()=>{
 observeRoomView('ABCDEF',{roomInstanceId:'r',setupId:'s',revision:1,self:{participantId:'p1',mode:'PLAYER',commandVersion:8},botControl:{requestedMode:'RUNNING',effectiveMode:'RUNNING',pace:'NORMAL',version:3,attentionRequired:false}});
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost')).mockRejectedValueOnce(new TypeError('lost again')).mockResolvedValue({ok:true,status:200,json:async()=>({rehearsal:{...eligible,selectedRoleId:'spy'}})});vi.stubGlobal('fetch',fetcher);
 function Harness(){const[busy,setBusy]=useState(false),[rehearsal,setRehearsal]=useState<{eligible:boolean;canChooseRole:boolean;selectedRoleId?:string}>(eligible);async function choose(roleId:string|null){setBusy(true);try{await setRehearsalRole('ABCDEF',roleId);}finally{setBusy(false);}}async function retry(){setBusy(true);try{const result=await retryPendingCommand('ABCDEF') as {rehearsal:typeof rehearsal};setRehearsal(result.rehearsal);}finally{setBusy(false);}}return <TestRolePicker rehearsal={rehearsal} busy={busy} pending={hasPendingCommand('ABCDEF')} onChoose={choose} onRetry={retry}/>;}
 render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:/我的身份：随机/}));fireEvent.click(screen.getByRole('tab',{name:'爪牙'}));fireEvent.click(screen.getByRole('button',{name:'间谍'}));fireEvent.click(screen.getByRole('button',{name:'使用间谍'}));await screen.findByRole('button',{name:'重试待确认操作'});expect(hasPendingCommand('ABCDEF')).toBe(true);expect(screen.getByRole('button',{name:'投毒者'})).toBeDisabled();expect(screen.getByRole('button',{name:'随机身份'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'重试待确认操作'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(screen.getByRole('button',{name:/我的身份：间谍/})).toBeVisible();expect(hasPendingCommand('ABCDEF')).toBe(false);expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls[2]![1].body).toBe(fetcher.mock.calls[0]![1].body);expect(new Headers(fetcher.mock.calls[2]![1].headers).get('x-command-id')).toBe(new Headers(fetcher.mock.calls[0]![1].headers).get('x-command-id'));
});
