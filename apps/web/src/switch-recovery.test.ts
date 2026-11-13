// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {ApiError,clearPendingJoin,finishPendingRoomSwitch,isDefiniteJoinFailure,joinRoom,readPendingJoin,readPendingRoomSwitch,requestRoomSwitchTicket,resetAccountContext,retryPendingRoomSwitch,switchRoom} from './api.js';
const source={code:'OLDRMM',roomInstanceId:'old-instance'};
const ticket={switchTicket:'signed-switch',expiresAt:Date.now()+300000,source:{...source,state:'RUNNING' as const,activeHumanCount:3,playerCount:5}};
const profile={nickname:'测试玩家',avatar:'avatar'};
const ok=(value:unknown)=>({ok:true,json:async()=>value});
const error=(status:number,errorCode:string)=>({ok:false,status,json:async()=>({error:'操作被拒绝',errorCode})});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();resetAccountContext();});
afterEach(()=>{finishPendingRoomSwitch();resetAccountContext();vi.unstubAllGlobals();sessionStorage.clear();});

test('a lost switch response keeps original tickets through reload and retries the exact target join',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(ok({joinTicket:'signed-join'})).mockRejectedValueOnce(new TypeError('lost response'));vi.stubGlobal('fetch',fetcher);
 await expect(switchRoom(source,'NEWRMM','new-instance',ticket,profile)).rejects.toThrow('lost response');expect(fetcher).toHaveBeenCalledTimes(2);
 const original=JSON.parse(String(fetcher.mock.calls[1]![1].body));expect(original).toEqual({...profile,mode:'PLAYER',joinTicket:'signed-join',switchTicket:'signed-switch'});expect(readPendingRoomSwitch()?.sourceCode).toBe('OLDRMM');expect(readPendingJoin('NEWRMM')).toEqual(profile);
 resetAccountContext();expect(readPendingRoomSwitch()?.targetCode).toBe('NEWRMM');fetcher.mockResolvedValueOnce(ok({id:'joined',closedRoomCode:'OLDRMM'}));await expect(retryPendingRoomSwitch()).resolves.toMatchObject({id:'joined',closedRoomCode:'OLDRMM'});expect(JSON.parse(String(fetcher.mock.calls[2]![1].body))).toEqual(original);expect(new Headers(fetcher.mock.calls[2]![1].headers).get('x-ravens-protocol')).toBe('7');expect(readPendingRoomSwitch()).toBeDefined();finishPendingRoomSwitch();expect(readPendingRoomSwitch()).toBeUndefined();
});
test('duplicate switch clicks share both ticket preparation and the join flight',async()=>{
 let finish!:(value:unknown)=>void;const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(ok({id:'joined',closedRoomCode:'OLDRMM'}));vi.stubGlobal('fetch',fetcher);
 const first=switchRoom(source,'NEWRMM','new-instance',ticket,profile),second=switchRoom(source,'NEWRMM','new-instance',ticket,profile);expect(first).toBe(second);finish(ok({joinTicket:'signed-join'}));await first;expect(fetcher).toHaveBeenCalledTimes(2);
});
test('confirmed switch failures clear the pending transfer while unavailable persistence keeps it',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(ok({joinTicket:'j'})).mockResolvedValueOnce(error(409,'HOST_CHANGED'));vi.stubGlobal('fetch',fetcher);await expect(switchRoom(source,'NEWRMM','new-instance',ticket,profile)).rejects.toBeInstanceOf(ApiError);expect(readPendingRoomSwitch()).toBeUndefined();
 fetcher.mockResolvedValueOnce(ok({joinTicket:'j2'})).mockResolvedValueOnce(error(503,'PERSISTENCE_UNAVAILABLE'));await expect(switchRoom(source,'NEWRMM','new-instance',ticket,profile)).rejects.toBeInstanceOf(ApiError);expect(readPendingRoomSwitch()?.joinTicket).toBe('j2');
});
test('join ticket acquisition failures release frozen drafts only when the failure is definite',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(error(404,'ROOM_NOT_FOUND'));vi.stubGlobal('fetch',fetcher);await expect(joinRoom('GONERM','甲','PLAYER',profile)).rejects.toBeInstanceOf(ApiError);expect(readPendingJoin('GONERM')).toBeUndefined();
 fetcher.mockRejectedValueOnce(new TypeError('offline'));await expect(joinRoom('NEWRMM',profile.nickname,'PLAYER',profile)).rejects.toThrow('offline');expect(readPendingJoin('NEWRMM')).toEqual(profile);clearPendingJoin('NEWRMM');expect(readPendingJoin('NEWRMM')).toBeUndefined();
});
test('switch ticket requests use the source path and do not need target membership command context',async()=>{
 const fetcher=vi.fn().mockResolvedValue(ok(ticket));vi.stubGlobal('fetch',fetcher);await expect(requestRoomSwitchTicket(source,'NEWRMM','new-instance')).resolves.toEqual(ticket);expect(fetcher.mock.calls[0]![0]).toBe('/api/rooms/OLDRMM/switch-ticket');expect(JSON.parse(String(fetcher.mock.calls[0]![1].body))).toEqual({sourceRoomInstanceId:'old-instance',targetCode:'NEWRMM',targetRoomInstanceId:'new-instance'});
});

test('explicit transfer capacity rejection unlocks the uncommitted switch instead of freezing its tickets',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(ok({joinTicket:'join'})).mockResolvedValueOnce(error(429,'JOIN_TRANSFER_CAPACITY'));vi.stubGlobal('fetch',fetcher);await expect(switchRoom(source,'NEWRMM','new-instance',ticket,profile)).rejects.toMatchObject({errorCode:'JOIN_TRANSFER_CAPACITY'});expect(readPendingRoomSwitch()).toBeUndefined();expect(readPendingJoin('NEWRMM')).toBeUndefined();
 fetcher.mockResolvedValueOnce(error(429,'JOIN_TICKET_CAPACITY'));await expect(joinRoom('NEWRMM',profile.nickname,'PLAYER',profile)).rejects.toMatchObject({errorCode:'JOIN_TICKET_CAPACITY'});expect(readPendingJoin('NEWRMM')).toBeUndefined();
});
