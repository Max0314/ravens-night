// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App.js";
import { Home } from "./pages/Home.js";
import { Lobby } from "./pages/Lobby.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { SeatOrderEditor } from "./pages/Display.js";
import { Tutorial } from "./pages/Tutorial.js";
import type { PrivateView } from "./api.js";
import { rolePlayGuides } from "./guide-content.js";
import { beginnerRoles } from "@ravens/content";

beforeEach(()=>{vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals();vi.restoreAllMocks(); });

test("the first screen gives an authorized newcomer one clear way to join", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "鸦钟夜话" })).toBeVisible();
  expect(screen.getByRole("link", { name: "渝ICP备2026016967号-1" })).toHaveAttribute("href", "https://beian.miit.gov.cn/");
  expect(screen.getByRole("link", { name: "渝公网安备 50010502504754号" })).toHaveAttribute("href", "https://beian.mps.gov.cn/#/query/webSearch?code=50010502504754");
  fireEvent.click(screen.getByRole("button", { name: "加入房间" }));
  expect(screen.getByRole("heading", { name: "加入房间" })).toBeVisible();
  expect(screen.getByLabelText("六位邀请码")).toHaveAttribute("inputMode", "text");
});

test("the initial account notification cannot return a loaded home screen to the moon loader",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url==="/api/auth/session"?{authorized:true}:{signedIn:false,rooms:[]}})));
  render(<App/>);await screen.findByRole("heading",{name:"鸦钟夜话"});
  fireEvent(window,new CustomEvent("fribench:account-change",{detail:{authenticated:false,accountKey:null}}));
  expect(screen.getByRole("heading",{name:"鸦钟夜话"})).toBeVisible();
  expect(screen.queryByLabelText("正在进入钟楼")).not.toBeInTheDocument();
});

test("an unchanged account notification during initial requests still finishes entering the game",async()=>{
  let finish!:(value:unknown)=>void;
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>url==="/api/auth/session"?new Promise(resolve=>{finish=resolve;}):{ok:true,json:async()=>({signedIn:false,rooms:[]})}));
  render(<App/>);fireEvent(window,new CustomEvent("fribench:account-change",{detail:{authenticated:false,accountKey:null}}));
  finish({ok:true,json:async()=>({authorized:true})});
  expect(await screen.findByRole("heading",{name:"鸦钟夜话"})).toBeVisible();
});

test("the home screen exposes an interactive tutorial and the complete role compendium", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  await screen.findByRole("heading", { name: "鸦钟夜话" });
  fireEvent.click(screen.getByRole("button", { name: "查看教程" }));
  expect(screen.getByRole("dialog", { name: "游戏帮助" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "阵营与胜负" })).toBeVisible();
  const tutorialBody=screen.getByRole("heading", {name:"阵营与胜负"}).closest(".guide-tutorial__body")!;tutorialBody.scrollTop=160;
  fireEvent.click(screen.getByRole("button", { name: "下一条" }));
  expect(screen.getByRole("heading", { name: "昼夜流程" })).toBeVisible();
  expect(tutorialBody.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "角色表" }));
  expect(screen.getByRole("tablist",{name:"角色分类"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /洗衣妇/ }));
  expect(screen.getByRole("article",{name:"洗衣妇详情"})).toBeVisible();
  expect(screen.getByRole("img", { name: "洗衣妇角色立绘" })).toBeVisible();
  fireEvent.click(screen.getByText("游玩建议与示例"));
  expect(screen.getByRole("heading", { name: "冒充与反制" })).toBeVisible();
  expect(screen.getByText(/邪恶冒充洗衣妇/)).toBeVisible();
  const detail=screen.getByRole('article',{name:'洗衣妇详情'}),scroll=detail.closest('.guide-scroll')??detail;
  scroll.scrollTop=120;
  const originalHidden=Object.getOwnPropertyDescriptor(document,'hidden');
  try{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document,'hidden',{configurable:true,value:false});act(()=>document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('article',{name:'洗衣妇详情'})).toBe(detail);expect(scroll.scrollTop).toBe(120);
    expect(screen.getByRole('heading',{name:'冒充与反制'})).toBeVisible();
  }finally{if(originalHidden)Object.defineProperty(document,'hidden',originalHidden);else delete (document as {hidden?:boolean}).hidden;}

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
  view.history=[];delete view.action;
  view.startInfo={infoId:'private-info',gameId:'game',team:[{seat:6,nickname:'小陈',kind:'DEMON'}],bluffs:[],acknowledged:false,canAcknowledge:true};
  const acknowledge=vi.fn();render(<PlayerGame view={view} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onConfirmStartInfo={acknowledge} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'首夜信息 · 仅你可见'})).toBeVisible();expect(screen.getByText('[小陈]')).toBeVisible();expect(screen.getByText('恶魔')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'已知晓'}));expect(acknowledge).toHaveBeenCalledWith('private-info');

});

test("joining from a television has a distinct public-display choice", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  await screen.findByRole("heading", { name: "鸦钟夜话" });
  fireEvent.click(screen.getByRole("button", { name: "加入房间" }));
  fireEvent.click(screen.getByRole("button", { name: /使用公共大屏/ }));
  expect(screen.queryByLabelText("你的昵称")).not.toBeInTheDocument();
  expect(screen.getByText("大屏只显示公开城镇信息。")).toBeVisible();
});

