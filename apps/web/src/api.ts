import type { ExperienceEvent, StorytellerDecision, RoomProtocolView, RoomCommandContext } from "@ravens/contracts";
import {roomSessionKey} from './account-context.js';
export interface RoomParticipant { id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; connected: boolean; ready?: boolean; lastSeenAt?: number }
export type RoomPlayMode = "IN_PERSON" | "REMOTE" | "HYBRID";
export interface GameView {
  contextId?: string;
  gameId?: string;
  revision?: number;
  serverNow?: number;
  presentationUntil?: number;
  phaseDeadlineAt?: number;
  pauseReason?: string;
  phase: "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER" | "ABORTED";
  day: number;
  seats: Array<{ seat: number; nickname: string; connected: boolean; alive: boolean; ghostVoteAvailable: boolean }>;
  events: Array<Partial<ExperienceEvent> & { seq: number; message: string }>;
  readyCount: number;
  aliveCount: number;
  nomination?: { ballotId?: string; nominatorSeat: number; nomineeSeat: number; votesReceived: number; votesRaised: number; threshold: number; votersRequired?: number; defenseUntil?: number; voteStartsAt?: number; voteEndsAt?: number; currentVoterSeat?: number; countedSeats?: number[]; countedVotes?: Record<number, boolean>; voterOrder?: number[]; raisedSeats?: number[]; nextCountAt?: number };
  onBlock?: { seat: number; votes: number };
  executionTied?: boolean;
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}
export interface RoomView extends Partial<RoomProtocolView> { code: string; state: string; playerCount: number; playMode?: RoomPlayMode; voiceRoomUrl?: string; organizerId?: string; organizerName?: string; participants: RoomParticipant[]; game?: GameView; rulesSummary?: string; hostClaimAt?: number; tutorialCompleteCount?: number }
export type PrivateHistoryPhase = GameView["phase"] | "HISTORY";
export type PrivateHistoryKind = "IDENTITY" | "ACTION" | "INFORMATION" | "ROLE_CHANGE" | "NOTICE";
export interface PrivateHistoryEntry {
  seq: number;
  phase: PrivateHistoryPhase;
  day: number;
  kind: PrivateHistoryKind;
  text: string;
}
export interface PrivateView extends Partial<RoomProtocolView> {
  contextId?: string;
  dayReady?: boolean;
  canCancelNomination?: boolean;
  canAbort?: boolean;
  canRestart?: boolean;
  canCancelTutorial?: boolean;
  canClaimHost?: boolean;
  butler?: { masterSeat?: number; masterRaised: boolean };
  social?: { invitations: Array<{ id: string; fromSeat: number; toSeat: number; status: string; createdAt: number }>; activeWhisper?: { id: string; participants: number[]; messages: Array<{ id: string; seat: number; text: string; createdAt: number }> } };
  participant: { id: string; nickname: string; seat: number; tutorialComplete?: boolean };
  storytellerDecisions?: StorytellerDecision[];
  state: string;
  playMode?: RoomPlayMode;
  voiceRoomUrl?: string;
  canClaimSlayer?: boolean;
  dayAbilityTargets?: number[];
  canNominate?: boolean;
  nominationTargets?: number[];
  canVote?: boolean;
  canEndDay?: boolean;
  canFinishDefense?: boolean;
  role?: { roleId: string; alignment: "GOOD" | "EVIL"; type: string; name: string; summary: string; beginnerTip: string; perceivedAs?: string };
  roleConfirmed?: boolean;
  voteRaised?: boolean;
  messages: string[];
  history: PrivateHistoryEntry[];
  game?: GameView;
  action?: { kind: "CONFIRM_ROLE" | "SELECT_ONE" | "SELECT_TWO" | "VOTE" | "DAY" | "SLAYER"; legalSeats: number[]; minTargets: number; maxTargets: number; prompt: string };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode?: string) { super(message); this.name = "ApiError"; }
}
let accountGeneration=0;
type ContextView = Partial<RoomProtocolView> & { contextId?: string; game?: GameView };
const contexts = new Map<string, ContextView>();
const tails = new Map<string, Promise<unknown>>();
interface Intent { url: string; init: RequestInit; body: Record<string, unknown>; binding: Omit<RoomCommandContext, "expectedCommandVersion">; generation: number; sent: boolean; promise?: Promise<unknown> }
const unsentVotes = new Map<string, Intent>();
const pending = new Map<string, Intent>();
const contextKey = (code: string, mode = currentRoomMode()) => `${code.toUpperCase()}:${mode}`;
export function resetAccountContext(){accountGeneration++; contexts.clear(); tails.clear(); pending.clear(); unsentVotes.clear();}
export function observeRoomView(code: string, incoming: ContextView, mode = currentRoomMode()) {
  const key = contextKey(code, mode), previous = contexts.get(key);
  if (!incoming.roomInstanceId || !incoming.self) return;
  if (previous?.roomInstanceId === incoming.roomInstanceId && (incoming.revision ?? 0) < (previous.revision ?? 0)) return;
  contexts.set(key, incoming);
}

