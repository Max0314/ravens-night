import {clearInvitationUrl,selectRoomUrl,readInvitedRoomCode,readSession,saveSession,clearSession,clearSessionFor,readStoredRoom,storedRoomSessions,type StoredSession} from './room-session.js';
export {readSession,saveSession} from './room-session.js';
import {getRoomSummary,clearPendingJoin,isDefiniteJoinFailure,readPendingRoomSwitch,finishPendingRoomSwitch,retryPendingRoomSwitch,requestRoomSwitchTicket,switchRoom,type RoomSwitchTicket,type JoinResult} from './api.js';
import {RoomSheet} from './components/RoomPage.js';
import {playerLabel} from '@ravens/ui';
import type {PlayerSelection} from './use-player-profile.js';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { ApiError, hasPendingCommand, setRehearsalRole, retryPendingCommand, notifyStorageFailure, acknowledgeStartInfo, cancelNomination, castVote, completeTutorial, confirmRole, createRoom, readCreationIntent, finishCreationIntent, getAuthSession, getPrivateView as fetchPrivateView, getRoom as fetchRoom, resetAccountContext, joinRoom, leaveRoom, login, nominate, readyToEndDay, resetRoom, startRoom, submitGameAction, useDayAbility, setRoomReady, reorderRoomSeats, removeRoomPlayer, recoverRoom, resumeGame, finishDefense, type PrivateView, type RoomPlayMode, type RoomView } from "./api.js";
import { GramophonePlayer } from "./components/GramophonePlayer.js";
import { GuideOverlay, type GuideMode } from "./components/GuideOverlay.js";
import { RoomTools } from "./components/RoomTools.js";
import { Create } from "./pages/Create.js";
import { Display } from "./pages/Display.js";
import { Home } from "./pages/Home.js";
import { Join, type JoinValues } from "./pages/Join.js";
import { Lobby } from "./pages/Lobby.js";
import { Login } from "./pages/Login.js";
import { PlayerGame, hasPrivateTownTask } from "./pages/PlayerGame.js";
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
import "./styles/town-workspace.css";
import "./styles/result-town.css";
import "./styles/village-records.css";
import {installMobileViewport} from './mobile-viewport.js';
import { installTouchPolicy } from './touch-policy.js';
import { roomSnapshot } from "./room-snapshot.js";
import {roomSessionKey} from './account-context.js';
import {getAccount,resumeAccountRoom} from './api.js';

