// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { RoleCard } from "./RoleCard.js";

test("a player can instantly cover and reveal private role information", () => {
  render(<RoleCard name="共情者" alignment="善良 · 镇民" ability="每夜得知邻座中邪恶玩家的数量。" portraitUrl="/portrait.webp" />);
  expect(screen.getByText("共情者")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "遮住身份" }));
  expect(screen.queryByText("共情者")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "显示身份" }));
  expect(screen.getByText("共情者")).toBeVisible();
});
