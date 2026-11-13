import type {PlayerSelection} from './use-player-profile.js';
import type { ExperienceEvent, StorytellerDecision, RoomProtocolView, RoomCommandContext } from "@ravens/contracts";
import {roomSessionKey} from './account-context.js';
import { isOlderSnapshot } from "./snapshot-order.js";
import {observeRoomAudioDelivery,resetRoomAudioDeliveries,roomAudioRequestFailed,type RoomAudioObservation} from './room-audio-delivery.js';
import type {PresentationAckRequest,PresentationAckResponse} from '@ravens/contracts';
import type { RoomParticipant, RoomPlayMode, GameView, RoomView, PrivateView, RoomResult } from "@ravens/contracts";
export type { RoomParticipant, RoomPlayMode, GameView, RoomView, PrivateView, RoomResult, PrivateHistoryEntry, PrivateHistoryPhase, PrivateHistoryKind } from "@ravens/contracts";
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode?: string, readonly details?:{joinTicketConsumed?:boolean;profile?:GameProfile}) { super(message); this.name = "ApiError"; }
}
let accountGeneration=0;
type ContextView = Partial<RoomProtocolView> & { contextId?: string; game?: GameView; room?: RoomView; botControl?: RoomView["botControl"] };
const contexts = new Map<string, ContextView>();
const tails = new Map<string, Promise<unknown>>();
interface Intent { onCommitted?: (() => void) | undefined; url: string; init: RequestInit; body: Record<string, unknown>; binding: Omit<RoomCommandContext, "expectedCommandVersion">; generation: number; sent: boolean; promise?: Promise<unknown> }
const unsentVotes = new Map<string, Intent>();
const pending = new Map<string, Intent>();
const contextKey = (code: string, mode = currentRoomMode()) => `${code.toUpperCase()}:${mode}`;
export function resetAccountContext(){accountGeneration++; resetRoomAudioDeliveries(); contexts.clear(); tails.clear(); pending.clear(); unsentVotes.clear(); joinTickets.clear(); joinIntents.clear();joinFlights.clear();switchMemory=undefined;switchFlight=undefined;switchPreparation=undefined; creationIntent=undefined; creationFlights.clear();}
export function observeRoomView(code: string, incoming: ContextView, mode = currentRoomMode(),audioObservation?:RoomAudioObservation) {
  observeRoomAudioDelivery(code,incoming,mode,audioObservation);
  const key = contextKey(code, mode), previous = contexts.get(key);
  if (!incoming.roomInstanceId || !incoming.self) return;
  if (isOlderSnapshot(incoming, previous)) return;
  contexts.set(key, incoming);
}

function commandBinding(code: string, path: string): Omit<RoomCommandContext, "expectedCommandVersion"> {
  const view = contexts.get(contextKey(code));
  if (!view?.roomInstanceId || !view.setupId || !view.self) throw new ApiError("正在同步房间，请稍后重新操作", 409, "SYNC_REQUIRED");
  const base = { roomInstanceId: view.roomInstanceId, setupId: view.setupId };
  if (["bots/step", "bots/command", "rehearsal/advance"].includes(path)) return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId, contextId: view.game.contextId } : {}), ...(view.game?.nomination?.ballotId ? { ballotId: view.game.nomination.ballotId } : {}) };
  if (["vote", "nomination/cancel", "nomination/defense/complete"].includes(path))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...(view.game?.nomination?.ballotId ? { ballotId: view.game.nomination.ballotId } : {}) };
  if (["role/confirm", "first-night-info/ack", "action", "nominate", "day/ready", "day/ability", "resume", "abort", "reopen", "reset"].includes(path) || path.startsWith("whispers"))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...((view.contextId ?? view.game?.contextId) ? { contextId: (view.contextId ?? view.game?.contextId)! } : {}) };
  return base;
}

const memberPath = (url: string) => /^\/api\/rooms\/([^/]+)\/(.+)$/.exec(url);
function isMemberWrite(url: string, init?: RequestInit) {
  const match = memberPath(url);
  return match && init?.method && !["GET", "HEAD"].includes(init.method) && !/^(?:join$|recover$|switch-ticket$|presentations\/ack$|account\/)/.test(match[2]!) ? match : undefined;
}

