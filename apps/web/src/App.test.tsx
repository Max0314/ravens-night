// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App.js";
import { Home } from "./pages/Home.js";
import { Lobby } from "./pages/Lobby.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { SeatOrderEditor } from "./pages/Display.js";
import { Tutorial } from "./pages/Tutorial.js";
import type { PrivateView } from "./api.js";
import { rolePlayGuides } from "./guide-content.js";
import { beginnerRoles } from "@ravens/content";

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

test("the first screen gives an authorized newcomer one clear way to join", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "加入一局" }));
  expect(screen.getByRole("heading", { name: "进入村庄" })).toBeVisible();
  expect(screen.getByLabelText("六位邀请码")).toHaveAttribute("inputMode", "text");
});

test("the home screen exposes an interactive tutorial and the complete role compendium", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  await screen.findByRole("heading", { name: "今夜，每个人都有秘密" });
  fireEvent.click(screen.getByRole("button", { name: "先看 3 分钟教程" }));
  expect(screen.getByRole("dialog", { name: "游戏帮助" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "两个阵营，一项使命" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "下一条" }));
  expect(screen.getByRole("heading", { name: "系统就是隐形说书人" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "角色表" }));
  expect(screen.getByText("暗流涌动 · 22 个角色")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /洗衣妇/ }));
  expect(screen.getByRole("heading", { name: "洗衣妇" })).toBeVisible();
  expect(screen.getByRole("img", { name: "洗衣妇角色立绘" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "冒充与反制" })).toBeVisible();
  expect(screen.getByText(/邪恶冒充洗衣妇/)).toBeVisible();
});

test("every role has a detailed play guide", () => {
  expect(beginnerRoles.every((role) => Boolean(rolePlayGuides[role.id]))).toBe(true);
  const butlerGuide = rolePlayGuides.butler;
  expect(butlerGuide).toBeDefined();
  expect(butlerGuide!.mechanics).toContain("必须选择一名其他玩家");
  expect(butlerGuide!.mechanics).toContain("不能跳过");
});

test("evil first-night intelligence prominently shows teammate names and seat numbers", () => {
  const view = playerView("DAY_DISCUSSION");
  view.game!.phase = "FIRST_NIGHT";
  view.game!.day = 0;
  view.role = { roleId: "poisoner", alignment: "EVIL", type: "MINION", name: "投毒者", summary: "每夜选择一人投毒。", beginnerTip: "隐藏你的身份。" };
  view.history = [
    { seq: 1, phase: "ROLE_REVEAL", day: 0, kind: "IDENTITY", text: "你的身份是投毒者。" },
    { seq: 2, phase: "ROLE_REVEAL", day: 0, kind: "INFORMATION", text: "恶魔是 小陈（6号）；其他爪牙：无。" },
    { seq: 3, phase: "ROLE_REVEAL", day: 0, kind: "NOTICE", text: "本项目小局规则：邪恶玩家会在首夜得知队友姓名与编号；小恶魔不会获得三个安全伪装。" },
  ];
  view.action = { kind: "SELECT_ONE", legalSeats: [1, 2, 3, 4, 5, 6], minTargets: 1, maxTargets: 1, prompt: "选择今晚投毒的玩家" };

  render(<PlayerGame view={view} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  const intel = screen.getByText("邪恶阵营首夜情报").parentElement!;
  expect(intel).toBeVisible();
  expect(within(intel).getByText("恶魔是 小陈（6号）；其他爪牙：无。")).toBeVisible();
  expect(within(intel).getByText(/邪恶玩家会在首夜得知队友姓名与编号/)).toBeVisible();
});

test("joining from a television has a distinct public-display choice", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  await screen.findByRole("heading", { name: "今夜，每个人都有秘密" });
  fireEvent.click(screen.getByRole("button", { name: "加入一局" }));
  fireEvent.click(screen.getByRole("button", { name: /电视公共大屏/ }));
  expect(screen.queryByLabelText("你的昵称")).not.toBeInTheDocument();
  expect(screen.getByText("电脑连接电视 · 只显示公开城镇信息")).toBeVisible();
});

