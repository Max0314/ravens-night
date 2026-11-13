// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { observeRoomView, resetAccountContext, ApiError, createRoom, joinRoom, leaveRoom, recoverRoom, submitGameAction, runBotCommand, setSixPlayerEvilCooperation } from "./api.js";

beforeEach(()=>{resetAccountContext();observeRoomView("ABCDEF",{roomInstanceId:"instance",setupId:"setup",revision:1,self:{participantId:"p1",mode:"PLAYER",commandVersion:0},contextId:"context",game:{gameId:"game",phase:"OTHER_NIGHT",day:1,seats:[],events:[],readyCount:0,aliveCount:5}});});
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
const success = () => ({ ok: true, json: async () => ({ id: "restored-seat" }) });
const commandId = (fetcher: ReturnType<typeof vi.fn>, attempt: number) => new Headers(fetcher.mock.calls[attempt]?.[1].headers).get("x-command-id");

test("an ambiguous action retries once with the same command id", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("connection lost")).mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetcher);
  await submitGameAction("ABCDEF", [2]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(commandId(fetcher, 0)).toBeTruthy();
  expect(commandId(fetcher, 1)).toBe(commandId(fetcher, 0));
});

test("create, join, leave, and rejected commands are never blindly replayed", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetcher);
  await expect(createRoom(5, "甲", "IN_PERSON")).rejects.toThrow();
  await expect(joinRoom("ABCDEF", "甲", "PLAYER")).rejects.toThrow();
  await expect(leaveRoom("ABCDEF")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
  resetAccountContext();observeRoomView("ABCDEF",{roomInstanceId:"instance",setupId:"setup",revision:1,self:{participantId:"p1",mode:"PLAYER",commandVersion:0}});
  fetcher.mockReset().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "这位玩家不能行动" }) });
  await expect(submitGameAction("ABCDEF", [2])).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("manual recovery retry retains its command id without storing the recovery secret", async () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const secret = "A-private-one-use-recovery-secret";
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetcher);
  await expect(recoverRoom("ABCDEF", secret)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(sessionStorage)).not.toContain(secret);
  expect(sessionStorage.length).toBe(1);
  fetcher.mockResolvedValueOnce(success());
  await expect(recoverRoom("ABCDEF", secret)).resolves.toEqual({ id: "restored-seat" });
  expect(commandId(fetcher, 2)).toBe(commandId(fetcher, 0));
  expect(sessionStorage.length).toBe(0);
});


test("bot test commands bind public game/ballot and retry only the original id and payload",async()=>{
 observeRoomView('ABCDEF',{roomInstanceId:'instance',setupId:'setup',revision:2,self:{participantId:'p1',mode:'PLAYER',commandVersion:3},botControl:{requestedMode:'PAUSED',effectiveMode:'PAUSED',pace:'NORMAL',version:9,attentionRequired:false},contextId:'public-context',game:{gameId:'game',contextId:'public-context',phase:'VOTING',day:1,seats:[],events:[],readyCount:0,aliveCount:5,nomination:{ballotId:'ballot',nominatorSeat:1,nomineeSeat:2,votesReceived:0,votesRaised:0,threshold:3}}});
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce({ok:true,json:async()=>({controlResult:{status:'APPLIED',executedCount:1}})});vi.stubGlobal('fetch',fetcher);
 await runBotCommand('ABCDEF','SHOOT_ONCE',2);expect(fetcher).toHaveBeenCalledTimes(2);expect(commandId(fetcher,1)).toBe(commandId(fetcher,0));const first=JSON.parse(fetcher.mock.calls[0]![1].body);expect(first).toMatchObject({command:'SHOOT_ONCE',targetSeat:2,expectedControlVersion:9,expectedCommandVersion:3,gameId:'game',contextId:'public-context',ballotId:'ballot'});expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[0]![1].body);
});

test('confirmed avatar collision clears an unused join intent so a new avatar may be submitted',async()=>{
 const ticket={ok:true,json:async()=>({joinTicket:'fixture-join-ticket',expiresAt:Date.now()+600000})};
 const fetcher=vi.fn().mockResolvedValueOnce(ticket).mockResolvedValueOnce({ok:false,status:409,json:async()=>({error:'头像已被使用',errorCode:'AVATAR_TAKEN'})}).mockResolvedValueOnce(ticket).mockResolvedValueOnce(success());vi.stubGlobal('fetch',fetcher);
 await expect(joinRoom('ABCDEF','甲','PLAYER',{nickname:'甲',avatar:'avatar-one'})).rejects.toMatchObject({errorCode:'AVATAR_TAKEN'});
 await expect(joinRoom('ABCDEF','甲','PLAYER',{nickname:'甲',avatar:'avatar-two'})).resolves.toEqual({id:'restored-seat'});expect(JSON.parse(fetcher.mock.calls[3]![1].body).avatar).toBe('avatar-two');
});

test('six-player rule mutations use room binding and retry the same setting idempotently',async()=>{
 const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('response lost')).mockResolvedValueOnce({ok:true,json:async()=>({code:'ABCDEF',sixPlayerEvilCooperation:true})});vi.stubGlobal('fetch',fetcher);
 await setSixPlayerEvilCooperation('ABCDEF',true);expect(fetcher).toHaveBeenCalledTimes(2);expect(commandId(fetcher,0)).toBe(commandId(fetcher,1));
 expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({sixPlayerEvilCooperation:true,roomInstanceId:'instance',setupId:'setup',expectedCommandVersion:0});expect(fetcher.mock.calls[1]![1].body).toBe(fetcher.mock.calls[0]![1].body);
});

test('six-player creation keeps the setting frozen across an ambiguous response and omits it by default',async()=>{
 const ticket={ok:true,json:async()=>({createTicket:'creation-ticket'})},created={ok:true,json:async()=>({code:'ABCDEF',organizerToken:'host'})};
 const fetcher=vi.fn().mockResolvedValueOnce(ticket).mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(created);vi.stubGlobal('fetch',fetcher);
 await expect(createRoom(6,'皮卡丘','IN_PERSON',undefined,{nickname:'皮卡丘',avatar:null},true)).rejects.toThrow();
 await expect(createRoom(6,'皮卡丘','IN_PERSON',undefined,{nickname:'皮卡丘',avatar:null},false)).rejects.toMatchObject({errorCode:'CREATION_PENDING'});expect(fetcher).toHaveBeenCalledTimes(2);
 await expect(createRoom(6,'皮卡丘','IN_PERSON',undefined,{nickname:'皮卡丘',avatar:null},true)).resolves.toMatchObject({code:'ABCDEF'});expect(commandId(fetcher,2)).toBe(commandId(fetcher,1));expect(fetcher.mock.calls[2]![1].body).toBe(fetcher.mock.calls[1]![1].body);expect(JSON.parse(fetcher.mock.calls[1]![1].body).sixPlayerEvilCooperation).toBe(true);
 resetAccountContext();sessionStorage.clear();fetcher.mockReset().mockResolvedValueOnce(ticket).mockResolvedValueOnce(created);
 await createRoom(6,'皮卡丘');expect(JSON.parse(fetcher.mock.calls[1]![1].body)).not.toHaveProperty('sixPlayerEvilCooperation');
});