test("the public display reorders seats by drag or keyboard before the game", () => {
  const onReorder = vi.fn();
  const players = [
    { id: "p1", nickname: "原房主", mode: "PLAYER" as const, seat: 1, connected: true },
    { id: "p2", nickname: "二号", mode: "PLAYER" as const, seat: 2, connected: true },
    { id: "p3", nickname: "三号", mode: "PLAYER" as const, seat: 3, connected: true },
  ];
  render(<SeatOrderEditor players={players} busy={false} onReorder={onReorder} />);

  const handle=screen.getByRole('button',{name:'2号 二号'});fireEvent.keyDown(handle,{key:' '});fireEvent.keyDown(handle,{key:'ArrowLeft'});fireEvent.keyDown(handle,{key:' '});expect(onReorder).toHaveBeenLastCalledWith(['p2','p1','p3']);

});

test("a scanned invitation opens the join form with its room code filled in", async () => {
  window.history.replaceState({}, "", "/?room=C8TME8");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "加入房间" })).toBeVisible();
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
  fireEvent.click(screen.getByRole("button", { name: "离开房间" }));
  expect(onLeave).toHaveBeenCalledOnce();
});

test("the home screen preserves an active game and offers a clear resume action", () => {
  const onResume = vi.fn();
  render(<Home onCreate={vi.fn()} onJoin={vi.fn()} onTutorial={vi.fn()} onRoles={vi.fn()} activeRoom={{ code: "ABC123", state: "RUNNING", playerCount: 6, participants: [] }} activeMode="PLAYER" onResume={onResume} />);
  expect(screen.getByText("房间 ABC123 · 席位已保留")).toBeVisible();
  expect(screen.queryByRole("button", { name: "退出并更换房间" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "继续当前房间" }));
  expect(onResume).toHaveBeenCalledOnce();
});

test("tutorial keeps its return while game waits use the room menu", () => {
  const tutorialBack = vi.fn();
  const { unmount } = render(<Tutorial onBack={tutorialBack} onDone={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /返回首页/ }));
  expect(tutorialBack).toHaveBeenCalledOnce();
  unmount();

  const gameBack = vi.fn();
  render(<PlayerGame busy={false} canRestart={false} onBack={gameBack} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /返回首页/ })).not.toBeInTheDocument();
  expect(gameBack).not.toHaveBeenCalled();
});

test("the room tutorial can be skipped with one action", () => {
  const onDone = vi.fn();
  render(<Tutorial onBack={vi.fn()} onDone={onDone} />);
  fireEvent.click(screen.getByRole("button", { name: "跳过教学" }));
  expect(onDone).toHaveBeenCalledOnce();
});

test("the optional tutorial finishes in three cards and can be skipped from every card", () => {
  const done=vi.fn();render(<Tutorial onBack={vi.fn()} onDone={done}/>);
  for(let step=0;step<2;step++){expect(screen.getByRole("button",{name:"跳过教学"})).toBeEnabled();fireEvent.click(screen.getByRole("button",{name:"下一步"}));}
  fireEvent.click(screen.getByRole("button",{name:"完成教学"}));expect(done).toHaveBeenCalledOnce();
});

test("a nomination is confirmed before submission and may be abandoned", () => {
  const onNominate = vi.fn();
  render(<PlayerGame view={playerView("DAY_DISCUSSION")} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={onNominate} onCancelNomination={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "[被提名人] 存活" }));
  fireEvent.click(screen.getByRole("button", { name: "提名" }));
  expect(screen.getByRole("alertdialog",{name:"确认提名"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("alertdialog",{name:"确认提名"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"关闭玩家操作"}));

  fireEvent.click(screen.getByRole("button", { name: "[被提名人] 存活" }));
  fireEvent.click(screen.getByRole("button", { name: "提名" }));
  fireEvent.click(screen.getByRole("button", { name: "确认提名 [被提名人]" }));
  expect(onNominate).toHaveBeenCalledWith(2);
});

test("the nominator can cancel before voting and a voter can switch their hand", () => {
  const onCancelNomination = vi.fn();
  const onVote = vi.fn();
  const initial = playerView("VOTING");initial.canCancelNomination=true;
  const { rerender } = render(<PlayerGame view={initial} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={onCancelNomination} onVote={onVote} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "撤销提名 / 本轮表决" }));
  fireEvent.click(screen.getByRole("button", { name: "撤销提名（仍消耗今日次数）" }));
  expect(onCancelNomination).toHaveBeenCalledOnce();

  const raised = playerView("VOTING");
  raised.voteRaised = true;
  raised.game!.nomination!.votesReceived = 1;
  rerender(<PlayerGame view={raised} busy={false} canRestart={false} onBack={vi.fn()} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onCancelNomination={onCancelNomination} onVote={onVote} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  expect(screen.getByRole("button", { name: "举手" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "撤销提名（仍消耗今日次数）" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "放下" }));
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

  fireEvent.click(screen.getByRole("button",{name:/^记录/}));
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
  expect(screen.getByText("已提交 · 等待其他玩家")).toBeVisible();
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
