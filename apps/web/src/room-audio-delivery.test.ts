// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {getRoom,getRoomResult,nominate,castVote,observeRoomView,resetAccountContext,type RoomView,type GameView} from './api.js';
import {connectRoomFeed} from './room-live.js';
import {resetRoomAudioDeliveries,roomAudioDelivery,roomAudioFeedLive,roomAudioFeedClosed,roomAudioRequestFailed,observeRoomAudioDelivery} from './room-audio-delivery.js';
function snapshot(revision:number):RoomView{
 const game:GameView={gameId:'g',revision,serverNow:20000,phase:'NOMINATION',day:1,seats:[],readyCount:0,aliveCount:5,events:[{id:'e'+revision,seq:revision,message:'result',kind:'VOTE_RESULT',outcome:'ON_BLOCK',startsAt:10000}]};
 return{code:'ABCDEF',roomInstanceId:'room',setupId:'setup',revision,serverNow:20000,self:{participantId:'me',mode:'PLAYER',commandVersion:0},state:'RUNNING',playerCount:5,participants:[],game};
}
beforeEach(()=>{resetAccountContext();resetRoomAudioDeliveries();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
test('the first HTTP fallback after a real WS disconnect establishes the shared public/private history floor',async()=>{
 observeRoomView('ABCDEF',snapshot(1));roomAudioFeedLive('ABCDEF','PLAYER');roomAudioFeedClosed('ABCDEF','PLAYER');
 const recovered=snapshot(2);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>recovered})));await getRoom('ABCDEF');expect(roomAudioDelivery(recovered.game!)?.historyThrough).toBe(2);
 const mine={...recovered,room:{...recovered,game:{...recovered.game!}},game:{...recovered.game!}};observeRoomView('ABCDEF',mine);expect(roomAudioDelivery(mine.game!)).toMatchObject({generation:1,historyThrough:2});expect(roomAudioDelivery(mine.room.game!)).toMatchObject({generation:1,historyThrough:2});
 const live=snapshot(3);observeRoomView('ABCDEF',live);expect(roomAudioDelivery(live.game!)).toMatchObject({generation:1,historyThrough:2});
});
test('HTTP failures recover once while repeated unsupported WS constructors leave healthy polling live',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue({ok:true,json:async()=>snapshot(2)}));await expect(getRoom('ABCDEF')).rejects.toThrow('offline');const first=await getRoom('ABCDEF');expect(roomAudioDelivery(first.game!)?.historyThrough).toBe(2);
 vi.stubGlobal('WebSocket',vi.fn(()=>{throw new DOMException('blocked');}));const stop=connectRoomFeed('ABCDEF','PLAYER',vi.fn());vi.advanceTimersByTime(7000);
 const next=snapshot(3);vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>next} as Response);await getRoom('ABCDEF');expect(roomAudioDelivery(next.game!)).toMatchObject({generation:1,historyThrough:2});stop();
});
test('an isolated HTTP error cannot erase an active WS delivery and stale snapshots cannot consume recovery',()=>{
 const current=snapshot(5);observeRoomView('ABCDEF',current);roomAudioFeedLive('ABCDEF','PLAYER');roomAudioRequestFailed('ABCDEF','PLAYER');const live=snapshot(6);observeRoomView('ABCDEF',live);expect(roomAudioDelivery(live.game!)).toMatchObject({generation:0,historyThrough:-Infinity});
 roomAudioFeedClosed('ABCDEF','PLAYER');observeRoomView('ABCDEF',snapshot(4));const recovered=snapshot(7);observeRoomView('ABCDEF',recovered);expect(roomAudioDelivery(recovered.game!)).toMatchObject({generation:1,historyThrough:7});
});
test('the WS hook marks a genuine disconnect before polling wins, and a later WS first packet keeps that floor',()=>{
 vi.useFakeTimers();
 const sockets:Array<{onmessage?:((event:{data:string})=>void);onclose?:((event:{code:number})=>void);close:()=>void}>=[];class Socket{close=vi.fn();constructor(){sockets.push(this);}}
 vi.stubGlobal('WebSocket',Socket);const receive=vi.fn(),stop=connectRoomFeed('ABCDEF','PLAYER',receive);sockets[0]!.onmessage?.({data:JSON.stringify({type:'view',room:snapshot(1)})});sockets[0]!.onclose?.({code:1006});const first=snapshot(2);observeRoomAudioDelivery('ABCDEF',first,'PLAYER');expect(roomAudioDelivery(first.game!)).toMatchObject({generation:1,historyThrough:2});
 vi.advanceTimersByTime(1000);sockets[1]!.onmessage?.({data:JSON.stringify({type:'view',room:snapshot(3)})});const later=receive.mock.calls.at(-1)![0].room as RoomView;expect(roomAudioDelivery(later.game!)).toMatchObject({generation:1,historyThrough:2});stop();
});

test.each(['nominate','vote'] as const)('a confirmed %s ACK that beats recovery polling preserves its fresh event, including a retried response',async command=>{
 observeRoomView('ABCDEF',snapshot(1));roomAudioFeedLive('ABCDEF','PLAYER');roomAudioFeedClosed('ABCDEF','PLAYER');
 const ack=snapshot(3);ack.game!.events=[{...snapshot(2).game!.events[0]!},{id:'confirmed',seq:3,message:'new',kind:command==='nominate'?'NOMINATION':'VOTE_RESULT',outcome:'ON_BLOCK',startsAt:20000}];
 vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new TypeError('lost first ACK')).mockResolvedValueOnce({ok:true,json:async()=>ack}));if(command==='nominate')await nominate('ABCDEF',2);else await castVote('ABCDEF',true);
 const receipt=roomAudioDelivery(ack.game!)!;expect(receipt).toMatchObject({generation:1,historyThrough:3});expect(receipt.liveIds.has('confirmed')).toBe(true);expect(receipt.liveIds.has('e2')).toBe(false);expect(fetch).toHaveBeenCalledTimes(2);
});

test('failure of a non-snapshot room endpoint cannot create a polling recovery boundary',async()=>{
 observeRoomView('ABCDEF',snapshot(1));vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:500,json:async()=>({error:'result temporarily unavailable'})})));await expect(getRoomResult('ABCDEF')).rejects.toThrow();const live=snapshot(2);observeRoomView('ABCDEF',live);expect(roomAudioDelivery(live.game!)).toMatchObject({generation:0,historyThrough:-Infinity});
});
