import { expect, test } from "vitest";
import { Pool } from "pg";
import { PostgresRoomRepository } from "./room-repository.js";
import { RoomService } from "../rooms/service.js";

// This URL must point at a disposable, otherwise empty PostgreSQL database.
// The default unit suite never opens a database connection.
test.skipIf(!process.env.RAVENS_TEST_DATABASE_URL)("PostgreSQL transactions, encrypted recovery, one writer, and loss of the writer connection", async () => {
  const url = process.env.RAVENS_TEST_DATABASE_URL!;
  const pool = new Pool({ connectionString: url });
  const repositories: PostgresRoomRepository[] = [];
  const open = () => { const repository = new PostgresRoomRepository(url, "integration-test-key-only"); repositories.push(repository); return repository; };
  const first = open();
  try {
    await first.initialize();
    const existing = await pool.query("SELECT count(*)::integer AS count FROM room_runtime_snapshots");
    expect(existing.rows[0].count, "Use a disposable database, never a deployment database").toBe(0);
    const rooms = new RoomService({ presentation: false });
    const { room } = rooms.create(5, "Test Host");
    const players = [1, 2, 3, 4, 5].map((seat) => rooms.join(room.code, `Test ${seat}`, "PLAYER"));
    for (const player of players) rooms.setReady(room.code, player.token, true);
    rooms.startTutorial(room.code, players[0]!.token);
    for (const player of players) rooms.completeTutorial(room.code, player.token);
    const snapshot = rooms.snapshot(room.code);
    expect(snapshot.game?.events.length).toBeGreaterThan(0);
    await first.commit([snapshot], []);
    const raw = await pool.query("SELECT snapshot FROM room_runtime_snapshots WHERE code=$1", [room.code]);
    expect(raw.rows[0].snapshot.format).toBe("ravens-aes256-v1");
    expect(JSON.stringify(raw.rows[0].snapshot)).not.toContain("Test Host");
    expect((await first.loadAll())[0]).toEqual(snapshot);
    const events = await pool.query("SELECT count(*)::integer AS count FROM room_public_events WHERE code=$1", [room.code]);
    expect(events.rows[0].count).toBe(snapshot.game!.events.length);
    const contender = open();
    await expect(contender.initialize()).rejects.toThrow("already running");
    await expect(first.commit([snapshot], [])).rejects.toThrow("revision conflict");
    const another = rooms.create(5, "Second Host").room;
    await first.commit([rooms.snapshot(another.code)], []);
    const changed = structuredClone(snapshot); changed.revision += 1; changed.organizerName = "Must roll back";
    await expect(first.commit([changed, rooms.snapshot(another.code)], [])).rejects.toThrow("revision conflict");
    expect((await first.loadAll()).find((r) => r.code === room.code)?.organizerName).toBe(snapshot.organizerName);
    await first.close(); repositories.splice(repositories.indexOf(first), 1);
    const restored = open(); await restored.initialize();
    expect((await restored.loadAll()).find((r) => r.code === room.code)).toEqual(snapshot);
    await restored.commit([], [another.code]);
    expect(await restored.loadAll()).toHaveLength(1);
    const locks = await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted");
    expect(locks.rows).toHaveLength(1);
    await pool.query("SELECT pg_terminate_backend($1)", [locks.rows[0].pid]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(restored.commit([changed], [])).rejects.toThrow("writer is unavailable");
  } finally {
    await Promise.allSettled(repositories.map((r) => r.close()));
    await pool.end();
  }
}, 20_000);
