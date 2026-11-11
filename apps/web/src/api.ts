import type {PlayerSelection} from './use-player-profile.js';
import type { ExperienceEvent, StorytellerDecision, RoomProtocolView, RoomCommandContext } from "@ravens/contracts";
import {roomSessionKey} from './account-context.js';
import { isOlderSnapshot } from "./snapshot-order.js";
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
export function resetAccountContext(){accountGeneration++; contexts.clear(); tails.clear(); pending.clear(); unsentVotes.clear(); joinTickets.clear(); joinIntents.clear();joinFlights.clear(); creationIntent=undefined; creationFlights.clear();}
export function observeRoomView(code: string, incoming: ContextView, mode = currentRoomMode()) {
  const key = contextKey(code, mode), previous = contexts.get(key);
  if (!incoming.roomInstanceId || !incoming.self) return;
  if (isOlderSnapshot(incoming, previous)) return;
  contexts.set(key, incoming);
}

function commandBinding(code: string, path: string): Omit<RoomCommandContext, "expectedCommandVersion"> {
  const view = contexts.get(contextKey(code));
  if (!view?.roomInstanceId || !view.setupId || !view.self) throw new ApiError("正在同步房间，请稍后重新操作", 409, "SYNC_REQUIRED");
  const base = { roomInstanceId: view.roomInstanceId, setupId: view.setupId };
  if (["bots/step", "rehearsal/advance"].includes(path)) return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId, contextId: view.game.contextId } : {}), ...(view.game?.nomination?.ballotId ? { ballotId: view.game.nomination.ballotId } : {}) };
  if (["vote", "nomination/cancel", "nomination/defense/complete"].includes(path))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...(view.game?.nomination?.ballotId ? { ballotId: view.game.nomination.ballotId } : {}) };
  if (["role/confirm", "first-night-info/ack", "action", "nominate", "day/ready", "day/ability", "resume", "abort", "reopen", "reset"].includes(path) || path.startsWith("whispers"))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...((view.contextId ?? view.game?.contextId) ? { contextId: (view.contextId ?? view.game?.contextId)! } : {}) };
  return base;
}

const memberPath = (url: string) => /^\/api\/rooms\/([^/]+)\/(.+)$/.exec(url);
function isMemberWrite(url: string, init?: RequestInit) {
  const match = memberPath(url);
  return match && init?.method && !["GET", "HEAD"].includes(init.method) && !/^(?:join$|recover$|account\/)/.test(match[2]!) ? match : undefined;
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
  const headers = new Headers({ "content-type": "application/json", "x-room-mode": currentRoomMode(), "x-ravens-protocol": "4" });
  if (init?.method && init.method !== "GET") headers.set("x-command-id", crypto.randomUUID());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const options = { ...init, credentials: "same-origin" as const, headers };
  // Only receipt-backed commands can be safely retried after an ambiguous disconnect.
  const retryable = init?.method === "POST" && /^\/api\/rooms\/[^/]+\/(?:bots(?:\/control|\/step)?|rehearsal\/(?:clock|advance)|start|reset|seats|ready|resume|tutorial\/complete|role\/confirm|first-night-info\/ack|profile|action|nominate|nomination\/(?:cancel|defense\/complete)|vote|day\/(?:ready|ability)|whispers(?:\/leave|\/[^/]+\/(?:respond|messages))?|recovery|recover)$/.test(url);
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
        if (view.roomInstanceId) observeRoomView(match[1]!, view, headers.get("x-room-mode") === "DISPLAY" ? "DISPLAY" : "PLAYER");
        else if (view.self) {
          const key = contextKey(match[1]!), old = contexts.get(key);
          if (old && (!old.self || view.self.commandVersion >= old.self.commandVersion)) contexts.set(key, { ...old, self: view.self });
        }
      }
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("请求超时，操作结果待确认，请重试原操作");
      if (!(retryable && attempt === 0 && error instanceof TypeError)) throw error;
    } finally { clearTimeout(timer); }
  }
}

export function getAuthSession() { return request<{ authorized: boolean }>("/api/auth/session"); }
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
export function getRoomSummary(code:string){return request<{canJoin:boolean;willReplaceBot:boolean;botCount:number;activeHumanCount:number}>(`/api/rooms/${encodeURIComponent(code)}/summary`);}
export function manageBots(code:string,intent:{count?:number;fill?:boolean;clear?:boolean}){return request<PrivateView>(`/api/rooms/${code}/bots`,{method:"POST",body:JSON.stringify(intent)});}
export function controlBots(code:string,intent:{mode?:"RUNNING"|"PAUSED";pace?:"NORMAL"|"SLOW"}){return request<PrivateView>(`/api/rooms/${code}/bots/control`,{method:"POST",body:JSON.stringify(intent)});}
export function stepBots(code:string){return request<PrivateView>(`/api/rooms/${code}/bots/step`,{method:"POST",body:"{}"});}
export function setRehearsalClock(code:string,mode:"WALL"|"MANUAL"){return request<PrivateView>(`/api/rooms/${code}/rehearsal/clock`,{method:"POST",body:JSON.stringify({mode})});}
export function advanceRehearsal(code:string){return request<PrivateView>(`/api/rooms/${code}/rehearsal/advance`,{method:"POST",body:"{}"});}

