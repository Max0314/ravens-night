import type { PrivateView, RoomView } from "./api.js";
export interface RoomPacket { type: "view"; room: RoomView; privateView?: PrivateView; serverNow: number }

/** Cookie-authenticated updates, with bounded reconnect and an HTTP polling fallback. */
export function connectRoomFeed(code: string, mode: "PLAYER" | "DISPLAY", receive: (packet: RoomPacket) => void): () => void {
  if (typeof WebSocket === "undefined") return () => undefined;
  let stopped = false; let socket: WebSocket | undefined; let retry: number | undefined; let heartbeat: number | undefined; let backoff = 1_000;
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${encodeURIComponent(code)}/live?mode=${mode}`);
    socket.onopen = () => { backoff = 1_000; heartbeat = window.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send("ping"); }, 15_000); };
    socket.onmessage = (event) => { if (stopped) return; try { const packet = JSON.parse(String(event.data)) as RoomPacket; if (packet.type === "view" && packet.room) receive(packet); } catch { /* Polling will repair an invalid packet. */ } };
    socket.onclose = (event) => { if (heartbeat !== undefined) window.clearInterval(heartbeat); if (!stopped && event.code !== 1008) { retry = window.setTimeout(connect, backoff); backoff = Math.min(15_000, backoff * 2); } };
    socket.onerror = () => { /* The close callback owns retries; avoid concurrent sockets. */ };
  };
  connect();
  return () => { stopped = true; if (retry !== undefined) window.clearTimeout(retry); if (heartbeat !== undefined) window.clearInterval(heartbeat); socket?.close(); };
}
