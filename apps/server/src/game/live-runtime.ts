import type {CreationRequest} from '../rooms/creation.js';
import { createHash } from "node:crypto";
import { RoomService, type RoomRecord, type AccountClaim } from "../rooms/service.js";
import type { RoomCommandContext } from "@ravens/contracts";
import { RoomError, COMMAND_RECEIPT_LIMIT } from "../rooms/errors.js";
import type { AccountProfile } from '../auth/game-profile.js';
export interface RoomRepository {
  initialize(): Promise<void>;
  loadAll(): Promise<RoomRecord[]>;
  commit(changed: RoomRecord[], deleted: string[], claims?:AccountClaim[], profiles?:AccountProfile[],creations?:CreationRequest[],deletedCreations?:string[]): Promise<void>;
  loadCreationRequests?():Promise<CreationRequest[]>;
  loadClaims?():Promise<AccountClaim[]>;
  loadProfiles?():Promise<AccountProfile[]>;
  health?():Promise<void>;
  close(): Promise<void>;
}
interface Receipt { fingerprint: string; kind?: "view" | "result"; result?: unknown; actorCommandVersion?: number; contextId?: string; }
export interface CommandReceipt {
  code: string; id: string; actor: string; fingerprint: string;
  requireHost?:boolean;context?: RoomCommandContext; accountId?: string; resultKind?: "view" | "result";
}
export class PersistenceUnavailableError extends Error {
  constructor(cause: unknown) { super("房间状态暂时无法保存，请稍后重试", { cause }); this.name = "PersistenceUnavailableError"; }
}
/** Actual HTTP mutations are staged, persisted, then published; GET never sees an uncommitted state. */
export class LiveRoomRuntime {
  #service: RoomService;
  #tail: Promise<void> = Promise.resolve();
  readonly #listeners = new Set<(changedCodes: string[]) => void>();
  constructor(readonly repository?: RoomRepository, readonly options: { now?: () => number; presentation?: boolean;botSecret?:string } = {}) { this.#service = new RoomService(options); }
  get service(): RoomService { return this.#service; }
  async initialize(): Promise<void> {
    if (!this.repository) return;
    await this.repository.initialize();
    const snapshots = await this.repository.loadAll();
    const legacyCodes = snapshots.filter(room => room.schemaVersion !== 3).map(room => room.code);
    this.#service.restore(snapshots);
    this.#service.restoreClaims(await this.repository.loadClaims?.()??[]);
    this.#service.restoreProfiles(await this.repository.loadProfiles?.()??[]);
    this.#service.restoreCreationRequests(await this.repository.loadCreationRequests?.()??[]);
    const migrated = legacyCodes.map(code => this.#service.snapshot(code));
    if (migrated.length) {
      for (const room of migrated) room.revision += 1;
      await this.repository.commit(migrated, []);
      this.#service.restore(migrated);
    }
  }
  subscribe(listener: (changedCodes: string[]) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  execute<T>(mutation: (stage: RoomService) => T, receipt?: CommandReceipt): Promise<T> {
    const run = this.#tail.then(async () => {
      const before = this.#service.listCodes().map((code) => this.#service.snapshot(code));
      const stage = new RoomService(this.options);
      stage.restore(before);
      stage.restoreClaims(this.#service.accountClaims());
      stage.restoreProfiles(this.#service.accountProfiles());
      stage.restoreCreationRequests(this.#service.creationRequests());
      const key = receipt ? createHash("sha256").update(`${receipt.actor}:${receipt.id}`).digest("hex") : undefined;
      const receiptRoom = receipt ? stage.find(receipt.code) : undefined;
      const actor = receipt?.context ? stage.authorizeCommand(receipt.code, receipt.actor, receipt.context, receipt.accountId) : undefined;
      if (receipt && receiptRoom) {
        const actorHash = createHash("sha256").update(receipt.actor).digest("hex");
        if (!receiptRoom.participants.some((p) => !p.left && p.tokenHash === actorHash)) throw new RoomError("SEAT_REMOVED", "原座位已失效，请重新加入或恢复", 403);
      }
      if(receipt?.requireHost)stage.assertHost(receipt.code,receipt.actor);
      let receipts = (receiptRoom?.metadata?.commandReceipts ?? {}) as Record<string, Receipt>;
      if (key && receipts[key]) {
        if (receipts[key]!.fingerprint !== receipt!.fingerprint) throw new RoomError("COMMAND_ID_REUSED", "同一操作编号不能用于不同请求");
        return structuredClone(receipts[key]!.result) as T;
      }
      const result = mutation(stage);
      if (actor && receipt) stage.completeCommand(receipt.code, actor.participantId);
      if (key && receiptRoom && stage.listCodes().includes(receiptRoom.code)) {
        const currentReceiptRoom=stage.find(receiptRoom.code);
        receipts=(currentReceiptRoom.metadata?.commandReceipts??{}) as Record<string,Receipt>;
        receipts[key] = {
          fingerprint: receipt!.fingerprint, kind: receipt!.resultKind ?? "result",
          ...(receipt!.resultKind === "view" ? {} : { result: structuredClone(result) }),
          ...(actor ? { actorCommandVersion: actor.commandVersion } : {}),
          ...(receipt!.context?.contextId ? { contextId: receipt!.context.contextId } : {}),
        };
        const keys = Object.keys(receipts);
        for (const old of keys.slice(0, Math.max(0, keys.length - COMMAND_RECEIPT_LIMIT))) delete receipts[old];
        currentReceiptRoom.metadata = { ...currentReceiptRoom.metadata, commandReceipts: receipts };
        currentReceiptRoom.revision += 1;
      }
      const after = stage.listCodes().map((code) => stage.snapshot(code));
      const original = new Map(before.map((room) => [room.code, room]));
      // Presence timestamps stay in memory between real transitions. A reconnect/disconnect
      // increments revision; routine 1.2-second polls must not create a durable journal entry.
      const changed = after.filter((room) => !original.has(room.code) || room.revision !== original.get(room.code)!.revision);
      const remaining = new Set(after.map((room) => room.code));
      const deleted = before.filter((room) => !remaining.has(room.code)).map((room) => room.code);
      const claims=stage.accountClaims().filter(value=>!this.#service.accountClaim(value.sub));
      const profiles=stage.accountProfiles().filter(value=>value.revision!==this.#service.accountProfile(value.sub)?.revision);
      const creations=stage.creationRequests().filter(value=>!this.#service.creationRequest(value.key));
      const deletedCreations=this.#service.creationRequests().filter(value=>!stage.creationRequest(value.key)).map(value=>value.key);
      if (this.repository && (changed.length || deleted.length || claims.length || profiles.length || creations.length || deletedCreations.length)) {
        try { await this.repository.commit(changed, deleted,claims,profiles,creations,deletedCreations); }
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
