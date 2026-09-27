// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, createRoom, joinRoom, leaveRoom, recoverRoom, submitGameAction } from "./api.js";

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
const success = () => ({ ok: true, json: async () => ({ id: "restored-seat" }) });
const commandId = (fetcher: ReturnType<typeof vi.fn>, attempt: number) => new Headers(fetcher.mock.calls[attempt]?.[1].headers).get("x-command-id");

test("an ambiguous action retries once with the same command id", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("connection lost")).mockResolvedValueOnce(success());
  vi.stubGlobal("fetch", fetcher);
  await submitGameAction("ABCDEF", [2]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(commandId(fetcher, 0)).toBeTruthy();
  expect(commandId(fetcher, 1)).toBe(commandId(fetcher, 0));
});

test("create, join, leave, and rejected commands are never blindly replayed", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetcher);
  await expect(createRoom(5, "甲", "IN_PERSON")).rejects.toThrow();
  await expect(joinRoom("ABCDEF", "甲", "PLAYER")).rejects.toThrow();
  await expect(leaveRoom("ABCDEF")).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockReset().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "这位玩家不能行动" }) });
  await expect(submitGameAction("ABCDEF", [2])).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("manual recovery retry retains its command id without storing the recovery secret", async () => {
  vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder);
  const secret = "A-private-one-use-recovery-secret";
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetcher);
  await expect(recoverRoom("ABCDEF", secret)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(sessionStorage)).not.toContain(secret);
  expect(sessionStorage.length).toBe(1);
  fetcher.mockResolvedValueOnce(success());
  await expect(recoverRoom("ABCDEF", secret)).resolves.toEqual({ id: "restored-seat" });
  expect(commandId(fetcher, 2)).toBe(commandId(fetcher, 0));
  expect(sessionStorage.length).toBe(0);
});
