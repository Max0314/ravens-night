import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, cancelNomination, castVote, completeTutorial, confirmRole, createRoom, getAuthSession, getPrivateView, getRoom, joinRoom, leaveRoom, login, nominate, readyToEndDay, resetRoom, startRoom, submitGameAction, useDayAbility, type PrivateView, type RoomView } from "./api.js";
import { GuideOverlay, type GuideMode } from "./components/GuideOverlay.js";
import { Create } from "./pages/Create.js";
import { Display } from "./pages/Display.js";
import { Home } from "./pages/Home.js";
import { Join, type JoinValues } from "./pages/Join.js";
import { Lobby } from "./pages/Lobby.js";
import { Login } from "./pages/Login.js";
import { PlayerGame } from "./pages/PlayerGame.js";
import { Tutorial } from "./pages/Tutorial.js";
import "./styles/app.css";

type Screen = "LOADING" | "LOGIN" | "HOME" | "CREATE" | "JOIN" | "LOBBY" | "TUTORIAL" | "GAME" | "DISPLAY";
type ConnectionState = "ONLINE" | "OFFLINE" | "RECONNECTING";
interface StoredSession { roomCode: string; mode: "PLAYER" | "DISPLAY"; participantId?: string }
const SESSION_KEY = "ravens_room_session";
const PROTECTED_SCREENS = new Set<Screen>(["LOBBY", "TUTORIAL", "GAME", "DISPLAY"]);

