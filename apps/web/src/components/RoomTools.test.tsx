// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RoomTools } from "./RoomTools.js";
import { reopenRoom, cancelTutorialRoom, claimRoomHost } from "../api.js";
vi.mock("../api.js", () => ({
  abortRoom: vi.fn().mockResolvedValue({}), cancelTutorialRoom: vi.fn().mockResolvedValue({}), claimRoomHost: vi.fn().mockResolvedValue({}),
  createRecoveryCode: vi.fn().mockResolvedValue({ recoveryCode: "private-recovery", expiresAt: Date.now() + 600_000 }),
  hasPendingCommand: () => false, removeRoomPlayer: vi.fn(), reopenRoom: vi.fn().mockResolvedValue({}), retryPendingCommand: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const room = { code: "ABCDEF", state: "TUTORIAL", playerCount: 5, organizerId: "host", serverNow: 1000, hostClaimAt: 999, participants: [{ id: "host", nickname: "房主", mode: "PLAYER" as const, connected: true }] };
test("tutorial cancellation requires a concrete confirmation and recovery stays reachable", async () => {
  render(<RoomTools room={room} participantId="host" onChanged={vi.fn().mockResolvedValue(undefined)} />);
  fireEvent.click(screen.getByText("更多"));
  expect(screen.getByRole("button", { name: "换设备恢复码" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消教学" }));
  expect(cancelTutorialRoom).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(cancelTutorialRoom).toHaveBeenCalledWith("ABCDEF"));
});
test("a stranded player can claim an offline host while an active host can abort", async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  const ui = render(<RoomTools room={{ ...room, state: "RUNNING" }} participantId="player" onChanged={change} />);
  fireEvent.click(screen.getByText("更多"));
  fireEvent.click(screen.getByRole("button", { name: "接任房主" }));
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(claimRoomHost).toHaveBeenCalledWith("ABCDEF", "host"));
  ui.rerender(<RoomTools room={{ ...room, state: "RUNNING" }} participantId="host" onChanged={change} />);
  fireEvent.click(screen.getByRole("button", { name: "重开本局" }));
  expect(screen.getByText("本局不判胜负，所有人返回大厅并重新准备。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(reopenRoom).toHaveBeenCalledWith("ABCDEF"));
});
