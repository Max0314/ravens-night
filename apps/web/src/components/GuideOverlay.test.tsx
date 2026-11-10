// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { GuideOverlay } from "./GuideOverlay.js";
afterEach(()=>{cleanup();window.history.replaceState({},"","/");});

test("live room refreshes preserve help focus and Escape uses the current close handler", () => {
  const firstClose = vi.fn();
  const nextClose = vi.fn();
  const view = render(<GuideOverlay mode="roles" onClose={firstClose} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: /镇长/ })).toHaveFocus();
  const rolesTab = screen.getByRole("button", { name: "角色表" });
  rolesTab.focus();
  view.rerender(<GuideOverlay mode="roles" onClose={nextClose} />);
  expect(rolesTab).toHaveFocus();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(nextClose).toHaveBeenCalledOnce();
  expect(firstClose).not.toHaveBeenCalled();
});


test("role category tabs expose one group, support keyboard switching and constrain detail navigation", () => {
  render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("button",{name:"查看洗衣妇详情"})).toBeVisible();
  expect(screen.queryByRole("button",{name:"查看管家详情"})).not.toBeInTheDocument();
  const town=screen.getByRole("tab",{name:/镇民/});
  fireEvent.keyDown(town,{key:"ArrowRight"});
  expect(screen.getByRole("tab",{name:/外来者/})).toHaveFocus();
  expect(screen.getByRole("button",{name:"查看管家详情"})).toBeVisible();
  expect(screen.queryByRole("button",{name:"查看洗衣妇详情"})).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("tab",{name:/外来者/}),{key:"End"});
  fireEvent.click(screen.getByRole("button",{name:"查看小恶魔详情"}));
  expect(screen.getByRole("button",{name:"上一位"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"下一位"})).toBeDisabled();
});
