// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { castVote, createRecoveryCode, hasPendingCommand, observeRoomView, resetAccountContext, retryPendingCommand, type PrivateView } from "./api.js";

function seed(ballotId = "ballot-a", commandVersion = 0) {
  observeRoomView("ABCDEF", {
    protocolVersion: 2, roomInstanceId: "instance", setupId: "setup", revision: commandVersion + (ballotId === "ballot-a" ? 1 : 5),
    self: { participantId: "player", mode: "PLAYER", commandVersion },
    game: { gameId: "game", contextId: ballotId, phase: "VOTING", day: 1, seats: [], events: [], readyCount: 0, aliveCount: 5,
      nomination: { ballotId, nominatorSeat: 1, nomineeSeat: 2, votesReceived: 0, votesRaised: 0, threshold: 3 } },
  });
}
const success = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
afterEach(() => { resetAccountContext(); vi.unstubAllGlobals(); sessionStorage.clear(); });

test("an unsent old-round intent is discarded rather than rebound when the previous command completes", async () => {
  seed();
  let complete!: (value: unknown) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const first = createRecoveryCode("ABCDEF");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  const vote = castVote("ABCDEF", true);
  const rejected = expect(vote).rejects.toMatchObject({ errorCode: "CONTEXT_CHANGED" });
  seed("ballot-b");
  complete(success({ self: { participantId: "player", mode: "PLAYER", commandVersion: 1 } }));
  await first; await rejected;
  expect(fetcher).toHaveBeenCalledOnce();
});

test("same-round unsent gestures coalesce; binding and latest command version are sent together", async () => {
  seed("ballot-a", 7);
  const fetcher = vi.fn().mockResolvedValue(success({ self: { participantId: "player", mode: "PLAYER", commandVersion: 8 } }));
  vi.stubGlobal("fetch", fetcher);
  await Promise.all([castVote("ABCDEF", true), castVote("ABCDEF", false)]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ raised: false, ballotId: "ballot-a", expectedCommandVersion: 7 });
  expect(new Headers(fetcher.mock.calls[0]![1].headers).get("x-ravens-protocol")).toBe("2");
});

test("an uncertain command blocks later intent and explicit retry retains the exact original payload and id", async () => {
  seed();
  const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetcher);
  await expect(castVote("ABCDEF", true)).rejects.toThrow("offline");
  expect(hasPendingCommand("ABCDEF")).toBe(true);
  await expect(castVote("ABCDEF", false)).rejects.toMatchObject({ errorCode: "COMMAND_PENDING" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  seed("ballot-b", 1);
  fetcher.mockResolvedValueOnce(success({ self: { participantId: "player", mode: "PLAYER", commandVersion: 1 } }));
  await retryPendingCommand("ABCDEF");
  const original = fetcher.mock.calls[0]![1], retried = fetcher.mock.calls[2]![1];
  expect(retried.body).toBe(original.body);
  expect(new Headers(retried.headers).get("x-command-id")).toBe(new Headers(original.headers).get("x-command-id"));
  expect(hasPendingCommand("ABCDEF")).toBe(false);
});
