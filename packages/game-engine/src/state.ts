import type { EngineEvent, GameState } from "./types.js";

export function createInitialState(seed: string, nicknames: string[]): GameState {
  if (nicknames.length < 5 || nicknames.length > 12) {
    throw new Error("Player count must be between 5 and 12");
  }
  return {
    seed,
    rngCursor: 0,
    phase: "LOBBY",
    day: 0,
    players: nicknames.map((nickname, index) => ({
      seat: index + 1,
      nickname,
      alive: true,
      ghostVoteAvailable: true,
      nominatedToday: false,
      wasNominatedToday: false,
    })),
    executionOccurred: false,
  };
}

export function reduce(state: GameState, event: EngineEvent): GameState {
  switch (event.type) {
    case "PHASE_CHANGED":
      return { ...state, phase: event.phase };
    case "PLAYER_DIED":
      return {
        ...state,
        executionOccurred: state.executionOccurred || event.cause === "EXECUTION",
        players: state.players.map((player) =>
          player.seat === event.seat ? { ...player, alive: false } : player,
        ),
      };
    case "DAY_ADVANCED":
      // Omit optional phase-local state instead of serializing `undefined`.
      // This keeps persisted snapshots compatible with strict JSON schemas.
      const { nomination: _nomination, onBlock: _onBlock, ...dayState } = state;
      return {
        ...dayState,
        day: event.day,
        executionOccurred: false,
        players: state.players.map((player) => ({
          ...player,
          nominatedToday: false,
          wasNominatedToday: false,
        })),
      };
    case "GHOST_VOTE_SPENT":
      return {
        ...state,
        players: state.players.map((player) =>
          player.seat === event.seat ? { ...player, ghostVoteAvailable: false } : player,
        ),
      };
    case "NOMINATION_STARTED":
      return {
        ...state,
        nomination: { nominatorSeat: event.nominatorSeat, nomineeSeat: event.nomineeSeat, votes: {} },
        players: state.players.map((player) => ({
          ...player,
          nominatedToday: player.nominatedToday || player.seat === event.nominatorSeat,
          wasNominatedToday: player.wasNominatedToday || player.seat === event.nomineeSeat,
        })),
      };
    case "VOTE_RECORDED":
      if (!state.nomination) return state;
      return {
        ...state,
        nomination: {
          ...state.nomination,
          votes: { ...state.nomination.votes, [event.seat]: event.raised },
        },
      };
    case "EXECUTION_SET":
      return { ...state, onBlock: { seat: event.seat, votes: event.votes } };
    case "GAME_WON":
      return { ...state, phase: "GAME_OVER", winner: event.winner, winReason: event.reason };
  }
}

export function replay(initial: GameState, events: EngineEvent[]): GameState {
  return events.reduce(reduce, initial);
}