async function request<T>(url: string, init?: RequestInit, onCommitted?: () => void): Promise<T> {
  const match = isMemberWrite(url, init);
  if (!match) return rawRequest<T>(url, init);
  const code = match[1]!, path = match[2]!, key = contextKey(code), binding = commandBinding(code, path);
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  if (/^(bots|rehearsal)(\/|$)/.test(path)) { const view=contexts.get(key); const version=(view?.room ?? view)?.botControl?.version; if(version===undefined)throw new ApiError("正在同步人机控制状态",409,"SYNC_REQUIRED"); body.expectedControlVersion=version; }
  const old = unsentVotes.get(key);
  if (path === "vote" && old && !old.sent && JSON.stringify(old.binding) === JSON.stringify(binding)) {
    old.body = body;
    return old.promise as Promise<T>;
  }
  const intent: Intent = { onCommitted, url, init: { ...init, headers: { "x-command-id": crypto.randomUUID() } }, body, binding, generation: accountGeneration, sent: false };
  const run = (tails.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    if (intent.generation !== accountGeneration) throw new ApiError("账号已切换，请重新操作", 409, "ACCOUNT_CHANGED");
    if (pending.has(key)) throw new ApiError("上一项操作结果待确认，请先重试该操作", 409, "COMMAND_PENDING");
    const current = commandBinding(code, path);
    if (JSON.stringify(current) !== JSON.stringify(intent.binding)) throw new ApiError("轮次或房间已变化，请重新操作", 409, "CONTEXT_CHANGED");
    intent.sent = true;
    if (unsentVotes.get(key) === intent) unsentVotes.delete(key);
    const commandVersion = contexts.get(key)!.self!.commandVersion;
    intent.init.body = JSON.stringify({ ...intent.body, ...intent.binding, expectedCommandVersion: commandVersion });
    return dispatchIntent<T>(key, intent);
  }).finally(() => { if (unsentVotes.get(key) === intent) unsentVotes.delete(key); });
  intent.promise = run;
  tails.set(key, run);
  if (path === "vote") unsentVotes.set(key, intent);
  return run;
}

async function dispatchIntent<T>(key: string, intent: Intent): Promise<T> {
  pending.set(key, intent);
  try {
    const result = await rawRequest<T>(intent.url, intent.init);
    if (pending.get(key) === intent) pending.delete(key);
    const committed=intent.onCommitted;intent.onCommitted=undefined;committed?.();
    return result;
  } catch (error) {
    if (intent.init.method === "DELETE" && intent.url.endsWith("/leave") && error instanceof ApiError && (error.status === 404 || (error.status === 403 && error.errorCode === "SEAT_REMOVED"))) {
      if (pending.get(key) === intent) pending.delete(key);
      return { left: true, roomDestroyed: error.status === 404, organizerChanged: false, self: null } as T;
    }
    if (error instanceof ApiError && error.status < 500 && pending.get(key) === intent) pending.delete(key);
    throw error;
  }
}
export function hasPendingCommand(code: string) { return pending.has(contextKey(code)); }
export async function retryPendingCommand(code: string) {
  const key = contextKey(code), intent = pending.get(key);
  if (!intent) return;
  if (intent.generation !== accountGeneration) throw new ApiError("账号已切换", 409, "ACCOUNT_CHANGED");
  return dispatchIntent(key, intent);
}

