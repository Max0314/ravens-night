// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { roomSnapshot } from "./room-snapshot.js";
import { Lobby } from "./pages/Lobby.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { GuideOverlay } from "./components/GuideOverlay.js";
import { SocialRoom } from "./components/SocialRoom.js";
import { Avatar } from "./components/Avatar.js";
import { App } from "./App.js";
import { resetAccountContext, sendWhisper, type PrivateView, type RoomView } from "./api.js";
import type { WhisperDrafts } from "./whisper-drafts.js";
vi.mock("./api.js",async original=>({...await original<object>(),sendWhisper:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear();localStorage.clear();resetAccountContext();window.history.replaceState({},"","/");});
function fixture(): { room:RoomView; mine:PrivateView } {
  const players=Array.from({length:12},(_,i)=>({id:`p${i+1}`,nickname:`玩家${i+1}很长的名字`,mode:"PLAYER" as const,seat:i+1,ready:i>0,connected:true}));
  const room:RoomView={code:"ABCDEF",state:"RUNNING",roomInstanceId:"instance",setupId:"setup",revision:4,serverNow:1000,playerCount:12,organizerId:"p1",participants:players,self:{participantId:"p1",mode:"PLAYER",commandVersion:0},game:{gameId:"g",contextId:"c",phase:"VOTING",day:1,serverNow:1000,revision:4,aliveCount:11,readyCount:0,seats:players.map(p=>({...p,seat:p.seat,alive:p.seat!==1,ghostVoteAvailable:true})),events:[],nomination:{ballotId:"b",nominatorSeat:2,nomineeSeat:3,votesReceived:0,votesRaised:0,threshold:6,countedSeats:[],voterOrder:[4,5,6,7,8,9,10,11,12,1,2,3]}}};
  const mine:PrivateView={room,...room,participant:{id:"p1",nickname:"玩家1",seat:1},contextId:"c",role:{roleId:"chef",name:"厨师",alignment:"GOOD",type:"TOWNSFOLK",summary:"私密能力",beginnerTip:"提示"},history:[],messages:[],canVote:true,canEndDay:true,canNominate:false};
  return {room,mine};
}
const handlers={busy:false,canRestart:false,onBack:vi.fn(),onConfirmRole:vi.fn(),onSubmitAction:vi.fn(),onNominate:vi.fn(),onCancelNomination:vi.fn(),onVote:vi.fn(),onReady:vi.fn(),onUseAbility:vi.fn(),onRestart:vi.fn(),onOpenGuide:vi.fn()};
test("snapshot pairs reject older polls, crossed revisions, old account generations and old game after reset",()=>{
  const {room,mine}=fixture();const current=roomSnapshot({generation:1},{type:"accept",generation:1,room,privateView:mine});
  expect(roomSnapshot(current,{type:"accept",generation:0,room})).toBe(current);
  expect(roomSnapshot(current,{type:"accept",generation:1,room:{...room,revision:3}})).toBe(current);
  expect(roomSnapshot(current,{type:"accept",generation:1,room:{...room,serverNow:999},privateView:{...mine,room:{...room,serverNow:999}}})).toBe(current);
  expect(roomSnapshot(current,{type:"accept",generation:1,privateView:{...mine,revision:5}})).toBe(current);
  const lobby={...room,state:"LOBBY",setupId:"new",revision:6};delete lobby.game;
  const reset=roomSnapshot(current,{type:"accept",generation:1,room:lobby});expect(reset.privateView).toBeUndefined();
  expect(roomSnapshot(reset,{type:"accept",generation:1,room,privateView:mine})).toBe(reset);
  expect(roomSnapshot(roomSnapshot(reset,{type:"reset",generation:2}),{type:"accept",generation:1,room})).toEqual({generation:2});
});

test("refresh after a lost first join completes the saved ticket before asking for private state",async()=>{
  const {room,mine}=fixture();const lobby={...room,state:"LOBBY"};delete lobby.game;
  sessionStorage.setItem("ravens_room_session",JSON.stringify({roomCode:"ABCDEF",mode:"PLAYER",nickname:"原昵称",pendingJoin:true}));
  sessionStorage.setItem("ravens_join:ravens_room_session:ABCDEF:PLAYER","original-signed-ticket");
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>({ok:true,status:200,json:async()=>url==="/api/auth/session"?{authorized:true}:url==="/api/account"?{signedIn:false,rooms:[]}:url.endsWith("/join")?{id:"p1",nickname:"原昵称",mode:"PLAYER"}:url.endsWith("/me")?{...mine,room:lobby,state:"LOBBY"}:url.endsWith("/result")?{result:null}:lobby}));vi.stubGlobal("fetch",fetcher);
  render(<App/>);expect(await screen.findByRole("heading",{name:"ABCDEF"})).toBeVisible();const join=fetcher.mock.calls.find(call=>call[0].endsWith("/join"))!;expect(JSON.parse(String(join[1]?.body)).joinTicket).toBe("original-signed-ticket");expect(fetcher.mock.calls.some(call=>call[0].includes("join-ticket"))).toBe(false);expect(JSON.parse(sessionStorage.getItem("ravens_room_session")!).participantId).toBe("p1");
});

