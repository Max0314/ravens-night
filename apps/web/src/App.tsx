import type {PlayerSelection} from './use-player-profile.js';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { ApiError, retryPendingCommand, notifyStorageFailure, acknowledgeStartInfo, cancelNomination, castVote, completeTutorial, confirmRole, createRoom, readCreationIntent, finishCreationIntent, getAuthSession, getPrivateView as fetchPrivateView, getRoom as fetchRoom, resetAccountContext, joinRoom, leaveRoom, login, nominate, readyToEndDay, resetRoom, startRoom, submitGameAction, useDayAbility, setRoomReady, reorderRoomSeats, removeRoomPlayer, recoverRoom, resumeGame, finishDefense, type PrivateView, type RoomPlayMode, type RoomView } from "./api.js";
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
import "./styles/touch.css";
import "./styles/room-flow.css";
import "./styles/avatar-interactions.css";
import "./styles/nomination-stage.css";
import {installMobileViewport} from './mobile-viewport.js';
import { installTouchPolicy } from './touch-policy.js';
import { roomSnapshot } from "./room-snapshot.js";
import {roomSessionKey} from './account-context.js';
import {getAccount,resumeAccountRoom} from './api.js';

type Screen = "LOADING" | "LOGIN" | "HOME" | "CREATE" | "JOIN" | "LOBBY" | "TUTORIAL" | "GAME" | "DISPLAY";
type ConnectionState = "ONLINE" | "OFFLINE" | "RECONNECTING";
interface StoredSession { avatar?:string|null;expectedProfileRevision?:number;pendingJoin?: boolean; nickname?: string; roomCode: string; mode: "PLAYER" | "DISPLAY"; participantId?: string }
const SESSION_KEY = roomSessionKey();
let volatileSession:StoredSession|null|undefined;