async function rawRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const generation=accountGeneration;
  const headers = new Headers({ "content-type": "application/json", "x-room-mode": currentRoomMode(), "x-ravens-protocol": "7" });
  if (init?.method && init.method !== "GET") headers.set("x-command-id", crypto.randomUUID());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const options = { ...init, credentials: "same-origin" as const, headers };
  const audioCommand=init?.method==='POST'?/^\/api\/rooms\/([^/]+)\/(nominate|vote)$/.exec(url):null;
  const audioObservation:RoomAudioObservation|undefined=audioCommand?{liveKind:audioCommand[2]==='nominate'?'NOMINATION':'VOTE_RESULT',afterSeq:Math.max(-Infinity,...(contexts.get(contextKey(audioCommand[1]!,headers.get('x-room-mode')==='DISPLAY'?'DISPLAY':'PLAYER'))?.game?.events??[]).map(event=>event.seq))}:undefined;
  // Only receipt-backed commands can be safely retried after an ambiguous disconnect.
  const retryable = init?.method === "POST" && /^\/api\/rooms\/[^/]+\/(?:bots(?:\/control|\/step|\/command)?|rehearsal\/(?:clock|advance|role)|start|reset|seats|ready|resume|tutorial\/complete|role\/confirm|first-night-info\/ack|profile|action|nominate|nomination\/(?:cancel|defense\/complete)|vote|day\/(?:ready|ability)|whispers(?:\/leave|\/[^/]+\/(?:respond|messages))?|recovery|recover)$/.test(url);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const body = await response.json().catch((error: unknown) => { if (error instanceof TypeError) throw error; return { error: "服务器暂时无法响应，请稍后重试" }; }) as T & { error?: string; errorCode?: string };
      if(generation!==accountGeneration)throw new ApiError('账号已切换，旧请求结果已丢弃',409);
      if (!response.ok) throw new ApiError(body.error ?? "请求失败，请稍后重试", response.status, body.errorCode,body as {joinTicketConsumed?:boolean;profile?:GameProfile});
      const match = /^\/api\/rooms\/([^/?]+)(?:[/?]|$)/.exec(url);
      if (match && typeof body === "object" && body) {
        const view = body as ContextView;
        if (view.roomInstanceId) observeRoomView(match[1]!, view, headers.get("x-room-mode") === "DISPLAY" ? "DISPLAY" : "PLAYER",audioObservation);
        else if (view.self) {
          const key = contextKey(match[1]!), old = contexts.get(key);
          if (old && (!old.self || view.self.commandVersion >= old.self.commandVersion)) contexts.set(key, { ...old, self: view.self });
        }
      }
      return body;
    } catch (error) {
      const roomMatch=/^\/api\/rooms\/([^/?]+)(?:\/me)?(?:\?|$)/.exec(url);
      if(generation===accountGeneration&&roomMatch&&(!init?.method||init.method==='GET')&&(controller.signal.aborted||error instanceof TypeError||error instanceof ApiError&&error.status>=500))roomAudioRequestFailed(roomMatch[1]!,headers.get('x-room-mode')==='DISPLAY'?'DISPLAY':'PLAYER');
      if (controller.signal.aborted) throw new Error("请求超时，操作结果待确认，请重试原操作");
      if (!(retryable && attempt === 0 && error instanceof TypeError)) throw error;
    } finally { clearTimeout(timer); }
  }
}

export function getAuthSession() { return request<{ authorized: boolean }>("/api/auth/session"); }
export function acknowledgePresentations(code:string,body:PresentationAckRequest){return rawRequest<PresentationAckResponse>(`/api/rooms/${encodeURIComponent(code)}/presentations/ack`,{method:'POST',body:JSON.stringify(body)});}
export type AccountRoom={code:string;participantId:string;mode:'PLAYER'|'DISPLAY';nickname:string};
export type GameProfile={revision:number;nickname:string;avatar:string|null;nicknameOverride:string|null;avatarOverride:string|null;defaultNickname:string;defaultAvatar:string|null};
export type AccountAccess={signedIn:boolean;guestClaimAvailable:boolean;rooms:AccountRoom[];profile?:GameProfile};
export function getAccount(){return request<AccountAccess>('/api/account');}
export function getAvatarChoices(){return request<{avatars:Array<{id:string;url:string}>}>('/api/account/avatars');}
export function saveGameProfile(nickname:string|null,avatar:string|null,expectedRevision:number){return request<{profile:GameProfile}>('/api/account/profile',{method:'POST',body:JSON.stringify({nickname,avatar,expectedRevision})});}
export function resumeAccountRoom(room:AccountRoom){return request<{id:string;mode:'PLAYER'|'DISPLAY';code:string}>(`/api/rooms/${room.code}/account/resume`,{method:'POST',body:JSON.stringify({participantId:room.participantId})});}
export type GuestPreview={previewToken:string;code:string;nickname:string;seat:number};
export function previewGuest(code:string){return request<GuestPreview>(`/api/rooms/${code}/account/guest-preview`,{method:'POST',body:'{}'});}
export function claimGuest(preview:GuestPreview){return request<{claimed:true;code:string;id:string}>(`/api/rooms/${preview.code}/account/guest-claim`,{method:'POST',body:JSON.stringify({previewToken:preview.previewToken,confirm:true})});}
export function login(accessPassword: string) { return request<{ authorized: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ accessPassword }) }); }

