import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { ApiError, cancelNomination, castVote, completeTutorial, confirmRole, createRoom, getAuthSession, getPrivateView as fetchPrivateView, getRoom as fetchRoom, resetAccountContext, joinRoom, leaveRoom, login, nominate, readyToEndDay, resetRoom, startRoom, submitGameAction, useDayAbility, setRoomReady, reorderRoomSeats, recoverRoom, resumeGame, finishDefense, type PrivateView, type RoomPlayMode, type RoomView } from "./api.js";
import { GramophonePlayer } from "./components/GramophonePlayer.js";
import { GuideOverlay, type GuideMode } from "./components/GuideOverlay.js";
import { RoomTools } from "./components/RoomTools.js";
import { Create } from "./pages/Create.js";
import { Display } from "./pages/Display.js";
import { Home } from "./pages/Home.js";
import { Join, type JoinValues } from "./pages/Join.js";
import { Lobby } from "./pages/Lobby.js";
import { Login } from "./pages/Login.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { Tutorial } from "./pages/Tutorial.js";
import { EffectsPreview } from "./pages/EffectsPreview.js";
import { PortraitsPreview } from "./pages/PortraitsPreview.js";
import type { PrivateReceipt } from "./components/EventStage.js";
import { enableEffectsAudio, effectsAudioEnabled } from "./components/experience-audio.js";
import { connectRoomFeed } from "./room-live.js";
import "./styles/app.css";
import "./styles/game-redesign.css";
import "./styles/portraits.css";
import "./styles/account.css";
import "./styles/mobile.css";
import "./styles/home.css";
import { roomSnapshot } from "./room-snapshot.js";
import {roomSessionKey} from './account-context.js';
import {getAccount,resumeAccountRoom} from './api.js';

type Screen = "LOADING" | "LOGIN" | "HOME" | "CREATE" | "JOIN" | "LOBBY" | "TUTORIAL" | "GAME" | "DISPLAY";
type ConnectionState = "ONLINE" | "OFFLINE" | "RECONNECTING";
interface StoredSession { pendingJoin?: boolean; nickname?: string; roomCode: string; mode: "PLAYER" | "DISPLAY"; participantId?: string }
const SESSION_KEY = roomSessionKey();


export function App() {
  const preview = new URLSearchParams(window.location.search).get("preview");
  return preview === "effects" ? <EffectsPreview /> : preview === "portraits" ? <PortraitsPreview /> : <RoomApp />;
}

