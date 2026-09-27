import { randomUUID, randomBytes } from "node:crypto";
import { hashOpaqueToken } from "../auth/session.js";
import type { RoomRecord, ParticipantRecord, RoomService } from "./service.js";
interface WhisperMessage { id: string; authorId: string; text: string; createdAt: number; }
interface Whisper { id: string; fromId: string; toId: string; status: "PENDING" | "ACTIVE" | "DECLINED" | "CLOSED"; createdAt: number; messages: WhisperMessage[]; }
interface Recovery { hash: string; participantId: string; expiresAt: number; }
interface RecoveryResult { id: string; nickname: string; mode: "PLAYER" | "DISPLAY"; seat: number | undefined; token: string; }
interface RecoveryReceipt { key: string; expiresAt: number; result: RecoveryResult; }
interface Social { whispers: Whisper[]; recovery: Recovery[]; recoveryReceipts?: RecoveryReceipt[]; }
function data(room: RoomRecord): Social { return (room.metadata?.social as Social | undefined) ?? { whispers: [], recovery: [] }; }
function update(room: RoomRecord, value: Social): void { room.metadata = { ...room.metadata, social: value }; room.revision += 1; room.lastActivityAt = new Date().toISOString(); }
export function member(room: RoomRecord, token: string, mode?: "PLAYER" | "DISPLAY"): ParticipantRecord {
  const participant = room.participants.find((p) => p.tokenHash === hashOpaqueToken(token) && !p.left);
  if (!participant || (mode && participant.mode !== mode)) throw new Error("Player authorization failed");
  return participant;
}
function canTalk(room: RoomRecord): void { if (room.game && ["FIRST_NIGHT", "OTHER_NIGHT", "ROLE_REVEAL"].includes(room.game.phase)) throw new Error("夜间请保持安静，天亮后可以继续耳语"); }
export function socialView(room: RoomRecord, token: string) {
  const id = member(room, token, "PLAYER").id;
  const seatFor = (participantId: string) => room.participants.find((p) => p.id === participantId)?.seat ?? 0;
  const whispers = data(room).whispers.filter((w) => w.fromId === id || w.toId === id);
  const active = whispers.find((w) => w.status === "ACTIVE");
  return { social: { invitations: whispers.filter((w) => w.status === "PENDING").map((w) => ({ id: w.id, fromSeat: seatFor(w.fromId), toSeat: seatFor(w.toId), status: w.status, createdAt: w.createdAt })), ...(active ? { activeWhisper: { id: active.id, participants: [seatFor(active.fromId), seatFor(active.toId)], messages: active.messages.map((m) => ({ id: m.id, seat: seatFor(m.authorId), text: m.text, createdAt: m.createdAt })) } } : {}) } };
}
export function inviteWhisper(room: RoomRecord, token: string, targetSeat: number): void {
  canTalk(room);
  const actor = member(room, token, "PLAYER");
  const target = room.participants.find((p) => p.mode === "PLAYER" && p.seat === targetSeat && !p.left);
  if (actor.seat === targetSeat || !target) throw new Error("请选择房间内的另一名玩家");
  const social = data(room);
  if (social.whispers.some((w) => ["ACTIVE", "PENDING"].includes(w.status) && [w.fromId, w.toId].some((id) => id === actor.id || id === target.id))) throw new Error("有一方已有耳语或邀请，请先结束当前交流");
  social.whispers.push({ id: randomUUID(), fromId: actor.id, toId: target.id, status: "PENDING", createdAt: Date.now(), messages: [] });
  social.whispers = social.whispers.slice(-80);
  update(room, social);
}
export function respondWhisper(room: RoomRecord, token: string, id: string, accept: boolean): void {
  canTalk(room);
  const idOfPlayer = member(room, token, "PLAYER").id;
  const social = data(room);
  const whisper = social.whispers.find((w) => w.id === id && w.toId === idOfPlayer && w.status === "PENDING");
  if (!whisper) throw new Error("邀请已失效");
  whisper.status = accept ? "ACTIVE" : "DECLINED";
  update(room, social);
}
export function leaveWhisper(room: RoomRecord, token: string): void {
  const idOfPlayer = member(room, token, "PLAYER").id;
  const social = data(room);
  for (const whisper of social.whispers) if ([whisper.fromId, whisper.toId].includes(idOfPlayer) && ["ACTIVE", "PENDING"].includes(whisper.status)) whisper.status = "CLOSED";
  update(room, social);
}
export function sendWhisper(room: RoomRecord, token: string, id: string, text: string): void {
  canTalk(room);
  const idOfPlayer = member(room, token, "PLAYER").id;
  const social = data(room);
  const whisper = social.whispers.find((w) => w.id === id && [w.fromId, w.toId].includes(idOfPlayer) && w.status === "ACTIVE");
  if (!whisper) throw new Error("耳语已经结束");
  const content = text.trim();
  if (!content || content.length > 500) throw new Error("耳语内容应为 1–500 个字");
  whisper.messages.push({ id: randomUUID(), authorId: idOfPlayer, text: content, createdAt: Date.now() });
  whisper.messages = whisper.messages.slice(-100);
  update(room, social);
}
export function createRecovery(room: RoomRecord, token: string) {
  const participant = member(room, token, "PLAYER");
  const social = data(room);
  const recoveryCode = randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + 10 * 60_000;
  social.recovery = social.recovery.filter((r) => r.participantId !== participant.id && r.expiresAt > Date.now());
  social.recoveryReceipts = (social.recoveryReceipts ?? []).filter((r) => r.result.id !== participant.id && r.expiresAt > Date.now());
  social.recovery.push({ hash: hashOpaqueToken(recoveryCode), participantId: participant.id, expiresAt });
  update(room, social);
  return { recoveryCode, expiresAt };
}
export function recoverMembership(service: RoomService, code: string, recoveryCode: string, commandId?: string): RecoveryResult {
  const room = service.find(code);
  const social = data(room);
  const receiptKey = commandId ? hashOpaqueToken(`${recoveryCode}:${commandId}`) : undefined;
  const receipt = receiptKey ? social.recoveryReceipts?.find((r) => r.key === receiptKey && r.expiresAt > Date.now()) : undefined;
  if (receipt) {
    const participant = member(room, receipt.result.token, "PLAYER");
    return { ...receipt.result, seat: participant.seat, nickname: participant.nickname };
  }
  const entry = social.recovery.find((r) => r.hash === hashOpaqueToken(recoveryCode) && r.expiresAt > Date.now());
  if (!entry) throw new Error("恢复码无效或已过期");
  const participant = room.participants.find((p) => p.id === entry.participantId && !p.left);
  if (!participant) throw new Error("原座位已离开房间");
  const token = randomBytes(32).toString("base64url");
  const oldHash = participant.tokenHash;
  participant.tokenHash = hashOpaqueToken(token);
  participant.connected = true;
  participant.lastSeenAt = Date.now();
  if (room.organizerTokenHash === oldHash || room.organizerParticipantId === participant.id) room.organizerTokenHash = participant.tokenHash;
  social.recovery = social.recovery.filter((r) => r.participantId !== participant.id);
  const result = { id: participant.id, nickname: participant.nickname, mode: participant.mode, seat: participant.seat, token };
  if (receiptKey) {
    social.recoveryReceipts = (social.recoveryReceipts ?? []).filter((r) => r.result.id !== participant.id && r.expiresAt > Date.now());
    social.recoveryReceipts.push({ key: receiptKey, expiresAt: entry.expiresAt, result });
  }
  update(room, social);
  return result;
}