export function notifyStorageFailure(){window.dispatchEvent(new Event('ravens:storage-warning'));}
export interface CreationIntent { creationVersion?:2;avatar?:string|null;expectedProfileRevision?:number;commandId:string;createTicket:string;playerCount:number;organizerName:string;playMode?:RoomPlayMode;voiceRoomUrl?:string }
const creationKey=()=>`ravens_creation:${roomSessionKey()}`;
let creationIntent:CreationIntent|undefined;
const creationFlights=new Map<string,{fingerprint:string;promise:Promise<{code:string;organizerToken:string}>}>();
export function readCreationIntent():CreationIntent|undefined {try{return creationIntent??=JSON.parse(sessionStorage.getItem(creationKey())??'null')??undefined;}catch{return creationIntent;}}
export function finishCreationIntent(){creationIntent=undefined;try{sessionStorage.removeItem(creationKey());}catch{}}
function creationWire(intent:CreationIntent){const{commandId,avatar,expectedProfileRevision,...wire}=intent;return wire;}
export function createRoom(playerCount:number,organizerName:string,playMode:RoomPlayMode='IN_PERSON',voiceRoomUrl?:string,profile?:PlayerSelection){
  const previous=readCreationIntent(),key=creationKey();
  const values=previous&&!previous.creationVersion?{playerCount,organizerName:organizerName.trim(),playMode,...(playMode!=='IN_PERSON'&&voiceRoomUrl?.trim()?{voiceRoomUrl:voiceRoomUrl.trim()}:{})}:{creationVersion:2 as const,playerCount,organizerName:organizerName.trim(),...(voiceRoomUrl?.trim()?{voiceRoomUrl:voiceRoomUrl.trim()}:{}),...(profile?{avatar:profile.avatar,...(profile.expectedProfileRevision!==undefined?{expectedProfileRevision:profile.expectedProfileRevision}:{})}:{})};
  const fingerprint=JSON.stringify(values),current=creationFlights.get(key);
  if(current)return current.fingerprint===fingerprint?current.promise:Promise.reject(new ApiError('正在创建房间，请等待原操作结果',409,'CREATION_PENDING'));
  if(previous){const{commandId,createTicket,...old}=previous;if(JSON.stringify(old)!==fingerprint)return Promise.reject(new ApiError('上次创建结果待确认，请继续原操作',409,'CREATION_PENDING'));}
  const flight={fingerprint,promise:undefined as unknown as Promise<{code:string;organizerToken:string}>};
  flight.promise=(async()=>{let intent=previous;if(!intent){const{createTicket}=await request<{createTicket:string}>('/api/room-create-ticket');intent={commandId:crypto.randomUUID(),createTicket,...values};creationIntent=intent;try{sessionStorage.setItem(key,JSON.stringify(intent));}catch{notifyStorageFailure();}}
    try{return await request<{code:string;organizerToken:string}>('/api/rooms',{method:'POST',headers:{'x-command-id':intent.commandId},body:JSON.stringify(creationWire(intent))});}
    catch(error){if(error instanceof ApiError&&error.status<500&&error.status!==429)finishCreationIntent();throw error;}
  })().finally(()=>{if(creationFlights.get(key)===flight)creationFlights.delete(key);});creationFlights.set(key,flight);return flight.promise;
}
export interface RoomSummary {code?:string;roomInstanceId:string;state:RoomView['state'];canJoin:boolean;willReplaceBot:boolean;botCount:number;activeHumanCount:number;playerCount?:number;occupiedAvatars:string[]}
export function getRoomSummary(code:string){return request<RoomSummary>(`/api/rooms/${encodeURIComponent(code)}/summary`);}
export function manageBots(code:string,intent:{count?:number;fill?:boolean;clear?:boolean}){return request<PrivateView>(`/api/rooms/${code}/bots`,{method:"POST",body:JSON.stringify(intent)});}
export function controlBots(code:string,intent:{autoNominate?:boolean;mode?:"RUNNING"|"PAUSED";pace?:"NORMAL"|"SLOW"}){return request<PrivateView>(`/api/rooms/${code}/bots/control`,{method:"POST",body:JSON.stringify(intent)});}
export function runBotCommand(code:string,command:import('@ravens/contracts').BotTestCommand,targetSeat?:number){return request<PrivateView>(`/api/rooms/${code}/bots/command`,{method:'POST',body:JSON.stringify({command,...(targetSeat!==undefined?{targetSeat}:{})})});}
export function stepBots(code:string){return request<PrivateView>(`/api/rooms/${code}/bots/step`,{method:"POST",body:"{}"});}
export function setRehearsalRole(code:string,roleId:string|null){return request<PrivateView>(`/api/rooms/${code}/rehearsal/role`,{method:"POST",body:JSON.stringify({roleId})});}
export function setRehearsalClock(code:string,mode:"WALL"|"MANUAL"){return request<PrivateView>(`/api/rooms/${code}/rehearsal/clock`,{method:"POST",body:JSON.stringify({mode})});}
export function advanceRehearsal(code:string){return request<PrivateView>(`/api/rooms/${code}/rehearsal/advance`,{method:"POST",body:"{}"});}