function RoomApp() {
  const invitedRoomCode = readInvitedRoomCode();
  const [screen, applyScreen] = useState<Screen>("LOADING");
  const screenRef=useRef<Screen>("LOADING");screenRef.current=screen;
  function setScreen(next: Screen) {
    const old=screenRef.current;
    if(next!==old){const state={ravensScreen:next};if(["LOADING","LOGIN"].includes(old)||["LOBBY","TUTORIAL","GAME"].includes(old)&&["LOBBY","TUTORIAL","GAME"].includes(next))window.history.replaceState(state,"",window.location.href);else window.history.pushState(state,"",window.location.href);screenRef.current=next;}
    applyScreen(next);
  }
  const [snapshot, dispatch] = useReducer(roomSnapshot, { generation: 0 });
  const generation = useRef(0);
  const {room, privateView} = snapshot;
  const renderGeneration=generation.current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [participantId, setParticipantId] = useState<string>();
  function beginSession() { generation.current++; dispatch({type:"reset",generation:generation.current}); }
  function setRoom(value: RoomView | undefined) { if (!value) { beginSession(); return; } dispatch({type:"accept",generation:generation.current,room:value}); }
  const acceptPrivateView = (incoming: PrivateView) => dispatch({type:"accept",generation:generation.current,privateView:incoming});
  const setPrivateView = (incoming: PrivateView | undefined) => { if(incoming) acceptPrivateView(incoming); };
  async function guard<T>(pending: Promise<T>): Promise<T> {
    const start=generation.current;
    try { const value=await pending; if(start!==generation.current)throw new ApiError("已切换房间",409,"STALE_RESPONSE");return value; }
    catch(error){if(start!==generation.current)throw new ApiError("已切换房间",409,"STALE_RESPONSE");throw error;}
  }
  const getRoom=(...args:Parameters<typeof fetchRoom>)=>guard(fetchRoom(...args));
  const getPrivateView=(...args:Parameters<typeof fetchPrivateView>)=>guard(fetchPrivateView(...args));
  const [receipt, setReceipt] = useState<PrivateReceipt>();
  const [guide, setGuide] = useState<GuideMode>();
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => navigator.onLine ? "ONLINE" : "OFFLINE");
  const [backNotice, setBackNotice] = useState(false);
  const guideRef = useRef<GuideMode | undefined>(undefined);

  const isOrganizer = Boolean(room?.organizerId && participantId === room.organizerId);

  useEffect(() => { void initialize(); }, []);
  useEffect(() => { if (!receipt) return; const timer = window.setTimeout(() => setReceipt(undefined), 3_800); return () => window.clearTimeout(timer); }, [receipt?.id]);
  useEffect(() => { const unlock = () => { if (effectsAudioEnabled()) void enableEffectsAudio(); }; document.addEventListener("pointerdown", unlock); return () => document.removeEventListener("pointerdown", unlock); }, []);
  useEffect(() => { guideRef.current = guide; }, [guide]);


  useEffect(() => {
    const offline = () => setConnectionState("OFFLINE");
    const online = () => {
      setConnectionState("RECONNECTING");
      if (!room?.code) { void initialize(); return; }
      void getRoom(room.code).then((next) => { setRoom(next); setConnectionState("ONLINE"); }).catch(() => setConnectionState("OFFLINE"));
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [room?.code]);

  useEffect(() => {
    const back = (event: PopStateEvent) => { const next=event.state?.ravensScreen ?? "HOME"; screenRef.current=next;applyScreen(next); };
    const hide = () => { if (document.hidden) setGuide(undefined); };
    const account = () => {
      // The SDK also announces its initial identity. Only an actual namespace
      // change needs clearing here; account-context already reloads that case.
      if (roomSessionKey() === SESSION_KEY) return;
      beginSession(); resetAccountContext(); setParticipantId(undefined); setReceipt(undefined); setGuide(undefined); setScreen("LOADING");
    };
    const viewport = () => document.documentElement.style.setProperty("--viewport-height", `${window.visualViewport?.height ?? window.innerHeight}px`);
    viewport(); window.visualViewport?.addEventListener("resize",viewport);
    window.addEventListener("popstate",back); document.addEventListener("visibilitychange",hide); window.addEventListener("fribench:account-change",account);
    return () => { window.removeEventListener("popstate",back); document.removeEventListener("visibilitychange",hide); window.removeEventListener("fribench:account-change",account); window.visualViewport?.removeEventListener("resize",viewport); };
  }, []);

  useEffect(() => {
    if (!["LOBBY", "TUTORIAL"].includes(screen) || !room) return;
    let active = true;
    const refresh = () => void getRoom(room.code).then((next) => { if (active) { setRoom(next); setConnectionState("ONLINE"); } }).catch((caught: unknown) => { if (active) void handleSessionFailure(caught); });
    const timer = window.setInterval(refresh, 2_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code]);

  useEffect(() => {
    if (!["LOBBY", "TUTORIAL"].includes(screen)) return;
    if (screen === "LOBBY" && room?.state === "TUTORIAL") setScreen("TUTORIAL");
    if (room?.state === "LOBBY") setScreen("LOBBY");
    if (room?.state === "RUNNING" || room?.state === "GAME_OVER" || room?.state === "ABORTED" || room?.state === "ENDED") setScreen("GAME");
  }, [room?.state, screen]);

  useEffect(() => {
    if (screen !== "GAME" || !room) return;
    let active = true;
    const refresh = () => void getPrivateView(room.code).then(async (view) => {
      if (!active) return;
      setConnectionState("ONLINE");
      if (view.state === "LOBBY") {
        setPrivateView(undefined);
        setRoom(await getRoom(room.code));
        setScreen("LOBBY");
        return;
      }
      acceptPrivateView(view);

    }).catch((caught: unknown) => { if (active) void handleSessionFailure(caught); });
    refresh();
    const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code]);

  useEffect(() => {
    if (!room || !["GAME", "LOBBY", "TUTORIAL"].includes(screen) || typeof WebSocket === "undefined") return;
    const start=generation.current; return connectRoomFeed(room.code, "PLAYER", (payload) => { dispatch({type:"accept",generation:start,room:payload.room,...(payload.privateView?{privateView:payload.privateView}:{})}); if(start===generation.current)setConnectionState("ONLINE"); });
  }, [room?.code, screen]);

  async function submitJoin(values: JoinValues) {
    beginSession();
    setBusy(true); setError(undefined);
    try {
      if(!values.recoveryCode)saveSession({roomCode:values.code,mode:values.mode,nickname:values.nickname,pendingJoin:true});
      const joined = await guard(values.recoveryCode ? recoverRoom(values.code, values.recoveryCode) : joinRoom(values.code, values.nickname, values.mode));
      saveSession({ roomCode: values.code, mode: values.mode, ...(values.mode === "PLAYER" ? { participantId: joined.id } : {}) });
      const current = await getRoom(values.code, values.mode);
      setConnectionState("ONLINE");
      saveSession({ roomCode: current.code, mode: values.mode, ...(values.mode === "PLAYER" ? { participantId: joined.id } : {}) });
      setParticipantId(values.mode === "PLAYER" ? joined.id : undefined);
      setRoom(current);
      if (values.mode === "DISPLAY") setScreen("DISPLAY"); else await restoreSession();
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "加入失败"); }
    finally { setBusy(false); }
  }

  async function submitCreate(name: string, count: number, playMode: RoomPlayMode, voiceRoomUrl?: string) {
    beginSession();
    setBusy(true); setError(undefined);
    try { const created = await guard(createRoom(count, name, playMode, voiceRoomUrl)); saveSession({ roomCode: created.code, mode: "PLAYER", nickname:name, pendingJoin:true }); const joined = await guard(joinRoom(created.code, name, "PLAYER")); const current = await getRoom(created.code, "PLAYER"); setConnectionState("ONLINE"); saveSession({ roomCode: current.code, mode: "PLAYER", participantId: joined.id }); setParticipantId(joined.id); setRoom(current); setScreen("LOBBY"); }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "创建失败"); }
    finally { setBusy(false); }
  }

  async function submitLogin(password: string) {
    setBusy(true); setError(undefined);
    try { await login(password); setConnectionState("ONLINE"); await restoreSession(); }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法验证访问口令"); }
    finally { setBusy(false); }
  }

  async function restoreSession() {
    let stored = readSession();
    if (invitedRoomCode && stored?.roomCode !== invitedRoomCode) { setScreen("JOIN"); return; }
    if (!stored) { setScreen(invitedRoomCode ? "JOIN" : "HOME"); return; }
    try {
      if(stored.pendingJoin && stored.nickname){const joined=await guard(joinRoom(stored.roomCode,stored.nickname,stored.mode));stored={roomCode:stored.roomCode,mode:stored.mode,...(stored.mode==="PLAYER"?{participantId:joined.id}:{})};saveSession(stored);}
      const current = await getRoom(stored.roomCode,stored.mode);
      setRoom(current);
      if (stored.mode === "DISPLAY") { setParticipantId(undefined); setScreen("DISPLAY"); return; }
      const mine = await getPrivateView(current.code);
      setParticipantId(mine.participant.id);
      saveSession({ roomCode: current.code, mode: "PLAYER", participantId: mine.participant.id });
      if (current.state === "LOBBY") { setScreen("LOBBY"); return; }
      if (current.state === "TUTORIAL" && !mine.participant.tutorialComplete) { setScreen("TUTORIAL"); return; }
      setPrivateView(mine); setScreen("GAME");
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if(stored?.pendingJoin){setScreen("JOIN");setError(caught instanceof Error?caught.message:"加入结果待确认，请重试");return;}
      if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if (isRevokedSession(caught)) {
        clearSession(); setRoom(undefined); setPrivateView(undefined); setParticipantId(undefined); setScreen(invitedRoomCode ? "JOIN" : "HOME");
      } else { setConnectionState("OFFLINE"); setScreen("LOADING"); }
    }
  }

  async function initialize() {
    try {
      const session = await getAuthSession();
      setConnectionState("ONLINE");
      if (session.authorized) {
        const account=await getAccount();
        if(account.signedIn&&!readSession()&&account.rooms.length===1&&!invitedRoomCode){const result=await resumeAccountRoom(account.rooms[0]!);saveSession({roomCode:result.code,mode:result.mode,participantId:result.id});}
        await restoreSession();
      } else setScreen("LOGIN");
    } catch { setConnectionState("OFFLINE"); setScreen("LOADING"); }
  }

  const handleRoomClosed = useCallback(() => {
    clearSession(); resetAccountContext();
    setGuide(undefined);
    setPrivateView(undefined);
    setRoom(undefined);
    setParticipantId(undefined);
    setBackNotice(false);
    setConnectionState("ONLINE");
    setScreen("HOME");
  }, []);

  async function handleSessionFailure(caught: unknown) {
    if(caught instanceof ApiError && caught.errorCode === "STALE_RESPONSE") return;
    if (isRevokedSession(caught)) {
      handleRoomClosed(); setScreen("JOIN"); setError("房间或座位会话已失效，请重新加入，或使用原设备生成的恢复码。");
      try { const auth = await getAuthSession(); if (!auth.authorized) setScreen("LOGIN"); } catch { setConnectionState("OFFLINE"); }
    } else if (caught instanceof ApiError && [403,409].includes(caught.status) && room) {
      await refreshCurrentRoom().catch(() => undefined);
      setError(caught.message);
    } else if (isNetworkFailure(caught)) setConnectionState("OFFLINE");
  }

  async function refreshCurrentRoom() {
    if(renderGeneration!==generation.current)throw new ApiError("已切换房间",409,"STALE_RESPONSE");
    if (!room) return;
    const next = await getRoom(room.code);
    setRoom(next);
    const mine = await getPrivateView(room.code);
    acceptPrivateView(mine);
    if (next.state === "LOBBY") setScreen("LOBBY");
    else if (next.state === "TUTORIAL") setScreen(mine.participant.tutorialComplete ? "GAME" : "TUTORIAL");
    else setScreen("GAME");
  }

  const withStatus = (page: ReactNode) => <>{page}{connectionState === "OFFLINE" ? <p className="session-status session-status--offline" role="status">网络已断开：本局状态保存在服务器，恢复网络后会自动同步</p> : null}{connectionState === "RECONNECTING" ? <p className="session-status" role="status">网络已恢复，正在同步当前局面…</p> : null}{backNotice ? <p className="session-status session-status--back" role="status">已阻止误退出，游戏仍在进行；稍后重新打开也会恢复原座位</p> : null}</>;
  const roomTools=room&&participantId?<RoomTools key={`${room.roomInstanceId}:${participantId}`} room={room} participantId={participantId} {...(privateView?{view:privateView}:{})} onChanged={refreshCurrentRoom} onLeft={()=>{if(renderGeneration===generation.current)handleRoomClosed();}} onGuide={setGuide}/>:null;
  const withGuide = (page: ReactNode) => withStatus(<>{page}{screen!=='HOME'?roomTools:null}{guide ? <GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /> : null}</>);

  if (screen === "LOADING") return withStatus(<main className="app-loading" aria-label="正在进入钟楼"><span>☾</span>{connectionState === "OFFLINE" ? <button type="button" onClick={() => void initialize()}>重新连接钟楼</button> : null}</main>);
  if (screen === "LOGIN") return withStatus(<Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "CREATE") return withStatus(<Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "JOIN") return withStatus(<Join initialCode={invitedRoomCode || readSession()?.roomCode || ""} onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />);
  async function beginTutorial(tutorialMode: "SKIP" | "OPTIONAL" = "SKIP") { if (!room || !isOrganizer) return; setBusy(true); try { const next = await guard(startRoom(room.code, tutorialMode)); setRoom(next); setConnectionState("ONLINE"); if (next.state === "TUTORIAL") setScreen("TUTORIAL"); else { acceptPrivateView(await getPrivateView(room.code)); setScreen("GAME"); } } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room) return; setBusy(true); try { const updated = await guard(completeTutorial(room.code)); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code)); setConnectionState("ONLINE"); } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string) => Promise<PrivateView>, privateTargets?: number[]) {
    if (!room) return;
    setBusy(true); setError(undefined);
    try { const updated = await guard(operation(room.code)); acceptPrivateView(updated);  setConnectionState("ONLINE"); if (privateTargets) { const roleId = privateView?.role?.roleId; setReceipt({ id: crypto.randomUUID(), kind: roleId === "poisoner" ? "POISON" : roleId === "monk" ? "PROTECT" : ["fortune_teller", "ravenkeeper"].includes(roleId ?? "") ? "DIVINE" : "SEALED", target: privateTargets.map((seat) => `${seat}号 ${privateView?.game?.seats.find((player) => player.seat === seat)?.nickname ?? ""}`).join("、") }); } }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "操作没有成功，请重试"); }
    finally { setBusy(false); }
  }

  async function restartGame() {
    if (!room || !isOrganizer) return;
    setBusy(true); setError(undefined);
    try {
      setRoom(await guard(resetRoom(room.code)));
      setConnectionState("ONLINE");
      setPrivateView(undefined);
      setScreen("LOBBY");
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法重新开局"); }
    finally { setBusy(false); }
  }

  async function exitRoom() {
    if (!room) return;
    setBusy(true); setError(undefined);
    try {
      await guard(leaveRoom(room.code));
      clearSession();
      window.history.replaceState({}, "", window.location.pathname);
      setGuide(undefined);
      setPrivateView(undefined);
      setRoom(undefined);
      setParticipantId(undefined);
      setBackNotice(false);
      setConnectionState("ONLINE");
      setScreen("HOME");
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if (isNetworkFailure(caught)) setConnectionState("OFFLINE");
      setError(caught instanceof Error ? caught.message : "无法退出房间");
    } finally { setBusy(false); }
  }

  function returnHome() {
    setGuide(undefined);
    setBackNotice(false);
    setError(undefined);
    setScreen("HOME");
  }

  function resumeRoom() {
    setError(undefined); setBusy(true); void restoreSession().finally(() => setBusy(false));
  }

  async function roomMutation(operation: (code: string) => Promise<RoomView>) { if (!room) return; setBusy(true); setError(undefined); try { setRoom(await guard(operation(room.code))); } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "操作失败"); } finally { setBusy(false); } }

  if (screen === "LOBBY" && room) return withGuide(<Lobby room={room} {...(participantId ? { participantId } : {})} onReady={(ready) => void roomMutation((code) => setRoomReady(code, ready))} onReorder={(ids) => void roomMutation((code) => reorderRoomSeats(code, ids))} onBegin={beginTutorial} onLeave={() => void exitRoom()} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return withGuide(<Tutorial {...(room ? {completeCount:room.tutorialCompleteCount ?? 0,total:room.playerCount}:{})} onBack={returnHome} onDone={finishTutorial} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "GAME") return withGuide(<PlayerGame key={`${room?.roomInstanceId}:${room?.game?.gameId}:${participantId}`} {...(privateView ? { view: privateView } : {})} {...(receipt ? { receipt } : {})} {...(room ? { roomCode: room.code } : {})} {...(room?.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {})} busy={busy} canRestart={privateView?.canRestart ?? false} {...(error ? { error } : {})} onBack={returnHome} onResumeGame={() => void runGameMutation(resumeGame)} onFinishDefense={() => void runGameMutation(finishDefense)} onLeave={() => void exitRoom()} onRefresh={async () => { if (room) { try { acceptPrivateView(await getPrivateView(room.code)); } catch (error) { await handleSessionFailure(error); throw error; } } }} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats), seats)} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onCancelNomination={() => void runGameMutation(cancelNomination)} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(code => readyToEndDay(code, !privateView?.dayReady))} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onRestart={() => void restartGame()} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return withStatus(<Display key={`${room?.roomInstanceId}:${room?.code}`} code={room?.code ?? "------"} onBack={returnHome} onRoomClosed={handleRoomClosed} />);
  const stored = room ? readSession() : undefined;
  let guestCode:string|undefined;try{guestCode=(JSON.parse(localStorage.getItem('ravens_room_session')??'{}') as StoredSession).roomCode;}catch{}
  return withGuide(<Home accountTools={roomTools} {...(guestCode?{guestCode}:{})} onAccountResume={(code,id,mode)=>{beginSession();saveSession({roomCode:code,mode,participantId:id});void restoreSession();}} onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} {...(error ? { error } : {})} {...(room && stored ? { activeRoom: room, activeMode: stored.mode, onResume: resumeRoom, onLeave: () => void exitRoom(), busy } : {})} />);
}

