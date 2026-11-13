export function playerLabel(_seat: number | undefined, nickname?: string) {
  return `[${nickname || '玩家'}]`;
}

/** Display-only compatibility for complete legacy labels; the stored text remains untouched. */
export function formatPlayerText(text: string) {
  return text.replace(/【玩家\d+-([^】]+)】/g, (_label, nickname: string) => `[${nickname}]`);
}
