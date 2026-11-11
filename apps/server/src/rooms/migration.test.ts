import { expect,test } from "vitest";
import { RoomService,type RoomRecord } from "./service.js";
import { migrateReceipts } from "./migration.js";

function legacy() {
  const service=new RoomService({now:()=>1000,presentation:false});const {room}=service.create(5,"房主");const players=Array.from({length:5},(_,i)=>service.join(room.code,`玩家${i}`,"PLAYER"));for(const p of players)service.setReady(room.code,p.token,true);service.startTutorial(room.code,players[0]!.token,"SKIP");const old=service.snapshot(room.code);delete (old as Partial<RoomRecord>).schemaVersion;delete old.game!.publicProjection;delete old.game!.pendingPublications;return {old,players};
}
test("v1 night waiting restores pre-night public life without revealing a pending Ravenkeeper death",()=>{
  const {old}=legacy();Object.assign(old.game!,{phase:"OTHER_NIGHT",day:2,aliveSeats:[1,2,3,4],nightStartAliveSeats:[1,2,3,4,5],nightDeaths:[5],pendingRavenkeeperSeat:5});
  const service=new RoomService({now:()=>1000,presentation:true});service.restore([old]);expect(service.publicView(old.code).game!.aliveCount).toBe(5);expect(service.snapshot(old.code).game!.aliveSeats).toHaveLength(4);
});
test("unknown schemas and incomplete active ballots fail before being accepted",()=>{
  const {old}=legacy();const service=new RoomService();expect(()=>service.restore([{...old,schemaVersion:4} as unknown as RoomRecord])).toThrow(/schema/);
  old.game!.phase="VOTING";delete old.game!.nomination;expect(()=>service.restore([old])).toThrow(/active ballot/);
});
test("legacy full views are compacted while small recovery results survive and unknown oversized receipts stop migration",()=>{
  const {old}=legacy();old.metadata={commandReceipts:{view:{fingerprint:"f",result:{participant:{id:"p"},history:["secret".repeat(10000)]}},recover:{fingerprint:"g",result:{recoveryCode:"test-only",expiresAt:10000}}}};
  migrateReceipts(old);expect(JSON.stringify(old.metadata)).not.toContain("secret");expect(JSON.stringify(old.metadata)).toContain("test-only");
  old.metadata={commandReceipts:{unknown:{fingerprint:"f",result:{unexpected:"x".repeat(16385)}}}};expect(()=>migrateReceipts(old)).toThrow(old.code);
});