function commandBinding(code: string, path: string): Omit<RoomCommandContext, "expectedCommandVersion"> {
  const view = contexts.get(contextKey(code));
  if (!view?.roomInstanceId || !view.setupId || !view.self) throw new ApiError("正在同步房间，请稍后重新操作", 409, "SYNC_REQUIRED");
  const base = { roomInstanceId: view.roomInstanceId, setupId: view.setupId };
  if (["vote", "nomination/cancel", "nomination/defense/complete"].includes(path))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...(view.game?.nomination?.ballotId ? { ballotId: view.game.nomination.ballotId } : {}) };
  if (["role/confirm", "action", "nominate", "day/ready", "day/ability", "resume", "abort", "reopen", "reset"].includes(path) || path.startsWith("whispers"))
    return { ...base, ...(view.game?.gameId ? { gameId: view.game.gameId } : {}), ...((view.contextId ?? view.game?.contextId) ? { contextId: (view.contextId ?? view.game?.contextId)! } : {}) };
  return base;
}

const memberPath = (url: string) => /^\/api\/rooms\/([^/]+)\/(.+)$/.exec(url);
function isMemberWrite(url: string, init?: RequestInit) {
  const match = memberPath(url);
  return match && init?.method && !["GET", "HEAD"].includes(init.method) && !/^(join|recover|account\/)/.test(match[2]!) ? match : undefined;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const match = isMemberWrite(url, init);
  if (!match) return rawRequest<T>(url, init);
  const code = match[1]!, path = match[2]!, key = contextKey(code), binding = commandBinding(code, path);
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  const old = unsentVotes.get(key);
  if (path === "vote" && old && !old.sent && JSON.stringify(old.binding) === JSON.stringify(binding)) {
    old.body = body;
    return old.promise as Promise<T>;
  }
  const intent: Intent = { url, init: { ...init, headers: { "x-command-id": crypto.randomUUID() } }, body, binding, generation: accountGeneration, sent: false };
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
  });
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
    return result;
  } catch (error) {
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
  const headers = new Headers({ "content-type": "application/json", "x-room-mode": currentRoomMode(), "x-ravens-protocol": "2" });
  if (init?.method && init.method !== "GET") headers.set("x-command-id", crypto.randomUUID());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const options = { ...init, credentials: "same-origin" as const, headers };
  // Only receipt-backed commands can be safely retried after an ambiguous disconnect.
  const retryable = init?.method === "POST" && /^\/api\/rooms\/[^/]+\/(?:start|reset|seats|ready|resume|tutorial\/complete|role\/confirm|action|nominate|nomination\/(?:cancel|defense\/complete)|vote|day\/(?:ready|ability)|whispers(?:\/leave|\/[^/]+\/(?:respond|messages))?|recovery|recover)$/.test(url);
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const body = await response.json().catch((error: unknown) => { if (error instanceof TypeError) throw error; return { error: "服务器暂时无法响应，请稍后重试" }; }) as T & { error?: string; errorCode?: string };
      if(generation!==accountGeneration)throw new ApiError('账号已切换，旧请求结果已丢弃',409);
      if (!response.ok) throw new ApiError(body.error ?? "请求失败，请稍后重试", response.status, body.errorCode);
      const match = memberPath(url);
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
export type AccountAccess={signedIn:boolean;guestClaimAvailable:boolean;rooms:AccountRoom[]};
export function getAccount(){return request<AccountAccess>('/api/account');}
export function resumeAccountRoom(room:AccountRoom){return request<{id:string;mode:'PLAYER'|'DISPLAY';code:string}>(`/api/rooms/${room.code}/account/resume`,{method:'POST',body:JSON.stringify({participantId:room.participantId})});}
export type GuestPreview={previewToken:string;code:string;nickname:string;seat:number};
export function previewGuest(code:string){return request<GuestPreview>(`/api/rooms/${code}/account/guest-preview`,{method:'POST',body:'{}'});}
export function claimGuest(preview:GuestPreview){return request<{claimed:true;code:string;id:string}>(`/api/rooms/${preview.code}/account/guest-claim`,{method:'POST',body:JSON.stringify({previewToken:preview.previewToken,confirm:true})});}
export function login(accessPassword: string) { return request<{ authorized: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ accessPassword }) }); }