type Screen = "LOADING" | "LOGIN" | "HOME" | "CREATE" | "JOIN" | "LOBBY" | "TUTORIAL" | "GAME" | "DISPLAY";
type ConnectionState = "ONLINE" | "OFFLINE" | "RECONNECTING";
const SESSION_KEY = roomSessionKey();


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
  const entryEpoch=useRef(0);
  async function entryRequest<T>(pending:Promise<T>,epoch:number):Promise<T>{try{const result=await pending;if(epoch!==entryEpoch.current)throw new ApiError("已切换入口",409,"STALE_RESPONSE");return result;}catch(caught){if(epoch!==entryEpoch.current)throw new ApiError("已切换入口",409,"STALE_RESPONSE");throw caught;}}
  const {room, privateView} = snapshot;
  const renderGeneration=generation.current;
  const [upgrade,setUpgrade]=useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [switchSource,setSwitchSource]=useState<RoomView>(),[roomChoice,setRoomChoice]=useState(false),[entryBlocked,setEntryBlocked]=useState(false);
  const [switchConfirmation,setSwitchConfirmation]=useState<{values:JoinValues;ticket:RoomSwitchTicket;targetInstance:string}>();
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
  useEffect(()=>{if(!room||!participantId)return;const stored=readStoredRoom(room.code);if(stored&&stored.participantId===participantId&&(stored.isHost!==(room.organizerId===participantId)||stored.roomInstanceId!==room.roomInstanceId))saveSession({...stored,roomInstanceId:room.roomInstanceId,isHost:room.organizerId===participantId});},[room?.code,room?.roomInstanceId,room?.organizerId,participantId]);

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
    const back = (event: PopStateEvent) => { entryEpoch.current++;setBusy(false);const next=event.state?.ravensScreen ?? "HOME"; screenRef.current=next;applyScreen(next); };
    const hide = () => { if (document.hidden) setGuide(undefined); };
    const account = () => {
      // The SDK also announces its initial identity. Only an actual namespace
      // change needs clearing here; account-context already reloads that case.
      if (roomSessionKey() === SESSION_KEY) return;
      entryEpoch.current++;beginSession(); resetAccountContext(); setParticipantId(undefined); setReceipt(undefined); setGuide(undefined); setScreen("LOADING");
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

  async function acceptJoined(code:string,mode:'PLAYER'|'DISPLAY',joined:Pick<JoinResult,'id'|'closedRoomCode'>,epoch=entryEpoch.current) {
    if(epoch!==entryEpoch.current)throw new ApiError('已切换入口',409,'STALE_RESPONSE');
    selectRoomUrl(code,mode);
    saveSession({roomCode:code,mode,...(mode==='PLAYER'?{participantId:joined.id}:{})});
    if(joined.closedRoomCode)clearSessionFor(joined.closedRoomCode,'PLAYER');
    clearPendingJoin(code,mode);finishPendingRoomSwitch();setSwitchSource(undefined);setRoomChoice(false);setSwitchConfirmation(undefined);setEntryBlocked(false);
    const current=await entryRequest(getRoom(code,mode),epoch);setConnectionState('ONLINE');setRoom(current);setParticipantId(mode==='PLAYER'?joined.id:undefined);
    saveSession({roomCode:current.code,mode,roomInstanceId:current.roomInstanceId,isHost:mode==='PLAYER'&&current.organizerId===joined.id,...(mode==='PLAYER'?{participantId:joined.id}:{})});
    if(mode==='DISPLAY')setScreen('DISPLAY');else await restoreSession(true,undefined,epoch);
  }
  async function retrySwitch() {
    const intent=readPendingRoomSwitch();if(!intent)return;const epoch=++entryEpoch.current;
    beginSession();setBusy(true);setError(undefined);setScreen('JOIN');
    try{const joined=await entryRequest(guard(retryPendingRoomSwitch()),epoch);await acceptJoined(intent.targetCode,'PLAYER',joined,epoch);}
    catch(caught){if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;setError(caught instanceof Error?caught.message:'换房结果待确认，请重试原操作');if(isNetworkFailure(caught))setConnectionState('OFFLINE');setScreen('JOIN');}
    finally{if(epoch===entryEpoch.current)setBusy(false);}
  }
  async function findOwnedRoom(excluded:string,epoch=entryEpoch.current):Promise<RoomView|undefined>{
    for(const stored of storedRoomSessions()){
      if(stored.mode!=='PLAYER'||stored.pendingJoin||stored.roomCode===excluded)continue;
      try{const current=await entryRequest(getRoom(stored.roomCode,'PLAYER'),epoch),self=current.self?.participantId??stored.participantId;
        if(current.organizerId&&current.organizerId===self){saveSession({...stored,roomInstanceId:current.roomInstanceId,isHost:true});return current;}
      }catch(caught){if(isRevokedSession(caught)){clearSessionFor(stored.roomCode,stored.mode);continue;}throw caught;}
    }
    return undefined;
  }
  async function restoreOwned(source:RoomView,epoch=++entryEpoch.current){
    beginSession();selectRoomUrl(source.code,'PLAYER');saveSession({roomCode:source.code,mode:'PLAYER',roomInstanceId:source.roomInstanceId,isHost:true,participantId:source.self?.participantId??source.organizerId});setSwitchSource(undefined);setRoomChoice(false);setEntryBlocked(false);await restoreSession(true,undefined,epoch);
  }
  async function routeInvitation(code:string,epoch=entryEpoch.current){
    if(epoch!==entryEpoch.current)return;
    setEntryBlocked(false);
    let exists=true;
    try{await entryRequest(getRoomSummary(code),epoch);}catch(caught){if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;if(caught instanceof ApiError&&caught.status===404){exists=false;clearPendingJoin(code,'PLAYER');clearPendingJoin(code,'DISPLAY');clearSessionFor(code,'PLAYER');clearSessionFor(code,'DISPLAY');clearInvitationUrl();}else{setEntryBlocked(true);setError(caught instanceof Error?caught.message:'邀请房间暂时无法核对，请重试');setScreen('JOIN');return;}}
    try{
      const mode=new URLSearchParams(location.search).get('display')==='1'?'DISPLAY':'PLAYER';let saved=exists?readStoredRoom(code,mode):undefined,targetRoom:RoomView|undefined;
      if(exists&&mode==='DISPLAY'){if(saved){saveSession(saved);await restoreSession(true,undefined,epoch);}else setScreen('JOIN');return;}
      if(saved&&!saved.pendingJoin&&saved.isHost!==false){try{targetRoom=await entryRequest(getRoom(code,'PLAYER'),epoch);if(targetRoom.organizerId&&(targetRoom.self?.participantId??saved.participantId)===targetRoom.organizerId){saveSession(saved);await restoreSession(true,targetRoom,epoch);return;}}catch(caught){if(isRevokedSession(caught)){clearSessionFor(code,'PLAYER');saved=undefined;setError(caught instanceof ApiError&&caught.errorCode==='SEAT_REMOVED'?'你已被移出原房间，可重新加入或创建房间。':'原房间或席位已失效，可重新加入或创建房间。');}else throw caught;}}
      const source=await findOwnedRoom(code,epoch);
      if(!exists){if(source){await restoreOwned(source,epoch);setError('邀请房间已结束，已回到你的房间。');}else{setRoom(undefined);setParticipantId(undefined);setScreen('HOME');setError('邀请房间已结束，可创建或加入其他房间。');}return;}
      if(!source&&saved){saveSession(saved);await restoreSession(true,targetRoom,epoch);return;}
      setSwitchSource(source);setRoomChoice(!!source);setScreen('JOIN');
    }catch(caught){if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;setEntryBlocked(true);setError(caught instanceof Error?caught.message:'原房间暂时无法核对，请重试');setScreen('JOIN');}
  }
  async function submitJoin(values:JoinValues){
    const epoch=++entryEpoch.current;
    if(readPendingRoomSwitch()){await retrySwitch();return;}
    setBusy(true);setError(undefined);setEntryBlocked(false);
    try{
      if(values.mode==='PLAYER'&&!values.recoveryCode){const source=switchSource??await findOwnedRoom(values.code,epoch);if(source&&source.code!==values.code){
        setSwitchSource(source);const target=await entryRequest(getRoomSummary(values.code),epoch);if(!target.roomInstanceId)throw new Error('房间版本尚未同步，请刷新后重试');
        const ticket=await entryRequest(requestRoomSwitchTicket(source,values.code,target.roomInstanceId),epoch);setSwitchConfirmation({values,ticket,targetInstance:target.roomInstanceId});return;
      }}
      beginSession();
      if(!values.recoveryCode)saveSession({roomCode:values.code,mode:values.mode,nickname:values.nickname,...(values.avatar!==undefined?{avatar:values.avatar}:{}),...(values.expectedProfileRevision!==undefined?{expectedProfileRevision:values.expectedProfileRevision}:{}),pendingJoin:true});
      const joined=await entryRequest(guard(values.recoveryCode?recoverRoom(values.code,values.recoveryCode):joinRoom(values.code,values.nickname,values.mode,values.avatar!==undefined?{nickname:values.nickname,avatar:values.avatar,...(values.expectedProfileRevision!==undefined?{expectedProfileRevision:values.expectedProfileRevision}:{})}:undefined)),epoch);
      await acceptJoined(values.code,values.mode,joined,epoch);
    }catch(caught){if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;if(isNetworkFailure(caught))setConnectionState('OFFLINE');setError(caught instanceof Error?caught.message:'加入失败');if(isDefiniteJoinFailure(caught)){clearPendingJoin(values.code,values.mode);if(readSession()?.pendingJoin)clearSessionFor(values.code,values.mode);}if(caught instanceof ApiError&&caught.status===404)await routeInvitation(values.code,epoch);}
    finally{if(epoch===entryEpoch.current)setBusy(false);}
  }
  async function confirmSwitch(){
    const pending=switchConfirmation,source=switchSource;if(!pending||!source||busy)return;const epoch=++entryEpoch.current;
    setBusy(true);setError(undefined);beginSession();
    try{const values=pending.values,joined=await entryRequest(guard(switchRoom(source,values.code,pending.targetInstance,pending.ticket,{nickname:values.nickname,avatar:values.avatar??null,...(values.expectedProfileRevision!==undefined?{expectedProfileRevision:values.expectedProfileRevision}:{})})),epoch);await acceptJoined(values.code,'PLAYER',joined,epoch);}
    catch(caught){if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;setError(caught instanceof Error?caught.message:'换房失败，原房间已保留');if(isNetworkFailure(caught))setConnectionState('OFFLINE');if(isDefiniteJoinFailure(caught)){setSwitchConfirmation(undefined);if(caught instanceof ApiError&&['SOURCE_ROOM_GONE','HOST_CHANGED','ROOM_INSTANCE_CHANGED'].includes(caught.errorCode??'')){setSwitchSource(undefined);if(caught.errorCode==='SOURCE_ROOM_GONE')clearSessionFor(source.code,'PLAYER');else if(caught.errorCode==='HOST_CHANGED'){const saved=readStoredRoom(source.code);if(saved)saveSession({...saved,isHost:false});}}}setScreen('JOIN');}
    finally{if(epoch===entryEpoch.current)setBusy(false);}
  }

  async function submitCreate(name: string, count: number, playMode: RoomPlayMode, voiceRoomUrl?: string,profile?:PlayerSelection) {
    const epoch=++entryEpoch.current;
    if(readPendingRoomSwitch()){await retrySwitch();return;}
    if(readSession()?.pendingJoin){await restoreSession(false,undefined,epoch);return;}
    beginSession();
    setBusy(true); setError(undefined);
    let createdCode:string|undefined;
    try { const created = await entryRequest(guard(createRoom(count, name, playMode, voiceRoomUrl,profile)),epoch); createdCode=created.code; selectRoomUrl(created.code,"PLAYER"); saveSession({ roomCode: created.code, mode: "PLAYER", nickname:name,...(profile?{avatar:profile.avatar,...(profile.expectedProfileRevision!==undefined?{expectedProfileRevision:profile.expectedProfileRevision}:{})}:{}), pendingJoin:true }); finishCreationIntent(); const joined = await entryRequest(guard(joinRoom(created.code, name, "PLAYER",profile)),epoch); const current = await entryRequest(getRoom(created.code, "PLAYER"),epoch); setConnectionState("ONLINE"); saveSession({ roomCode: current.code, mode: "PLAYER", participantId: joined.id,roomInstanceId:current.roomInstanceId,isHost:current.organizerId===joined.id }); setParticipantId(joined.id); setRoom(current); acceptPrivateView(await entryRequest(getPrivateView(current.code),epoch)); setScreen("LOBBY"); }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "创建失败");if(createdCode||readSession()?.pendingJoin)setScreen("JOIN"); }
    finally { if(epoch===entryEpoch.current)setBusy(false); }
  }

  async function submitLogin(password: string) {
    setBusy(true); setError(undefined);
    try { await login(password); setConnectionState("ONLINE"); await restoreSession(); }
    catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法验证访问口令"); }
    finally { setBusy(false); }
  }

  async function restoreSession(skipInvitation=false,suppliedRoom?:RoomView,epoch=entryEpoch.current) {
    if(epoch!==entryEpoch.current)return;
    const invitedRoomCode=readInvitedRoomCode();
    let stored = readSession();
    if (!skipInvitation && invitedRoomCode) { await routeInvitation(invitedRoomCode,epoch); return; }
    if (!stored) { if(invitedRoomCode&&!skipInvitation)await routeInvitation(invitedRoomCode,epoch);else setScreen("HOME"); return; }
    try {
      if(stored.pendingJoin && stored.nickname){const joined=await entryRequest(guard(joinRoom(stored.roomCode,stored.nickname,stored.mode,stored.avatar!==undefined?{nickname:stored.nickname,avatar:stored.avatar,...(stored.expectedProfileRevision!==undefined?{expectedProfileRevision:stored.expectedProfileRevision}:{})}:undefined)),epoch);stored={roomCode:stored.roomCode,mode:stored.mode,...(stored.mode==="PLAYER"?{participantId:joined.id}:{})};saveSession(stored);}
      const current = suppliedRoom??await entryRequest(getRoom(stored.roomCode,stored.mode),epoch);
      setRoom(current);
      if (stored.mode === "DISPLAY") { setParticipantId(undefined); setScreen("DISPLAY"); return; }
      const mine = await entryRequest(getPrivateView(current.code),epoch);
      setParticipantId(mine.participant.id);
      saveSession({ roomCode: current.code, mode: "PLAYER", participantId: mine.participant.id, roomInstanceId:current.roomInstanceId,isHost:current.organizerId===mine.participant.id });
      acceptPrivateView(mine);
      if ((mine.room?.state??mine.state??current.state) === "LOBBY") { setScreen("LOBBY"); return; }
      if ((mine.room?.state??mine.state??current.state) === "TUTORIAL" && !mine.participant.tutorialComplete) { setScreen("TUTORIAL"); return; }
      setPrivateView(mine); setScreen("GAME");
    } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if(caught instanceof ApiError&&caught.status===404&&invitedRoomCode&&!skipInvitation){await routeInvitation(invitedRoomCode,epoch);return;}
      if(stored?.pendingJoin&&!isDefiniteJoinFailure(caught)){setScreen("JOIN");setError(caught instanceof Error?caught.message:"加入结果待确认，请重试");return;}
      if(stored?.pendingJoin&&isDefiniteJoinFailure(caught)){clearPendingJoin(stored.roomCode,stored.mode);clearSessionFor(stored.roomCode,stored.mode);}
      if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return;
      if (isRevokedSession(caught)) {
        clearSession(); setRoom(undefined); setPrivateView(undefined); setParticipantId(undefined); setError(caught instanceof ApiError&&caught.errorCode==="SEAT_REMOVED"?"你已被移出原房间，可重新加入或创建房间。":"原房间或席位已失效，可重新加入或创建房间。"); clearInvitationUrl(); setScreen("HOME");
      } else { if(caught instanceof ApiError&&caught.status===426)setUpgrade(true);else setConnectionState("OFFLINE"); setScreen("LOADING"); }
    }
  }

  async function initialize() {
    const epoch=++entryEpoch.current;
    try {
      const session = await entryRequest(getAuthSession(),epoch);
      setConnectionState("ONLINE");
      if (session.authorized) {
        if(readPendingRoomSwitch()){await retrySwitch();return;}
        const pendingCreate=readCreationIntent();if(pendingCreate&&!readSession()&&!invitedRoomCode){setScreen("CREATE");await submitCreate(pendingCreate.organizerName,pendingCreate.playerCount,pendingCreate.playMode??"IN_PERSON",pendingCreate.voiceRoomUrl,pendingCreate.avatar!==undefined?{nickname:pendingCreate.organizerName,avatar:pendingCreate.avatar,...(pendingCreate.expectedProfileRevision!==undefined?{expectedProfileRevision:pendingCreate.expectedProfileRevision}:{})}:undefined);return;}
        if(readSession()){await restoreSession();return;}
        const account=await entryRequest(getAccount(),epoch);
        if(account.signedIn&&!readSession()&&account.rooms.length===1&&!invitedRoomCode){const result=await entryRequest(resumeAccountRoom(account.rooms[0]!),epoch);saveSession({roomCode:result.code,mode:result.mode,participantId:result.id});}
        await restoreSession();
      } else setScreen("LOGIN");
    } catch(caught) { if(caught instanceof ApiError&&caught.errorCode==='STALE_RESPONSE')return;if(caught instanceof ApiError&&caught.status===426)setUpgrade(true);else setConnectionState("OFFLINE"); setScreen("LOADING"); }
  }

  const handleRoomClosed = useCallback(() => {
    entryEpoch.current++;setBusy(false);clearSession(); clearInvitationUrl(); resetAccountContext();setSwitchSource(undefined);setRoomChoice(false);setSwitchConfirmation(undefined);setEntryBlocked(false);
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
      handleRoomClosed(); setError(caught instanceof ApiError&&caught.errorCode==="SEAT_REMOVED"?"你已被移出房间，可重新加入或创建房间。":"房间已结束或被房主关闭，可创建或加入其他房间。");
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

  const withStatus = (page: ReactNode) => <>{page}{readPendingRoomSwitch()&&!busy?<p className="session-status" role="status">换房结果待确认<button type="button" onClick={()=>void retrySwitch()}>重试原换房操作</button></p>:null}{entryBlocked?<p className="session-status" role="alert">{error}<button type="button" onClick={()=>void initialize()}>重试房间核对</button></p>:null}{storageNotice?<p className="session-status" role="status">浏览器未保存恢复资料，请勿关闭或刷新此页面。</p>:null}{upgrade?<p className="session-status" role="alert">游戏已更新<button type="button" onClick={()=>window.location.reload()}>刷新页面</button></p>:null}{connectionState === "OFFLINE" ? <p className="session-status session-status--offline" role="status">网络已断开：本局状态保存在服务器，恢复网络后会自动同步</p> : null}{connectionState === "RECONNECTING" ? <p className="session-status" role="status">网络已恢复，正在同步当前局面…</p> : null}{backNotice ? <p className="session-status session-status--back" role="status">已阻止误退出，游戏仍在进行；稍后重新打开也会恢复原座位</p> : null}</>;
  const roomTools=!guide&&room&&participantId?<RoomTools key={`${room.roomInstanceId}:${participantId}`} room={room} participantId={participantId} {...(privateView?{view:privateView}:{})} onChanged={refreshCurrentRoom} onHome={returnHome} onLeft={()=>{if(renderGeneration===generation.current)handleRoomClosed();}} onGuide={setGuide}/>:null;
  const withGuide = (page: ReactNode) => withStatus(<>{page}{screen!=='HOME'?roomTools:null}{guide ? <div className={`guide-host${screen==="GAME"&&privateView?.game?.phase==="VOTING"?" has-ballot-notice":screen==="GAME"&&hasPrivateTownTask(privateView)?" has-private-action-notice":""}`}><GuideOverlay mode={guide} {...(privateView?.role ? { ownRole: privateView.role } : {})} onClose={() => setGuide(undefined)} /></div> : null}</>);

  if (screen === "LOADING") return withStatus(<main className="app-loading" aria-label="正在进入钟楼"><span>☾</span>{connectionState === "OFFLINE" ? <button type="button" onClick={() => void initialize()}>重新连接钟楼</button> : null}</main>);
  if (screen === "LOGIN") return withStatus(<Login onSubmit={submitLogin} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "CREATE") return withStatus(<Create onBack={returnHome} onSubmit={submitCreate} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "JOIN") return withStatus(<><Join key={readPendingRoomSwitch()?.targetCode??invitedRoomCode} initialMode={new URLSearchParams(window.location.search).get('display')==='1'?'DISPLAY':'PLAYER'} initialCode={readPendingRoomSwitch()?.targetCode||invitedRoomCode||readSession()?.roomCode||''} onBack={returnHome} onSubmit={submitJoin} {...(switchSource?{previousRoom:{code:switchSource.code,onReturn:()=>void restoreOwned(switchSource)}}:{})} busy={busy||entryBlocked} {...(error?{error}:{})}/>{roomChoice&&switchSource?<RoomSheet title="选择房间" onClose={()=>setRoomChoice(false)} actions={<><button type="button" disabled={busy} onClick={()=>void restoreOwned(switchSource)}>回到我的房间</button><button type="button" disabled={busy} onClick={()=>setRoomChoice(false)}>继续加入新房间</button></>}><p>你是房间 {switchSource.code} 的房主。加入新房间时，将在确认后关闭原房间。</p></RoomSheet>:null}{switchConfirmation?<RoomSheet title="加入新房间并关闭旧房间" confirmation onClose={()=>{if(!busy&&!readPendingRoomSwitch())setSwitchConfirmation(undefined);}} actions={<><button type="button" disabled={busy} onClick={()=>void(readPendingRoomSwitch()?retrySwitch():confirmSwitch())}>{readPendingRoomSwitch()?'重试原换房操作':'加入并关闭旧房间'}</button><button type="button" disabled={busy||!!readPendingRoomSwitch()} onClick={()=>setSwitchConfirmation(undefined)}>取消</button></>}><p>将加入房间 {switchConfirmation.values.code}，并关闭原房间 {switchConfirmation.ticket.source.code}。</p><p>原房间{switchConfirmation.ticket.source.state==='RUNNING'?'已经开局':'当前未在进行对局'}，有 {switchConfirmation.ticket.source.activeHumanCount} 名真人。关闭后所有玩家都会退出，当前进度不再继续。</p>{error?<p role="alert">{error}</p>:null}</RoomSheet>:null}</>);
  async function beginTutorial(tutorialMode: "SKIP" | "OPTIONAL" = "SKIP") { if (!room || !isOrganizer) return; setBusy(true); try { const next = await guard(startRoom(room.code, tutorialMode)); setRoom(next); setConnectionState("ONLINE"); if (next.state === "TUTORIAL") setScreen("TUTORIAL"); else { acceptPrivateView(await getPrivateView(room.code)); setScreen("GAME"); } } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "无法开始"); } finally { setBusy(false); } }
  async function finishTutorial() { if (!room) return; setBusy(true); try { const updated = await guard(completeTutorial(room.code)); setRoom(updated); setScreen("GAME"); setPrivateView(await getPrivateView(room.code)); setConnectionState("ONLINE"); } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; if (isNetworkFailure(caught)) setConnectionState("OFFLINE"); setError(caught instanceof Error ? caught.message : "无法完成教学"); } finally { setBusy(false); } }

  async function runGameMutation(operation: (code: string) => Promise<PrivateView>, privateTargets?: number[]) {
    if (!room) return;
    setBusy(true); setError(undefined);
    try { const updated = await guard(operation(room.code)); acceptPrivateView(updated);  setConnectionState("ONLINE"); if (privateTargets) { const roleId = privateView?.role?.roleId; setReceipt({ id: crypto.randomUUID(), kind: roleId === "poisoner" ? "POISON" : roleId === "monk" ? "PROTECT" : roleId==="butler"?"BUTLER":roleId==="imp"?"DEMON": ["fortune_teller", "ravenkeeper"].includes(roleId ?? "") ? "DIVINE" : "SEALED", targetSeats:[...privateTargets], target: privateTargets.map((seat) => playerLabel(seat,privateView?.game?.seats.find((player) => player.seat === seat)?.nickname)).join("、") }); } }
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
    entryEpoch.current++;setBusy(false);
    clearInvitationUrl();setEntryBlocked(false);setRoomChoice(false);setSwitchConfirmation(undefined);setSwitchSource(undefined);
    setGuide(undefined);
    setBackNotice(false);
    setError(undefined);
    setScreen("HOME");
  }

  function resumeRoom() {
    setError(undefined); setBusy(true); const epoch=++entryEpoch.current;void restoreSession(false,undefined,epoch).finally(() => setBusy(false));
  }

  async function roomMutation(operation: (code: string) => Promise<RoomView>) { if (!room) return; setBusy(true); setError(undefined); try { setRoom(await guard(operation(room.code))); } catch (caught) { if(caught instanceof ApiError && caught.errorCode==="STALE_RESPONSE")return; await handleSessionFailure(caught); setError(caught instanceof Error ? caught.message : "操作失败"); } finally { setBusy(false); } }

  if (screen === "LOBBY" && room) return withGuide(<Lobby rehearsal={privateView?.rehearsal} rolePending={hasPendingCommand(room.code)} onRetryRole={async()=>{setBusy(true);setError(undefined);try{await guard(retryPendingCommand(room.code));acceptPrivateView(await getPrivateView(room.code));setConnectionState('ONLINE');}catch(e){await handleSessionFailure(e);throw e;}finally{setBusy(false);}}} onChooseRole={async roleId=>{setBusy(true);setError(undefined);try{acceptPrivateView(await guard(setRehearsalRole(room.code,roleId)));setConnectionState('ONLINE');}catch(e){await handleSessionFailure(e);throw e;}finally{setBusy(false);}}} onRetryReorder={async()=>{await guard(retryPendingCommand(room.code));const next=await getRoom(room.code);setRoom(next);return next;}} onRemove={id=>void roomMutation(code=>removeRoomPlayer(code,id))} room={room} {...(participantId ? { participantId } : {})} onReady={(ready) => void roomMutation((code) => setRoomReady(code, ready))} onReorder={async ids=>{setBusy(true);setError(undefined);try{const next=await guard(reorderRoomSeats(room.code,ids));setRoom(next);return next;}catch(e){await handleSessionFailure(e);setError(e instanceof Error?e.message:'排序失败');throw e;}finally{setBusy(false);}}} onBegin={beginTutorial} onLeave={() => void exitRoom()} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} canBegin={isOrganizer} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "TUTORIAL") return withGuide(<Tutorial hideBack {...(room ? {completeCount:room.tutorialCompleteCount ?? 0,total:room.playerCount}:{})} onBack={returnHome} onDone={finishTutorial} busy={busy} {...(error ? { error } : {})} />);
  if (screen === "GAME") return withGuide(<PlayerGame guideOpen={!!guide} onCloseGuide={()=>setGuide(undefined)} key={`${room?.roomInstanceId}:${room?.game?.gameId}:${participantId}`} {...(privateView ? { view: privateView } : {})} {...(receipt ? { receipt } : {})} {...(room ? { roomCode: room.code } : {})} {...(room?.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {})} busy={busy} canRestart={privateView?.canRestart ?? false} {...(error ? { error } : {})} onBack={returnHome} onResumeGame={() => void runGameMutation(resumeGame)} onFinishDefense={() => void runGameMutation(finishDefense)} onLeave={() => void exitRoom()} onRefresh={async () => { if (room) { try { acceptPrivateView(await getPrivateView(room.code)); } catch (error) { await handleSessionFailure(error); throw error; } } }} onConfirmStartInfo={infoId=>void runGameMutation(code=>acknowledgeStartInfo(code,infoId))} onConfirmRole={() => void runGameMutation(confirmRole)} onSubmitAction={(seats) => void runGameMutation((code) => submitGameAction(code, seats), seats)} onNominate={(seat) => void runGameMutation((code) => nominate(code, seat))} onCancelNomination={() => void runGameMutation(cancelNomination)} onVote={(raised) => void runGameMutation((code) => castVote(code, raised))} onReady={() => void runGameMutation(code => readyToEndDay(code, !privateView?.dayReady))} onUseAbility={(seat) => void runGameMutation((code) => useDayAbility(code, seat))} onRestart={() => void restartGame()} onOpenGuide={setGuide} />);
  if (screen === "DISPLAY") return withStatus(<Display key={`${room?.roomInstanceId}:${room?.code}`} code={room?.code ?? "------"} onBack={returnHome} onRoomClosed={handleRoomClosed} />);
  const stored = room ? readSession() : undefined;
  const guestSession=readSession(),guestCode=guestSession?.mode==='PLAYER'&&!guestSession.pendingJoin?guestSession.roomCode:undefined;
  return withGuide(<Home accountTools={roomTools} {...(guestCode?{guestCode}:{})} onAccountResume={(code,id,mode)=>{entryEpoch.current++;setBusy(false);beginSession();selectRoomUrl(code,mode);saveSession({roomCode:code,mode,participantId:id});void restoreSession();}} onCreate={() => {entryEpoch.current++;setBusy(false);clearInvitationUrl();setError(undefined);setScreen("CREATE");}} onJoin={() => {entryEpoch.current++;setBusy(false);clearInvitationUrl();setError(undefined);setScreen("JOIN");}} onTutorial={() => setGuide("tutorial")} onRoles={() => setGuide("roles")} {...(error ? { error } : {})} {...(room && stored ? { activeRoom: room, activeMode: stored.mode, onResume: resumeRoom, onLeave: () => void exitRoom(), busy } : {})} />);
}

function isNetworkFailure(error: unknown): boolean { return !(error instanceof ApiError); }
function isRevokedSession(error: unknown): boolean { return error instanceof ApiError && ([401,404].includes(error.status) || error.status === 403 && ["SEAT_REMOVED","ACCOUNT_MISMATCH"].includes(error.errorCode ?? "")); }
