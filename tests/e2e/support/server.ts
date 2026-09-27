import { writeFile } from "node:fs/promises";
import { buildApp } from "../../../apps/server/src/app.js";
import { RoomService, type RoomRecord } from "../../../apps/server/src/rooms/service.js";
import { setupGameRoles } from "../../../packages/game-engine/src/roles/setup-roles.js";
import type { RoomRepository } from "../../../apps/server/src/game/live-runtime.js";
/** This fixture lives only in the test process, with no production fixture route. */
async function main() {
  const service = new RoomService({ presentation: true });
  const created = service.create(5, "投毒演出验收");
  const room = service.find(created.room.code);
  for (let index = 0; index < 1_000; index++) { const id = `e2e-private-poison-${index}`; if (setupGameRoles(5, `${id}:${room.code}:game-1`).some((assignment) => assignment.roleId === "poisoner")) { room.id = id; break; } }
  const snapshots = new Map<string, RoomRecord>([[room.code, service.snapshot(room.code)]]);
  const repository: RoomRepository = { initialize: async () => undefined, loadAll: async () => structuredClone([...snapshots.values()]), commit: async (changed, deleted) => { changed.forEach((snapshot) => snapshots.set(snapshot.code, structuredClone(snapshot))); deleted.forEach((code) => snapshots.delete(code)); }, close: async () => undefined };
  await writeFile("outputs/e2e/fixture.json", JSON.stringify({ poisonRoomCode: room.code }));
  // Real production durations remain enabled even though request logging is muted.
  const app = buildApp({ repository, accessPassword: process.env.E2E_ACCESS_PASSWORD ?? "e2e-only-password", presentation: true });
  await app.listen({ host: "127.0.0.1", port: 4173 });
}
void main();
