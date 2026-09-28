// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { GuideOverlay } from "./GuideOverlay.js";

test("live room refreshes preserve help focus and Escape uses the current close handler", () => {
  const firstClose = vi.fn();
  const nextClose = vi.fn();
  const view = render(<GuideOverlay mode="roles" onClose={firstClose} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: /小恶魔/ })).toHaveFocus();
  const rolesTab = screen.getByRole("button", { name: "角色表" });
  rolesTab.focus();
  view.rerender(<GuideOverlay mode="roles" onClose={nextClose} />);
  expect(rolesTab).toHaveFocus();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(nextClose).toHaveBeenCalledOnce();
  expect(firstClose).not.toHaveBeenCalled();
});
