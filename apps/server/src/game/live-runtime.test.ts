import { describe, expect, test } from "vitest";
import { LiveRoomRuntime, type RoomRepository } from "./live-runtime.js";
import { RoomService, type RoomRecord } from "../rooms/service.js";
import { SnapshotCodec } from "../db/room-repository.js";
import { createRecovery, inviteWhisper, member, recoverMembership, respondWhisper, sendWhisper, socialView } from "../rooms/social.js";

class MemoryRepository implements RoomRepository {
  records = new Map<string, RoomRecord>(); writes = 0; fail = false;
  async initialize() {}
  async loadAll() { return [...this.records.values()].map((r) => structuredClone(r)); }
  async commit(changed: RoomRecord[], deleted: string[]) {
    if (this.fail) throw new Error("database unavailable");
    this.writes += 1;
    for (const room of changed) this.records.set(room.code, structuredClone(room));
    for (const code of deleted) this.records.delete(code);
  }
  async close() {}
}
async function fixture() {
  let time = 1000;
  const repository = new MemoryRepository();
  const runtime = new LiveRoomRuntime(repository, { now: () => time, presentation: false });
  await runtime.initialize();
  const created = await runtime.execute((s) => s.create(5, "Host"));
  const joined = await runtime.execute((s) => s.join(created.room.code, "Host", "PLAYER"));
  return { runtime, repository, code: created.room.code, token: joined.token, advance: () => { time += 1000; } };
}
describe("the production command path", () => {
  test("failed persistence neither publishes nor mutates live state, and a subsequent retry succeeds", async () => {
    const f = await fixture(); let published = 0;
    f.runtime.subscribe(() => { published += 1; });
    f.repository.fail = true;
    await expect(f.runtime.execute((s) => s.setReady(f.code, f.token, true))).rejects.toThrow("暂时无法保存");
    expect(f.runtime.service.publicView(f.code).participants[0]?.ready).toBe(false);
    expect(published).toBe(0);
    f.repository.fail = false;
    await f.runtime.execute((s) => s.setReady(f.code, f.token, true));
    expect(published).toBe(1);
    const restored = new LiveRoomRuntime(f.repository, { presentation: false });
    await restored.initialize();
    expect(restored.service.publicView(f.code).participants[0]?.ready).toBe(true);
  });
  test("duplicate commands persist once and do not accept a revoked credential through their receipt", async () => {
    const f = await fixture(); let invoked = 0;
    const receipt = { code: f.code, id: "command-123", actor: f.token, fingerprint: "ready" };
    const action = (s: RoomService) => { invoked += 1; s.setReady(f.code, f.token, true); return { private: "test-secret" }; };
    await f.runtime.execute(action, receipt);
    await f.runtime.execute(action, receipt);
    expect(invoked).toBe(1);
    await f.runtime.execute((s) => s.rotateParticipantToken(f.code, f.token));
    await expect(f.runtime.execute(action, receipt)).rejects.toThrow("authorization");
  });
  test("routine heartbeats update presence without database writes or event broadcasts", async () => {
    const f = await fixture(); let published = 0;
    f.runtime.subscribe(() => { published += 1; });
    const writes = f.repository.writes;
    for (let i = 0; i < 3; i++) { f.advance(); await f.runtime.execute((s) => s.pulse(f.code, f.token)); }
    expect(f.repository.writes).toBe(writes);
    expect(published).toBe(0);
    expect(f.runtime.service.find(f.code).participants[0]?.lastSeenAt).toBe(4000);
  });
  test("AES-GCM snapshots hide secrets and detect tampering while accepting legacy snapshots", () => {
    const codec = new SnapshotCodec("unit-test-encryption-key");
    const value = { role: "imp", tokenHash: "not-for-public", secret: "private-clue" };
    const encoded = codec.encode(value) as { data: string };
    expect(JSON.stringify(encoded)).not.toContain("private-clue");
    expect(codec.decode(encoded)).toEqual(value);
    expect(codec.decode(value)).toEqual(value);
    expect(() => new SnapshotCodec("different-key").decode(encoded)).toThrow();
    expect(() => new SnapshotCodec().decode(encoded)).toThrow("DATA_ENCRYPTION_KEY");
  });
});
describe("private room communication and recovery", () => {
  function makeRoom() {
    const s = new RoomService({ presentation: false });
    const { room } = s.create(5, "A");
    const players = ["A", "B", "C"].map((name) => s.join(room.code, name, "PLAYER"));
    return { s, room: s.find(room.code), players };
  }
  test("earshot permissions follow participant identity across seat changes", () => {
    const { s, room, players: [a, b, c] } = makeRoom();
    inviteWhisper(room, a!.token, 2);
    const id = socialView(room, b!.token).social.invitations[0]!.id;
    respondWhisper(room, b!.token, id, true);
    sendWhisper(room, a!.token, id, "private clue only for B");
    expect(socialView(room, c!.token).social.activeWhisper).toBeUndefined();
    s.reorderSeats(room.code, a!.token, [c!.participant.id, b!.participant.id, a!.participant.id]);
    expect(socialView(room, c!.token).social.activeWhisper).toBeUndefined();
    expect(socialView(room, a!.token).social.activeWhisper?.messages[0]).toMatchObject({ seat: 3, text: "private clue only for B" });
    expect(JSON.stringify(s.publicView(room.code))).not.toContain("private clue");
    expect(() => sendWhisper(room, c!.token, id, "intrusion")).toThrow();
  });
  test("a one-use recovery code rotates identity and cannot be replayed or found publicly", () => {
    const { s, room, players: [a] } = makeRoom();
    const recovery = createRecovery(room, a!.token);
    expect(JSON.stringify(s.publicView(room.code))).not.toContain(recovery.recoveryCode);
    const replacement = recoverMembership(s, room.code, recovery.recoveryCode);
    expect(replacement.id).toBe(a!.participant.id);
    expect(() => member(room, a!.token)).toThrow();
    expect(member(room, replacement.token).id).toBe(a!.participant.id);
    expect(() => recoverMembership(s, room.code, recovery.recoveryCode)).toThrow();
  });
});
