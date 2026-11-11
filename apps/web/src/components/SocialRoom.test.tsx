// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SocialRoom } from "./SocialRoom.js";
import { leaveWhisper, respondWhisper, type PrivateView } from "../api.js";
vi.mock("../api.js", async original => ({ ...await original<object>(), leaveWhisper: vi.fn().mockResolvedValue({}), respondWhisper: vi.fn().mockResolvedValue({}) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });
function view(): PrivateView {
  return { state: "RUNNING", participant: { id: "a", nickname: "甲", seat: 1 }, history: [], messages: [], game: { phase: "DAY_DISCUSSION", day: 1, aliveCount: 2, readyCount: 0, events: [], seats: [{ seat: 1, nickname: "甲", alive: true, connected: true, ghostVoteAvailable: true }, { seat: 2, nickname: "乙", alive: true, connected: true, ghostVoteAvailable: true }] }, social: { invitations: [{ id: "w", fromSeat: 2, toSeat: 1, status: "PENDING", createdAt: 1 }] } };
}

test("town owns opening; invitation responses stay in the fixed footer and night closes the sheet", async () => {
  const mine = view(), close = vi.fn(), refresh = vi.fn();
  const props = { code: "ABCDEF", view: mine, onClose: close, onRefresh: refresh, drafts: {}, setDrafts: vi.fn() };
  const ui = render(<SocialRoom {...props} open={false} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  ui.rerender(<SocialRoom {...props} open />);
  expect(screen.getByText("乙 邀请你私聊")).toBeVisible();
  expect(screen.getByRole("button", { name: "接受邀请" }).closest("footer")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "接受邀请" }));
  await waitFor(() => expect(respondWhisper).toHaveBeenCalledWith("ABCDEF", "w", true));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  ui.rerender(<SocialRoom {...props} open view={{ ...mine, game: { ...mine.game!, phase: "OTHER_NIGHT" } }} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(close).toHaveBeenCalledOnce();
});

test("closing the sheet keeps the conversation; only explicit end closes it", async () => {
  const mine = view(), close = vi.fn(), refresh = vi.fn();
  mine.social = { invitations: [], activeWhisper: { id: "w", participants: [1, 2], messages: [{ id: "m", seat: 2, text: "只有双方可见", createdAt: 1 }] } };
  render(<SocialRoom code="ABCDEF" view={mine} open onClose={close} onRefresh={refresh} drafts={{}} setDrafts={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "关闭与 乙 私聊" }));
  expect(close).toHaveBeenCalledOnce(); expect(leaveWhisper).not.toHaveBeenCalled();
  const end = screen.getByRole("button", { name: "结束私聊" });
  expect(end.closest("footer")).not.toBeNull();
  fireEvent.click(end);
  await waitFor(() => expect(leaveWhisper).toHaveBeenCalledWith("ABCDEF"));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
