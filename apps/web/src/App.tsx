import { useEffect, useState, type ReactNode } from "react";
import { castVote, completeTutorial, confirmRole, createRoom, getAuthSession, getPrivateView, getRoom, joinRoom, login, nominate, readyToEndDay, startRoom, submitGameAction, useDayAbility, type PrivateView, type RoomView } from "./api.js";
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
interface StoredSession { roomCode: string; mode: "PLAYER" | "DISPLAY"; organizer: boolean }
const SESSION_KEY = "ravens_room_session";

export function App() {
  const [screen, setScreen] = useState<Screen>("LOADING");
  const [room, setRoom] = useState<RoomView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [privateView, setPrivateView] = useState<PrivateView>();
  const [guide, setGuide] = useState<GuideMode>();

  useEffect(() => { void getAuthSession().then((session) => session.authorized ? restoreSession() : setScreen("LOGIN")).catch(() => setScreen("LOGIN")); }, []);

  useEffect(() => {
    if (screen !== "LOBBY" || !room) return;
    const timer = window.setInterval(() => void getRoom(room.code).then(setRoom).catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [screen, room?.code]);

  useEffect(() => {
    if (screen !== "LOBBY" || room?.state !== "TUTORIAL") return;
    setScreen("TUTORIAL");
  }, [room?.state, screen]);

  useEffect(() => {
    if (screen !== "GAME" || !room) return;
    let active = true;
    const refresh = () => void getPrivateView(room.code).then((view) => { if (active) setPrivateView(view); }).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code]);

  async function submitJoin(values: JoinValues) {
    setBusy(true); setError(undefined);
    try {
      await joinRoom(values.code, values.nickname, values.mode);
      const current = await getRoom(values.code);
      saveSession({ roomCode: current.code, mode: values.mode, organizer: false });
      setIsOrganizer(false);
      setRoom(current); setScreen(values.mode === "DISPLAY" ? "DISPLAY" : "LOBBY");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "加入失败"); }
    finally { setBusy(false); }
  }

  async function submitCreate(name: string, count: number) {
    setBusy(true); setError(undefined);
    try { const created = await createRoom(count, name); await joinRoom(created.code, name, "PLAYER"); const current = await getRoom(created.code); saveSession({ roomCode: current.code, mode: "PLAYER", organizer: true }); setIsOrganizer(true); setRoom(current); setScreen("LOBBY"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "创建失败"); }
    finally { setBusy(false); }
  }

  async function submitLogin(password: string) {
    setBusy(true); setError(undefined);
    try { await login(password); await restoreSession(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "无法验证访问口令"); }
    finally { setBusy(false); }
  }

  async function restoreSession() {
    const stored = readSession();
    if (!stored) { setScreen("HOME"); return; }
    try {
      const current = await getRoom(stored.roomCode);
      setRoom(current); setIsOrganizer(stored.organizer);
      if (stored.mode === "DISPLAY") { setScreen("DISPLAY"); return; }
      if (current.state === "LOBBY") { setScreen("LOBBY"); return; }
      if (current.state === "TUTORIAL") { setScreen("TUTORIAL"); return; }
      setPrivateView(await getPrivateView(current.code)); setScreen("GAME");
    } catch { sessionStorage.removeItem(SESSION_KEY); setScreen("HOME"); }
  }

  const withGuide = (page: ReactNode) => <>{page}{guide ? <GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /> : null}</>;

  if (screen === "LOADING") return <main className="app-loading" aria-label="正在进入钟楼"><span>☾</span></main>;
  if (screen === "LOGIN") return <Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />;
  if (screen === "CREATE") return <Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />;
  if (screen === "JOIN") return <Join onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />;
  async function beginTutorial() { if (!room || !isOrganizer) return; setBusy(true); try { setRoom(await startRoom(room.code)); setScreen("TUTORIAL"); } catch (caught) { setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room) return; setBusy(true); try { const updated = await completeTutorial(room.code); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code)); } catch (caught) { setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string) => Promise<PrivateView>) {
    if (!room) return;
    setBusy(true); setError(undefined);
    try { setPrivateView(await operation(room.code)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作没有成功，请重试"); }
    finally { setBusy(false); }
  }

  if (screen === "LOBBY" && room) return withGuide(<Lobby room={room} onBegin={beginTutorial} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return <Tutorial onDone={finishTutorial} />;
  if (screen === "GAME") return withGuide(<PlayerGame {...(privateView ? { view: privateView } : {})} busy={busy} {...(error ? { error } : {})} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats))} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(readyToEndDay)} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return <Display code={room?.code ?? "------"} />;
  return withGuide(<Home onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} />);
}

function saveSession(session: StoredSession): void { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function readSession(): StoredSession | undefined {
  try { const value = sessionStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as StoredSession : undefined; }
  catch { return undefined; }
}
