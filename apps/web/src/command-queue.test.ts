// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { castVote, createRecoveryCode, getRoom, hasPendingCommand, observeRoomView, resetAccountContext, retryPendingCommand, setRoomReady, sendWhisper, leaveRoom } from "./api.js";

function seed(ballotId = "ballot-a", commandVersion = 0) {
  observeRoomView("ABCDEF", {
    protocolVersion: 4, roomInstanceId: "instance", setupId: "setup", revision: commandVersion + (ballotId === "ballot-a" ? 1 : 5),
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
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ roomInstanceId: "instance", setupId: "setup", expectedCommandVersion: 0 });
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
  expect(new Headers(fetcher.mock.calls[0]![1].headers).get("x-ravens-protocol")).toBe("4");
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

test("a rejected queued vote does not strand the same ballot after the uncertain command succeeds", async () => {
  seed();
  const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetcher);
  await expect(castVote("ABCDEF", true)).rejects.toThrow();
  await expect(castVote("ABCDEF", false)).rejects.toMatchObject({ errorCode: "COMMAND_PENDING" });
  fetcher.mockResolvedValue(success({ self: { participantId: "player", mode: "PLAYER", commandVersion: 1 } }));
  await retryPendingCommand("ABCDEF");
  await castVote("ABCDEF", false);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(JSON.parse(fetcher.mock.calls[3]![1].body)).toMatchObject({ ballotId: "ballot-a", raised: false, expectedCommandVersion: 1 });
});

test("root room polling supplies fresh lobby context even without WebSocket or a private view", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(success({
    code: "ABCDEF", roomInstanceId: "instance", setupId: "latest-setup", revision: 4,
    self: { participantId: "player", mode: "PLAYER", commandVersion: 3 },
  })).mockResolvedValueOnce(success({}));
  vi.stubGlobal("fetch", fetcher);
  await getRoom("ABCDEF");
  await setRoomReady("ABCDEF", true);
  expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toMatchObject({ setupId: "latest-setup", expectedCommandVersion: 3 });
});

test("explicit retry confirms the original whisper draft once, without creating a new send intent",async()=>{
  seed();const committed=vi.fn();const fetcher=vi.fn().mockRejectedValue(new TypeError("lost response"));vi.stubGlobal("fetch",fetcher);
  await expect(sendWhisper("ABCDEF","whisper-1","原文",committed)).rejects.toThrow();expect(committed).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(success({self:{participantId:"player",mode:"PLAYER",commandVersion:1}}));await retryPendingCommand("ABCDEF");await retryPendingCommand("ABCDEF");expect(committed).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[2]![1].body);
});
test("lost leave success followed by revoked-seat response completes cleanup instead of stranding pending intent",async()=>{
  seed();const fetcher=vi.fn().mockRejectedValueOnce(new TypeError("lost response"));vi.stubGlobal("fetch",fetcher);await expect(leaveRoom("ABCDEF")).rejects.toThrow();
  fetcher.mockResolvedValue({ok:false,status:403,json:async()=>({errorCode:"SEAT_REMOVED",error:"座位已离开"})});await expect(retryPendingCommand("ABCDEF")).resolves.toMatchObject({left:true,self:null});expect(hasPendingCommand("ABCDEF")).toBe(false);
});
