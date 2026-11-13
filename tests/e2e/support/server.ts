import { readFile, writeFile } from "node:fs/promises";
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
  // Public TV layout fixtures only: no production route, database or private seat credentials.
  const tvRooms:Record<string,string>={};
  for(const count of [7,12]){
    const tv=service.create(count,'电视布局验证'),host=service.join(tv.room.code,'史泰龙','PLAYER');
    service.changeBots(tv.room.code,host.token,{fill:true});service.setReady(tv.room.code,host.token,true);tv.room=service.find(tv.room.code);
    for(const player of tv.room.participants)player.ready=true;
    service.startTutorial(tv.room.code,host.token,'SKIP',true);service.changeBotControl(tv.room.code,host.token,'PAUSED');service.changeRehearsalClock(tv.room.code,host.token,'MANUAL');
    const game=tv.room.game!,now=service.gameNow(tv.room);game.phase='VOTING';game.day=3;game.presentationUntil=0;game.pendingPublications=[];
    game.startInfo.stage='COMPLETE';for(const info of Object.values(game.startInfo.entries))info.acknowledged=true;game.aliveSeats=game.aliveSeats.filter(seat=>seat!==3&&seat!==5);
    game.nomination={ballotId:'tv-layout',mode:'SIMULTANEOUS',nominatorSeat:1,nomineeSeat:2,defenseUntil:now+20_000,voteStartsAt:now+20_000,voteEndsAt:now+28_000,countdownStarted:false};
    game.voteSubmissions={1:true,3:false,4:true,6:true};game.onBlock={seat:2,votes:4};
    tv.room.participants[1]!.nickname='冰霜大脚板的漫长昵称';
    Object.assign(game.publicProjection!,{phase:game.phase,day:game.day,aliveSeats:[...game.aliveSeats],nomination:structuredClone(game.nomination),voteSubmissions:{...game.voteSubmissions},onBlock:{...game.onBlock},presentationUntil:0,phaseDeadlineAt:0,events:[{id:'tv-record-1',gameId:game.gameId,seq:1,kind:'NOTICE',occurredAt:now,startsAt:now-1000,durationMs:0,message:'黎明时发现 [皮卡丘] 死亡。'},{id:'tv-record-2',gameId:game.gameId,seq:2,kind:'NOTICE',occurredAt:now,startsAt:now-500,durationMs:0,message:'第3天开始，自由讨论。'}]});
    snapshots.set(tv.room.code,service.snapshot(tv.room.code));tvRooms[`tv${count}RoomCode`]=tv.room.code;
  }
  const repository: RoomRepository = { initialize: async () => undefined, loadAll: async () => structuredClone([...snapshots.values()]), commit: async (changed, deleted) => { changed.forEach((snapshot) => snapshots.set(snapshot.code, structuredClone(snapshot))); deleted.forEach((code) => snapshots.delete(code)); }, close: async () => undefined };
  await writeFile("outputs/e2e/fixture.json", JSON.stringify({ poisonRoomCode: room.code,...tvRooms }));
  // Real production durations remain enabled even though request logging is muted.
  const app = buildApp({ repository, accessPassword: process.env.E2E_ACCESS_PASSWORD ?? "e2e-only-password", presentation: true });
  app.get('/__e2e/perf',async(_request,reply)=>reply.type('text/html').send((await readFile('apps/web/dist/index.html','utf8')).replace('</body>','<script src="/__e2e/performance.js"></script></body>')));
  app.get('/__e2e/performance.js',async(_request,reply)=>reply.type('application/javascript').send(await readFile('tests/e2e/support/performance.js','utf8')));
  await app.listen({ host: "127.0.0.1", port: 4173 });
}
void main();
