// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {afterEach, expect, test} from "vitest";
import { RoleCard } from "./RoleCard.js";
afterEach(cleanup);

test("a player can instantly cover and reveal private role information", () => {
  render(<RoleCard name="共情者" alignment="善良 · 镇民" ability="每夜得知邻座中邪恶玩家的数量。" portraitUrl="/portrait.webp" />);
  expect(screen.getByText("共情者")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "遮住身份" }));
  expect(screen.queryByText("共情者")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "显示身份" }));
  expect(screen.getByText("共情者")).toBeVisible();
});

test('covering a framed private card removes its portrait and taxonomy ornament',()=>{
  const view=render(<RoleCard name="小恶魔" alignment="邪恶 · 恶魔" ability="能力" portraitUrl="/imp.webp" frameUrl="/demon.webp" frameSrcSet="/demon-small.webp 240w, /demon.webp 960w"/>);
  expect(view.container.querySelector('.rn-portrait-frame__ornament')).toHaveAttribute('src','/demon.webp');
  expect(screen.getAllByRole('img')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'遮住身份'}));
  expect(view.container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'显示身份'}));
  expect(screen.getByRole('img',{name:'小恶魔角色立绘'})).toHaveAttribute('src','/imp.webp');
});
