// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ExperienceEvent } from "@ravens/contracts";
import type { GameView, PrivateView } from "../api.js";
import { PlayerGame } from "../pages/PlayerGame.js";
import { readSession, saveSession } from "../App.js";
import { EventStage, eventAt, publicEventsAt } from "./EventStage.js";

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.useRealTimers(); window.history.replaceState({}, "", "/"); });
const epoch = 1_790_500_000_000;
function shot(overrides: Partial<ExperienceEvent> = {}): ExperienceEvent { return { id: "shot-1", gameId: "game-1", seq: 1, kind: "SHOT", message: "三号死亡。", occurredAt: epoch, startsAt: epoch + 1_500, durationMs: 4_500, actorSeat: 1, targetSeat: 3, outcome: "DEATH", ...overrides }; }
function game(events: ExperienceEvent[], now = epoch): GameView { return { gameId: "game-1", serverNow: now, phase: "DAY_DISCUSSION", day: 1, events, readyCount: 0, aliveCount: 4, seats: [1, 2, 3, 4, 5].map((seat) => ({ seat, nickname: `${seat}号玩家`, alive: seat !== 3, connected: true, ghostVoteAvailable: true })) }; }

test("events share a wall-clock timeline, cover the delivery lead, and never replay completed shots", () => {
  const event = shot();
  expect(eventAt([event], epoch - 1, new Set())).toBeUndefined();
  expect(eventAt([event], epoch, new Set())?.id).toBe("shot-1");
  expect(eventAt([event], epoch + 6_000, new Set())).toBeUndefined();
  expect(eventAt([event], epoch + 2_000, new Set(["shot-1"]))).toBeUndefined();
});

test("polling new arrays does not cancel the death presentation's expiry", () => {
  vi.useFakeTimers(); vi.setSystemTime(epoch);
  const event = shot({ startsAt: epoch });
  const view = render(<EventStage game={game([event])} />);
  expect(screen.getByRole("dialog", { name: "城镇公开演出" })).toBeVisible();
  const originalAnimationDelay = screen.getByRole("dialog", { name: "城镇公开演出" }).style.getPropertyValue("--scene-delay");
  for (let index = 1; index <= 3; index++) { act(() => vi.advanceTimersByTime(1_200)); view.rerender(<EventStage game={game([{ ...event }], epoch + index * 1_200)} />); }
  expect(screen.getByRole("heading", { name: "枪声之后，一盏灯熄灭" })).toBeVisible();
  expect(screen.getByRole("dialog", { name: "城镇公开演出" }).style.getPropertyValue("--scene-delay")).toBe(originalAnimationDelay);
  act(() => vi.advanceTimersByTime(1_200));
  expect(screen.queryByRole("dialog", { name: "城镇公开演出" })).not.toBeInTheDocument();
});

test("skipping a public event persists per game and does not replay after remount", () => {
  vi.useFakeTimers(); vi.setSystemTime(epoch);
  const event = shot(); const view = render(<EventStage game={game([event])} />);
  fireEvent.click(screen.getByRole("button", { name: "跳过演出" }));
  expect(screen.queryByRole("dialog", { name: "城镇公开演出" })).not.toBeInTheDocument();
  view.unmount(); render(<EventStage game={game([event])} />);
  act(() => vi.advanceTimersByTime(80));
  expect(screen.queryByRole("dialog", { name: "城镇公开演出" })).not.toBeInTheDocument();
});

test("a small server clock correction cannot prematurely consume a public gunshot", () => {
  vi.useFakeTimers(); vi.setSystemTime(epoch);
  const event = shot(); const stage = render(<EventStage game={game([event])} />);
  expect(screen.getByRole("dialog", { name: "城镇公开演出" })).toBeVisible();
  stage.rerender(<EventStage game={game([event], epoch - 120)} />);
  act(() => vi.advanceTimersByTime(80));
  act(() => vi.advanceTimersByTime(240));
  expect(screen.getByRole("dialog", { name: "城镇公开演出" })).toBeVisible();
  expect(JSON.parse(sessionStorage.getItem("ravens_events_game-1") ?? "[]")).not.toContain("shot-1");
});

test("the public log withholds queued identity reveals until their server time", () => {
  const identity = shot({ id: "identity", kind: "NOTICE", message: "身份揭晓：3号是恶魔", durationMs: 0, startsAt: epoch + 10_000 });
  expect(publicEventsAt([shot(), identity], epoch + 2_000).map((event) => event.id)).toEqual(["shot-1"]);
  expect(publicEventsAt([identity], epoch + 10_000)[0]?.message).toContain("身份揭晓");
});

test("opening a display tab cannot overwrite the player tab's session", () => {
  saveSession({ roomCode: "ABCDEF", mode: "PLAYER", participantId: "player-1" });
  const playerSession = sessionStorage.getItem("ravens_room_session")!;
  saveSession({ roomCode: "ABCDEF", mode: "DISPLAY" });
  expect(readSession()?.mode).toBe("DISPLAY");
  sessionStorage.setItem("ravens_room_session", playerSession);
  expect(readSession()).toMatchObject({ mode: "PLAYER", participantId: "player-1" });
  expect(JSON.parse(localStorage.getItem("ravens_room_session")!).mode).toBe("PLAYER");
});

