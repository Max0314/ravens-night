import type { ExperienceEvent, StorytellerDecision } from "@ravens/contracts";
export interface RoomParticipant { id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; connected: boolean; ready?: boolean; lastSeenAt?: number }
export type RoomPlayMode = "IN_PERSON" | "REMOTE" | "HYBRID";
export interface GameView {
  gameId?: string;
  revision?: number;
  serverNow?: number;
  presentationUntil?: number;
  phaseDeadlineAt?: number;
  pauseReason?: string;
  phase: "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER";
  day: number;
  seats: Array<{ seat: number; nickname: string; connected: boolean; alive: boolean; ghostVoteAvailable: boolean }>;
  events: Array<Partial<ExperienceEvent> & { seq: number; message: string }>;
  readyCount: number;
  aliveCount: number;
  nomination?: { nominatorSeat: number; nomineeSeat: number; votesReceived: number; votesRaised: number; threshold: number; votersRequired?: number; defenseUntil?: number; voteStartsAt?: number; voteEndsAt?: number; currentVoterSeat?: number; countedSeats?: number[]; countedVotes?: Record<number, boolean>; voterOrder?: number[]; raisedSeats?: number[]; nextCountAt?: number };
  onBlock?: { seat: number; votes: number };
  executionTied?: boolean;
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}
export interface RoomView { code: string; state: string; playerCount: number; playMode?: RoomPlayMode; voiceRoomUrl?: string; organizerId?: string; organizerName?: string; participants: RoomParticipant[]; game?: GameView; rulesSummary?: string }
export type PrivateHistoryPhase = GameView["phase"] | "HISTORY";
export type PrivateHistoryKind = "IDENTITY" | "ACTION" | "INFORMATION" | "ROLE_CHANGE" | "NOTICE";
export interface PrivateHistoryEntry {
  seq: number;
  phase: PrivateHistoryPhase;
  day: number;
  kind: PrivateHistoryKind;
  text: string;
}
export interface PrivateView {
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
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers({ "content-type": "application/json", "x-room-mode": currentRoomMode() });
  if (init?.method && init.method !== "GET") headers.set("x-command-id", crypto.randomUUID());
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const options = { ...init, credentials: "same-origin" as const, headers };
  // Only receipt-backed commands can be safely retried after an ambiguous disconnect.
  const retryable = init?.method === "POST" && /^\/api\/rooms\/[^/]+\/(?:start|reset|seats|ready|resume|tutorial\/complete|role\/confirm|action|nominate|nomination\/(?:cancel|defense\/complete)|vote|day\/(?:ready|ability)|whispers(?:\/leave|\/[^/]+\/(?:respond|messages))?|recovery|recover)$/.test(url);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch((error: unknown) => { if (error instanceof TypeError) throw error; return { error: "服务器暂时无法响应，请稍后重试" }; }) as T & { error?: string };
      if (!response.ok) throw new ApiError(body.error ?? "请求失败，请稍后重试", response.status);
      return body;
    } catch (error) { if (!(retryable && attempt === 0 && error instanceof TypeError)) throw error; }
  }
}

export function getAuthSession() { return request<{ authorized: boolean }>("/api/auth/session"); }
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
export function startRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/start`, { method: "POST", body: "{}" }); }
export function resetRoom(code: string) { return request<RoomView>(`/api/rooms/${code}/reset`, { method: "POST", body: "{}" }); }
export function completeTutorial(code: string) { return request<RoomView>(`/api/rooms/${code}/tutorial/complete`, { method: "POST", body: "{}" }); }
export function getPrivateView(code: string) { return request<PrivateView>(`/api/rooms/${code}/me`); }
export function confirmRole(code: string) { return request<PrivateView>(`/api/rooms/${code}/role/confirm`, { method: "POST", body: "{}" }); }
export function submitGameAction(code: string, targetSeats: number[]) { return request<PrivateView>(`/api/rooms/${code}/action`, { method: "POST", body: JSON.stringify({ targetSeats }) }); }
export function nominate(code: string, nomineeSeat: number) { return request<PrivateView>(`/api/rooms/${code}/nominate`, { method: "POST", body: JSON.stringify({ nomineeSeat }) }); }
export function cancelNomination(code: string) { return request<PrivateView>(`/api/rooms/${code}/nomination/cancel`, { method: "POST", body: "{}" }); }
export function castVote(code: string, raised: boolean) { return request<PrivateView>(`/api/rooms/${code}/vote`, { method: "POST", body: JSON.stringify({ raised }) }); }
export function readyToEndDay(code: string) { return request<PrivateView>(`/api/rooms/${code}/day/ready`, { method: "POST", body: "{}" }); }
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
  try { return JSON.parse(sessionStorage.getItem("ravens_room_session") ?? "{}").mode === "DISPLAY" ? "DISPLAY" : "PLAYER"; }
  catch { return "PLAYER"; }
}
