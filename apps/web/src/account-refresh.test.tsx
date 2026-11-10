// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

afterEach(()=>{cleanup();sessionStorage.clear();localStorage.clear();vi.unstubAllGlobals();});

test("refreshing an already signed-in page accepts the SDK's initial identity without another loading screen",async()=>{
  sessionStorage.setItem("ravens_account_context","fixture-account");
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url==="/api/auth/session"?{authorized:true}:{signedIn:true,rooms:[]}})));
  // Import after the stored identity, as a real page refresh loads its modules.
  const {App}=await import("./App.js");
  render(<App/>);await screen.findByRole("heading",{name:"鸦钟夜话"});
  fireEvent(window,new CustomEvent("fribench:account-change",{detail:{authenticated:true,accountKey:"fixture-account"}}));
  expect(screen.getByRole("heading",{name:"鸦钟夜话"})).toBeVisible();
  expect(screen.queryByLabelText("正在进入钟楼")).not.toBeInTheDocument();
  expect(sessionStorage.getItem("ravens_account_context")).toBe("fixture-account");
});
