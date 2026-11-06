export interface SnapshotOrder { roomInstanceId?: string; revision?: number; serverNow?: number }
export function isOlderSnapshot(incoming: SnapshotOrder, previous?: SnapshotOrder): boolean {
  if (!previous) return false;
  if (previous.roomInstanceId && incoming.roomInstanceId && incoming.roomInstanceId !== previous.roomInstanceId) return true;
  const next=incoming.revision ?? 0, old=previous.revision ?? 0;
  return next < old || next === old && (incoming.serverNow ?? 0) < (previous.serverNow ?? 0);
}