export function createRoom(playerCount: number, organizerName: string, playMode: RoomPlayMode, voiceRoomUrl?: string) {
  return request<{ code: string; organizerToken: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ playerCount, organizerName, playMode, ...(voiceRoomUrl?.trim() ? { voiceRoomUrl: voiceRoomUrl.trim() } : {}) }) });
}

export function joinRoom(code: string, nickname: string, mode: "PLAYER" | "DISPLAY") {
  return request<{ id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; token: string }>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname, mode }) });
}

export function leaveRoom(code: string) { return request<{ left: true; roomDestroyed: boolean; organizerChanged: boolean }>(`/api/rooms/${code}/leave`, { method: "DELETE", body: "{}" }); }

export function getRoom(code: string, mode?: "PLAYER" | "DISPLAY") { return request<RoomView>(`/api/rooms/${code}`, mode ? { headers: { "x-room-mode": mode } } : undefined); }
export function setRoomReady(code: string, ready: boolean) { return request<RoomView>(`/api/rooms/${code}/ready`, { method: "POST", body: JSON.stringify({ ready }) }); }
export function reorderRoomSeats(code: string, participantIds: string[]) { return request<RoomView>(`/api/rooms/${code}/seats`, { method: "POST", body: JSON.stringify({ participantIds }) }); }
export function startRoom(code: string, tutorialMode: "SKIP" | "OPTIONAL" = "SKIP") { return request<RoomView>(`/api/rooms/${code}/start`, { method: "POST", body: JSON.stringify({ tutorialMode, markHostReady: true }) }); }
export function resetRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/reset`, { method: "POST", body: "{}" }); }
export function completeTutorial(code: string) { return request<RoomView>(`/api/rooms/${code}/tutorial/complete`, { method: "POST", body: "{}" }); }
export function getPrivateView(code: string) { return request<PrivateView>(`/api/rooms/${code}/me`); }
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
export function sendWhisper(code: string, id: string, text: string) { return request<unknown>(`/api/rooms/${code}/whispers/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ text }) }); }
export function createRecoveryCode(code: string) { return request<{ recoveryCode: string; expiresAt: number }>(`/api/rooms/${code}/recovery`, { method: "POST", body: "{}" }); }
export async function recoverRoom(code: string, recoveryCode: string) {
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}:${recoveryCode}`)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `ravens_recovery_attempt:${digest}`;
  let commandId: string = crypto.randomUUID();
  try { commandId = sessionStorage.getItem(key) ?? commandId; sessionStorage.setItem(key, commandId); } catch { /* The immediate retry still shares its command id. */ }
  const result = await request<{ id: string }>(`/api/rooms/${code}/recover`, { method: "POST", headers: { "x-command-id": commandId }, body: JSON.stringify({ recoveryCode }) });
  try { sessionStorage.removeItem(key); } catch { /* Recovery has already succeeded. */ }
  return result;
}
export function resumeGame(code: string) { return request<PrivateView>(`/api/rooms/${code}/resume`, { method: "POST", body: "{}" }); }
export function finishDefense(code: string) { return request<PrivateView>(`/api/rooms/${code}/nomination/defense/complete`, { method: "POST", body: "{}" }); }

function currentRoomMode(): "PLAYER" | "DISPLAY" {
  try { return JSON.parse(sessionStorage.getItem(roomSessionKey()) ?? "{}").mode === "DISPLAY" ? "DISPLAY" : "PLAYER"; }
  catch { return "PLAYER"; }
}