test("the public display reorders seats by drag or keyboard before the game", () => {
  const onReorder = vi.fn();
  const players = [
    { id: "p1", nickname: "原房主", mode: "PLAYER" as const, seat: 1, connected: true },
    { id: "p2", nickname: "二号", mode: "PLAYER" as const, seat: 2, connected: true },
    { id: "p3", nickname: "三号", mode: "PLAYER" as const, seat: 3, connected: true },
  ];
  render(<SeatOrderEditor players={players} busy={false} onReorder={onReorder} />);

  fireEvent.keyDown(screen.getByLabelText("二号，当前 2 号，可拖动调整座位"), { key: "ArrowLeft" });
  expect(onReorder).toHaveBeenLastCalledWith(["p2", "p1", "p3"]);

  const transfer = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => transfer.set(type, value),
    getData: (type: string) => transfer.get(type) ?? "",
  };
  fireEvent.dragStart(screen.getByLabelText("三号，当前 3 号，可拖动调整座位"), { dataTransfer });
  fireEvent.dragOver(screen.getByLabelText("原房主，当前 1 号，可拖动调整座位"), { dataTransfer });
  fireEvent.drop(screen.getByLabelText("原房主，当前 1 号，可拖动调整座位"), { dataTransfer });
  expect(onReorder).toHaveBeenLastCalledWith(["p3", "p1", "p2"]);
});

test("a scanned invitation opens the join form with its room code filled in", async () => {
  window.history.replaceState({}, "", "/?room=C8TME8");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "进入村庄" })).toBeVisible();
  expect(screen.getByLabelText("六位邀请码")).toHaveValue("C8TME8");
});

test("an unauthorized visitor sees the access-password login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: false }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "钟楼只为受邀者敲响" })).toBeVisible();
  expect(screen.getByLabelText("访问口令")).toHaveAttribute("type", "password");
});

test("the lobby provides an explicit way to leave and switch rooms", () => {
  const onLeave = vi.fn();
  render(<Lobby room={{ code: "ABC123", state: "LOBBY", playerCount: 6, participants: [{ id: "p1", nickname: "创建者", mode: "PLAYER", seat: 1, connected: true }] }} onBegin={vi.fn()} onLeave={onLeave} onTutorial={vi.fn()} onRoles={vi.fn()} canBegin busy={false} />);
  fireEvent.click(screen.getByRole("button", { name: "退出房间" }));
  expect(onLeave).toHaveBeenCalledOnce();
});

test("the home screen preserves an active game and offers a clear resume action", () => {
  const onResume = vi.fn();
  render(<Home onCreate={vi.fn()} onJoin={vi.fn()} onTutorial={vi.fn()} onRoles={vi.fn()} activeRoom={{ code: "ABC123", state: "RUNNING", playerCount: 6, participants: [] }} activeMode="PLAYER" onResume={onResume} />);
  expect(screen.getByText("本局仍在进行，身份和座位已为你保留")).toBeVisible();
  expect(screen.queryByRole("button", { name: "退出并更换房间" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "继续当前房间" }));
  expect(onResume).toHaveBeenCalledOnce();
});

test("tutorial and game waiting screens always provide a safe return", () => {
  const tutorialBack = vi.fn();
  const { unmount } = render(<Tutorial onBack={tutorialBack} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "← 返回首页" }));
  expect(tutorialBack).toHaveBeenCalledOnce();
  unmount();

  const gameBack = vi.fn();
  render(<PlayerGame busy={false} canRestart={false} onBack={gameBack} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "← 返回首页" }));
  expect(gameBack).toHaveBeenCalledOnce();
});

test("the room tutorial can be skipped with one action", () => {
  const onDone = vi.fn();
  render(<Tutorial onBack={vi.fn()} onDone={onDone} />);
  expect(screen.getByText("跳过后，游戏中仍可随时打开教程和角色表。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "跳过教程，查看身份" }));
  expect(onDone).toHaveBeenCalledOnce();
});

test("the expanded tutorial teaches role skills and concrete bluffing examples", () => {
  render(<Tutorial onBack={vi.fn()} onDone={vi.fn()} />);
  for (let step = 0; step < 6; step += 1) fireEvent.click(screen.getByRole("button", { name: "我明白了" }));
  expect(screen.getByRole("heading", { name: "邪恶如何冒充镇民" })).toBeVisible();
  expect(screen.getByText(/男爵声称.*投毒者/)).toBeVisible();
});

test("a nomination is confirmed before submission and may be abandoned", () => {
  const onNominate = vi.fn();
  render(<PlayerGame view={playerView("DAY_DISCUSSION")} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={onNominate} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /被提名人.*提名/ }));
  expect(screen.getByText("确认提名 被提名人（2号）？")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "暂不提名" }));
  expect(screen.queryByText("确认提名 被提名人（2号）？")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /被提名人.*提名/ }));
  fireEvent.click(screen.getByRole("button", { name: "确认提名" }));
  expect(onNominate).toHaveBeenCalledWith(2);
});

