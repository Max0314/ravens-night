import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashOpaqueToken } from "../auth/session.js";
import type { ParticipantMode, RoomRecord } from "./service.js";
import { RoomError, TICKET_MS } from "./errors.js";
interface JoinTicket { roomInstanceId: string; setupId: string; mode: ParticipantMode; issuedAt: number; expiresAt: number; nonce: string; }
const sign = (value: string, secret: string) => createHmac("sha256", secret).update("ravens-join-v2:" + value).digest("base64url");
export function issueJoinTicket(room: RoomRecord, mode: ParticipantMode, now: number, secret: string) {
  const payload = Buffer.from(JSON.stringify({ roomInstanceId: room.roomInstanceId, setupId: room.setupId, mode, issuedAt: now, expiresAt: now + TICKET_MS, nonce: randomBytes(32).toString("base64url") } satisfies JoinTicket)).toString("base64url");
  return { joinTicket: payload + "." + sign(payload, secret), expiresAt: now + TICKET_MS };
}
/** Verify the bearer and its room binding without treating an already committed retry as a new join. */
export function parseJoinTicket(raw: string, room: RoomRecord, mode: ParticipantMode, secret: string) {
  const [payload, signature, ...extra] = raw.split(".");
  const expected = payload ? sign(payload, secret) : "";
  if (!payload || !signature || extra.length || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new RoomError("JOIN_TICKET_INVALID", "加入凭据无效，请重新打开邀请", 400);
  let ticket: JoinTicket;
  try { ticket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JoinTicket; }
  catch { throw new RoomError("JOIN_TICKET_INVALID", "加入凭据无效", 400); }
  if(typeof ticket.roomInstanceId!=="string"||typeof ticket.setupId!=="string"||typeof ticket.nonce!=="string"||!["PLAYER","DISPLAY"].includes(ticket.mode)||!Number.isFinite(ticket.issuedAt)||ticket.expiresAt!==ticket.issuedAt+TICKET_MS)throw new RoomError("JOIN_TICKET_INVALID","加入凭据无效",400);
  if(ticket.roomInstanceId!==room.roomInstanceId||ticket.mode!==mode)throw new RoomError("ROOM_INSTANCE_CHANGED","目标房间已变化，请重新打开邀请");
  const hash=hashOpaqueToken(raw);
  return {...ticket,hash,token:createHmac("sha256",secret).update(`ravens-guest-v2:${room.roomInstanceId}:${hash}`).digest("base64url")};
}
export function validateJoinTicket(raw: string, room: RoomRecord, mode: ParticipantMode, now: number, secret: string) {
  const ticket=parseJoinTicket(raw,room,mode,secret);
  if(ticket.expiresAt<=now||ticket.issuedAt>now)throw new RoomError("JOIN_TICKET_EXPIRED", "加入凭据已过期，请使用账号或恢复码恢复原座位");
  const hash=ticket.hash;
  const revoked = room.metadata?.revokedJoinTickets as Record<string, number> | undefined;
  if ((revoked?.[hash] ?? 0) > now) throw new RoomError("JOIN_TICKET_REVOKED", "原加入凭据已撤销，请重新加入");
  return ticket;
}
export function assertJoinCapacity(room: RoomRecord, now: number): void {
  const revoked = Object.fromEntries(Object.entries(room.metadata?.revokedJoinTickets as Record<string, number> ?? {}).filter(([, expiry]) => expiry > now));
  room.metadata = { ...room.metadata, revokedJoinTickets: revoked };
  const active = room.participants.filter(p => (p.joinTicket?.expiresAt ?? 0) > now).length;
  if (active + Object.keys(revoked).length >= 256) throw new RoomError("JOIN_TICKET_CAPACITY", "加入操作较多，请稍后再试", 429);
}
export function revokeJoinTicket(room: RoomRecord, id: string): void {
  const participant = room.participants.find(p => p.id === id);
  if (!participant?.joinTicket) return;
  room.metadata = { ...room.metadata, revokedJoinTickets: { ...room.metadata?.revokedJoinTickets as object, [participant.joinTicket.hash]: participant.joinTicket.expiresAt } };
  delete participant.joinTicket;
}