const handlers = { busy: false, canRestart: false, onBack: vi.fn(), onConfirmRole: vi.fn(), onSubmitAction: vi.fn(), onNominate: vi.fn(), onCancelNomination: vi.fn(), onVote: vi.fn(), onReady: vi.fn(), onUseAbility: vi.fn(), onRestart: vi.fn(), onOpenGuide: vi.fn() };
function player(): PrivateView { return { participant: { id: "p1", nickname: "1号玩家", seat: 1 }, state: "RUNNING", playMode: "IN_PERSON", role: { roleId: "poisoner", alignment: "EVIL", type: "MINION", name: "投毒者", summary: "每晚投毒", beginnerTip: "保守秘密" }, messages: [], history: [], game: game([], Date.now()), canClaimSlayer: true, dayAbilityTargets: [1, 2, 3, 4, 5] }; }

test("in-person players have the complete town and can inspect a dead player's ghost vote", () => {
  render(<PlayerGame {...handlers} view={player()} />);
  fireEvent.click(screen.getByRole("button", { name: "公开城镇" }));
  expect(screen.getByRole("region", { name: "公开城镇" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "3号 3号玩家 已死亡" }));
  expect(screen.getByText("仍可讨论 · 保留一枚幽灵票")).toBeVisible();
});

test("private cover removes the poison animation and private target from view", () => {
  render(<PlayerGame {...handlers} view={player()} receipt={{ id: "private-1", kind: "POISON", target: "秘密目标" }} />);
  expect(screen.getByRole("status", { name: "仅你可见的行动回执" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "◈ 遮住私密内容" }));
  expect(screen.queryByRole("status", { name: "仅你可见的行动回执" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "私密内容已遮住" })).toBeVisible();
});

test("a dead player confirms the single ghost vote before sending it", () => {
  const view = player(); view.participant.seat = 3; view.game!.phase = "VOTING"; view.game!.nomination = { nominatorSeat: 1, nomineeSeat: 2, votesReceived: 0, votesRaised: 0, threshold: 2 };
  const onVote = vi.fn(); render(<PlayerGame {...handlers} onVote={onVote} view={view} />);
  fireEvent.click(screen.getByRole("button", { name: "举手赞成" })); expect(onVote).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认使用幽灵票" })); expect(onVote).toHaveBeenCalledWith(true);
});

test("non-slayer living players can make the same public claim without leaking their role", () => {
  const onUseAbility = vi.fn(); render(<PlayerGame {...handlers} onUseAbility={onUseAbility} view={player()} />);
  fireEvent.click(screen.getByText("公开宣称猎魔人能力"));
  fireEvent.click(screen.getByRole("button", { name: "33号玩家已死亡" }));
  fireEvent.click(screen.getByRole("button", { name: "公开射击所选玩家" })); expect(onUseAbility).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认公开开枪" })); expect(onUseAbility).toHaveBeenCalledWith(3);
});

test("a ghost confirmation stops accepting a vote once its seat has been counted", () => {
  const view = player(); view.participant.seat = 3; view.canVote = true; view.game!.phase = "VOTING"; view.game!.nomination = { nominatorSeat: 1, nomineeSeat: 2, votesReceived: 0, votesRaised: 0, threshold: 2, voterOrder: [3, 4, 5, 1, 2], countedSeats: [] };
  const onVote = vi.fn(); const content = render(<PlayerGame {...handlers} onVote={onVote} view={view} />);
  fireEvent.click(screen.getByRole("button", { name: "举手赞成" }));
  content.rerender(<PlayerGame {...handlers} onVote={onVote} view={{ ...view, canVote: false, game: { ...view.game!, nomination: { ...view.game!.nomination!, countedSeats: [3], countedVotes: { 3: false } } } }} />);
  expect(screen.getByRole("button", { name: "确认使用幽灵票" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "确认使用幽灵票" })); expect(onVote).not.toHaveBeenCalled();
  expect(screen.getByText("你的票已锁定：未举手")).toBeVisible();
});

test("storyteller decisions remain hidden until the final public presentation ends", () => {
  const view = player(); view.game!.phase = "GAME_OVER"; view.game!.winner = "GOOD"; view.game!.presentationUntil = view.game!.serverNow! + 5_000;
  view.storytellerDecisions = [{ id: "decision-1", day: 1, seat: 3, ability: "test", choice: "本局信息选择", reason: "该信息受中毒影响。" }];
  const content = render(<PlayerGame {...handlers} view={view} />);
  expect(screen.queryByText(/说书人裁量复盘/)).not.toBeInTheDocument();
  content.rerender(<PlayerGame {...handlers} view={{ ...view, game: { ...view.game!, serverNow: view.game!.presentationUntil } }} />);
  fireEvent.click(screen.getByText(/说书人裁量复盘/));
  expect(screen.getByText("该信息受中毒影响。")).toBeVisible();
});