export function App() {
  const invitedRoomCode = readInvitedRoomCode();
  const [screen, setScreen] = useState<Screen>("LOADING");
  const [room, setRoom] = useState<RoomView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [participantId, setParticipantId] = useState<string>();
  const [privateView, setPrivateView] = useState<PrivateView>();
  const [guide, setGuide] = useState<GuideMode>();
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => navigator.onLine ? "ONLINE" : "OFFLINE");
  const [backNotice, setBackNotice] = useState(false);
  const guideRef = useRef<GuideMode | undefined>(undefined);
  const backNoticeTimer = useRef<number | undefined>(undefined);
  const isOrganizer = Boolean(room?.organizerId && participantId === room.organizerId);

  useEffect(() => { void initialize(); }, []);
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
    if (screen !== "LOBBY" || !room) return;
    const refresh = () => void getRoom(room.code).then((next) => { setRoom(next); setConnectionState("ONLINE"); }).catch((caught: unknown) => { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); });
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, [screen, room?.code]);

  useEffect(() => {
    if (screen !== "LOBBY" || room?.state !== "TUTORIAL") return;
    setScreen("TUTORIAL");
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
      setPrivateView(view);
    }).catch((caught: unknown) => { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); });
    refresh();
    const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code]);

  async function submitJoin(values: JoinValues) {
    setBusy(true); setError(undefined);
    try {
      const joined = await joinRoom(values.code, values.nickname, values.mode);
      const current = await getRoom(values.code);
      setConnectionState("ONLINE");
      saveSession({ roomCode: current.code, mode: values.mode, ...(values.mode === "PLAYER" ? { participantId: joined.id } : {}) });
      setParticipantId(values.mode === "PLAYER" ? joined.id : undefined);
      setRoom(current); setScreen(values.mode === "DISPLAY" ? "DISPLAY" : "LOBBY");
    } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "加入失败"); }
    finally { setBusy(false); }
  }

  async function submitCreate(name: string, count: number) {
    setBusy(true); setError(undefined);
    try { const created = await createRoom(count, name); const joined = await joinRoom(created.code, name, "PLAYER"); const current = await getRoom(created.code); setConnectionState("ONLINE"); saveSession({ roomCode: current.code, mode: "PLAYER", participantId: joined.id }); setParticipantId(joined.id); setRoom(current); setScreen("LOBBY"); }
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
      if (current.state === "TUTORIAL") { setScreen("TUTORIAL"); return; }
      setPrivateView(mine); setScreen("GAME");
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403, 404].includes(caught.status)) {
        localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); setScreen(invitedRoomCode ? "JOIN" : "HOME");
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
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setGuide(undefined);
    setPrivateView(undefined);
    setRoom(undefined);
    setParticipantId(undefined);
    setBackNotice(false);
    setConnectionState("ONLINE");
    setScreen("HOME");
  }, []);

  const withStatus = (page: ReactNode) => <>{page}{connectionState === "OFFLINE" ? <p className="session-status session-status--offline" role="status">网络已断开：本局状态保存在服务器，恢复网络后会自动同步</p> : null}{connectionState === "RECONNECTING" ? <p className="session-status" role="status">网络已恢复，正在同步当前局面…</p> : null}{backNotice ? <p className="session-status session-status--back" role="status">已阻止误退出，游戏仍在进行；稍后重新打开也会恢复原座位</p> : null}</>;
  const withGuide = (page: ReactNode) => withStatus(<>{page}{guide ? <GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /> : null}</>);

  if (screen === "LOADING") return withStatus(<main className="app-loading" aria-label="正在进入钟楼"><span>☾</span></main>);
  if (screen === "LOGIN") return withStatus(<Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "CREATE") return withStatus(<Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "JOIN") return withStatus(<Join initialCode={invitedRoomCode} onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />);
  async function beginTutorial() { if (!room || !isOrganizer) return; setBusy(true); try { setRoom(await startRoom(room.code)); setConnectionState("ONLINE"); setScreen("TUTORIAL"); } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room) return; setBusy(true); try { const updated = await completeTutorial(room.code); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code)); setConnectionState("ONLINE"); } catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string) => Promise<PrivateView>) {
    if (!room) return;
    setBusy(true); setError(undefined);
    try { setPrivateView(await operation(room.code)); setConnectionState("ONLINE"); }
    catch (caught) { if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "操作没有成功，请重试"); }
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
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
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
    const stored = readSession();
    if (!room || !stored) return;
    setError(undefined);
    if (stored.mode === "DISPLAY") { setScreen("DISPLAY"); return; }
    if (room.state === "LOBBY") { setScreen("LOBBY"); return; }
    if (room.state === "TUTORIAL") { setScreen("TUTORIAL"); return; }
    setScreen("GAME");
  }

  if (screen === "LOBBY" && room) return withGuide(<Lobby room={room} onBegin={beginTutorial} onLeave={() => void exitRoom()} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return withStatus(<Tutorial onBack={returnHome} onDone={finishTutorial} />);
  if (screen === "GAME") return withGuide(<PlayerGame {...(privateView ? { view: privateView } : {})} busy={busy} canRestart={isOrganizer} {...(error ? { error } : {})} onBack={returnHome} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats))} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onCancelNomination={() => void runGameMutation(cancelNomination)} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(readyToEndDay)} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onRestart={() => void restartGame()} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return withStatus(<Display code={room?.code ?? "------"} onBack={returnHome} onRoomClosed={handleRoomClosed} />);
  const stored = room ? readSession() : undefined;
  return withGuide(<Home onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} {...(room && stored ? { activeRoom: room, activeMode: stored.mode, onResume: resumeRoom, onLeave: () => void exitRoom(), busy, ...(error ? { error } : {}) } : {})} />);
}

function saveSession(session: StoredSession): void { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); sessionStorage.removeItem(SESSION_KEY); }
function readSession(): StoredSession | undefined {
  try {
    const value = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!value) return undefined;
    const session = JSON.parse(value) as StoredSession;
    localStorage.setItem(SESSION_KEY, value);
    sessionStorage.removeItem(SESSION_KEY);
    return session;
  }
  catch { return undefined; }
}

function readInvitedRoomCode(): string {
  return new URLSearchParams(window.location.search).get("room")?.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6) ?? "";
}

function isNetworkFailure(error: unknown): boolean { return !(error instanceof ApiError); }