const joinTickets = new Map<string, string>();
const joinIntents=new Map<string,PlayerSelection>();
type JoinResult={id:string;nickname:string;mode:'PLAYER'|'DISPLAY';seat?:number;token:string};
const joinFlights=new Map<string,{fingerprint:string;promise:Promise<JoinResult>}>();
const joinKey=(code:string,mode:string)=>`ravens_join:${roomSessionKey()}:${code}:${mode}`;
export function readPendingJoin(code:string,mode:'PLAYER'|'DISPLAY'='PLAYER'):PlayerSelection|undefined {const key=joinKey(code,mode);try{return joinIntents.get(key)??JSON.parse(sessionStorage.getItem(key+':intent')??'null')??undefined;}catch{return joinIntents.get(key);}}
export function joinRoom(code:string,nickname:string,mode:'PLAYER'|'DISPLAY',profile?:PlayerSelection){
  const key=joinKey(code,mode),old=readPendingJoin(code,mode),next={nickname,...(profile?{avatar:profile.avatar,...(profile.expectedProfileRevision!==undefined?{expectedProfileRevision:profile.expectedProfileRevision}:{})}:{})};
  if(old&&(old.nickname!==nickname||profile&&JSON.stringify(old)!==JSON.stringify(next)))return Promise.reject(new ApiError('加入结果待确认，请重试原资料',409,'JOIN_PENDING'));
  const frozen=old??next as PlayerSelection,fingerprint=JSON.stringify(frozen),active=joinFlights.get(key);
  if(active)return active.fingerprint===fingerprint?active.promise:Promise.reject(new ApiError('正在加入，请等待原操作结果',409,'JOIN_PENDING'));
  joinIntents.set(key,frozen);try{sessionStorage.setItem(key+':intent',fingerprint);}catch{notifyStorageFailure();}
  const flight={fingerprint,promise:undefined as unknown as Promise<JoinResult>};flight.promise=performJoin(code,mode,key,frozen).finally(()=>{if(joinFlights.get(key)===flight)joinFlights.delete(key);});joinFlights.set(key,flight);return flight.promise;
}
async function performJoin(code:string,mode:'PLAYER'|'DISPLAY',key:string,frozen:PlayerSelection){
  let ticket = joinTickets.get(key);
  try { ticket ??= sessionStorage.getItem(key) ?? undefined; } catch { /* In-memory retry remains available. */ }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!ticket) {
      ticket = (await request<{ joinTicket: string }>(`/api/rooms/${code}/join-ticket?mode=${mode}`, { headers: { "x-room-mode": mode } })).joinTicket;
      joinTickets.set(key, ticket);
      try { sessionStorage.setItem(key, ticket); } catch { /* Cookie recovery remains available. */ }
    }
    try {
      const result = await request<{ id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; token: string }>(`/api/rooms/${code}/join`, { method: "POST", headers: { "x-room-mode": mode }, body: JSON.stringify({ ...frozen, mode, joinTicket: ticket }) });
      const context=contextKey(code,mode);
      if(contexts.get(context)?.self?.participantId !== result.id){contexts.delete(context);pending.delete(context);tails.delete(context);unsentVotes.delete(context);}
      joinTickets.delete(key);joinIntents.delete(key);
      try { sessionStorage.removeItem(key);sessionStorage.removeItem(key+':intent'); } catch { /* The seat is already committed. */ }
      return result;
    } catch (error) {
      if(error instanceof ApiError&&['PROFILE_STALE','NICKNAME_TAKEN'].includes(error.errorCode??'')){joinTickets.delete(key);joinIntents.delete(key);try{sessionStorage.removeItem(key);sessionStorage.removeItem(key+':intent');}catch{}}
      if (error instanceof ApiError && ["SETUP_CHANGED", "JOIN_TICKET_EXPIRED", "JOIN_TICKET_REVOKED"].includes(error.errorCode ?? "")) {
        joinTickets.delete(key); ticket = undefined;
        try { sessionStorage.removeItem(key);sessionStorage.removeItem(key+':intent'); } catch { /* Retry still has the in-memory decision. */ }
        // Only a confirmed unused setup conflict may obtain another ticket automatically.
        if (error.errorCode === "SETUP_CHANGED" && attempt === 0) continue;
      }
      throw error;
    }
  }
  throw new ApiError("人数或座序已变化，请重新加入", 409, "SETUP_CHANGED");
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