test("a replaced host keeps the valid player session after a stale management request is denied",async()=>{
  const {room,mine}=fixture();const lobby={...room,state:"LOBBY"};delete lobby.game;
  sessionStorage.setItem("ravens_room_session",JSON.stringify({roomCode:"ABCDEF",mode:"PLAYER",participantId:"p1"}));
  let claimed=false;
  const fetcher=vi.fn(async(url:string)=>{
    if(url.endsWith("/start")){claimed=true;return{ok:false,status:403,json:async()=>({errorCode:"HOST_REQUIRED",error:"只有现任房主可以操作"})};}
    const current={...lobby,revision:claimed?5:4,organizerId:claimed?"p2":"p1"};
    return{ok:true,status:200,json:async()=>url==="/api/auth/session"?{authorized:true}:url==="/api/account"?{signedIn:false,rooms:[]}:url.endsWith("/me")?{...mine,...current,game:undefined,room:current}:url.endsWith("/result")?{result:null}:current};
  });vi.stubGlobal("fetch",fetcher);
  render(<App/>);fireEvent.click(await screen.findByRole("button",{name:"准备并开始"}));
  expect(await screen.findByText("只有现任房主可以操作")).toBeVisible();
  expect(screen.getByRole("heading",{name:"ABCDEF"})).toBeVisible();expect(screen.queryByRole("heading",{name:"加入房间"})).not.toBeInTheDocument();
  expect(JSON.parse(sessionStorage.getItem("ravens_room_session")!).participantId).toBe("p1");expect(screen.queryByRole("button",{name:"准备并开始"})).not.toBeInTheDocument();
});

test("browser back closes ghost confirmation and public player detail before navigating away",async()=>{
  window.history.replaceState({ravensScreen:"GAME"},"","/");
  const navigate=vi.fn();window.addEventListener("popstate",navigate);
  try{
    const {mine}=fixture();render(<PlayerGame {...handlers} view={mine}/>);
    fireEvent.click(screen.getByRole("button",{name:"举手"}));expect(window.history.state.ravensLayer).toBeDefined();
    window.history.back();await waitFor(()=>expect(screen.queryByRole("alertdialog",{name:"使用鬼票"})).not.toBeInTheDocument());expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"城镇"}));fireEvent.click(screen.getByRole("button",{name:/2号 玩家2.*存活/}));expect(screen.getByRole("button",{name:"关闭玩家操作"})).toBeVisible();
    window.history.back();await waitFor(()=>expect(screen.queryByRole("button",{name:"关闭玩家操作"})).not.toBeInTheDocument());expect(navigate).not.toHaveBeenCalled();
    expect(window.history.state.ravensScreen).toBe("GAME");
  }finally{window.removeEventListener("popstate",navigate);}
});

