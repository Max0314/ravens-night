// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {Create} from './Create.js';
import {Lobby} from './Lobby.js';
import {readCreationIntent,type RoomView} from '../api.js';
vi.mock('../api.js',async original=>({...await original<object>(),readCreationIntent:vi.fn()}));
vi.mock('../use-player-profile.js',()=>({usePlayerProfile:()=>({draft:{nickname:'皮卡丘',avatar:null},ready:true,saving:false,save:async()=>({nickname:'皮卡丘',avatar:null}),change:()=>{},reload:()=>{},account:{signedIn:false}})}));
vi.mock('../components/PlayerProfileEditor.js',()=>({PlayerProfileEditor:()=>null}));
vi.mock('../components/SeatOrderGrid.js',()=>({SeatOrderGrid:()=>null}));
const handlers={onBegin:vi.fn(),onLeave:vi.fn(),onTutorial:vi.fn(),onRoles:vi.fn(),busy:false};
afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeEach(()=>{vi.mocked(readCreationIntent).mockReturnValue(undefined);});
test('six-player creation defaults off, clears on another count and transmits the selected option',async()=>{
 const submit=vi.fn(),ui=render(<Create onBack={()=>{}} onSubmit={submit} busy={false}/>);
 expect(screen.queryByLabelText('6人局邪恶协作')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'6人'}));expect(screen.getByLabelText('6人局邪恶协作')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('6人局邪恶协作'));fireEvent.click(screen.getByRole('button',{name:'7人'}));fireEvent.click(screen.getByRole('button',{name:'6人'}));expect(screen.getByLabelText('6人局邪恶协作')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('6人局邪恶协作'));await act(async()=>fireEvent.submit(ui.container.querySelector('form')!));expect(submit).toHaveBeenCalledWith('皮卡丘',6,'IN_PERSON',undefined,{nickname:'皮卡丘',avatar:null},true);
});
test('a pending creation freezes and resends its original cooperation choice',async()=>{
 vi.mocked(readCreationIntent).mockReturnValue({creationVersion:2,playerCount:6,organizerName:'皮卡丘',commandId:'pending',createTicket:'ticket',sixPlayerEvilCooperation:true});
 const submit=vi.fn(),ui=render(<Create onBack={()=>{}} onSubmit={submit} busy={false}/>);expect(screen.getByLabelText('6人局邪恶协作')).toBeChecked();expect(screen.getByLabelText('6人局邪恶协作')).toBeDisabled();
 await act(async()=>fireEvent.submit(ui.container.querySelector('form')!));expect(submit).toHaveBeenLastCalledWith('皮卡丘',6,'IN_PERSON',undefined,{nickname:'皮卡丘',avatar:null},true);
});
test('lobby changes wait for public server state and non-host or started rooms are read-only',async()=>{
 const room:RoomView={code:'SIX123',state:'LOBBY',playerCount:6,participants:[],sixPlayerEvilCooperation:false},change=vi.fn();
 const ui=render(<Lobby {...handlers} room={room} canBegin onSetCooperation={change}/>);fireEvent.click(screen.getByLabelText('6人局邪恶协作'));expect(change).toHaveBeenCalledWith(true);expect(screen.getByLabelText('6人局邪恶协作')).not.toBeChecked();
 ui.rerender(<Lobby {...handlers} room={{...room,sixPlayerEvilCooperation:true}} canBegin={false} onSetCooperation={change}/>);expect(screen.queryByLabelText('6人局邪恶协作')).toBeNull();expect(screen.getByText('自定义增强 · 6人局邪恶协作')).toHaveAttribute('role','status');
 ui.rerender(<Lobby {...handlers} room={{...room,state:'RUNNING',sixPlayerEvilCooperation:true}} canBegin onSetCooperation={change}/>);expect(screen.queryByLabelText('6人局邪恶协作')).toBeNull();expect(screen.getByText('自定义增强 · 6人局邪恶协作')).toBeVisible();
 await waitFor(()=>expect(change).toHaveBeenCalledTimes(1));
});
