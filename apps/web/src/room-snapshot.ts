import type { PrivateView, RoomView } from "./api.js";
import { isOlderSnapshot } from "./snapshot-order.js";
export interface Snapshot { generation: number; room?: RoomView; privateView?: PrivateView }
export type SnapshotAction = { type: "reset"; generation: number } | { type: "accept"; generation: number; room?: RoomView; privateView?: PrivateView };
/** A public/private pair is accepted as a unit. Arrival order never orders gameplay. */
export function roomSnapshot(state: Snapshot, action: SnapshotAction): Snapshot {
  if (action.type === "reset") return { generation: action.generation };
  if (action.generation !== state.generation) return state;
  const room = action.privateView?.room ?? action.room;
  if (!room) return state;
  if (state.room && state.room.code !== room.code) return state;
  if (isOlderSnapshot(room, state.room)) return state;
  const mine = action.privateView;
  if (mine && (mine.roomInstanceId !== room.roomInstanceId || mine.revision !== room.revision || mine.setupId !== room.setupId || mine.game?.gameId !== room.game?.gameId)) return state;
  if (mine) return { generation: state.generation, room, privateView: mine };
  // A public packet alone must not combine a new phase with old private capabilities.
  if (room.game && room.self?.mode === "PLAYER" && state.privateView && state.privateView.revision !== room.revision) return state;
  return { generation: state.generation, room, ...(state.privateView && state.privateView.setupId === room.setupId && state.privateView.revision === room.revision ? { privateView: state.privateView } : {}) };
}
