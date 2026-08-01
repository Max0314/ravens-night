import type { EngineCommand, EngineEvent, GameState, PlayerState } from "./types.js";

function playerAt(state: GameState, seat: number): PlayerState {
  const player = state.players.find((candidate) => candidate.seat === seat);
  if (!player) throw new Error(`Unknown seat ${seat}`);
  return player;
}

export function decide(state: GameState, command: EngineCommand): EngineEvent[] {
  switch (command.type) {
    case "NOMINATE": {
      if (state.phase !== "DAY_DISCUSSION" && state.phase !== "NOMINATION") {
        throw new Error("Nominations are not open");
      }
      const actor = playerAt(state, command.actorSeat);
      const nominee = playerAt(state, command.nomineeSeat);
      if (!actor.alive) throw new Error("A dead player cannot nominate");
      if (actor.nominatedToday) throw new Error("This player already nominated today");
      if (nominee.wasNominatedToday) throw new Error("This player was already nominated today");
      return [{ type: "NOMINATION_STARTED", nominatorSeat: actor.seat, nomineeSeat: nominee.seat }];
    }
    case "VOTE": {
      if (state.phase !== "VOTING") throw new Error("Voting is not open");
      const actor = playerAt(state, command.actorSeat);
      if (!state.nomination) throw new Error("No nomination is active");
      if (!actor.alive && command.raised && !actor.ghostVoteAvailable) {
        throw new Error("This player's ghost vote has already been spent");
      }
      const events: EngineEvent[] = [{ type: "VOTE_RECORDED", seat: actor.seat, raised: command.raised }];
      if (!actor.alive && command.raised) events.push({ type: "GHOST_VOTE_SPENT", seat: actor.seat });
      return events;
    }
    case "CHANGE_PHASE":
      return [{ type: "PHASE_CHANGED", phase: command.phase }];
    case "ADVANCE_DAY":
      return [{ type: "DAY_ADVANCED", day: state.day + 1 }];
  }
}
