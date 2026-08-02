// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App.js";
import { Home } from "./pages/Home.js";
import { Lobby } from "./pages/Lobby.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { Tutorial } from "./pages/Tutorial.js";

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
  render(<PlayerGame busy={false} canRestart={false} onBack={gameBack} onConfirmRole={vi.fn()} onSubmitAction={vi.fn()} onNominate={vi.fn()} onVote={vi.fn()} onReady={vi.fn()} onUseAbility={vi.fn()} onRestart={vi.fn()} onOpenGuide={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "← 返回首页" }));
  expect(gameBack).toHaveBeenCalledOnce();
});
