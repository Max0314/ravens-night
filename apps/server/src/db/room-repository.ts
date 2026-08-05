import { Pool } from "pg";
import type { RoomRecord } from "../rooms/service.js";

export class PostgresRoomRepository {
  readonly #pool: Pool;
  constructor(databaseUrl: string) { this.#pool = new Pool({ connectionString: databaseUrl, max: 5 }); }

  async initialize(): Promise<void> {
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS room_runtime_snapshots (
        code text PRIMARY KEY,
        revision integer NOT NULL,
        snapshot jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async loadAll(): Promise<RoomRecord[]> {
    const result = await this.#pool.query<{ snapshot: RoomRecord }>("SELECT snapshot FROM room_runtime_snapshots ORDER BY updated_at");
    return result.rows.map((row) => row.snapshot);
  }

  async save(snapshot: RoomRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO room_runtime_snapshots (code, revision, snapshot, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (code) DO UPDATE SET revision = EXCLUDED.revision, snapshot = EXCLUDED.snapshot, updated_at = now()
       WHERE room_runtime_snapshots.revision < EXCLUDED.revision`,
      [snapshot.code, snapshot.revision, JSON.stringify(snapshot)],
    );
  }

  async delete(code: string): Promise<void> {
    await this.#pool.query("DELETE FROM room_runtime_snapshots WHERE code = $1", [code]);
  }

  async close(): Promise<void> { await this.#pool.end(); }
}
