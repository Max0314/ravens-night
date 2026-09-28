import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, cancelNomination, castVote, completeTutorial, confirmRole, createRoom, getAuthSession, getPrivateView, getRoom, joinRoom, leaveRoom, login, nominate, readyToEndDay, resetRoom, startRoom, submitGameAction, useDayAbility, setRoomReady, reorderRoomSeats, recoverRoom, resumeGame, finishDefense, type PrivateView, type RoomPlayMode, type RoomView } from "./api.js";
import { GramophonePlayer } from "./components/GramophonePlayer.js";
import { GuideOverlay, type GuideMode } from "./components/GuideOverlay.js";
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

type Screen = "LOADING" | "LOGIN" | "HOME" | "CREATE" | "JOIN" | "LOBBY" | "TUTORIAL" | "GAME" | "DISPLAY";
type ConnectionState = "ONLINE" | "OFFLINE" | "RECONNECTING";
interface StoredSession { roomCode: string; mode: "PLAYER" | "DISPLAY"; participantId?: string }
const SESSION_KEY = "ravens_room_session";
const PROTECTED_SCREENS = new Set<Screen>(["LOBBY", "TUTORIAL", "GAME", "DISPLAY"]);

export function App() {
  const preview = new URLSearchParams(window.location.search).get("preview");
  return preview === "effects" ? <EffectsPreview /> : preview === "portraits" ? <PortraitsPreview /> : <RoomApp />;
}

