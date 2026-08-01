import { useEffect, useState } from "react";
import { castVote, completeTutorial, confirmRole, createRoom, getAuthSession, getPrivateView, getRoom, joinRoom, login, nominate, readyToEndDay, startRoom, submitGameAction, useDayAbility, type PrivateView, type RoomView } from "./api.js";
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
interface StoredSession { roomCode: string; playerToken: string; mode: "PLAYER" | "DISPLAY"; organizerToken?: string }
const SESSION_KEY = "ravens_room_session";

export function App() {
  const [screen, setScreen] = useState<Screen>("LOADING");
  const [room, setRoom] = useState<RoomView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [organizerToken, setOrganizerToken] = useState<string>();
  const [playerToken, setPlayerToken] = useState<string>();
  const [privateView, setPrivateView] = useState<PrivateView>();

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
    if (screen !== "GAME" || !room || !playerToken) return;
    let active = true;
    const refresh = () => void getPrivateView(room.code, playerToken).then((view) => { if (active) setPrivateView(view); }).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 1_200);
    return () => { active = false; window.clearInterval(timer); };
  }, [screen, room?.code, playerToken]);

  async function submitJoin(values: JoinValues) {
    setBusy(true); setError(undefined);
    try {
      const joined = await joinRoom(values.code, values.nickname, values.mode);
      setPlayerToken(joined.token);
      const current = await getRoom(values.code);
      saveSession({ roomCode: current.code, playerToken: joined.token, mode: values.mode });
      setRoom(current); setScreen(values.mode === "DISPLAY" ? "DISPLAY" : "LOBBY");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "加入失败"); }
    finally { setBusy(false); }
  }

  async function submitCreate(name: string, count: number) {
    setBusy(true); setError(undefined);
    try { const created = await createRoom(count, name); const joined = await joinRoom(created.code, name, "PLAYER"); const current = await getRoom(created.code); saveSession({ roomCode: current.code, playerToken: joined.token, mode: "PLAYER", organizerToken: created.organizerToken }); setOrganizerToken(created.organizerToken); setPlayerToken(joined.token); setRoom(current); setScreen("LOBBY"); }
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
      setRoom(current); setPlayerToken(stored.playerToken); setOrganizerToken(stored.organizerToken);
      if (stored.mode === "DISPLAY") { setScreen("DISPLAY"); return; }
      if (current.state === "LOBBY") { setScreen("LOBBY"); return; }
      if (current.state === "TUTORIAL") { setScreen("TUTORIAL"); return; }
      setPrivateView(await getPrivateView(current.code, stored.playerToken)); setScreen("GAME");
    } catch { sessionStorage.removeItem(SESSION_KEY); setScreen("HOME"); }
  }

  if (screen === "LOADING") return <main className="app-loading" aria-label="正在进入钟楼"><span>☾</span></main>;
  if (screen === "LOGIN") return <Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />;
  if (screen === "CREATE") return <Create onBack={() => setScreen("HOME")} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />;
  if (screen === "JOIN") return <Join onBack={() => setScreen("HOME")} onSubmit={submitJoin} busy={busy} {...(error ? { error } : {})} />;
  async function beginTutorial() { if (!room || !organizerToken) return; setBusy(true); try { setRoom(await startRoom(room.code, organizerToken)); setScreen("TUTORIAL"); } catch (caught) { setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room || !playerToken) return; setBusy(true); try { const updated = await completeTutorial(room.code, playerToken); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code, playerToken)); } catch (caught) { setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string, token: string) => Promise<PrivateView>) {
    if (!room || !playerToken) return;
    setBusy(true); setError(undefined);
    try { setPrivateView(await operation(room.code, playerToken)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作没有成功，请重试"); }
    finally { setBusy(false); }
  }

  if (screen === "LOBBY" && room) return <Lobby room={room} onBegin={beginTutorial} canBegin={Boolean(organizerToken)} busy={busy} {...(error ? { error } : {})} />;
  if (screen === "TUTORIAL") return <Tutorial onDone={finishTutorial} />;
  if (screen === "GAME") return <PlayerGame {...(privateView ? { view: privateView } : {})} busy={busy} {...(error ? { error } : {})} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code, token) => submitGameAction(code, token, seats))} onNominate={(seat) => void runGameMutation((code, token) => nominate(code, token, seat))} onVote={(raised) => void runGameMutation((code, token) => castVote(code, token, raised))} onReady={() => void runGameMutation(readyToEndDay)} onUseAbility={(seat) => void runGameMutation((code, token) => useDayAbility(code, token, seat))} />;
  if (screen === "DISPLAY") return <Display code={room?.code ?? "------"} />;
  return <Home onCreate={() => setScreen("CREATE")} onJoin={() => setScreen("JOIN")} />;
}

function saveSession(session: StoredSession): void { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function readSession(): StoredSession | undefined {
  try { const value = sessionStorage.getItem(SESSION_KEY); return value ? JSON.parse(value) as StoredSession : undefined; }
  catch { return undefined; }
}
