import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { RoomRecord } from "../rooms/service.js";
import type { RoomRepository } from "../game/live-runtime.js";

interface Envelope { format: "ravens-aes256-v1"; iv: string; tag: string; data: string; }
export class SnapshotCodec {
  readonly key?: Buffer;
  constructor(key?: string) {
    if (key) this.key = /^[A-Za-z0-9+/]{43}=$/.test(key) && Buffer.from(key, "base64").length === 32 ? Buffer.from(key, "base64") : createHash("sha256").update(key).digest();
  }
  encode(value: unknown): unknown {
    if (!this.key) return value;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { format: "ravens-aes256-v1", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") } satisfies Envelope;
  }
  decode<T>(value: unknown): T {
    const envelope = value as Envelope;
    if (envelope?.format !== "ravens-aes256-v1") return value as T;
    if (!this.key) throw new Error("Encrypted rooms require DATA_ENCRYPTION_KEY");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8")) as T;
  }
}
export class PostgresRoomRepository implements RoomRepository {
  readonly #pool: Pool;
  readonly #codec: SnapshotCodec;
  #writer: PoolClient | undefined;
  #writerUnavailable = false;
  constructor(databaseUrl: string, key = process.env.DATA_ENCRYPTION_KEY) {
    this.#pool = new Pool({ connectionString: databaseUrl, max: 5 }); this.#codec = new SnapshotCodec(key);
    // A lost connection may also mean a lost advisory lock. Fail closed until restart
    // reloads authoritative snapshots; never write from potentially stale memory.
    this.#pool.on("error", () => { this.#writerUnavailable = true; });
  }
  async initialize(): Promise<void> {
    this.#writer = await this.#pool.connect();
    this.#writer.on("error", () => { this.#writerUnavailable = true; });
    try {
    const lock = await this.#writer.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext('ravens-night-runtime-writer')) AS locked");
    if (!lock.rows[0]?.locked) throw new Error("Another ravens-night writer is already running");
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS room_runtime_snapshots (code text PRIMARY KEY, revision integer NOT NULL, snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS room_runtime_journal (code text NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(code, revision));
      CREATE TABLE IF NOT EXISTS room_public_events (code text NOT NULL, game_id text NOT NULL, seq integer NOT NULL, event jsonb NOT NULL, PRIMARY KEY(code, game_id, seq));
    `);
    } catch (error) {
      this.#writer.release(true); this.#writer = undefined;
      throw error;
    }
  }
  async loadAll(): Promise<RoomRecord[]> {
    const result = await this.#pool.query<{ snapshot: unknown }>("SELECT snapshot FROM room_runtime_snapshots ORDER BY updated_at");
    return result.rows.map((row) => this.#codec.decode<RoomRecord>(row.snapshot));
  }
  async save(snapshot: RoomRecord): Promise<void> { await this.commit([snapshot], []); }
  async delete(code: string): Promise<void> { await this.commit([], [code]); }
  async commit(changed: RoomRecord[], deleted: string[]): Promise<void> {
    if (!this.#writer || this.#writerUnavailable) throw new Error("Database writer is unavailable; restart to reacquire lock and restore committed rooms");
    const connection = await this.#pool.connect();
    try {
      await connection.query("BEGIN");
      for (const snapshot of changed) {
        const encoded = JSON.stringify(this.#codec.encode(snapshot));
        const saved = await connection.query(`INSERT INTO room_runtime_snapshots(code,revision,snapshot) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(code) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=now()
          WHERE room_runtime_snapshots.revision < EXCLUDED.revision`, [snapshot.code, snapshot.revision, encoded]);
        if (saved.rowCount !== 1) throw new Error("Room revision conflict; only one application writer is supported");
        await connection.query("INSERT INTO room_runtime_journal(code,revision,snapshot) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING", [snapshot.code, snapshot.revision, encoded]);
        if (snapshot.game?.events.length) await connection.query(`INSERT INTO room_public_events(code,game_id,seq,event)
          SELECT $1, item->>'gameId', (item->>'seq')::integer, item FROM jsonb_array_elements($2::jsonb) item
          ON CONFLICT DO NOTHING`, [snapshot.code, JSON.stringify(snapshot.game.events)]);
        await connection.query("DELETE FROM room_runtime_journal WHERE code=$1 AND revision < $2", [snapshot.code, Math.max(0, snapshot.revision - 500)]);
      }
      for (const code of deleted) {
        await connection.query("DELETE FROM room_runtime_snapshots WHERE code=$1", [code]);
        await connection.query("DELETE FROM room_runtime_journal WHERE code=$1", [code]);
        await connection.query("DELETE FROM room_public_events WHERE code=$1", [code]);
      }
      if (this.#writerUnavailable) throw new Error("Database writer lock was lost");
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
  }
  async close(): Promise<void> {
    try {
      if (this.#writer) {
        try { if (!this.#writerUnavailable) await this.#writer.query("SELECT pg_advisory_unlock(hashtext('ravens-night-runtime-writer'))"); }
        finally { this.#writer.release(this.#writerUnavailable); this.#writer = undefined; }
      }
    } finally { await this.#pool.end(); }
  }
}
