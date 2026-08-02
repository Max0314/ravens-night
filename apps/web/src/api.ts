export interface RoomParticipant { id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; connected: boolean }
export interface GameView {
  phase: "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER";
  day: number;
  seats: Array<{ seat: number; nickname: string; connected: boolean; alive: boolean; ghostVoteAvailable: boolean }>;
  events: Array<{ seq: number; message: string }>;
  readyCount: number;
  aliveCount: number;
  nomination?: { nominatorSeat: number; nomineeSeat: number; votesReceived: number; votesRaised: number; threshold: number };
  onBlock?: { seat: number; votes: number };
  executionTied?: boolean;
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}
export interface RoomView { code: string; state: string; playerCount: number; organizerId?: string; organizerName?: string; participants: RoomParticipant[]; game?: GameView }
export interface PrivateView {
  participant: { id: string; nickname: string; seat: number };
  state: string;
  role?: { roleId: string; alignment: "GOOD" | "EVIL"; type: string; name: string; summary: string; beginnerTip: string; perceivedAs?: string };
  roleConfirmed?: boolean;
  voteRaised?: boolean;
  messages: string[];
  game?: GameView;
  action?: { kind: "CONFIRM_ROLE" | "SELECT_ONE" | "SELECT_TWO" | "VOTE" | "DAY" | "SLAYER"; legalSeats: number[]; minTargets: number; maxTargets: number; prompt: string };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "请求失败，请稍后重试", response.status);
  return body;
}

export function getAuthSession() { return request<{ authorized: boolean }>("/api/auth/session"); }
export function login(accessPassword: string) { return request<{ authorized: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ accessPassword }) }); }

export function createRoom(playerCount: number, organizerName: string) {
  return request<{ code: string; organizerToken: string }>("/api/rooms", { method: "POST", body: JSON.stringify({ playerCount, organizerName }) });
}

export function joinRoom(code: string, nickname: string, mode: "PLAYER" | "DISPLAY") {
  return request<{ id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat?: number; token: string }>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname, mode }) });
}

export function leaveRoom(code: string) { return request<{ left: true; roomDestroyed: boolean; organizerChanged: boolean }>(`/api/rooms/${code}/leave`, { method: "DELETE", body: "{}" }); }

export function getRoom(code: string) { return request<RoomView>(`/api/rooms/${code}`); }
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