export function saveSession(session: StoredSession): void { try { const value = JSON.stringify(session); sessionStorage.setItem(SESSION_KEY, value); localStorage.setItem(`${SESSION_KEY}:${session.roomCode}:${session.mode}`, value); if (session.mode === "PLAYER") localStorage.setItem(SESSION_KEY, value); } catch { /* Cookie sessions remain valid when storage is unavailable. */ } }
export function readSession(): StoredSession | undefined {
  try {
    const invitation = readInvitedRoomCode();
    const value = sessionStorage.getItem(SESSION_KEY) ?? (invitation ? localStorage.getItem(`${SESSION_KEY}:${invitation}:PLAYER`) : null) ?? localStorage.getItem(SESSION_KEY);
    if (!value) return undefined;
    const session = JSON.parse(value) as StoredSession;
    if (!session.roomCode || !["PLAYER", "DISPLAY"].includes(session.mode)) return undefined;
    sessionStorage.setItem(SESSION_KEY, value);
    return session;
  }
  catch { return undefined; }
}

function clearSession(): void { try { const current = readSession(); sessionStorage.removeItem(SESSION_KEY); if (current) { localStorage.removeItem(`${SESSION_KEY}:${current.roomCode}:${current.mode}`); const last = localStorage.getItem(SESSION_KEY); if (last && (JSON.parse(last) as StoredSession).roomCode === current.roomCode && (JSON.parse(last) as StoredSession).mode === current.mode) localStorage.removeItem(SESSION_KEY); } } catch { /* Clear as much as browser storage allows. */ } }

function readInvitedRoomCode(): string {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6) ?? "";
}

function isNetworkFailure(error: unknown): boolean { return !(error instanceof ApiError); }
function isRevokedSession(error: unknown): boolean { return error instanceof ApiError && ([401,404].includes(error.status) || error.status === 403 && ["SEAT_REMOVED","ACCOUNT_MISMATCH"].includes(error.errorCode ?? "")); }