const joinTickets = new Map<string, string>();
type JoinProfile=Pick<PlayerSelection,'nickname'>&Partial<Omit<PlayerSelection,'nickname'>>;
const joinIntents=new Map<string,PlayerSelection>();
export type JoinResult={id:string;nickname:string;mode:'PLAYER'|'DISPLAY';seat?:number;token:string;closedRoomCode?:string};
const joinFlights=new Map<string,{fingerprint:string;promise:Promise<JoinResult>}>();
const joinKey=(code:string,mode:string)=>`ravens_join:${roomSessionKey()}:${code}:${mode}`;
export function readPendingJoin(code:string,mode:'PLAYER'|'DISPLAY'='PLAYER'):PlayerSelection|undefined {
  const transfer=readPendingRoomSwitch();if(mode==='PLAYER'&&transfer?.targetCode===code)return transfer.profile;
  const key=joinKey(code,mode);try{return joinIntents.get(key)??JSON.parse(sessionStorage.getItem(key+':intent')??'null')??undefined;}catch{return joinIntents.get(key);}
}
export function clearPendingJoin(code:string,mode:'PLAYER'|'DISPLAY'='PLAYER'){
  const key=joinKey(code,mode);joinTickets.delete(key);joinIntents.delete(key);try{sessionStorage.removeItem(key);sessionStorage.removeItem(key+':intent');}catch{}
}
export function isDefiniteJoinFailure(error:unknown){return error instanceof ApiError&&error.status<500&&(error.status===429?['JOIN_TRANSFER_CAPACITY','JOIN_TICKET_CAPACITY'].includes(error.errorCode??''):![408,425,426].includes(error.status))&&!['JOIN_PENDING','COMMAND_PENDING','CREATION_PENDING'].includes(error.errorCode??'');}
export function joinRoom(code:string,nickname:string,mode:'PLAYER'|'DISPLAY',profile?:PlayerSelection){
  if(readPendingRoomSwitch())return Promise.reject(new ApiError('换房结果待确认，请重试原操作',409,'JOIN_PENDING'));
  const key=joinKey(code,mode),old=readPendingJoin(code,mode),next={nickname,...(profile?{avatar:profile.avatar,...(profile.expectedProfileRevision!==undefined?{expectedProfileRevision:profile.expectedProfileRevision}:{})}:{})};
  if(old&&(old.nickname!==nickname||profile&&JSON.stringify(old)!==JSON.stringify(next)))return Promise.reject(new ApiError('加入结果待确认，请重试原资料',409,'JOIN_PENDING'));
  const frozen=old??next as PlayerSelection,fingerprint=JSON.stringify(frozen),active=joinFlights.get(key);
  if(active)return active.fingerprint===fingerprint?active.promise:Promise.reject(new ApiError('正在加入，请等待原操作结果',409,'JOIN_PENDING'));
  joinIntents.set(key,frozen);try{sessionStorage.setItem(key+':intent',fingerprint);}catch{notifyStorageFailure();}
  const flight={fingerprint,promise:undefined as unknown as Promise<JoinResult>};flight.promise=performJoin(code,mode,key,frozen).finally(()=>{if(joinFlights.get(key)===flight)joinFlights.delete(key);});joinFlights.set(key,flight);return flight.promise;
}
async function performJoin(code:string,mode:'PLAYER'|'DISPLAY',key:string,frozen:JoinProfile){
  let ticket=joinTickets.get(key);try{ticket??=sessionStorage.getItem(key)??undefined;}catch{}
  for(let attempt=0;attempt<2;attempt++){
    try{
      if(!ticket){ticket=(await request<{joinTicket:string}>(`/api/rooms/${code}/join-ticket?mode=${mode}`,{headers:{'x-room-mode':mode}})).joinTicket;joinTickets.set(key,ticket);try{sessionStorage.setItem(key,ticket);}catch{notifyStorageFailure();}}
      const result=await request<JoinResult>(`/api/rooms/${code}/join`,{method:'POST',headers:{'x-room-mode':mode},body:JSON.stringify({...frozen,mode,joinTicket:ticket})});
      const context=contextKey(code,mode);if(contexts.get(context)?.self?.participantId!==result.id){contexts.delete(context);pending.delete(context);tails.delete(context);unsentVotes.delete(context);}
      clearPendingJoin(code,mode);return result;
    }catch(error){
      if(error instanceof ApiError&&error.errorCode==='SETUP_CHANGED'&&attempt===0){joinTickets.delete(key);ticket=undefined;try{sessionStorage.removeItem(key);}catch{}continue;}
      if(isDefiniteJoinFailure(error))clearPendingJoin(code,mode);
      throw error;
    }
  }
  throw new ApiError('人数或座序已变化，请重新加入',409,'SETUP_CHANGED');
}

