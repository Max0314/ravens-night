// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App.js";

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
