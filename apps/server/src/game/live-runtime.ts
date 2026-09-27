import { createHash } from "node:crypto";
import { RoomService, type RoomRecord } from "../rooms/service.js";
export interface RoomRepository {
  initialize(): Promise<void>;
  loadAll(): Promise<RoomRecord[]>;
  commit(changed: RoomRecord[], deleted: string[]): Promise<void>;
  close(): Promise<void>;
}
interface Receipt { fingerprint: string; result: unknown; }
export class PersistenceUnavailableError extends Error {
  constructor(cause: unknown) { super("房间状态暂时无法保存，请稍后重试", { cause }); this.name = "PersistenceUnavailableError"; }
}
/** Actual HTTP mutations are staged, persisted, then published; GET never sees an uncommitted state. */
export class LiveRoomRuntime {
  #service: RoomService;
  #tail: Promise<void> = Promise.resolve();
  readonly #listeners = new Set<(changedCodes: string[]) => void>();
  constructor(readonly repository?: RoomRepository, readonly options: { now?: () => number; presentation?: boolean } = {}) { this.#service = new RoomService(options); }
  get service(): RoomService { return this.#service; }
  async initialize(): Promise<void> {
    if (!this.repository) return;
    await this.repository.initialize();
    this.#service.restore(await this.repository.loadAll());
  }
  subscribe(listener: (changedCodes: string[]) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  execute<T>(mutation: (stage: RoomService) => T, receipt?: { code: string; id: string; actor: string; fingerprint: string }): Promise<T> {
    const run = this.#tail.then(async () => {
      const before = this.#service.listCodes().map((code) => this.#service.snapshot(code));
      const stage = new RoomService(this.options);
      stage.restore(before);
      const key = receipt ? createHash("sha256").update(`${receipt.actor}:${receipt.id}`).digest("hex") : undefined;
      const receiptRoom = receipt ? stage.find(receipt.code) : undefined;
      if (receipt && receiptRoom) {
        const actorHash = createHash("sha256").update(receipt.actor).digest("hex");
        if (receiptRoom.organizerTokenHash !== actorHash && !receiptRoom.participants.some((p) => !p.left && p.tokenHash === actorHash)) throw new Error("Player authorization failed");
      }
      const receipts = (receiptRoom?.metadata?.commandReceipts ?? {}) as Record<string, Receipt>;
      if (key && receipts[key]) {
        if (receipts[key]!.fingerprint !== receipt!.fingerprint) throw new Error("同一操作编号不能用于不同请求");
        return structuredClone(receipts[key]!.result) as T;
      }
      const result = mutation(stage);
      if (key && receiptRoom && stage.listCodes().includes(receiptRoom.code)) {
        receipts[key] = { fingerprint: receipt!.fingerprint, result: structuredClone(result) };
        const keys = Object.keys(receipts);
        for (const old of keys.slice(0, Math.max(0, keys.length - 256))) delete receipts[old];
        receiptRoom.metadata = { ...receiptRoom.metadata, commandReceipts: receipts };
        receiptRoom.revision += 1;
      }
      const after = stage.listCodes().map((code) => stage.snapshot(code));
      const original = new Map(before.map((room) => [room.code, room]));
      // Presence timestamps stay in memory between real transitions. A reconnect/disconnect
      // increments revision; routine 1.2-second polls must not create a durable journal entry.
      const changed = after.filter((room) => !original.has(room.code) || room.revision !== original.get(room.code)!.revision);
      const remaining = new Set(after.map((room) => room.code));
      const deleted = before.filter((room) => !remaining.has(room.code)).map((room) => room.code);
      if (this.repository && (changed.length || deleted.length)) {
        try { await this.repository.commit(changed, deleted); }
        catch (cause) { throw new PersistenceUnavailableError(cause); }
      }
      this.#service = stage;
      if (changed.length || deleted.length) for (const listener of this.#listeners) { try { listener([...changed.map((r) => r.code), ...deleted]); } catch { /* A disconnected subscriber cannot undo a committed command. */ } }
      return result;
    });
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }
  async close(): Promise<void> { await this.#tail; this.#listeners.clear(); await this.repository?.close(); }
}
