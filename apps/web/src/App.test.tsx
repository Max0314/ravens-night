// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => vi.unstubAllGlobals());

test("the first screen gives an authorized newcomer one clear way to join", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "加入一局" }));
  expect(screen.getByRole("heading", { name: "进入村庄" })).toBeVisible();
  expect(screen.getByLabelText("六位邀请码")).toHaveAttribute("inputMode", "text");
});

test("an unauthorized visitor sees the access-password login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authorized: false }) }));
  render(<App />);
  expect(await screen.findByRole("heading", { name: "钟楼只为受邀者敲响" })).toBeVisible();
  expect(screen.getByLabelText("访问口令")).toHaveAttribute("type", "password");
});