test("browser back closes a role detail before the grid and does not accumulate replacement layers",async()=>{
  window.history.replaceState({ravensScreen:"HOME"},"","/");
  function Harness(){const[open,setOpen]=useState(true);return open?<GuideOverlay mode="roles" onClose={()=>setOpen(false)}/>:<p>已关闭图鉴</p>;}
  render(<Harness/>);fireEvent.click(screen.getByRole("tab",{name:/外来者/}));const baseLength=window.history.length;
  fireEvent.click(screen.getByRole("button",{name:/管家/}));window.history.back();
  await waitFor(()=>expect(screen.queryByRole("article",{name:"管家详情"})).not.toBeInTheDocument());expect(screen.getByRole("tab",{name:/外来者/})).toHaveAttribute("aria-selected","true");
  fireEvent.click(screen.getByRole("button",{name:/管家/}));expect(window.history.length).toBe(baseLength+1);window.history.back();
  await waitFor(()=>expect(screen.queryByRole("article",{name:"管家详情"})).not.toBeInTheDocument());window.history.back();await screen.findByText("已关闭图鉴");expect(window.history.state.ravensScreen).toBe("HOME");
});
test("12-seat lobby supports whole-card keyboard sorting, host-only self-ready start, offline prevention and avatar fallback",()=>{
  const {room}=fixture();room.state="LOBBY";const begin=vi.fn(),reorder=vi.fn();
  const props={room,participantId:"p1",onBegin:begin,onLeave:vi.fn(),onTutorial:vi.fn(),onRoles:vi.fn(),canBegin:true,busy:false,onReorder:reorder};
  const ui=render(<Lobby {...props}/>);expect(screen.getAllByRole("button",{name:/号 玩家/})).toHaveLength(12);
  fireEvent.click(screen.getByRole("button",{name:"准备并开始"}));expect(begin).toHaveBeenCalledWith("SKIP");
  const card=screen.getByRole("button",{name:/2号 玩家2/});fireEvent.keyDown(card,{key:" "});fireEvent.keyDown(card,{key:"ArrowLeft"});fireEvent.keyDown(card,{key:" "});expect(reorder.mock.calls[0]![0].slice(0,3)).toEqual(["p2","p1","p3"]);
  ui.rerender(<Lobby {...props} room={{...room,participants:room.participants.map((p,i)=>i===1?{...p,connected:false}:p)}}/>);expect(screen.getByRole("button",{name:"准备并开始"})).toBeDisabled();
  ui.unmount();const avatar=render(<Avatar id="p1" name="甲" url="https://auth.fribench.cn/assets/avatars/v1/cat-unbothered.webp"/>);fireEvent.error(avatar.container.querySelector("img")!);expect(screen.getByText("甲")).toBeVisible();
});
test("pointer reorder commits once on release, cancels on interruption and resets on roster change",()=>{
  class Pointer extends MouseEvent { pointerId:number;constructor(type:string,init:MouseEventInit & {pointerId?:number}={}){super(type,init);this.pointerId=init.pointerId??1;} }
  vi.stubGlobal("PointerEvent",Pointer);vi.useFakeTimers();
  const {room}=fixture();const reorder=vi.fn();const props={room:{...room,state:"LOBBY"},participantId:"p1",onBegin:vi.fn(),onLeave:vi.fn(),onTutorial:vi.fn(),onRoles:vi.fn(),canBegin:true,busy:false,onReorder:reorder};
  const ui=render(<Lobby {...props}/>);const handle=screen.getByRole("button",{name:/1号 玩家1很长的名字/});
  for(const node of ui.container.querySelectorAll<HTMLElement>('[data-player-id]')){const index=()=>Array.from(node.parentElement!.children).indexOf(node);Object.defineProperties(node,{offsetLeft:{get:()=>index()%4*100},offsetTop:{get:()=>Math.floor(index()/4)*130},offsetWidth:{get:()=>90},offsetHeight:{get:()=>120}});node.getBoundingClientRect=()=>({left:index()%4*100,top:Math.floor(index()/4)*130,width:90,height:120,right:0,bottom:0,x:0,y:0,toJSON(){}});}

  fireEvent.pointerDown(handle,{pointerId:1,button:0,clientX:0,clientY:0});fireEvent.pointerMove(handle,{pointerId:1,clientX:4,clientY:0});fireEvent.pointerUp(handle,{pointerId:1});expect(reorder).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle,{pointerId:1,button:0,clientX:0,clientY:0});act(()=>vi.advanceTimersByTime(600));fireEvent.pointerMove(handle,{pointerId:1,clientX:210,clientY:0});fireEvent.pointerCancel(handle,{pointerId:1});expect(reorder).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle,{pointerId:1,button:0,clientX:0,clientY:0});act(()=>vi.advanceTimersByTime(600));fireEvent.pointerMove(handle,{pointerId:1,clientX:210,clientY:0});fireEvent.pointerUp(handle,{pointerId:1,clientX:210,clientY:0});fireEvent.pointerUp(handle,{pointerId:1,clientX:210,clientY:0});expect(reorder).toHaveBeenCalledOnce();expect(reorder.mock.calls[0]![0].slice(0,3)).toEqual(["p2","p3","p1"]);
  fireEvent.pointerDown(handle,{pointerId:1,button:0,clientX:0,clientY:0});act(()=>vi.advanceTimersByTime(600));fireEvent.pointerMove(handle,{pointerId:1,clientX:210,clientY:0});ui.rerender(<Lobby {...props} room={{...props.room,setupId:"new"}}/>);fireEvent.pointerUp(handle,{pointerId:1});expect(reorder).toHaveBeenCalledOnce();
});
test("role category and focused card survive detail close without a second dialog",async()=>{
  const ui=render(<GuideOverlay mode="roles" onClose={vi.fn()}/>);fireEvent.click(screen.getByRole("tab",{name:/外来者/}));
  const scroller=ui.container.querySelector('.role-compendium')!;scroller.scrollTop=180;
  fireEvent.click(screen.getByRole("button",{name:/管家/}));expect(screen.getAllByRole("dialog")).toHaveLength(1);expect(screen.getByRole("article",{name:"管家详情"})).toHaveFocus();
  expect(scroller.scrollTop).toBe(0);
  fireEvent.keyDown(window,{key:"Escape"});expect(screen.getByRole("tab",{name:/外来者/})).toHaveAttribute("aria-selected","true");await waitFor(()=>expect(screen.getByRole("button",{name:/管家/})).toHaveFocus());expect(scroller.scrollTop).toBe(180);
});
test("privacy cover retains public ghost-vote confirmation, resets old ballots and preserves tab choice",()=>{
  const {mine}=fixture(),vote=vi.fn();const ui=render(<PlayerGame {...handlers} view={mine} onVote={vote}/>);
  fireEvent.click(screen.getByRole("button",{name:"记录"}));fireEvent(window,new Event("ravens:cover-private"));
  expect(screen.getByLabelText("私密内容已遮住")).toBeVisible();const ballot=within(screen.getByRole("region",{name:"公开表决"}));
  fireEvent.click(ballot.getByRole("button",{name:/3号/}));expect(screen.getByLabelText("私密内容已遮住")).toBeVisible();
  fireEvent.click(ballot.getByRole("button",{name:"举手"}));expect(vote).not.toHaveBeenCalled();
  ui.rerender(<PlayerGame {...handlers} view={{...mine,game:{...mine.game!,nomination:{...mine.game!.nomination!,ballotId:"new"}}}} onVote={vote}/>);expect(screen.queryByRole("alertdialog",{name:"使用鬼票"})).not.toBeInTheDocument();
  fireEvent.click(ballot.getByRole("button",{name:"举手"}));fireEvent.click(ballot.getByRole("button",{name:"确认使用鬼票"}));expect(vote).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button",{name:"显示私密内容"}));expect(screen.getByRole("button",{name:"记录"})).toHaveAttribute("aria-pressed","true");
});
test("a failed foreground refresh keeps voting locked until a later valid snapshot arrives",async()=>{
  const {mine}=fixture();const refresh=vi.fn().mockRejectedValue(new Error("offline"));const ui=render(<PlayerGame {...handlers} view={mine} onRefresh={refresh}/>);
  fireEvent(window,new Event("online"));await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(screen.getByRole("button",{name:"举手"})).toBeDisabled();
  ui.rerender(<PlayerGame {...handlers} view={{...mine,revision:5,serverNow:2000}} onRefresh={refresh}/>);expect(screen.getByRole("button",{name:"举手"})).toBeEnabled();
});
test("whisper acknowledgement never erases newer text; a closed conversation retains a readonly draft",async()=>{
  let finish!:()=>void;vi.mocked(sendWhisper).mockImplementation((_code,_id,_text,committed)=>new Promise(resolve=>{finish=()=>{committed?.();resolve({});};}));
  const {mine}=fixture();mine.game!.phase="DAY_DISCUSSION";mine.social={invitations:[],activeWhisper:{id:"w1",participants:[1,2],messages:[]}};
  function Harness({view}:{view:PrivateView}){const[drafts,setDrafts]=useState<WhisperDrafts>({});return <SocialRoom open onClose={vi.fn()} code="ABCDEF" view={view} drafts={drafts} setDrafts={setDrafts} onRefresh={vi.fn()}/>;}
  const ui=render(<Harness view={mine}/>);const input=screen.getByRole("textbox",{name:"私聊内容"});fireEvent.change(input,{target:{value:"第一条"}});fireEvent.click(screen.getByRole("button",{name:"发送"}));fireEvent.change(input,{target:{value:"新草稿"}});finish();await waitFor(()=>expect(screen.getByRole("button",{name:"发送"})).toBeEnabled());expect(input).toHaveValue("新草稿");
  ui.rerender(<Harness view={{...mine,social:{invitations:[]}}}/>);expect(screen.getByRole("textbox",{name:"已结束耳语草稿"})).toHaveValue("新草稿");expect(screen.queryByRole("button",{name:"发送"})).not.toBeInTheDocument();
});
