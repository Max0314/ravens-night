import { describe, expect, test } from "vitest";
import { RoomService } from "./service.js";

type JoinedPlayer = ReturnType<RoomService["join"]>;

function createSixPlayerGame() {
  const service = new RoomService();
  const { room, organizerToken } = service.create(6, "压力测试主持");
  const players = Array.from({ length: 6 }, (_, index) => service.join(room.code, `模拟玩家${index + 1}`, "PLAYER"));
  service.startTutorial(room.code, organizerToken);
  for (const player of players) service.completeTutorial(room.code, player.token);
  for (const player of players) service.confirmRole(room.code, player.token);
  settleNight(service, room.code, players);
  return { service, code: room.code, players };
}

function settleNight(service: RoomService, code: string, players: JoinedPlayer[]): void {
  for (let pass = 0; pass < 16; pass += 1) {
    const phase = service.publicView(code).game?.phase;
    if (phase !== "FIRST_NIGHT" && phase !== "OTHER_NIGHT") return;
    const snapshot = service.snapshot(code);
    const pending = players.map((player) => ({ player, view: service.privateView(code, player.token) }))
      .filter(({ view }) => view.action?.kind === "SELECT_ONE" || view.action?.kind === "SELECT_TWO");
    expect(pending.length, `night stalled in ${phase}`).toBeGreaterThan(0);

    for (const { player, view } of pending) {
      if (!view.action || (view.action.kind !== "SELECT_ONE" && view.action.kind !== "SELECT_TWO")) continue;
      const seat = player.participant.seat!;
      const assignment = snapshot.assignments.find((candidate) => candidate.seat === seat)!;
      let legalSeats = [...view.action.legalSeats];
      if (assignment.roleType === "DEMON") {
        const preferredGood = snapshot.assignments
          .filter((candidate) => candidate.alignment === "GOOD" && candidate.roleId !== "soldier")
          .map((candidate) => candidate.seat)
          .find((candidate) => legalSeats.includes(candidate));
        if (preferredGood !== undefined) legalSeats = [preferredGood, ...legalSeats.filter((candidate) => candidate !== preferredGood)];
      } else if (assignment.perceivedRoleId === "monk") {
        const evil = snapshot.assignments.map((candidate) => candidate.seat)
          .find((candidate) => candidate !== seat && legalSeats.includes(candidate) && snapshot.assignments.find((assignmentCandidate) => assignmentCandidate.seat === candidate)?.alignment === "EVIL");
        if (evil !== undefined) legalSeats = [evil, ...legalSeats.filter((candidate) => candidate !== evil)];
      }
      service.submitAction(code, player.token, legalSeats.slice(0, view.action.maxTargets));
    }
  }
  throw new Error("night failed to settle after 16 passes");
}

function executeSeat(service: RoomService, code: string, players: JoinedPlayer[], nomineeSeat: number, nominatorSeat: number): void {
  const nominator = players.find((player) => player.participant.seat === nominatorSeat)!;
  service.nominate(code, nominator.token, nomineeSeat);
  if (service.publicView(code).game?.phase !== "VOTING") return;
  for (const player of players) service.vote(code, player.token, true);
  const aliveSeats = service.publicView(code).game!.seats.filter((seat) => seat.alive).map((seat) => seat.seat);
  for (const seat of aliveSeats) {
    const player = players.find((candidate) => candidate.participant.seat === seat)!;
    service.readyToEndDay(code, player.token);
  }
}

function playGoodStrategy(): "GOOD" | "EVIL" {
  const { service, code, players } = createSixPlayerGame();
  for (let round = 0; round < 8; round += 1) {
    const publicGame = service.publicView(code).game!;
    if (publicGame.phase === "GAME_OVER") return publicGame.winner!;
    expect(["DAY_DISCUSSION", "NOMINATION"]).toContain(publicGame.phase);
    const snapshot = service.snapshot(code);
    const living = publicGame.seats.filter((seat) => seat.alive).map((seat) => seat.seat);
    const demon = snapshot.assignments.find((assignment) => assignment.roleType === "DEMON" && living.includes(assignment.seat));
    expect(demon, "a living demon should exist before the day execution").toBeDefined();
    const goodNominator = snapshot.assignments.find((assignment) => assignment.alignment === "GOOD" && living.includes(assignment.seat) && assignment.seat !== demon!.seat);
    expect(goodNominator).toBeDefined();
    executeSeat(service, code, players, demon!.seat, goodNominator!.seat);
    settleNight(service, code, players);
  }
  throw new Error("good strategy did not finish within eight rounds");
}

function playEvilStrategy(): "GOOD" | "EVIL" {
  const { service, code, players } = createSixPlayerGame();
  for (let round = 0; round < 8; round += 1) {
    const publicGame = service.publicView(code).game!;
    if (publicGame.phase === "GAME_OVER") return publicGame.winner!;
    expect(["DAY_DISCUSSION", "NOMINATION"]).toContain(publicGame.phase);
    const snapshot = service.snapshot(code);
    const living = publicGame.seats.filter((seat) => seat.alive).map((seat) => seat.seat);
    const evilNominator = snapshot.assignments.find((assignment) => assignment.alignment === "EVIL" && living.includes(assignment.seat));
    const goodNominee = snapshot.assignments.find((assignment) => assignment.alignment === "GOOD" && living.includes(assignment.seat));
    expect(evilNominator).toBeDefined();
    expect(goodNominee).toBeDefined();
    executeSeat(service, code, players, goodNominee!.seat, evilNominator!.seat);
    settleNight(service, code, players);
  }
  throw new Error("evil strategy did not finish within eight rounds");
}

describe("repeated six-player simulations", () => {
  test("one hundred randomized games can finish with the demon repeatedly executed", () => {
    for (let game = 0; game < 100; game += 1) expect(playGoodStrategy()).toBe("GOOD");
  });

  test("one hundred randomized games can finish while evil removes good players", () => {
    for (let game = 0; game < 100; game += 1) expect(playEvilStrategy()).toBe("EVIL");
  });
});
