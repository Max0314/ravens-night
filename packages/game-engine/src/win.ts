import type { EngineEvent, GameState } from "./types.js";

export function checkBaseWin(state: GameState): EngineEvent[] {
  if (state.winner) return [];
  const living = state.players.filter((player) => player.alive);
  const demon = state.players.find((player) => player.roleType === "DEMON" && player.alive);
  if (!demon) return [{ type: "GAME_WON", winner: "GOOD", reason: "The demon is dead" }];
  if (living.length <= 2) return [{ type: "GAME_WON", winner: "EVIL", reason: "Only two players remain" }];
  return [];
}