export function App() {
  useEffect(()=>{
    const dispose=installTouchPolicy();
    const disposeViewport=installMobileViewport();
    return()=>{dispose();disposeViewport();};
  },[]);
  const preview = new URLSearchParams(window.location.search).get("preview");
  return <div className="app-viewport">{preview === "effects" ? <EffectsPreview /> : preview === "portraits" ? <PortraitsPreview /> : <RoomApp />}</div>;
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
  const [upgrade,setUpgrade]=useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(()=>{const revoke=(event:Event)=>{if(readSession()?.roomCode===(event as CustomEvent<{code:string}>).detail.code){clearSession();setRoom(undefined);setPrivateView(undefined);setParticipantId(undefined);setScreen('HOME');}};window.addEventListener('ravens:profile-seat-revoked',revoke);return()=>window.removeEventListener('ravens:profile-seat-revoked',revoke);},[]);
  const[storageNotice,setStorageNotice]=useState(false);
  useEffect(()=>{const show=()=>setStorageNotice(true);window.addEventListener("ravens:storage-warning",show);return()=>window.removeEventListener("ravens:storage-warning",show);},[]);
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
    window.addEventListener("popstate",back); document.addEventListener("visibilitychange",hide); window.addEventListener("fribench:account-change",account);
    return () => { window.removeEventListener("popstate",back); document.removeEventListener("visibilitychange",hide); window.removeEventListener("fribench:account-change",account); };
  }, []);

  useEffect(() => {
    if (!["LOBBY", "TUTORIAL"].includes(screen) || !room) return;
    let active = true;
    const refresh = () => void getRoom(room.code).then((next) => { if (active) { setRoom(next); void getPrivateView(next.code).then(mine=>{if(active)acceptPrivateView(mine);}).catch(caught=>{if(active)void handleSessionFailure(caught);}); setConnectionState("ONLINE"); } }).catch((caught: unknown) => { if (active) void handleSessionFailure(caught); });
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
      if(!values.recoveryCode)saveSession({roomCode:values.code,mode:values.mode,nickname:values.nickname,...(values.avatar!==undefined?{avatar:values.avatar}:{}),...(values.expectedProfileRevision!==undefined?{expectedProfileRevision:values.expectedProfileRevision}:{}),pendingJoin:true});
      const joined = await guard(values.recoveryCode ? recoverRoom(values.code, values.recoveryCode) : joinRoom(values.code, values.nickname, values.mode,values.avatar!==undefined?{nickname:values.nickname,avatar:values.avatar,...(values.expectedProfileRevision!==undefined?{expectedProfileRevision:values.expectedProfileRevision}:{})}:undefined));
      const confirmedUrl=new URL(window.location.href);confirmedUrl.searchParams.delete("display");window.history.replaceState(window.history.state,"",confirmedUrl);
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

  async function submitCreate(name: string, count: number, playMode: RoomPlayMode, voiceRoomUrl?: string,profile?:PlayerSelection) {
    if(readSession()?.pendingJoin){await restoreSession();return;}
    beginSession();
    setBusy(true); setError(undefined);
    let createdCode:string|undefined;
    try { const created = await guard(createRoom(count, name, playMode, voiceRoomUrl,profile)); createdCode=created.code; saveSession({ roomCode: created.code, mode: "PLAYER", nickname:name,...(profile?{avatar:profile.avatar,...(profile.expectedProfileRevision!==undefined?{expectedProfileRevision:profile.expectedProfileRevision}:{})}:{}), pendingJoin:true }); finishCreationIntent(); const joined = await guard(joinRoom(created.code, name, "PLAYER",profile)); const current = await getRoom(created.code, "PLAYER"); setConnectionState("ONLINE"); saveSession({ roomCode: current.code, mode: "PLAYER", participantId: joined.id }); setParticipantId(joined.id); setRoom(current); acceptPrivateView(await getPrivateView(current.code)); setScreen("LOBBY"); }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "创建失败");if(createdCode||readSession()?.pendingJoin)setScreen("JOIN"); }
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
    if (invitedRoomCode && (stored?.roomCode !== invitedRoomCode || new URLSearchParams(window.location.search).get("display")==="1"&&stored?.mode!=="DISPLAY")) { setScreen("JOIN"); return; }
    if (!stored) { setScreen(invitedRoomCode ? "JOIN" : "HOME"); return; }
    try {
      if(stored.pendingJoin && stored.nickname){const joined=await guard(joinRoom(stored.roomCode,stored.nickname,stored.mode,stored.avatar!==undefined?{nickname:stored.nickname,avatar:stored.avatar,...(stored.expectedProfileRevision!==undefined?{expectedProfileRevision:stored.expectedProfileRevision}:{})}:undefined));stored={roomCode:stored.roomCode,mode:stored.mode,...(stored.mode==="PLAYER"?{participantId:joined.id}:{})};saveSession(stored);}
      const current = await getRoom(stored.roomCode,stored.mode);
      setRoom(current);
      if (stored.mode === "DISPLAY") { setParticipantId(undefined); setScreen("DISPLAY"); return; }
      const mine = await getPrivateView(current.code);
      setParticipantId(mine.participant.id);
      saveSession({ roomCode: current.code, mode: "PLAYER", participantId: mine.participant.id });
      acceptPrivateView(mine);
      if (current.state === "LOBBY") { setScreen("LOBBY"); return; }
      if (current.state === "TUTORIAL" && !mine.participant.tutorialComplete) { setScreen("TUTORIAL"); return; }
      setPrivateView(mine); setScreen("GAME");
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if(stored?.pendingJoin){setScreen("JOIN");setError(caught instanceof Error?caught.message:"加入结果待确认，请重试");return;}
      if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if (isRevokedSession(caught)) {
        clearSession(); setRoom(undefined); setPrivateView(undefined); setParticipantId(undefined); setScreen(invitedRoomCode ? "JOIN" : "HOME");
      } else { if(caught instanceof ApiError&&caught.status===426)setUpgrade(true);else setConnectionState("OFFLINE"); setScreen("LOADING"); }
    }
  }

  async function initialize() {
    try {
      const session = await getAuthSession();
      setConnectionState("ONLINE");
      if (session.authorized) {
        const pendingCreate=readCreationIntent();if(pendingCreate&&!readSession()&&!invitedRoomCode){setScreen("CREATE");await submitCreate(pendingCreate.organizerName,pendingCreate.playerCount,pendingCreate.playMode??"IN_PERSON",pendingCreate.voiceRoomUrl,pendingCreate.avatar!==undefined?{nickname:pendingCreate.organizerName,avatar:pendingCreate.avatar,...(pendingCreate.expectedProfileRevision!==undefined?{expectedProfileRevision:pendingCreate.expectedProfileRevision}:{})}:undefined);return;}
        const account=await getAccount();
        if(account.signedIn&&!readSession()&&account.rooms.length===1&&!invitedRoomCode){const result=await resumeAccountRoom(account.rooms[0]!);saveSession({roomCode:result.code,mode:result.mode,participantId:result.id});}
        await restoreSession();
      } else setScreen("LOGIN");
    } catch(caught) { if(caught instanceof ApiError&&caught.status===426)setUpgrade(true);else setConnectionState("OFFLINE"); setScreen("LOADING"); }
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
    if(caught instanceof ApiError&&caught.status===426){setUpgrade(true);return;}
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

  const withStatus = (page: ReactNode) => <>{page}{storageNotice?<p className="session-status" role="status">浏览器未保存恢复资料，请勿关闭或刷新此页面。</p>:null}{upgrade?<p className="session-status" role="alert">游戏已更新<button type="button" onClick={()=>window.location.reload()}>刷新页面</button></p>:null}{connectionState === "OFFLINE" ? <p className="session-status session-status--offline" role="status">网络已断开：本局状态保存在服务器，恢复网络后会自动同步</p> : null}{connectionState === "RECONNECTING" ? <p className="session-status" role="status">网络已恢复，正在同步当前局面…</p> : null}{backNotice ? <p className="session-status session-status--back" role="status">已阻止误退出，游戏仍在进行；稍后重新打开也会恢复原座位</p> : null}</>;
  const roomTools=!guide&&room&&participantId?<RoomTools key={`${room.roomInstanceId}:${participantId}`} room={room} participantId={participantId} {...(privateView?{view:privateView}:{})} onChanged={refreshCurrentRoom} onLeft={()=>{if(renderGeneration===generation.current)handleRoomClosed();}} onGuide={setGuide}/>:null;
  const withGuide = (page: ReactNode) => withStatus(<>{page}{screen!=='HOME'?roomTools:null}{guide ? <div className={`guide-host${screen==="GAME"&&privateView?.game?.phase==="VOTING"?" has-ballot-notice":""}`}><GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /></div> : null}</>);

  if (screen === "LOADING") return withStatus(<main className="app-loading" aria-label="正在进入钟楼"><span>☾</span>{connectionState === "OFFLINE" ? <button type="button" onClick={() => void initialize()}>重新连接钟楼</button> : null}</main>);
  if (screen === "LOGIN") return withStatus(<Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "CREATE") return withStatus(<Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "JOIN") return withStatus(<Join initialMode={new URLSearchParams(window.location.search).get("display")==="1"?"DISPLAY":"PLAYER"} initialCode={invitedRoomCode || readSession()?.roomCode || ""} onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />);
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

  if (screen === "LOBBY" && room) return withGuide(<Lobby onRetryReorder={async()=>{await guard(retryPendingCommand(room.code));const next=await getRoom(room.code);setRoom(next);return next;}} onRemove={id=>void roomMutation(code=>removeRoomPlayer(code,id))} room={room} {...(participantId ? { participantId } : {})} onReady={(ready) => void roomMutation((code) => setRoomReady(code, ready))} onReorder={async ids=>{setBusy(true);setError(undefined);try{const next=await guard(reorderRoomSeats(room.code,ids));setRoom(next);return next;}catch(e){await handleSessionFailure(e);setError(e instanceof Error?e.message:'排序失败');throw e;}finally{setBusy(false);}}} onBegin={beginTutorial} onLeave={() => void exitRoom()} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return withGuide(<Tutorial {...(room ? {completeCount:room.tutorialCompleteCount ?? 0,total:room.playerCount}:{})} onBack={returnHome} onDone={finishTutorial} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "GAME") return withGuide(<PlayerGame guideOpen={!!guide} onCloseGuide={()=>setGuide(undefined)} key={`${room?.roomInstanceId}:${room?.game?.gameId}:${participantId}`} {...(privateView ? { view: privateView } : {})} {...(receipt ? { receipt } : {})} {...(room ? { roomCode: room.code } : {})} {...(room?.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {})} busy={busy} canRestart={privateView?.canRestart ?? false} {...(error ? { error } : {})} onBack={returnHome} onResumeGame={() => void runGameMutation(resumeGame)} onFinishDefense={() => void runGameMutation(finishDefense)} onLeave={() => void exitRoom()} onRefresh={async () => { if (room) { try { acceptPrivateView(await getPrivateView(room.code)); } catch (error) { await handleSessionFailure(error); throw error; } } }} onConfirmStartInfo={infoId=>void runGameMutation(code=>acknowledgeStartInfo(code,infoId))} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats), seats)} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onCancelNomination={() => void runGameMutation(cancelNomination)} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(code => readyToEndDay(code, !privateView?.dayReady))} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onRestart={() => void restartGame()} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return withStatus(<Display key={`${room?.roomInstanceId}:${room?.code}`} code={room?.code ?? "------"} onBack={returnHome} onRoomClosed={handleRoomClosed} />);
  const stored = room ? readSession() : undefined;
  const guestSession=readSession(),guestCode=guestSession?.mode==='PLAYER'&&!guestSession.pendingJoin?guestSession.roomCode:undefined;
  return withGuide(<Home accountTools={roomTools} {...(guestCode?{guestCode}:{})} onAccountResume={(code,id,mode)=>{beginSession();saveSession({roomCode:code,mode,participantId:id});void restoreSession();}} onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} {...(error ? { error } : {})} {...(room && stored ? { activeRoom: room, activeMode: stored.mode, onResume: resumeRoom, onLeave: () => void exitRoom(), busy } : {})} />);
}

