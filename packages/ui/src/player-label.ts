export function playerLabel(seat: number | undefined, nickname?: string) {
  return seat === undefined ? nickname || '玩家' : `【玩家${seat}-${nickname || '玩家'}】`;
}
