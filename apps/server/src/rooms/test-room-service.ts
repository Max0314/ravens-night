import { RoomService as ProductionRoomService, type ParticipantMode } from "./service.js";

/** Rules-only fixture: clients explicitly finish preparation and cinematic time is zero. */
export class TestRoomService extends ProductionRoomService {
  constructor() { super({ presentation: false, now: () => 1_800_000_000_000 }); }
  override join(code: string, nickname: string, mode: ParticipantMode) {
    const result = super.join(code, nickname, mode);
    if (mode === "PLAYER") this.setReady(code, result.token, true);
    return result;
  }
}