export interface RoomSwitchTicket {switchTicket:string;expiresAt:number;source:{code:string;roomInstanceId:string;state:RoomView['state'];activeHumanCount:number;playerCount:number}}
export interface PendingRoomSwitch {sourceCode:string;sourceInstance:string;targetCode:string;targetInstance:string;switchTicket:string;joinTicket:string;profile:PlayerSelection;fingerprint:string;createdAt:number}
const switchKey=()=>`ravens_room_switch:${roomSessionKey()}`;
let switchMemory:{key:string;intent:PendingRoomSwitch}|undefined;
let switchFlight:Promise<JoinResult>|undefined;
let switchPreparation:{fingerprint:string;promise:Promise<JoinResult>}|undefined;
export function readPendingRoomSwitch():PendingRoomSwitch|undefined{
  const key=switchKey();if(switchMemory?.key===key)return switchMemory.intent;
  try{const value=JSON.parse(sessionStorage.getItem(key)??'null') as PendingRoomSwitch|null;if(value&&typeof value.sourceCode==='string'&&typeof value.targetCode==='string'&&typeof value.switchTicket==='string'&&typeof value.joinTicket==='string'&&value.profile&&typeof value.profile.nickname==='string'){switchMemory={key,intent:value};return value;}}catch{}
  return undefined;
}
export function finishPendingRoomSwitch(){const key=switchKey();if(switchMemory?.key===key)switchMemory=undefined;try{sessionStorage.removeItem(key);}catch{}}
export function requestRoomSwitchTicket(source:Pick<RoomView,'code'|'roomInstanceId'>,targetCode:string,targetRoomInstanceId:string){
  return request<RoomSwitchTicket>(`/api/rooms/${source.code}/switch-ticket`,{method:'POST',headers:{'x-room-mode':'PLAYER'},body:JSON.stringify({sourceRoomInstanceId:source.roomInstanceId,targetCode,targetRoomInstanceId})});
}
export function switchRoom(source:Pick<RoomView,'code'|'roomInstanceId'>,targetCode:string,targetInstance:string,ticket:RoomSwitchTicket,profile:PlayerSelection):Promise<JoinResult>{
  const values={sourceCode:source.code,sourceInstance:source.roomInstanceId!,targetCode,targetInstance,switchTicket:ticket.switchTicket,profile},fingerprint=JSON.stringify(values);
  if(switchPreparation)return switchPreparation.fingerprint===fingerprint?switchPreparation.promise:Promise.reject(new ApiError('正在换房，请等待原操作结果',409,'JOIN_PENDING'));
  if(readPendingRoomSwitch())return Promise.reject(new ApiError('换房结果待确认，请重试原操作',409,'JOIN_PENDING'));
  const preparation={fingerprint,promise:undefined as unknown as Promise<JoinResult>};
  preparation.promise=(async()=>{
    const targetKey=joinKey(targetCode,'PLAYER');let joinTicket=joinTickets.get(targetKey);try{joinTicket??=sessionStorage.getItem(targetKey)??undefined;}catch{}
    if(!joinTicket)joinTicket=(await request<{joinTicket:string}>(`/api/rooms/${targetCode}/join-ticket?mode=PLAYER`,{headers:{'x-room-mode':'PLAYER'}})).joinTicket;
    const intent:PendingRoomSwitch={...values,joinTicket,fingerprint,createdAt:Date.now()};switchMemory={key:switchKey(),intent};try{sessionStorage.setItem(switchKey(),JSON.stringify(intent));}catch{notifyStorageFailure();}
    return retryPendingRoomSwitch();
  })().finally(()=>{if(switchPreparation===preparation)switchPreparation=undefined;});
  switchPreparation=preparation;return preparation.promise;
}

