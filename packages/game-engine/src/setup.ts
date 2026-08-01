import type { RoleType } from "./types.js";

export interface Distribution {
  townsfolk: number;
  outsider: number;
  minion: number;
  demon: number;
}

const distributions: Record<number, Distribution> = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
};

export function distributionFor(playerCount: number): Distribution {
  const distribution = distributions[playerCount];
  if (!distribution) throw new Error("Player count must be between 5 and 12");
  return { ...distribution };
}

export function roleTypesFor(playerCount: number): RoleType[] {
  const distribution = distributionFor(playerCount);
  return [
    ...Array<RoleType>(distribution.townsfolk).fill("TOWNSFOLK"),
    ...Array<RoleType>(distribution.outsider).fill("OUTSIDER"),
    ...Array<RoleType>(distribution.minion).fill("MINION"),
    ...Array<RoleType>(distribution.demon).fill("DEMON"),
  ];
}
