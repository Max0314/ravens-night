import { RoomService as ProductionRoomService, type ParticipantMode } from "./service.js";

/** Rules-only fixture: clients explicitly finish preparation and cinematic time is zero. */
export class TestRoomService extends ProductionRoomService {
  private readonly players: Array<{code: string; token: string}> = [];
  constructor() { super({ presentation: false, now: () => 1_800_000_000_000 }); }
  override join(code: string, nickname: string, mode: ParticipantMode) {
    const result = super.join(code, nickname, mode);
    if (mode === "PLAYER") { this.players.push({code, token: result.token}); for (const player of this.players.filter(p => p.code === code)) { try { this.setReady(code, player.token, true); } catch { /* departed fixture seat */ } } }
    return result;
  }
}