function RoomApp() {
  const invitedRoomCode = readInvitedRoomCode();
  const [screen, setScreen] = useState<Screen>("LOADING");
  const [room, setRoom] = useState<RoomView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [participantId, setParticipantId] = useState<string>();
  const [privateView, setPrivateView] = useState<PrivateView>();
  const acceptPrivateView = useCallback((incoming: PrivateView) => setPrivateView((previous) => {
    if (incoming.game?.gameId && previous?.game?.gameId === incoming.game.gameId && (incoming.game.revision ?? 0) < (previous.game.revision ?? 0)) return previous;
    return incoming;
  }), []);
  const [receipt, setReceipt] = useState<PrivateReceipt>();
  const [guide, setGuide] = useState<GuideMode>();
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => navigator.onLine ? "ONLINE" : "OFFLINE");
  const [backNotice, setBackNotice] = useState(false);
  const guideRef = useRef<GuideMode | undefined>(undefined);
  const backNoticeTimer = useRef<number | undefined>(undefined);
  const isOrganizer = Boolean(room?.organizerId && participantId === room.organizerId);

  useEffect(() => { void initialize(); }, []);
  useEffect(() => { if (!receipt) return; const timer = window.setTimeout(() => setReceipt(undefined), 3_800); return () => window.clearTimeout(timer); }, [receipt?.id]);
  useEffect(() => { const unlock = () => { if (effectsAudioEnabled()) void enableEffectsAudio(); }; document.addEventListener("pointerdown", unlock); return () => document.removeEventListener("pointerdown", unlock); }, []);
  useEffect(() => { guideRef.current = guide; }, [guide]);
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [screen, privateView?.game?.phase]);

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
    if (!room || !PROTECTED_SCREENS.has(screen)) return;
    const marker = { ...window.history.state as object, ravensRoomGuard: room.code };
    window.history.pushState(marker, "", window.location.href);
    const protectGame = () => {
      window.history.pushState(marker, "", window.location.href);
      if (guideRef.current) { setGuide(undefined); return; }
      setBackNotice(true);
      if (backNoticeTimer.current) window.clearTimeout(backNoticeTimer.current);
      backNoticeTimer.current = window.setTimeout(() => setBackNotice(false), 3_200);
    };
    window.addEventListener("popstate", protectGame);
    return () => {
      window.removeEventListener("popstate", protectGame);
      if (backNoticeTimer.current) window.clearTimeout(backNoticeTimer.current);
    };
  }, [Boolean(room && PROTECTED_SCREENS.has(screen)), room?.code]);

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
    if (room?.state === "RUNNING" || room?.state === "GAME_OVER" || room?.state === "ENDED") setScreen("GAME");
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
      setRoom((current) => current ? { ...current, state: view.state, ...(view.game ? { game: view.game } : {}) } : current);
    }).catch((caught: unknown) => { if (active) void handleSessionFailure(caught); });
    refresh();
    const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code]);

  useEffect(() => {
    if (!room || !["GAME", "LOBBY", "TUTORIAL"].includes(screen) || typeof WebSocket === "undefined") return;
    return connectRoomFeed(room.code, "PLAYER", (payload) => { setRoom(payload.room); if (payload.privateView) acceptPrivateView(payload.privateView); setConnectionState("ONLINE"); });
  }, [room?.code, screen]);

  async function submitJoin(values: JoinValues) {
    setBusy(true); setError(undefined);
    try {
      const joined = values.recoveryCode ? await recoverRoom(values.code, values.recoveryCode) : await joinRoom(values.code, values.nickname, values.mode);
      saveSession({ roomCode: values.code, mode: values.mode, ...(values.mode === "PLAYER" ? { participantId: joined.id } : {}) });
      const current = await getRoom(values.code, values.mode);
      setConnectionState("ONLINE");
      saveSession({ roomCode: current.code, mode: values.mode, ...(values.mode === "PLAYER" ? { participantId: joined.id } : {}) });
      setParticipantId(values.mode === "PLAYER" ? joined.id : undefined);
      setRoom(current);
      if (values.mode === "DISPLAY") setScreen("DISPLAY"); else await restoreSession();
    } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "加入失败"); }
    finally { setBusy(false); }
  }

  async function submitCreate(name: string, count: number, playMode: RoomPlayMode, voiceRoomUrl?: string) {
    setBusy(true); setError(undefined);
    try { const created = await createRoom(count, name, playMode, voiceRoomUrl); const joined = await joinRoom(created.code, name, "PLAYER"); const current = await getRoom(created.code, "PLAYER"); setConnectionState("ONLINE"); saveSession({ roomCode: current.code, mode: "PLAYER", participantId: joined.id }); setParticipantId(joined.id); setRoom(current); setScreen("LOBBY"); }
    catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "创建失败"); }
    finally { setBusy(false); }
  }

  async function submitLogin(password: string) {
    setBusy(true); setError(undefined);
    try { await login(password); setConnectionState("ONLINE"); await restoreSession(); }
    catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法验证访问口令"); }
    finally { setBusy(false); }
  }

  async function restoreSession() {
    const stored = readSession();
    if (invitedRoomCode && stored?.roomCode !== invitedRoomCode) { setScreen("JOIN"); return; }
    if (!stored) { setScreen(invitedRoomCode ? "JOIN" : "HOME"); return; }
    try {
      const current = await getRoom(stored.roomCode);
      setRoom(current);
      if (stored.mode === "DISPLAY") { setParticipantId(undefined); setScreen("DISPLAY"); return; }
      const mine = await getPrivateView(current.code);
      setParticipantId(mine.participant.id);
      saveSession({ roomCode: current.code, mode: "PLAYER", participantId: mine.participant.id });
      if (current.state === "LOBBY") { setScreen("LOBBY"); return; }
      if (current.state === "TUTORIAL" && !mine.participant.tutorialComplete) { setScreen("TUTORIAL"); return; }
      setPrivateView(mine); setScreen("GAME");
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) {
        clearSession(); setRoom(undefined); setPrivateView(undefined); setParticipantId(undefined); setScreen(invitedRoomCode ? "JOIN" : "HOME");
      } else { setConnectionState("OFFLINE"); setScreen("LOADING"); }
    }
  }

  async function initialize() {
    try {
      const session = await getAuthSession();
      setConnectionState("ONLINE");
      if (session.authorized) await restoreSession(); else setScreen("LOGIN");
    } catch { setConnectionState("OFFLINE"); setScreen("LOADING"); }
  }

  const handleRoomClosed = useCallback(() => {
    clearSession();
    setGuide(undefined);
    setPrivateView(undefined);
    setRoom(undefined);
    setParticipantId(undefined);
    setBackNotice(false);
    setConnectionState("ONLINE");
    setScreen("HOME");
  }, []);

  async function handleSessionFailure(caught: unknown) {
    if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) {
      handleRoomClosed(); setError("房间或座位会话已失效，请重新加入，或使用原设备生成的恢复码。");
      try { const auth = await getAuthSession(); if (!auth.authorized) setScreen("LOGIN"); } catch { setConnectionState("OFFLINE"); }
    } else if (isNetworkFailure(caught)) setConnectionState("OFFLINE");
  }

  const withStatus = (page: ReactNode) => <>{page}<GramophonePlayer />{connectionState === "OFFLINE" ? <p className="session-status session-status--offline" role="status">网络已断开：本局状态保存在服务器，恢复网络后会自动同步</p> : null}{connectionState === "RECONNECTING" ? <p className="session-status" role="status">网络已恢复，正在同步当前局面…</p> : null}{backNotice ? <p className="session-status session-status--back" role="status">已阻止误退出，游戏仍在进行；稍后重新打开也会恢复原座位</p> : null}</>;
  const withGuide = (page: ReactNode) => withStatus(<>{page}{guide ? <GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /> : null}</>);

  if (screen === "LOADING") return withStatus(<main className="app-loading" aria-label="正在进入钟楼"><span>☾</span>{connectionState === "OFFLINE" ? <button type="button" onClick={() => void initialize()}>重新连接钟楼</button> : null}</main>);
  if (screen === "LOGIN") return withStatus(<Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "CREATE") return withStatus(<Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "JOIN") return withStatus(<Join initialCode={invitedRoomCode} onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />);
  async function beginTutorial() { if (!room || !isOrganizer) return; setBusy(true); try { setRoom(await startRoom(room.code)); setConnectionState("ONLINE"); setScreen("TUTORIAL"); } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room) return; setBusy(true); try { const updated = await completeTutorial(room.code); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code)); setConnectionState("ONLINE"); } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string) => Promise<PrivateView>, privateTargets?: number[]) {
    if (!room) return;
    setBusy(true); setError(undefined);
    try { const updated = await operation(room.code); acceptPrivateView(updated); setRoom((current) => current ? { ...current, state: updated.state, ...(updated.game ? { game: updated.game } : {}) } : current); setConnectionState("ONLINE"); if (privateTargets) { const roleId = privateView?.role?.roleId; setReceipt({ id: crypto.randomUUID(), kind: roleId === "poisoner" ? "POISON" : roleId === "monk" ? "PROTECT" : ["fortune_teller", "ravenkeeper"].includes(roleId ?? "") ? "DIVINE" : "SEALED", target: privateTargets.map((seat) => `${seat}号 ${privateView?.game?.seats.find((player) => player.seat === seat)?.nickname ?? ""}`).join("、") }); } }
    catch (caught) { await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "操作没有成功，请重试"); }
    finally { setBusy(false); }
  }

  async function restartGame() {
    if (!room || !isOrganizer) return;
    setBusy(true); setError(undefined);
    try {
      setRoom(await resetRoom(room.code));
      setConnectionState("ONLINE");
      setPrivateView(undefined);
      setScreen("LOBBY");
    } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法重新开局"); }
    finally { setBusy(false); }
  }

  async function exitRoom() {
    if (!room) return;
    setBusy(true); setError(undefined);
    try {
      await leaveRoom(room.code);
      clearSession();
      window.history.replaceState({}, "", window.location.pathname);
      setGuide(undefined);
      setPrivateView(undefined);
      setRoom(undefined);
      setParticipantId(undefined);
      setBackNotice(false);
      setConnectionState("ONLINE");
      setScreen("HOME");
    } catch (caught) {
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

  async function roomMutation(operation: (code: string) => Promise<RoomView>) { if (!room) return; setBusy(true); setError(undefined); try { setRoom(await operation(room.code)); } catch (caught) { await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "操作失败"); } finally { setBusy(false); } }

  if (screen === "LOBBY" && room) return withGuide(<Lobby room={room} {...(participantId ? { participantId } : {})} onReady={(ready) => void roomMutation((code) => setRoomReady(code, ready))} onReorder={(ids) => void roomMutation((code) => reorderRoomSeats(code, ids))} onBegin={beginTutorial} onLeave={() => void exitRoom()} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return withStatus(<Tutorial onBack={returnHome} onDone={finishTutorial} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "GAME") return withGuide(<PlayerGame {...(privateView ? { view: privateView } : {})} {...(receipt ? { receipt } : {})} {...(room ? { roomCode: room.code } : {})} {...(room?.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {})} busy={busy} canRestart={isOrganizer} {...(error ? { error } : {})} onBack={returnHome} onResumeGame={() => void runGameMutation(resumeGame)} onFinishDefense={() => void runGameMutation(finishDefense)} onLeave={() => void exitRoom()} onRefresh={() => { if (room) void getPrivateView(room.code).then(acceptPrivateView).catch(handleSessionFailure); }} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats), seats)} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onCancelNomination={() => void runGameMutation(cancelNomination)} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(readyToEndDay)} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onRestart={() => void restartGame()} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return withStatus(<Display code={room?.code ?? "------"} onBack={returnHome} onRoomClosed={handleRoomClosed} />);
  const stored = room ? readSession() : undefined;
  return withGuide(<Home onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} {...(error ? { error } : {})} {...(room && stored ? { activeRoom: room, activeMode: stored.mode, onResume: resumeRoom, onLeave: () => void exitRoom(), busy } : {})} />);
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