export function retryPendingRoomSwitch():Promise<JoinResult>{
  if(switchFlight)return switchFlight;
  const intent=readPendingRoomSwitch();if(!intent)return Promise.reject(new ApiError('没有待确认的换房操作',409,'NO_PENDING_SWITCH'));
  const generation=accountGeneration,key=switchKey();
  const flight=rawRequest<JoinResult>(`/api/rooms/${intent.targetCode}/join`,{method:'POST',headers:{'x-room-mode':'PLAYER'},body:JSON.stringify({...intent.profile,mode:'PLAYER',joinTicket:intent.joinTicket,switchTicket:intent.switchTicket})}).catch(error=>{if(generation===accountGeneration&&key===switchKey()&&isDefiniteJoinFailure(error))finishPendingRoomSwitch();throw error;}).finally(()=>{if(switchFlight===flight)switchFlight=undefined;});
  switchFlight=flight;return flight;
}

export function leaveRoom(code: string) { return request<{ left: true; roomDestroyed: boolean; organizerChanged: boolean }>(`/api/rooms/${code}/leave`, { method: "DELETE", body: "{}" }); }

export function getRoom(code: string, mode?: "PLAYER" | "DISPLAY") { return request<RoomView>(`/api/rooms/${code}`, mode ? { headers: { "x-room-mode": mode } } : undefined); }
export function setRoomReady(code: string, ready: boolean) { return request<RoomView>(`/api/rooms/${code}/ready`, { method: "POST", body: JSON.stringify({ ready }) }); }
export function reorderRoomSeats(code: string, participantIds: string[]) { return request<RoomView>(`/api/rooms/${code}/seats`, { method: "POST", body: JSON.stringify({ participantIds }) }); }
export function startRoom(code: string, tutorialMode: "SKIP" | "OPTIONAL" = "SKIP") { return request<RoomView>(`/api/rooms/${code}/start`, { method: "POST", body: JSON.stringify({ tutorialMode, markHostReady: true }) }); }
export function resetRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/reset`, { method: "POST", body: "{}" }); }
export function completeTutorial(code: string) { return request<RoomView>(`/api/rooms/${code}/tutorial/complete`, { method: "POST", body: "{}" }); }
export function getPrivateView(code: string) { return request<PrivateView>(`/api/rooms/${code}/me`); }
export function acknowledgeStartInfo(code:string,infoId:string){return request<PrivateView>(`/api/rooms/${code}/first-night-info/ack`,{method:'POST',body:JSON.stringify({infoId})});}
export function updateGuestProfile(code:string,nickname:string,avatar:string){return request<PrivateView>(`/api/rooms/${code}/profile`,{method:'POST',body:JSON.stringify({nickname,avatar})});}
export function confirmRole(code: string) { return request<PrivateView>(`/api/rooms/${code}/role/confirm`, { method: "POST", body: "{}" }); }
export function submitGameAction(code: string, targetSeats: number[]) { return request<PrivateView>(`/api/rooms/${code}/action`, { method: "POST", body: JSON.stringify({ targetSeats }) }); }
export function nominate(code: string, nomineeSeat: number) { return request<PrivateView>(`/api/rooms/${code}/nominate`, { method: "POST", body: JSON.stringify({ nomineeSeat }) }); }
export function cancelNomination(code: string) { return request<PrivateView>(`/api/rooms/${code}/nomination/cancel`, { method: "POST", body: "{}" }); }
export function castVote(code: string, raised: boolean) { return request<PrivateView>(`/api/rooms/${code}/vote`, { method: "POST", body: JSON.stringify({ raised }) }); }
export function readyToEndDay(code: string, ready = true) { return request<PrivateView>(`/api/rooms/${code}/day/ready`, { method: "POST", body: JSON.stringify({ ready }) }); }
export function cancelTutorialRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/tutorial/cancel`, { method: "POST", body: "{}" }); }
export function removeRoomPlayer(code: string, id: string, cancelTutorial = false) { return request<RoomView>(`/api/rooms/${code}/participants/${encodeURIComponent(id)}/remove`, { method: "POST", body: JSON.stringify({ confirm: true, cancelTutorial }) }); }
export function abortRoom(code: string) { return request<PrivateView>(`/api/rooms/${code}/abort`, { method: "POST", body: '{"confirm":true}' }); }
export function reopenRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/reopen`, { method: "POST", body: '{"confirm":true}' }); }
export function claimRoomHost(code: string, expectedOrganizerId: string) { return request<RoomView>(`/api/rooms/${code}/host/claim`, { method: "POST", body: JSON.stringify({ expectedOrganizerId }) }); }
export function useDayAbility(code: string, targetSeat: number) { return request<PrivateView>(`/api/rooms/${code}/day/ability`, { method: "POST", body: JSON.stringify({ targetSeat }) }); }
export function inviteWhisper(code: string, targetSeat: number) { return request<unknown>(`/api/rooms/${code}/whispers`, { method: "POST", body: JSON.stringify({ targetSeat }) }); }
export function respondWhisper(code: string, id: string, accept: boolean) { return request<unknown>(`/api/rooms/${code}/whispers/${encodeURIComponent(id)}/respond`, { method: "POST", body: JSON.stringify({ accept }) }); }
export function leaveWhisper(code: string) { return request<unknown>(`/api/rooms/${code}/whispers/leave`, { method: "POST", body: "{}" }); }
export function sendWhisper(code: string, id: string, text: string, onCommitted?: () => void) { return request<unknown>(`/api/rooms/${code}/whispers/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text }) }, onCommitted); }
export function createRecoveryCode(code: string) { return request<{ recoveryCode: string; expiresAt: number }>(`/api/rooms/${code}/recovery`, { method: "POST", body: "{}" }); }
export async function recoverRoom(code: string, recoveryCode: string) {
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}:${recoveryCode}`)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `ravens_recovery_attempt:${digest}`;
  let commandId: string = crypto.randomUUID();
  try { commandId = sessionStorage.getItem(key) ?? commandId; sessionStorage.setItem(key, commandId); } catch { /* The immediate retry still shares its command id. */ }
  const result = await request<{ id: string }>(`/api/rooms/${code}/recover`, { method: "POST", headers: { "x-command-id": commandId }, body: JSON.stringify({ recoveryCode }) });
  try { sessionStorage.removeItem(key);sessionStorage.removeItem(key+':intent'); } catch { /* Recovery has already succeeded. */ }
  return result;
}
export function resumeGame(code: string) { return request<PrivateView>(`/api/rooms/${code}/resume`, { method: "POST", body: "{}" }); }
export function finishDefense(code: string) { return request<PrivateView>(`/api/rooms/${code}/nomination/defense/complete`, { method: "POST", body: "{}" }); }

function currentRoomMode(): "PLAYER" | "DISPLAY" {
  try { return JSON.parse(sessionStorage.getItem(roomSessionKey()) ?? "{}").mode === "DISPLAY" ? "DISPLAY" : "PLAYER"; }
  catch { return "PLAYER"; }
}

export function getRoomResult(code: string) { return request<{ result: RoomResult | null }>(`/api/rooms/${code}/result`); }