test("the nominator can cancel before voting and a voter can switch their hand", () => {
  const onCancelNomination = vi.fn();
  const onVote = vi.fn();
  const initial = playerView("VOTING");
  const { rerender } = render(<PlayerGame view={initial} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={onCancelNomination} onVote={onVote} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "取消本次提名" }));
  expect(onCancelNomination).toHaveBeenCalledOnce();

  const raised = playerView("VOTING");
  raised.voteRaised = true;
  raised.game!.nomination!.votesReceived = 1;
  rerender(<PlayerGame view={raised} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={onCancelNomination} onVote={onVote} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  expect(screen.getByRole("button", { name: "举手赞成" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "取消本次提名" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "放下手" }));
  expect(onVote).toHaveBeenCalledWith(false);
});

test("private identity, actions, and clues are grouped into a readable timeline", () => {
  const view = playerView("DAY_DISCUSSION");
  view.history = [
    { seq: 1, phase: "ROLE_REVEAL", day: 0, kind: "IDENTITY", text: "你的身份是占卜师。" },
    { seq: 2, phase: "FIRST_NIGHT", day: 0, kind: "ACTION", text: "你选择查验二号与三号。" },
    { seq: 3, phase: "FIRST_NIGHT", day: 0, kind: "INFORMATION", text: "占卜结果：是。" },
  ];
  render(<PlayerGame view={view} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);

  const drawer = screen.getByText("我的身份与线索记录").closest("details");
  expect(drawer).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("我的身份与线索记录"));
  expect(drawer).toHaveAttribute("open");
  expect(screen.getByRole("heading", { name: "首夜" })).toBeVisible();
  expect(screen.getByText("你选择查验二号与三号。")).toBeVisible();
  expect(screen.getByText("占卜结果：是。")).toBeVisible();
  expect(screen.getByText("我的行动")).toBeVisible();
  expect(screen.getByText("收到线索")).toBeVisible();
});

test("a submitted night action explains when its information will appear", () => {
  const view = playerView("DAY_DISCUSSION");
  view.game!.phase = "FIRST_NIGHT";
  view.game!.day = 0;
  delete view.action;
  view.history.push({ seq: 2, phase: "FIRST_NIGHT", day: 0, kind: "ACTION", text: "你选择查验二号与三号。" });

  render(<PlayerGame view={view} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  expect(screen.getByText("你的选择已记录。等本夜所有角色完成行动后，结果会出现在下方记录中。")).toBeVisible();
});

function playerView(phase: "DAY_DISCUSSION" | "VOTING"): PrivateView {
  const seats = [
    { seat: 1, nickname: "提名人", connected: true, alive: true, ghostVoteAvailable: true },
    { seat: 2, nickname: "被提名人", connected: true, alive: true, ghostVoteAvailable: true },
    { seat: 3, nickname: "三号", connected: true, alive: true, ghostVoteAvailable: true },
    { seat: 4, nickname: "四号", connected: true, alive: true, ghostVoteAvailable: true },
    { seat: 5, nickname: "五号", connected: true, alive: true, ghostVoteAvailable: true },
  ];
  return {
    participant: { id: "p1", nickname: "提名人", seat: 1 },
    state: "RUNNING",
    role: { roleId: "chef", alignment: "GOOD", type: "TOWNSFOLK", name: "厨师", summary: "测试能力", beginnerTip: "测试提示" },
    roleConfirmed: true,
    messages: ["你的身份是厨师。"],
    history: [{ seq: 1, phase: "ROLE_REVEAL", day: 0, kind: "IDENTITY", text: "你的身份是厨师。" }],
    game: {
      phase,
      day: 1,
      seats,
      events: [],
      readyCount: 0,
      aliveCount: 5,
      ...(phase === "VOTING" ? { nomination: { nominatorSeat: 1, nomineeSeat: 2, votesReceived: 0, votesRaised: 0, threshold: 3 } } : {}),
    },
    action: { kind: phase === "VOTING" ? "VOTE" : "DAY", legalSeats: seats.map((seat) => seat.seat), minTargets: 0, maxTargets: phase === "VOTING" ? 0 : 1, prompt: "测试操作" },
  };
}
