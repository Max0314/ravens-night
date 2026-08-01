import { parsePublicGameView, type PlayerGameView, type PublicGameView } from "@ravens/contracts";
import { roleById, type GameState, type RoleAssignment } from "@ravens/game-engine";

export function projectPublicView(
  state: GameState,
  roomCode: string,
  connectedSeats: ReadonlySet<number>,
): PublicGameView {
  return parsePublicGameView({
    roomCode,
    phase: state.phase,
    day: state.day,
    seats: state.players.map((player) => ({
      seat: player.seat,
      nickname: player.nickname,
      alive: player.alive,
      connected: connectedSeats.has(player.seat),
      ghostVoteAvailable: player.ghostVoteAvailable,
    })),
    publicEvents: [],
    ...(state.nomination
      ? {
          nomination: {
            nominatorSeat: state.nomination.nominatorSeat,
            nomineeSeat: state.nomination.nomineeSeat,
            votes: Object.values(state.nomination.votes).filter(Boolean).length,
            threshold: Math.ceil(state.players.filter((player) => player.alive).length / 2),
          },
        }
      : {}),
  });
}

export function projectPlayerView(
  state: GameState,
  roomCode: string,
  connectedSeats: ReadonlySet<number>,
  assignments: RoleAssignment[],
  playerSeat: number,
  privateMessages: Array<{ seq: number; text: string }>,
): PlayerGameView {
  const assignment = assignments.find((candidate) => candidate.seat === playerSeat);
  if (!assignment) throw new Error("Player has no role assignment");
  const perceivedRole = roleById(assignment.perceivedRoleId);
  return {
    public: projectPublicView(state, roomCode, connectedSeats),
    self: {
      roleId: assignment.perceivedRoleId,
      alignment: assignment.alignment,
      abilitySummary: perceivedRole.summary,
      privateMessages,
    },
  };
}
