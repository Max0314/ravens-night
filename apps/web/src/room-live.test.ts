// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest';
import {connectRoomFeed} from './room-live.js';
vi.mock('./api.js',()=>({observeRoomView:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

test('a WebView constructor failure falls back without throwing and retries with bounded backoff',()=>{
 vi.useFakeTimers();const create=vi.fn(()=>{throw new DOMException('blocked','SecurityError');});vi.stubGlobal('WebSocket',create);
 const close=connectRoomFeed('ABCDEF','PLAYER',vi.fn());expect(create).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(999);expect(create).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(1);expect(create).toHaveBeenCalledTimes(2);
 vi.advanceTimersByTime(2000);expect(create).toHaveBeenCalledTimes(3);close();vi.advanceTimersByTime(60000);expect(create).toHaveBeenCalledTimes(3);
});
test('policy/auth close stops socket retries while an ordinary disconnect reconnects only once',()=>{
 vi.useFakeTimers();const sockets:Array<{onclose?:(event:{code:number})=>void;close:()=>void}>=[];
 class Socket{static OPEN=1;close=vi.fn();onclose?:((event:{code:number})=>void);constructor(){sockets.push(this);}}
 vi.stubGlobal('WebSocket',Socket);const close=connectRoomFeed('ABCDEF','PLAYER',vi.fn());
 sockets[0]!.onclose?.({code:1006});sockets[0]!.onclose?.({code:1006});vi.advanceTimersByTime(1000);expect(sockets).toHaveLength(2);
 sockets[1]!.onclose?.({code:1008});vi.advanceTimersByTime(60000);expect(sockets).toHaveLength(2);close();
});