export function saveSession(session:StoredSession):void{
 volatileSession=session;const value=JSON.stringify(session);let persisted=true;
 try{sessionStorage.setItem(SESSION_KEY,value);}catch{persisted=false;}
 try{localStorage.setItem(`${SESSION_KEY}:${session.roomCode}:${session.mode}`,value);if(session.mode==='PLAYER')localStorage.setItem(SESSION_KEY,value);}catch{persisted=false;}
 if(persisted)volatileSession=undefined;else notifyStorageFailure();
}
export function readSession():StoredSession|undefined{
 if(volatileSession!==undefined)return volatileSession??undefined;
 const invitation=readInvitedRoomCode(),values:Array<string|null>=[];
 try{values.push(sessionStorage.getItem(SESSION_KEY));}catch{}
 try{if(invitation)values.push(localStorage.getItem(`${SESSION_KEY}:${invitation}:PLAYER`));values.push(localStorage.getItem(SESSION_KEY));}catch{}
 for(const value of values){if(!value)continue;try{const session=JSON.parse(value) as StoredSession;if(!session.roomCode||!['PLAYER','DISPLAY'].includes(session.mode))continue;try{sessionStorage.setItem(SESSION_KEY,value);}catch{volatileSession=session;notifyStorageFailure();}return session;}catch{}}
 return undefined;
}

function clearSession():void{
 const current=readSession();volatileSession=null;
 try{sessionStorage.removeItem(SESSION_KEY);}catch{}
 if(current){try{localStorage.removeItem(`${SESSION_KEY}:${current.roomCode}:${current.mode}`);}catch{}
  try{const last=localStorage.getItem(SESSION_KEY);if(last&&(JSON.parse(last) as StoredSession).roomCode===current.roomCode&&(JSON.parse(last) as StoredSession).mode===current.mode)localStorage.removeItem(SESSION_KEY);}catch{}
 }
}

function readInvitedRoomCode(): string {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase().replace(/\s/g, "") ?? "";
}

function isNetworkFailure(error: unknown): boolean { return !(error instanceof ApiError); }
function isRevokedSession(error: unknown): boolean { return error instanceof ApiError && ([401,404].includes(error.status) || error.status === 403 && ["SEAT_REMOVED","ACCOUNT_MISMATCH"].includes(error.errorCode ?? "")); }
