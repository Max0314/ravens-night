import { randomUUID } from "node:crypto";
import {
  ROLE_CATALOG,
  chooseInformationResult,
  randomAt,
  resolveSpecialWin,
  roleById,
  setupGameRoles,
  type RoleAssignment,
  grimoireCandidates, trueGrimoire, type Grimoire,
} from "@ravens/game-engine";
import type { ExperienceEvent, StorytellerDecision, RoomCommandContext, PrivateHistoryEntry as HistoryView } from "@ravens/contracts";
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, shuffled } from "@ravens/game-engine";
import { createOpaqueToken, hashOpaqueToken } from "../auth/session.js";
import { createRoomCode, normalizeRoomCode } from "./codes.js";
import { RoomError, ONLINE_MS, HOST_CLAIM_MS } from "./errors.js";
import { revokeMembership } from "./social.js";
import { initializePresentation, enqueuePublication, publishDue, syncImmediate, attachBallotTiming, abortPresentation, projectedGame, type PublicProjection, type Publication } from "./presentation.js";
import { migratePresentation, migrateReceipts, validateLegacyRoom } from "./migration.js";
import { revokeJoinTicket } from "./join-ticket.js";
import type { Account } from '../auth/account.js';
import { profileView, validateProfile, type AccountProfile } from '../auth/game-profile.js';

import {activePlayers,humans,bots,newBotControl,botToken,gameNow,setTimeline,invalidateBots,exitIneligibleRehearsal,upgradeBotRoom,MAX_BOTS,type BotControl} from './bot-types.js';
import type {RoomTimeline,ControlResult} from '@ravens/contracts';
import {avatarChoices} from '../auth/avatar.js';
import type {CreationRequest} from './creation.js';
import { experienceTiming } from '@ravens/contracts';
import {createStartInfo,validateStartInfo,type StartInfo} from './first-night-info.js';
const HUMAN_ACTIVITY_CHECKPOINT_MS=60_000;
export type ParticipantMode = "PLAYER" | "DISPLAY";
export type RoomPlayMode = "IN_PERSON" | "REMOTE" | "HYBRID";
export interface AccountClaim {sub:string;roomId:string;participantId:string;previewHash:string}

export interface ParticipantRecord {
  controller:"HUMAN"|"BOT";
  bot?:{policyVersion:1};
  pendingProfile?: {nickname:string;avatar:string|null};
  avatarSnapshot?: string;
  joinTicket?: { hash: string; expiresAt: number; credentialHash: string };
  commandVersion: number;
  accountId?: string;
  id: string;
  nickname: string;
  mode: ParticipantMode;
  seat?: number;
  tokenHash: string;
  connected: boolean;
  tutorialComplete: boolean;
  ready: boolean;
  lastSeenAt: number;
  left?: boolean;
}

export interface RoomResult {releasedWallAt:number;hadBots:boolean;rehearsalUsed:boolean; gameId: string; releasedAt: number; winner: "GOOD" | "EVIL"; reason: string; days: number; participants: Array<{controller:"HUMAN"|"BOT";id: string; nickname: string; avatar?: string; finalRole: string; perceivedRole?: string}> }

export interface RoomRecord {
  rehearsalRole?:{participantId:string;roleId:string};
  lastResult?: RoomResult;
  schemaVersion: 4;
  timeline:RoomTimeline;
  botControl:BotControl;
  lastHumanActivityAt:number;
  roomInstanceId: string;
  setupId: string;
  organizerAccountId?: string;
  metadata?: Record<string, unknown>;
  id: string;
  code: string;
  organizerName: string;
  organizerParticipantId?: string;
  playerCount: number;
  playMode: RoomPlayMode;
  voiceRoomUrl?: string;
  lastActivityAt: string;
  participants: ParticipantRecord[];
  state: "LOBBY" | "TUTORIAL" | "RUNNING" | "GAME_OVER" | "ABORTED";
  organizerTokenHash: string;
  assignments: RoleAssignment[];
  gameNumber: number;
  revision: number;
  game?: GameRuntime;
}

type RuntimePhase = "ROLE_REVEAL" | "FIRST_NIGHT" | "DAY_DISCUSSION" | "NOMINATION" | "VOTING" | "OTHER_NIGHT" | "GAME_OVER" | "ABORTED";
type PrivateHistoryPhase = RuntimePhase | "HISTORY";
type PrivateHistoryKind = "IDENTITY" | "ACTION" | "INFORMATION" | "ROLE_CHANGE" | "NOTICE";

interface PrivateHistoryEntry {
  grimoire?: NonNullable<HistoryView["grimoire"]>;
  targetSeatsRevealDay?:number;
  publishAfterEventId?: string;
  seq: number;
  phase: PrivateHistoryPhase;
  day: number;
  kind: PrivateHistoryKind;
  text: string;
  effect?: "POISON" | "PROTECT" | "DIVINATION";
  targetSeats?: number[];
}

interface NominationRuntime {
  ballotId: string;
  butlerRemindedSeats?: number[];
  nominatorSeat: number;
  nomineeSeat: number;
  defenseUntil?: number;
  voteStartsAt?: number;
  voteEndsAt?: number;
  nextCountAt?: number;
  voteStarted?: boolean;
  voterOrder?: number[];
  countedSeats?: number[];
  countedVotes?: Record<number, boolean>;
}

const VOTE_SLOT_MS = 1500;
const DEFENSE_MS = 20_000;

export interface GameRuntime {
  presentationVersion:1|2;
  startInfo:StartInfo;
  hadBots:boolean;
  rehearsalUsed:boolean;
  spyGrimoires?: Record<string, Grimoire>;
  deferredRoleChanges?: Array<{ seat: number; previous: RoleAssignment; historySeq: number; eventId?: string }>;
  publicProjection?: PublicProjection;
  pendingPublications?: Publication[];
  contextId: string;
  termination?: { kind: "ABORTED"; actorParticipantId: string; at: number };
  gameId: string;
  storytellerSeed: string;
  presentationUntil: number;
  phaseDeadlineAt: number;
  pauseReason?: string;
  decisions: StorytellerDecision[];
  nightStep?: number;
  nightOrder?: Array<{ seat: number; roleId: string }>;
  nightStartAliveSeats?: number[];
  protectedSeat?: number;
  poisonSourceSeat?: number;
  lastExecutedSeat?: number;
  executionDeathRoleId?: string;
  claimDayBySeat: Record<number, number>;
  informationPairs?: Record<number, { targetSeat: number; decoySeat: number }>;
  phase: RuntimePhase;
  day: number;
  aliveSeats: number[];
  ghostVoteSeats: number[];
  confirmedRoleSeats: number[];
  nominatedBySeats: number[];
  nominatedSeats: number[];
  readySeats: number[];
  messages: Record<number, string[]>;
  privateHistory: Record<number, PrivateHistoryEntry[]>;
  nightSubmissions: Record<number, number[]>;
  voteSubmissions: Record<number, boolean>;
  usedAbilitySeats: number[];
  virginSpentSeats: number[];
  butlerMasterSeat?: number;
  poisonedSeat?: number;
  redHerringSeat?: number;
  executionTied: boolean;
  pendingRavenkeeperSeat?: number;
  nightDeaths?: number[];
  lastExecutedRoleId?: string;
  events: ExperienceEvent[];
  nomination?: NominationRuntime;
  onBlock?: { seat: number; votes: number };
  winner?: "GOOD" | "EVIL";
  winReason?: string;
}

export class RoomService {
  readonly #rooms = new Map<string, RoomRecord>();
  readonly #creations=new Map<string,CreationRequest>();
  readonly #profiles = new Map<string, AccountProfile>();
  readonly #claims = new Map<string, AccountClaim>();
  readonly #now: () => number;
  readonly #presentation: boolean;
  readonly #botSecret:string;

  constructor(options: { now?: () => number; presentation?: boolean; botSecret?:string } = {}) {
    this.#now = options.now ?? Date.now;
    this.#botSecret=options.botSecret??"local-test-bot-credentials";
    this.#presentation = options.presentation ?? true;
  }

  create(playerCount: number, organizerName: string, playMode: RoomPlayMode = "IN_PERSON", voiceRoomUrl?: string): { room: RoomRecord; organizerToken: string } {
    if (!Number.isInteger(playerCount) || playerCount < 5 || playerCount > 12) {
      throw new Error("Player count must be between 5 and 12");
    }
    if (!["IN_PERSON", "REMOTE", "HYBRID"].includes(playMode)) throw new Error("Unknown play mode");
    const normalizedVoiceRoomUrl = voiceRoomUrl?.trim();
    if (normalizedVoiceRoomUrl && !isSafeExternalUrl(normalizedVoiceRoomUrl)) throw new Error("Voice link must use http or https");
    let code = createRoomCode();
    while (this.#rooms.has(code)) code = createRoomCode();
    const organizerToken = createOpaqueToken();
    const room: RoomRecord = {
      schemaVersion: 4, timeline:{mode:"WALL",offsetMs:0,epoch:0},botControl:newBotControl(),lastHumanActivityAt:this.#now(),metadata:{pendingFirstJoin:true},roomInstanceId: randomUUID(), setupId: randomUUID(),
      id: randomUUID(),
      code,
      organizerName: organizerName.trim().slice(0, 24) || "组织者",
      playerCount,
      playMode,
      ...(normalizedVoiceRoomUrl ? { voiceRoomUrl: normalizedVoiceRoomUrl } : {}),
      lastActivityAt: new Date(this.#now()).toISOString(),
      participants: [],
      state: "LOBBY",
      organizerTokenHash: hashOpaqueToken(organizerToken),
      assignments: [],
      gameNumber: 0,
      revision: 1,
    };
    this.#rooms.set(code, room);
    return { room: structuredClone(room), organizerToken };
  }

  join(codeInput: string, nicknameInput: string, mode: ParticipantMode): { participant: ParticipantRecord; token: string } {
    const room = this.find(codeInput);
    if (mode !== "PLAYER" && mode !== "DISPLAY") throw new Error("Unknown participant mode");
    if (mode === "PLAYER" && room.state !== "LOBBY") throw new Error("Game already started");
    const nickname = nicknameInput.trim().slice(0, 24);
    if (!nickname) throw new Error("Nickname is required");
    if (mode === "PLAYER" && room.participants.some((participant) => participant.mode === "PLAYER" && participant.nickname === nickname)) {
      throw new RoomError("NICKNAME_TAKEN","这个昵称已经有人使用，请修改昵称后继续",409);
    }
    let replacingSeat:number|undefined;
    if(mode==='PLAYER'&&activePlayers(room).length>=room.playerCount){
      const replace=bots(room).sort((a,b)=>b.seat!-a.seat!)[0];
      if(!replace)throw new RoomError('ROOM_FULL','房间已满');
      replacingSeat=replace.seat;revokeMembership(room,replace.id);room.participants=room.participants.filter(p=>p.id!==replace.id);delete room.botControl.memory[replace.id];
    }
    const token = createOpaqueToken();
    const players = room.participants.filter((participant) => participant.mode === "PLAYER");
    const participant: ParticipantRecord = {
      controller:"HUMAN",commandVersion: 0,
      id: randomUUID(),
      nickname,
      mode,
      ...(mode === "PLAYER" ? { seat: replacingSeat??players.length + 1 } : {}),
      tokenHash: hashOpaqueToken(token),
      connected: true,
      tutorialComplete: false, ready: false, lastSeenAt: this.#now(),
    };
    room.participants.push(participant);
    if (mode === "PLAYER" && !room.organizerParticipantId && players.length === 0) {
      room.organizerParticipantId = participant.id;
      room.organizerName = participant.nickname;
      room.organizerTokenHash = participant.tokenHash;
    }
    if (mode === "PLAYER") {room.metadata={...room.metadata,pendingFirstJoin:false};room.lastHumanActivityAt=this.#now();this.invalidateSetup(room);}
    this.changed(room);
    return { participant: structuredClone(participant), token };
  }

  leave(codeInput: string, playerToken: string): { roomDestroyed: boolean; organizerChanged: boolean } {
    const room = this.find(codeInput);
    const participantIndex = room.participants.findIndex((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (participantIndex < 0) throw new Error("Player authorization failed");
    const participant = room.participants[participantIndex]!;
    if (participant.mode === "PLAYER" && room.game && this.gameNow(room) < room.game.presentationUntil) throw new RoomError("PRESENTATION_PENDING", "演出正在进行，请稍后操作");
    if (participant.mode === "PLAYER" && !["LOBBY", "GAME_OVER", "ABORTED"].includes(this.publicView(codeInput).state)) throw new RoomError("GAME_IN_PROGRESS", "本局仍在进行，可先返回首页，或请房主中止本局");

    const previousOrganizerId = this.organizer(room)?.id;
    revokeMembership(room, participant.id);
    if (["GAME_OVER", "ABORTED"].includes(room.state) && participant.mode === "PLAYER") {
      participant.left = true;
      participant.connected = false;
      participant.tokenHash = hashOpaqueToken(createOpaqueToken());
    } else room.participants.splice(participantIndex, 1);
    const players = room.participants
      .filter((candidate) => candidate.mode === "PLAYER" && !candidate.left && candidate.controller==="HUMAN")
      .sort((left, right) => left.seat! - right.seat!);
    if (players.length === 0) {
      this.#rooms.delete(room.code);
      return { roomDestroyed: true, organizerChanged: previousOrganizerId === participant.id };
    }
    if (room.state === "LOBBY" && participant.mode === "PLAYER") {
      activePlayers(room).sort((a,b)=>a.seat!-b.seat!).forEach((candidate, index) => { candidate.seat = index + 1; });
      this.invalidateSetup(room);
    }
    const organizerChanged = previousOrganizerId === participant.id;
    if (organizerChanged) {
      room.organizerParticipantId = players[0]!.id;
      room.organizerName = players[0]!.nickname;
      room.organizerTokenHash = players[0]!.tokenHash;
      if(players[0]!.accountId)room.organizerAccountId=players[0]!.accountId;else delete room.organizerAccountId;
    }
    this.changed(room);
    return { roomDestroyed: false, organizerChanged };
  }

  creationRequests(){return structuredClone([...this.#creations.values()]);}
  restoreCreationRequests(values:CreationRequest[]){this.#creations.clear();for(const value of values)this.#creations.set(value.key,structuredClone(value));}
  creationRequest(key:string){return this.#creations.get(key);}
  putCreationRequest(value:CreationRequest){this.#creations.set(value.key,structuredClone(value));}
  expireCreations(now=this.#now()){let removed=0;for(const [key,value]of this.#creations){if(value.expiresAt<=now){this.#creations.delete(key);if(++removed>=100)break;}}}
  wallNow(){return this.#now();}
  gameNow(room:RoomRecord,wall=this.#now()){return gameNow(room,wall);}
  internalBotToken(room:RoomRecord,participant:ParticipantRecord){return botToken(this.#botSecret,room,participant);}
  touchScheduling(room:RoomRecord){room.revision++;}
  assertHost(code:string,token:string){return this.requireHost(this.find(code),token);}
  botControlView(room:RoomRecord){const c=room.botControl;return{autoNominate:c.autoNominate===true,requestedMode:c.mode,effectiveMode:c.mode==='PAUSED'?'PAUSED' as const:humans(room).some(p=>p.connected&&this.#now()-p.lastSeenAt<ONLINE_MS)?'RUNNING' as const:'SUSPENDED' as const,pace:c.pace,version:c.version,attentionRequired:c.attentionRequired};}
  private rememberBotTeam(room:RoomRecord,seat:number,knownTeamSeats:number[]){const p=bots(room).find(p=>p.seat===seat);if(p)room.botControl.memory[p.id]={...(room.game?{gameId:room.game.gameId}:{}),knownTeamSeats,ackedHumanMessageIds:[]};}
  validateControlCommand(code:string,token:string,context:RoomCommandContext,expectedControlVersion:number,bindGame=false,accountId?:string){
    const room=this.find(code);this.requireHost(room,token);this.validateCommand(code,token,context,'ROOM',accountId);
    if(room.botControl.version!==expectedControlVersion)throw new RoomError('BOT_CONTROL_CHANGED','人机控制状态已变化，请重新操作');
    if(bindGame&&room.game){const projection=room.game.publicProjection!;if(context.gameId!==room.game.gameId||context.contextId!==projection.contextId)throw new RoomError('CONTEXT_CHANGED','游戏阶段已变化，请重新操作');if(projection.phase==='VOTING'?context.ballotId!==projection.nomination?.ballotId:context.ballotId!==undefined)throw new RoomError('BALLOT_CHANGED','表决状态已变化，请重新操作');}
  }
  changeBots(code:string,token:string,request:{count?:number;fill?:boolean;clear?:boolean}):ControlResult{
    const room=this.find(code);this.requireHost(room,token);if(room.state!=='LOBBY')throw new RoomError('GAME_IN_PROGRESS','请回到大厅后调整人机');
    if([request.count!==undefined,request.fill===true,request.clear===true].filter(Boolean).length!==1)throw new RoomError('INVALID_REQUEST','请选择一种人机操作',400);
    const current=bots(room),vacancies=room.playerCount-activePlayers(room).length;
    const count=request.fill?vacancies:request.count??0;
    if(!Number.isInteger(count)||count<0||request.count!==undefined&&count<1||count>vacancies)throw new RoomError('BOT_CAPACITY_CHANGED','空位已变化，请刷新');
    if(count+this.listCodes().reduce((n,c)=>n+bots(this.find(c)).length,0)>MAX_BOTS)throw new RoomError('BOT_LIMIT_REACHED','当前人机席位已满，请稍后再试',429);
    let removed=0;
    if(request.clear){removed=current.length;for(const p of current){revokeMembership(room,p.id);delete room.botControl.memory[p.id];}room.participants=room.participants.filter(p=>p.controller!=='BOT');}
    for(let i=0;i<count;i++){
      let label=1;while(room.participants.some(p=>p.nickname===`人机·${String(label).padStart(2,'0')}`))label++;
      const participant:ParticipantRecord={id:randomUUID(),controller:'BOT',bot:{policyVersion:1},mode:'PLAYER',nickname:`人机·${String(label).padStart(2,'0')}`,seat:activePlayers(room).length+1,tokenHash:'',commandVersion:0,connected:true,lastSeenAt:this.#now(),ready:false,tutorialComplete:false,avatarSnapshot:avatarChoices[Math.floor(randomAt(room.botControl.seed,label)*avatarChoices.length)]!.url};
      participant.tokenHash=hashOpaqueToken(this.internalBotToken(room,participant));room.participants.push(participant);
    }
    if(!count&&!removed)return{status:'UNCHANGED',added:0,removed:0};
    activePlayers(room).sort((a,b)=>a.seat!-b.seat!).forEach((p,i)=>p.seat=i+1);this.invalidateSetup(room);this.changed(room);return{status:'APPLIED',added:count,removed};
  }
  changeBotControl(code:string,token:string,mode?:'RUNNING'|'PAUSED',pace?:'NORMAL'|'SLOW',autoNominate?:boolean):ControlResult{
    const room=this.find(code);this.requireHost(room,token);
    if(mode!==undefined&&!['RUNNING','PAUSED'].includes(mode)||pace!==undefined&&!['NORMAL','SLOW'].includes(pace)||autoNominate!==undefined&&typeof autoNominate!=='boolean'||mode===undefined&&pace===undefined&&autoNominate===undefined)throw new RoomError('INVALID_REQUEST','请选择控制方式',400);
    if(mode==='RUNNING'&&room.timeline.mode==='MANUAL')throw new RoomError('MODE_CONFLICT','请先恢复演练计时');
    const c=room.botControl;if((mode===undefined||c.mode===mode)&&(pace===undefined||c.pace===pace)&&(autoNominate===undefined||c.autoNominate===autoNominate)&&!c.attentionRequired)return{status:'UNCHANGED'};
    if(mode)c.mode=mode;if(pace)c.pace=pace;if(autoNominate!==undefined)c.autoNominate=autoNominate;c.attentionRequired=false;invalidateBots(room);this.changed(room);return{status:'APPLIED'};
  }
  private rehearsalEligible(room:RoomRecord){return humans(room).length===1&&bots(room).length>0;}
  private clearIneligibleRehearsalRole(room:RoomRecord){
    if(room.rehearsalRole&&(!this.rehearsalEligible(room)||room.rehearsalRole.participantId!==this.organizer(room)?.id||!humans(room).some(p=>p.id===room.rehearsalRole!.participantId)))delete room.rehearsalRole;
  }
  changeRehearsalRole(code:string,token:string,roleId:string|null):ControlResult{
    const room=this.find(code),host=this.requireHost(room,token);
    if(room.state!=='LOBBY')throw new RoomError('GAME_IN_PROGRESS','请回到大厅后选择测试身份');
    if(!this.rehearsalEligible(room))throw new RoomError('REHEARSAL_UNAVAILABLE','仅一名真人与人机游玩时可选择测试身份');
    if(roleId!==null&&!ROLE_CATALOG.some(role=>role.id===roleId))throw new RoomError('INVALID_ROLE','请选择有效角色或随机身份',400);
    if((room.rehearsalRole?.roleId??null)===roleId&&(!room.rehearsalRole||room.rehearsalRole.participantId===host.id))return{status:'UNCHANGED'};
    if(roleId===null)delete room.rehearsalRole;else room.rehearsalRole={participantId:host.id,roleId};
    this.invalidateSetup(room);this.changed(room);return{status:'APPLIED'};
  }
  changeRehearsalClock(code:string,token:string,mode:'MANUAL'|'WALL'):ControlResult{
    const room=this.find(code);this.requireHost(room,token);
    if(!['MANUAL','WALL'].includes(mode))throw new RoomError('INVALID_REQUEST','请选择计时方式',400);
    if(humans(room).length!==1||!bots(room).length||mode==='MANUAL'&&!['LOBBY','TUTORIAL','RUNNING'].includes(this.publicView(code).state))throw new RoomError('REHEARSAL_UNAVAILABLE','仅一名真人与人机游玩时可使用演练计时');
    if(!setTimeline(room,mode,this.#now()))return{status:'UNCHANGED'};
    room.botControl.mode=mode==='MANUAL'?'PAUSED':'RUNNING';if(mode==='MANUAL'&&room.game)room.game.rehearsalUsed=true;invalidateBots(room);this.changed(room);return{status:'APPLIED'};
  }
  advanceRehearsal(code:string,token:string):ControlResult{
    const room=this.find(code);this.requireHost(room,token);
    if(room.timeline.mode!=='MANUAL'||room.botControl.mode!=='PAUSED'||humans(room).length!==1||!bots(room).length)throw new RoomError('REHEARSAL_UNAVAILABLE','请先冻结单人演练计时');
    const game=room.game;if(!game||game.phase==='ABORTED'||game.publicProjection?.revealComplete)return{status:'WAITING'};
    const now=this.gameNow(room),ballot=game.nomination;
    const boundaries=[...(game.pendingPublications??[]).map(n=>n.at),game.presentationUntil,...(ballot?[ballot.defenseUntil,ballot.voteStartsAt,ballot.nextCountAt,ballot.voteEndsAt]:[]),...(!game.pauseReason?[game.phaseDeadlineAt]:[])].filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>now);
    if(!boundaries.length)return{status:'WAITING'};
    room.timeline.manualNowMs=Math.min(...boundaries);room.botControl.version++;room.revision++;this.advanceTime(this.#now(),room.code);return{status:'ADVANCED'};
  }

  listCodes(): string[] { return [...this.#rooms.keys()]; }

  accountClaims():AccountClaim[]{return structuredClone([...this.#claims.values()]);}
  restoreClaims(values:AccountClaim[]){for(const value of values)this.#claims.set(value.sub,structuredClone(value));}
  accountClaim(sub:string){return this.#claims.get(sub);}
  accountProfiles(){return structuredClone([...this.#profiles.values()]);}
  restoreProfiles(values:AccountProfile[]){for(const value of values)this.#profiles.set(value.sub,structuredClone(value));}
  accountProfile(sub:string){return this.#profiles.get(sub);}
  syncAccountProfile(room:RoomRecord,participant:ParticipantRecord,account:Account,force=false){
    if(participant.mode==='DISPLAY')return;
    const saved=this.accountProfile(account.sub),view=profileView(account,saved);
    const next={nickname:saved||force?view.nickname:participant.nickname,avatar:view.avatar};
    if(participant.nickname===next.nickname&&(participant.avatarSnapshot??null)===next.avatar){if(participant.pendingProfile){delete participant.pendingProfile;this.changed(room);}return;}
    delete participant.pendingProfile;
    participant.nickname=next.nickname;if(next.avatar)participant.avatarSnapshot=next.avatar;else delete participant.avatarSnapshot;
    if(room.organizerParticipantId===participant.id)room.organizerName=participant.nickname;
    this.changed(room);
  }
  updateAccountProfile(account:Account,nickname:string|null,avatar:string|null,expectedRevision:number){
    const values=validateProfile(nickname,avatar),previous=this.accountProfile(account.sub);
    const same=Boolean(previous&&previous.nickname===values.nickname&&previous.avatar===values.avatar);
    if(!same&&(previous?.revision??0)!==expectedRevision)throw new RoomError('PROFILE_STALE','资料已在其他页面更新，请重新打开后修改');
    if(!same)this.#profiles.set(account.sub,{sub:account.sub,revision:(previous?.revision??0)+1,...values});
    for(const room of this.#rooms.values())for(const participant of room.participants.filter(p=>!p.left&&p.accountId===account.sub)){
      this.syncAccountProfile(room,participant,account,true);
    }
    return profileView(account,this.accountProfile(account.sub));
  }
  bindAccount(code:string,token:string,sub:string,newToken:string){
    const room=this.find(code),participant=room.participants.find(value=>!value.left&&value.tokenHash===hashOpaqueToken(token));
    if(!participant||participant.accountId&&participant.accountId!==sub)throw Error('Player authorization failed');
    revokeJoinTicket(room, participant.id);
    participant.accountId=sub;participant.tokenHash=hashOpaqueToken(newToken);
    if(room.organizerParticipantId===participant.id){room.organizerAccountId=sub;room.organizerTokenHash=participant.tokenHash;}
    this.changed(room);return participant;
  }
  claimAccount(code:string,token:string,sub:string,previewHash:string,newToken:string){
    if(this.#claims.has(sub))throw Error('本账号在鸦钟夜话的游客认领机会已使用');
    const room=this.find(code),participant=room.participants.find(value=>!value.left&&value.tokenHash===hashOpaqueToken(token));
    if(!participant||participant.accountId||participant.mode!=='PLAYER')throw Error('没有可认领的游客座位');
    if(this.accountRooms(sub).length)throw Error('账号已有房间，不能覆盖');
    this.bindAccount(code,token,sub,newToken);
    this.#claims.set(sub,{sub,roomId:room.code,participantId:participant.id,previewHash});
    return participant;
  }
  accountRooms(sub:string){return this.listCodes().flatMap(code=>{const room=this.find(code);return room.participants.filter(value=>!value.left&&value.accountId===sub).map(value=>({code,participantId:value.id,mode:value.mode,nickname:value.nickname}));});}

  snapshot(codeInput: string): RoomRecord { return structuredClone(this.find(codeInput)); }

  self(code: string, token: string, accountId?: string) {
    const room = this.find(code);
    const participant = room.participants.find(p => !p.left && p.tokenHash === hashOpaqueToken(token));
    if (!participant) throw new RoomError("SEAT_REMOVED", "原座位已失效，请重新加入或恢复", 403);
    if (participant.accountId && participant.accountId !== accountId) throw new RoomError("ACCOUNT_MISMATCH", "账号与座位授权不匹配", 403);
    return { participantId: participant.id, mode: participant.mode, commandVersion: participant.commandVersion };
  }

  authorizeCommand(code: string, token: string, context: RoomCommandContext, accountId?: string) {
    const room = this.find(code);
    if (room.roomInstanceId !== context.roomInstanceId) throw new RoomError("ROOM_REPLACED", "房间已变化，请重新加入");
    return this.self(code, token, accountId);
  }

  validateCommand(code: string, token: string, context: RoomCommandContext, scope: "ROOM" | "GAME" | "BALLOT" | "OPTIONAL_GAME", accountId?: string): void {
    const self = this.authorizeCommand(code, token, context, accountId);
    const room = this.find(code);
    if (self.commandVersion !== context.expectedCommandVersion) throw new RoomError("COMMAND_VERSION_STALE", "操作状态已更新，请刷新后重新操作");
    if (room.setupId !== context.setupId) throw new RoomError("SETUP_CHANGED", "人数、座序或准备阶段已变化，请重新操作");
    if (scope === "ROOM" || (scope === "OPTIONAL_GAME" && !room.game)) return;
    const game = room.game;
    if (game && !["ABORTED"].includes(game.phase)) this.assertPresentationComplete(room);
    if (!game || context.gameId !== game.gameId) throw new RoomError("GAME_CHANGED", "本局已结束或重新开始，请重新操作");
    if (scope === "BALLOT") {
      if (!game.nomination || context.ballotId !== game.nomination.ballotId) throw new RoomError("BALLOT_CHANGED", "本轮投票已结束，请查看当前轮次");
    } else if (context.contextId !== game.contextId) throw new RoomError("CONTEXT_CHANGED", "游戏阶段已变化，请重新操作");
  }

  completeCommand(code: string, participantId: string): void {
    const room = this.#rooms.get(normalizeRoomCode(code));
    const participant = room?.participants.find(p => p.id === participantId);
    if (participant) {participant.commandVersion += 1;if(participant.controller==="HUMAN"){participant.lastSeenAt=this.#now();participant.connected=true;room!.lastHumanActivityAt=this.#now();room!.metadata={...room!.metadata,humanActivityCheckpointAt:this.#now()};}}
  }

  private invalidateSetup(room: RoomRecord): void {
    if(room.state==='LOBBY')for(const participant of room.participants){const pending=participant.pendingProfile;if(!pending)continue;participant.nickname=pending.nickname;if(pending.avatar)participant.avatarSnapshot=pending.avatar;else delete participant.avatarSnapshot;delete participant.pendingProfile;if(room.organizerParticipantId===participant.id)room.organizerName=participant.nickname;}
    exitIneligibleRehearsal(room,this.#now());this.clearIneligibleRehearsalRole(room);invalidateBots(room);
    room.setupId = randomUUID();
    for (const player of room.participants) player.ready = false;
  }

  private requireHost(room: RoomRecord, token: string): ParticipantRecord {
    const host = this.organizer(room);
    if (!host || host.controller!=="HUMAN" || host.left || host.tokenHash !== hashOpaqueToken(token)) throw new RoomError("HOST_REQUIRED", "只有现任房主可以操作", 403);
    return host;
  }

  cancelTutorial(code: string, token: string): void {
    const room = this.find(code);
    this.requireHost(room, token);
    if (room.state !== "TUTORIAL") throw new RoomError("TUTORIAL_CHANGED", "教学已结束，请查看当前阶段");
    room.state = "LOBBY";
    room.assignments = [];
    delete room.game;
    for (const player of room.participants) player.tutorialComplete = false;
    this.invalidateSetup(room);
    this.changed(room);
  }

  removeParticipant(code: string, token: string, id: string, cancelTutorial = false): void {
    const room = this.find(code);
    const host = this.requireHost(room, token);
    if (id === host.id) throw new RoomError("CANNOT_REMOVE_HOST", "房主请使用离开房间");
    const target = room.participants.find(p => p.id === id && !p.left && p.mode === "PLAYER");
    if (!target) throw new RoomError("SEAT_REMOVED", "该玩家已不在房间");
    if (room.state === "TUTORIAL" && cancelTutorial) this.cancelTutorial(code, token);
    if (room.state !== "LOBBY") throw new RoomError("GAME_IN_PROGRESS", "请先取消教学或中止本局，再移除玩家");
    revokeMembership(room, id);
    room.participants = room.participants.filter(p => p.id !== id);
    delete room.botControl.memory[id];
    room.participants.filter(p => p.mode === "PLAYER" && !p.left).sort((a, b) => a.seat! - b.seat!).forEach((p, i) => { p.seat = i + 1; });
    this.invalidateSetup(room);
    this.changed(room);
  }

  abort(code: string, token: string): void {
    const room = this.find(code);
    const host = this.requireHost(room, token);
    if (room.state !== "RUNNING") throw new RoomError("GAME_CHANGED", "本局已结束，请刷新");
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    game.contextId = randomUUID();
    game.phase = "ABORTED";
    game.startInfo.stage="CANCELLED";invalidateBots(room);
    room.state = "ABORTED";
    game.termination = { kind: "ABORTED", actorParticipantId: host.id, at: this.#now() };
    delete game.nomination; delete game.nightOrder; delete game.nightStep; delete game.pauseReason;
    delete game.winner; delete game.winReason;
    game.presentationUntil = 0;
    game.events = game.events.filter(event => event.startsAt <= this.gameNow(room) && event.kind !== "GAME_OVER");
    abortPresentation(game, this.gameNow(room));
    this.changed(room);
  }

  claimHost(code: string, token: string, expectedOrganizerId: string): void {
    const { room, participant } = this.authorizedPlayer(code, token);
    const host = this.organizer(room);
    if (!host || host.id !== expectedOrganizerId || host.id === participant.id) throw new RoomError("HOST_CHANGED", "房主已变化，请刷新");
    if (this.#now() - participant.lastSeenAt >= ONLINE_MS || this.#now() - host.lastSeenAt < HOST_CLAIM_MS) throw new RoomError("HOST_STILL_ONLINE", "房主离线满5分钟后才能接任");
    room.organizerParticipantId = participant.id;
    room.organizerName = participant.nickname;
    room.organizerTokenHash = participant.tokenHash;
    if (participant.accountId) room.organizerAccountId = participant.accountId; else delete room.organizerAccountId;
    this.changed(room);
  }

  reopen(code: string, token: string): void {
    const room = this.find(code);
    if (room.state === "TUTORIAL") { this.cancelTutorial(code, token); return; }
    if (room.state === "RUNNING") this.abort(code, token);
    this.reset(code, token);
  }

  reorderSeats(codeInput: string, displayToken: string, participantIds: string[]): void {
    const room = this.find(codeInput);
    if (room.state !== "LOBBY") throw new Error("座位只能在开局前调整");
    const display = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(displayToken));
    if (!display || display.left || this.organizer(room)?.id !== display.id) throw new RoomError("HOST_REQUIRED", "只有房主可以调整座位", 403);
    const players = room.participants.filter((candidate) => candidate.mode === "PLAYER" && !candidate.left);
    const currentIds = new Set(players.map((candidate) => candidate.id));
    if (participantIds.length !== players.length || new Set(participantIds).size !== participantIds.length || participantIds.some((id) => !currentIds.has(id))) {
      throw new Error("座位顺序必须包含当前全部玩家且不能重复");
    }
    if(players.slice().sort((a,b)=>a.seat!-b.seat!).every((p,i)=>p.id===participantIds[i]))return;
    const playersById = new Map(players.map((candidate) => [candidate.id, candidate]));
    participantIds.forEach((id, index) => { playersById.get(id)!.seat = index + 1; });
    this.invalidateSetup(room);
    this.changed(room);
  }

  restore(snapshots: RoomRecord[]): void {
    for (const snapshot of snapshots) {
      const code = normalizeRoomCode(snapshot.code);
      if (![undefined, 1, 2, 3, 4].includes(snapshot.schemaVersion)) throw new Error("Unsupported room snapshot schema");
      if (snapshot.playerCount < 5 || snapshot.playerCount > 12 || !Array.isArray(snapshot.participants)) throw new Error(`Room ${code}: invalid roster snapshot`);
      if(![2,3,4].includes(snapshot.schemaVersion))validateLegacyRoom(snapshot);
      const game = snapshot.game ? this.restoreGame(snapshot.game, `legacy-game-${snapshot.gameNumber ?? 0}:${randomUUID()}`, snapshot.timeline ? gameNow(snapshot,this.#now()) : this.#now()) : undefined;
      if (game && (![3,4].includes(snapshot.schemaVersion)||!game.publicProjection)) migratePresentation(game, snapshot.playerCount, this.#now(), !this.#presentation);
      migrateReceipts(snapshot);

      snapshot.roomInstanceId ??= randomUUID();
      snapshot.setupId ??= randomUUID();
      snapshot.participants = snapshot.participants.map((participant) => ({ ...participant, commandVersion: participant.commandVersion ?? 0, ready: participant.ready ?? false, lastSeenAt: participant.lastSeenAt ?? this.#now() }));
      const organizerParticipantId = snapshot.organizerParticipantId
        ?? snapshot.participants.find((participant) => participant.mode === "PLAYER" && participant.seat === 1)?.id;
      const restored=structuredClone({ ...snapshot, playMode: snapshot.playMode ?? "IN_PERSON", lastActivityAt: snapshot.lastActivityAt ?? new Date(this.#now()).toISOString(), ...(organizerParticipantId ? { organizerParticipantId } : {}), ...(game ? { game } : {}), code, gameNumber: snapshot.gameNumber ?? 0, revision: snapshot.revision || 1 });
      upgradeBotRoom(restored,this.#now());
      if(restored.rehearsalRole!==undefined&&(!restored.rehearsalRole||typeof restored.rehearsalRole!=="object"||typeof restored.rehearsalRole.participantId!=="string"||!restored.rehearsalRole.participantId||!ROLE_CATALOG.some(role=>role.id===restored.rehearsalRole!.roleId)))throw new Error(`Room ${code}: invalid rehearsal role`);
      this.clearIneligibleRehearsalRole(restored);
      if((snapshot.schemaVersion as number)!==4){
        restored.schemaVersion=4;
        if(restored.game){restored.game.presentationVersion=1;restored.game.startInfo={mode:'LEGACY',stage:restored.game.phase==='ABORTED'?'CANCELLED':'COMPLETE',entries:{}};for(const e of restored.game.events)e.timingVersion??=1;}
      }
      validateStartInfo(restored);this.#rooms.set(code,restored);
      this.captureResult(this.#rooms.get(code)!, this.gameNow(this.#rooms.get(code)!));
    }
  }

  expireIdle(now = Date.now(), lobbyTtlMs = 2 * 60 * 60 * 1000, activeTtlMs = 24 * 60 * 60 * 1000): string[] {
    const expired: string[] = [];
    for (const room of this.#rooms.values()) {
      const age = now - (bots(room).length?room.lastHumanActivityAt:Date.parse(room.lastActivityAt));
      const ttl = room.state === "LOBBY" ? lobbyTtlMs : activeTtlMs;
      if (Number.isFinite(age) && age >= ttl) {
        this.#rooms.delete(room.code);
        expired.push(room.code);
      }
    }
    return expired;
  }

  find(codeInput: string): RoomRecord {
    const code = normalizeRoomCode(codeInput);
    const room = this.#rooms.get(code);
    if (!room) throw new Error("Room not found");
    return room;
  }

  publicView(codeInput: string) {
    const room = this.find(codeInput);
    const organizer = this.organizer(room);
    return {
      code: room.code,
      timeline:{mode:room.timeline.mode,epoch:room.timeline.epoch},botControl:this.botControlView(room),activeHumanCount:humans(room).length,botCount:bots(room).length,
      protocolVersion: 4 as const, roomInstanceId: room.roomInstanceId, setupId: room.setupId,
      revision: room.revision, serverNow: this.#now(),
      rulesSummary: room.playerCount < 7 ? "5–6 人采用官方 Teensyville：恶魔与爪牙互不认识，恶魔没有三个伪装。提名后辩护 20 秒，从被提名者下一座顺时针每席 1.5 秒计票；本席计票前可调整举手，未举手不消耗鬼票。" : "暗流涌动标准规则。提名后辩护 20 秒，从被提名者下一座顺时针每席 1.5 秒计票；本席计票前可调整举手，未举手不消耗鬼票。",
      state: room.game && room.state !== "ABORTED" ? room.game.publicProjection?.phase === "GAME_OVER" ? "GAME_OVER" : "RUNNING" : room.state,
      playerCount: room.playerCount,
      playMode: room.playMode,
      ...(room.voiceRoomUrl ? { voiceRoomUrl: room.voiceRoomUrl } : {}),
      ...(organizer ? { organizerId: organizer.id, organizerName: organizer.nickname } : {}),
      tutorialCompleteCount: room.participants.filter(p => p.mode === "PLAYER" && !p.left && p.tutorialComplete).length,
      hostClaimAt: organizer ? organizer.lastSeenAt + HOST_CLAIM_MS : undefined,
      participants: room.participants.map(p => ({ controller:p.controller,id: p.id, nickname: p.mode==="DISPLAY"?"公共大屏":p.nickname, mode: p.mode, seat: p.seat, avatar: p.mode==="DISPLAY"?undefined:p.avatarSnapshot, connected: p.controller==="BOT"||p.connected && this.#now() - p.lastSeenAt < ONLINE_MS, ready: p.ready, left: p.left ?? false })),
      ...(room.game ? { game: this.publicGame(room) } : {}),
    };
  }

  startTutorial(codeInput: string, organizerToken: string, tutorialMode: "OPTIONAL" | "SKIP" = "OPTIONAL", markHostReady = false): void {
    const room = this.find(codeInput);
    const players = room.participants.filter((participant) => participant.mode === "PLAYER");
    const host = this.requireHost(room, organizerToken);
    if (room.state !== "LOBBY") throw new Error("Only a lobby can start; finish or reset the previous game first");
    if (players.length !== room.playerCount) throw new Error("All players must join before starting");
    if (players.some(player => player.controller==="HUMAN"&&this.#now() - player.lastSeenAt >= ONLINE_MS)) throw new RoomError("PLAYERS_OFFLINE", "有玩家离线，请等待重连或移除后重新准备");
    if (markHostReady) host.ready = true;
    if (players.some((player) => !player.ready)) throw new Error("所有玩家准备后才能开始");
    for (const player of players) player.tutorialComplete = false;
    delete room.game;
    room.gameNumber = (room.gameNumber ?? 0) + 1;
    this.clearIneligibleRehearsalRole(room);
    const forced=room.rehearsalRole?{seat:host.seat!,roleId:room.rehearsalRole.roleId}:undefined;
    room.assignments = setupGameRoles(room.playerCount, `${room.id}:${room.code}:game-${room.gameNumber}`,forced);
    room.state = "TUTORIAL";
    if (tutorialMode === "SKIP") {
      for (const player of players) player.tutorialComplete = true;
      room.state = "RUNNING";
      room.game = this.createGame(room);
    }
    this.changed(room);
  }

  reset(codeInput: string, organizerToken: string): void {
    const room = this.find(codeInput);
    this.requireHost(room, organizerToken);
    if (!["GAME_OVER", "ABORTED"].includes(room.state)) throw new RoomError("GAME_IN_PROGRESS", "请先取消教学或中止本局");
    if (room.state === "GAME_OVER" && !room.game?.publicProjection?.revealComplete) throw new RoomError("FINALE_PENDING", "身份公布完成后才能开始下一把");
    this.captureResult(room, this.gameNow(room));
    room.state = "LOBBY";
    room.participants = room.participants.filter((participant) => !participant.left);
    room.participants.filter((participant) => participant.mode === "PLAYER").sort((a, b) => a.seat! - b.seat!).forEach((participant, index) => { participant.seat = index + 1; });
    room.assignments = [];
    delete room.game;room.timeline={mode:"WALL",offsetMs:0,epoch:room.timeline.epoch+1};room.botControl.memory={};
    if (room.metadata) delete room.metadata.social;
    this.invalidateSetup(room);
    for (const participant of room.participants) { participant.tutorialComplete = false; participant.ready = false; }
    this.changed(room);
  }

  completeTutorial(codeInput: string, playerToken: string): void {
    const room = this.find(codeInput);
    if (room.state !== "TUTORIAL") throw new Error("Tutorial is not active");
    const participant = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (!participant || participant.mode !== "PLAYER") throw new Error("Player authorization failed");
    participant.tutorialComplete = true;
    const players = room.participants.filter((candidate) => candidate.mode === "PLAYER");
    if (players.length === room.playerCount && players.every((candidate) => candidate.tutorialComplete)) room.state = "RUNNING";
    if (room.state === "RUNNING" && !room.game) room.game = this.createGame(room);
    this.changed(room);
  }

  setReady(codeInput: string, playerToken: string, ready: boolean): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    if (room.state !== "LOBBY") throw new Error("只能在大厅准备");
    if (typeof ready !== "boolean") throw new Error("Ready must be boolean");
    participant.ready = ready;
    this.changed(room);
  }

  pulse(codeInput: string, token: string, now = this.#now()): boolean {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => !candidate.left && candidate.tokenHash === hashOpaqueToken(token));
    if (!participant) throw new Error("Participant authorization failed");
    const wasOffline = !participant.connected;
    participant.lastSeenAt = now;
    participant.connected = true;
    let checkpoint=false;
    if(participant.controller==="HUMAN"&&participant.mode==="PLAYER"){
      const saved=room.metadata?.humanActivityCheckpointAt;
      const previous=typeof saved==='number'&&Number.isFinite(saved)?saved:room.lastHumanActivityAt;
      checkpoint=wasOffline||now-previous>=HUMAN_ACTIVITY_CHECKPOINT_MS;
      room.metadata={...room.metadata,humanActivityCheckpointAt:checkpoint?now:previous};
      room.lastHumanActivityAt=now;
    }
    room.lastActivityAt = new Date(now).toISOString();
    if (wasOffline||checkpoint) room.revision += 1;
    return wasOffline||checkpoint;
  }

  rotateParticipantToken(codeInput: string, oldToken: string): { participant: ParticipantRecord; token: string } {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => !candidate.left && candidate.tokenHash === hashOpaqueToken(oldToken));
    if (!participant) throw new Error("Participant authorization failed");
    const token = createOpaqueToken();
    const oldHash = participant.tokenHash;
    revokeJoinTicket(room, participant.id);
    participant.tokenHash = hashOpaqueToken(token);
    participant.lastSeenAt = this.#now();
    participant.connected = true;
    if (room.organizerTokenHash === oldHash) room.organizerTokenHash = participant.tokenHash;
    this.changed(room);
    return { participant: structuredClone(participant), token };
  }

  resume(codeInput: string, token: string): void {
    const { room } = this.authorizedPlayer(codeInput, token);
    const game = this.requireGame(room);
    if (!game.pauseReason || ["GAME_OVER", "ABORTED"].includes(game.phase)) throw new Error("当前阶段没有暂停，不能延长截止时间");
    delete game.pauseReason;
    this.deadline(room);
    this.changed(room);
  }

  advanceTime(now = this.#now(), onlyCode?:string): string[] {
    const changed: string[] = [];
    for (const room of this.#rooms.values()) {
      if(onlyCode&&room.code!==onlyCode)continue;
      let dirty = false;
      for (const participant of room.participants) {
        if (participant.controller==="HUMAN" && participant.connected && now - participant.lastSeenAt >= ONLINE_MS) { participant.connected = false; dirty = true; }
      }
      const time=this.gameNow(room,now);
      const game = room.game;
      if (game && game.phase !== "ABORTED") dirty = publishDue(game, time) || dirty;
      if(game&&this.releaseStartInfoIfDue(room))dirty=true;
      if (game?.phase === "VOTING" && game.nomination?.voterOrder && time >= game.presentationUntil) dirty = this.advanceBallot(room, time) || dirty;
      if (game && !["GAME_OVER", "ABORTED"].includes(game.phase) && time >= game.phaseDeadlineAt && time >= game.presentationUntil && !game.pauseReason) {
        if (game.phase === "VOTING") {
          for (const seat of this.eligibleVoters(game)) game.voteSubmissions[seat] ??= false;
          this.settleVote(room);
        } else {
          game.pauseReason = "本阶段等待超时。请确认所有玩家已连接并完成手机上的操作；完成操作后继续。";
          this.event(room, "说书人正在等候玩家，请检查连接并完成当前操作。");
        }
        dirty = true;
      }
      if (dirty) { if (game) { publishDue(game, time); syncImmediate(game, time); } this.captureResult(room, time); room.revision += 1; changed.push(room.code); }
    }
    return changed;
  }

  confirmRole(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    if (game.phase !== "ROLE_REVEAL") return;
    if (!game.confirmedRoleSeats.includes(participant.seat!)) game.confirmedRoleSeats.push(participant.seat!);
    delete game.pauseReason;
    if (this.gameNow(room) >= game.phaseDeadlineAt) this.deadline(room);
    if (game.confirmedRoleSeats.length === room.playerCount) {
      game.phase = "FIRST_NIGHT";
      game.contextId = randomUUID();
      this.event(room, "所有身份已确认。村庄进入首夜。", "NIGHT_FALLS");
      if(game.startInfo.mode==='LEGACY'){this.initializeNight(room);this.settleNightIfReady(room);}
      else {publishDue(game,this.gameNow(room));this.releaseStartInfoIfDue(room);}
    }
    this.changed(room);
  }

  updateGuestProfile(code:string,token:string,nickname:string,avatar:string) {
    const {room,participant}=this.authorizedPlayer(code,token);
    if(participant.controller!=='HUMAN'||participant.accountId)throw new RoomError('PROFILE_OWNER_CHANGED','请重新加载当前账号资料',403);
    const values=validateProfile(nickname,avatar);
    if(!values.nickname||!values.avatar)throw new RoomError('INVALID_PROFILE','请选择昵称和头像',400);
    if(participant.nickname===values.nickname&&(participant.avatarSnapshot??null)===values.avatar&&!participant.pendingProfile)return{profileApplication:'CURRENT' as const};
    participant.nickname=values.nickname;participant.avatarSnapshot=values.avatar;delete participant.pendingProfile;
    if(room.organizerParticipantId===participant.id)room.organizerName=participant.nickname;
    this.changed(room);
    return {profileApplication:'CURRENT' as const};
  }

  private startInfoBlocks(room:RoomRecord){return room.game?.phase==='FIRST_NIGHT'&&room.game.startInfo.mode!=='LEGACY'&&room.game.startInfo.stage!=='COMPLETE';}
  private nightfallComplete(room:RoomRecord){
    const g=room.game;if(!g||room.state!=='RUNNING'||g.phase!=='FIRST_NIGHT'||g.confirmedRoleSeats.length!==room.playerCount)return false;
    const event=g.events.find(e=>e.kind==='NIGHT_FALLS'&&e.day===0);
    return !!event&&this.gameNow(room)>=Math.max(g.presentationUntil,event.startsAt+event.durationMs)&&!(g.pendingPublications??[]).some(p=>p.id===`${event.id}:end`);
  }
  private releaseStartInfoIfDue(room:RoomRecord){
    const g=room.game;if(!g||g.startInfo.stage!=='WAIT_NIGHTFALL'||!this.nightfallComplete(room))return false;
    const s=g.startInfo;
    if(s.mode==='NONE')return this.completeStartInfoAndContinue(room);
    if(s.mode!=='REQUIRED')return false;
    s.stage='WAIT_ACK';s.releasedAt=this.gameNow(room);delete g.pauseReason;g.phaseDeadlineAt=this.gameNow(room)+180000;
    for(const [own,entry]of Object.entries(s.entries)){
      const seat=Number(own),team=entry.team.map(p=>`${p.nickname}（${p.seat}号，${p.kind==='DEMON'?'恶魔':'爪牙'}）`).join('、');
      this.privateMessage(g,seat,`首夜阵营信息：${team||'无其他队友'}。`,'INFORMATION');
      if(entry.bluffRoleIds.length)this.privateMessage(g,seat,`三个安全伪装：${entry.bluffRoleIds.map(id=>roleById(id).name).join('、')}。`,'INFORMATION');
      this.rememberBotTeam(room,seat,entry.team.map(p=>p.seat));
    }
    return true;
  }
  private completeStartInfoAndContinue(room:RoomRecord){
    const g=this.requireGame(room),s=g.startInfo;
    if(!this.nightfallComplete(room)||!(s.mode==='NONE'&&s.stage==='WAIT_NIGHTFALL'||s.mode==='REQUIRED'&&s.stage==='WAIT_ACK'&&Object.values(s.entries).every(e=>e.acknowledged)))return false;
    s.stage='COMPLETE';g.contextId=randomUUID();delete g.pauseReason;invalidateBots(room);
    this.initializeNight(room);this.deadline(room);this.settleNightIfReady(room);return true;
  }
  private startInfoView(room:RoomRecord,seat:number){
    const g=room.game,s=g?.startInfo,entry=s?.entries[seat];if(!g||!s||!entry||s.releasedAt===undefined)return;
    return {infoId:entry.infoId,gameId:g.gameId,team:structuredClone(entry.team),bluffs:entry.bluffRoleIds.map(id=>{const r=roleById(id);return{roleId:id,name:r.name,summary:r.summary};}),acknowledged:entry.acknowledged,
      canAcknowledge:room.state==='RUNNING'&&g.phase==='FIRST_NIGHT'&&s.stage==='WAIT_ACK'&&!entry.acknowledged&&this.gameNow(room)>=g.presentationUntil};
  }
  acknowledgeStartInfo(code:string,token:string,infoId:string){
    const {room,participant}=this.authorizedPlayer(code,token),g=this.requireGame(room),s=g.startInfo,entry=s.entries[participant.seat!];
    if(!entry||entry.infoId!==infoId||s.releasedAt===undefined||s.stage==='CANCELLED'||room.state!=='RUNNING')throw new RoomError('START_INFO_NOT_AVAILABLE','当前没有待确认提示');
    if(entry.acknowledged)return;
    if(!this.startInfoView(room,participant.seat!)?.canAcknowledge)throw new RoomError('START_INFO_NOT_AVAILABLE','当前没有待确认提示');
    entry.acknowledged=true;delete g.pauseReason;if(this.gameNow(room)>=g.phaseDeadlineAt)this.deadline(room);
    this.completeStartInfoAndContinue(room);this.changed(room);
  }

  submitAction(codeInput: string, playerToken: string, targetSeats: number[]): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    if (game.phase !== "FIRST_NIGHT" && game.phase !== "OTHER_NIGHT") throw new Error("No night action is active");
    if(this.startInfoBlocks(room))throw new RoomError("START_INFO_NOT_AVAILABLE","请先完成当前私密提示");
    if (game.nightSubmissions[participant.seat!]) throw new Error("Night action already submitted");
    const requirement = this.nightRequirement(room, participant.seat!);
    if (!requirement) throw new Error("This role has no pending action");
    if (!Array.isArray(targetSeats) || targetSeats.length !== requirement.count || new Set(targetSeats).size !== targetSeats.length) throw new Error("Invalid number of targets");
    if (targetSeats.some((seat) => !requirement.legalSeats.includes(seat))) throw new Error("Illegal target");
    const roleId = this.assignment(room, participant.seat!).perceivedRoleId;
    const effect = roleId === "poisoner" ? "POISON" : roleId === "monk" ? "PROTECT" : ["fortune_teller", "ravenkeeper"].includes(roleId) ? "DIVINATION" : undefined;
    this.privateMessage(game, participant.seat!, this.describeNightAction(room, participant.seat!, targetSeats), "ACTION", effect, targetSeats);
    game.nightSubmissions[participant.seat!] = [...targetSeats];
    delete game.pauseReason;
    if (this.gameNow(room) >= game.phaseDeadlineAt) this.deadline(room);
    this.settleNightIfReady(room);
    this.changed(room);
  }

  nominate(codeInput: string, playerToken: string, nomineeSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    const seat = participant.seat!;
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("Nominations are not open");
    if (!game.aliveSeats.includes(seat)) throw new Error("A dead player cannot nominate");
    this.assignment(room, nomineeSeat);
    if (game.nominatedBySeats.includes(seat)) throw new Error("You already nominated today");
    if (game.nominatedSeats.includes(nomineeSeat)) throw new Error("That player was already nominated today");
    game.nominatedBySeats.push(seat);
    game.nominatedSeats.push(nomineeSeat);
    game.nomination = { ballotId: randomUUID(), nominatorSeat: seat, nomineeSeat };
    game.contextId = randomUUID();
    game.voteSubmissions = {};
    game.readySeats = [];
    game.phase = "VOTING";
    this.event(room, `${this.nickname(room, seat)} 提名了 ${this.nickname(room, nomineeSeat)}。`, "NOMINATION", { actorSeat: seat, targetSeat: nomineeSeat });
    if (this.#presentation) this.prepareBallot(room);
    const nominee = this.assignment(room, nomineeSeat);
    const first = nominee.perceivedRoleId === "virgin" && !game.virginSpentSeats.includes(nomineeSeat);
    if (first) game.virginSpentSeats.push(nomineeSeat);
    if (first && nominee.roleId === "virgin" && game.aliveSeats.includes(nomineeSeat) && !this.isImpaired(room, nomineeSeat)
      && roleById(this.registeredRole(room, seat, "virgin", ["TOWNSFOLK"])).type === "TOWNSFOLK") {
      this.execute(room, seat, "处女的能力触发");
      delete game.nomination;
      if (!this.evaluateWin(room, true)) this.beginOtherNight(room);
    }
    this.deadline(room);
    this.changed(room);
  }

  cancelNomination(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    if (game.phase !== "VOTING" || !game.nomination) throw new Error("There is no nomination to cancel");
    if (game.nomination.nominatorSeat !== participant.seat) throw new Error("Only the nominator may cancel this nomination");
    if (Object.keys(game.voteSubmissions).length > 0 || (game.nomination.voteStartsAt !== undefined && this.gameNow(room) >= game.nomination.voteStartsAt)) throw new Error("The nomination cannot be cancelled after voting begins");
    const { nominatorSeat, nomineeSeat } = game.nomination;
    // A withdrawn public nomination still consumes both daily nomination allowances.
    delete game.nomination;
    game.phase = "NOMINATION";
    game.contextId = randomUUID();
    this.event(room, `${this.nickname(room, nominatorSeat)} 撤回对 ${this.nickname(room, nomineeSeat)} 的提名；双方今日提名次数已使用。`);
    this.deadline(room);
    this.changed(room);
  }

  finishDefense(codeInput: string, playerToken: string): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    const nomination = game.nomination;
    if (game.phase !== "VOTING" || !nomination || nomination.defenseUntil === undefined || this.gameNow(room) >= nomination.defenseUntil) throw new Error("辩护窗口已经结束");
    if (nomination.nomineeSeat !== participant.seat) throw new Error("只有被提名者可以提前结束辩护");
    const now = this.gameNow(room);
    nomination.defenseUntil = now;
    nomination.voteStartsAt = now;
    nomination.nextCountAt = now + VOTE_SLOT_MS;
    nomination.voteEndsAt = now + nomination.voterOrder!.length * VOTE_SLOT_MS;
    nomination.voteStarted = true;
    this.event(room, `${this.nickname(room, participant.seat!)} 结束了辩护，开始顺时针计票。`);
    this.deadline(room);
    this.changed(room);
  }

  vote(codeInput: string, playerToken: string, raised: boolean): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    if (game.phase !== "VOTING" || !game.nomination) throw new RoomError("BALLOT_CHANGED", "Voting is not open");
    if (this.gameNow(room) >= game.phaseDeadlineAt) throw new RoomError("BALLOT_CLOSED", "Voting deadline passed");
    if (typeof raised !== "boolean") throw new Error("Vote must be boolean");
    const seat = participant.seat!;
    if (!this.eligibleVoters(game).includes(seat)) throw new RoomError("NO_GHOST_VOTE", "No ghost vote remains");
    if (game.nomination.voterOrder) {
      if (this.voteIsLocked(room, seat)) throw new RoomError("VOTE_LOCKED", "本席已计票，不能再改变举手状态");
      // Freeze any earlier seats before applying a later player's hand change. Otherwise
      // a delayed scheduler tick could retrospectively alter a Butler's already earned vote.
      this.advanceBallot(room, this.gameNow(room));
      if (game.phase !== "VOTING" || !game.nomination || this.voteIsLocked(room, seat)) throw new RoomError("BALLOT_CHANGED", "本轮或本席已计票，请刷新");
    }
    game.voteSubmissions[seat] = raised;
    delete game.pauseReason;
    if (!game.nomination?.voterOrder && this.eligibleVoters(game).every((candidate) => game.voteSubmissions[candidate] !== undefined)) this.settleVote(room);
    this.changed(room);
  }

  private eligibleVoters(game: GameRuntime): number[] {
    return [...new Set([...game.aliveSeats, ...game.ghostVoteSeats])];
  }

  private prepareBallot(room: RoomRecord): void {
    const game = this.requireGame(room);
    const nomination = game.nomination!;
    const eligible = new Set(this.eligibleVoters(game));
    const voterOrder = Array.from({ length: room.playerCount }, (_, index) => (nomination.nomineeSeat + index) % room.playerCount + 1).filter((seat) => eligible.has(seat));
    const voteStartsAt = Math.max(this.gameNow(room), game.presentationUntil) + DEFENSE_MS;
    Object.assign(nomination, { defenseUntil: voteStartsAt, voteStartsAt, voteEndsAt: voteStartsAt + voterOrder.length * VOTE_SLOT_MS, nextCountAt: voteStartsAt + VOTE_SLOT_MS, voterOrder, countedSeats: [], countedVotes: {}, voteStarted: false });
    attachBallotTiming(game);
  }

  private voteIsLocked(room:RoomRecord, seat: number): boolean {
    const game=this.requireGame(room);
    const nomination = game.nomination;
    if (!nomination?.voterOrder) return false;
    const index = nomination.voterOrder.indexOf(seat);
    const counted = nomination.countedSeats!.length;
    return index < counted || index < 0 || this.gameNow(room) >= nomination.nextCountAt! + (index - counted) * VOTE_SLOT_MS;
  }

  private raisedVoteIsValid(room: RoomRecord, seat: number): boolean {
    const game = this.requireGame(room);
    // Every eligible raised hand counts. Secret role enforcement would identify the Butler.
    return game.voteSubmissions[seat] === true;
  }

  private butlerMasterRaised(game: GameRuntime): boolean {
    const master = game.butlerMasterSeat;
    if (master === undefined) return false;
    return game.nomination?.countedVotes && Object.hasOwn(game.nomination.countedVotes, master)
      ? game.nomination.countedVotes[master] === true
      : game.voteSubmissions[master] === true && this.eligibleVoters(game).includes(master);
  }

  private remindButler(room: RoomRecord, seat: number): void {
    const game = this.requireGame(room), nomination = game.nomination;
    if (!nomination || !game.aliveSeats.includes(seat) || this.assignment(room, seat).perceivedRoleId !== "butler" || !game.voteSubmissions[seat] || this.butlerMasterRaised(game)) return;
    if (nomination.butlerRemindedSeats?.includes(seat)) return;
    (nomination.butlerRemindedSeats ??= []).push(seat);
    this.privateMessage(game, seat, "按管家规则，主人未举手时你应放下手。本次举手仍计票，请在后续表决遵守角色规则。", "NOTICE");
  }

  private validVotes(room: RoomRecord): number[] {
    const game = this.requireGame(room);
    if (game.nomination?.countedVotes) return Object.entries(game.nomination.countedVotes).filter(([, raised]) => raised).map(([seat]) => Number(seat));
    return this.eligibleVoters(game).filter((seat) => this.raisedVoteIsValid(room, seat));
  }

  private advanceBallot(room: RoomRecord, now: number): boolean {
    const game = this.requireGame(room);
    const nomination = game.nomination;
    if (game.phase !== "VOTING" || !nomination?.voterOrder || now < nomination.voteStartsAt! || now < game.presentationUntil) return false;
    let changed = false;
    if (!nomination.voteStarted) { nomination.voteStarted = true; changed = true; }
    while (nomination.countedSeats!.length < nomination.voterOrder.length && now >= nomination.nextCountAt!) {
      const seat = nomination.voterOrder[nomination.countedSeats!.length]!;
      const valid = this.eligibleVoters(game).includes(seat) && this.raisedVoteIsValid(room, seat);
      nomination.countedSeats!.push(seat);
      nomination.countedVotes![seat] = valid;
      this.remindButler(room, seat);
      if (valid && !game.aliveSeats.includes(seat)) game.ghostVoteSeats = game.ghostVoteSeats.filter((candidate) => candidate !== seat);
      nomination.nextCountAt! += VOTE_SLOT_MS;
      changed = true;
    }
    if (changed) syncImmediate(game, now);
    if (nomination.countedSeats!.length === nomination.voterOrder.length) { this.settleVote(room); changed = true; }
    return changed;
  }

  private pauseBallotForPresentation(room: RoomRecord): void {
    const game = this.requireGame(room), now = this.gameNow(room);
    const nomination = game.nomination;
    if (!nomination?.voterOrder) return;
    const delay = Math.max(0, game.presentationUntil - now);
    if (now < nomination.defenseUntil!) {
      nomination.defenseUntil! += delay;
      nomination.voteStartsAt! += delay;
    }
    nomination.nextCountAt! += delay;
    nomination.voteEndsAt! += delay;
  }

  private settleVote(room: RoomRecord): void {
    const game = this.requireGame(room);
    if (!game.nomination) return;
    const validRaisedSeats = this.validVotes(room);
    if (!game.nomination.countedVotes) for (const seat of validRaisedSeats) this.remindButler(room, seat);
    if (!game.nomination.countedVotes) for (const seat of validRaisedSeats) if (!game.aliveSeats.includes(seat)) game.ghostVoteSeats = game.ghostVoteSeats.filter((candidate) => candidate !== seat);
    const votes = validRaisedSeats.length;
    const threshold = Math.ceil(game.aliveSeats.length / 2);
    const nomineeSeat = game.nomination.nomineeSeat;
    if (votes >= threshold) {
      if (!game.onBlock || votes > game.onBlock.votes) { game.onBlock = { seat: nomineeSeat, votes }; game.executionTied = false; }
      else if (votes === game.onBlock.votes) game.executionTied = true;
    }
    game.contextId = randomUUID();
    this.event(room, `${this.nickname(room, nomineeSeat)} 获得 ${votes} 票（至少一半需 ${threshold} 票）。${game.executionTied ? "最高票平票，暂时无人处决。" : ""}`, "VOTE_RESULT", { targetSeat: nomineeSeat, seats: validRaisedSeats, votes, threshold, outcome: game.executionTied ? "TIED" : game.onBlock?.seat === nomineeSeat ? "ON_BLOCK" : "NONE" });
    delete game.nomination;
    game.phase = "NOMINATION";
    game.readySeats = [];
    this.deadline(room);
  }

  readyToEndDay(codeInput: string, playerToken: string, ready = true): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    if (game.phase !== "DAY_DISCUSSION" && game.phase !== "NOMINATION") throw new Error("The day cannot end now");
    const seat = participant.seat!;
    if (!game.aliveSeats.includes(seat)) throw new Error("Only living players confirm day end");
    if (!ready) { game.readySeats = game.readySeats.filter(candidate => candidate !== seat); this.changed(room); return; }
    if (!game.readySeats.includes(seat)) game.readySeats.push(seat);
    delete game.pauseReason;
    if (!game.aliveSeats.every((candidate) => game.readySeats.includes(candidate))) { this.changed(room); return; }
    syncImmediate(game, this.gameNow(room));
    const executed = game.executionTied ? undefined : game.onBlock?.seat;
    if (executed !== undefined) this.execute(room, executed);
    else {
      delete game.lastExecutedRoleId; delete game.lastExecutedSeat; delete game.executionDeathRoleId;
      this.event(room, "今天无人被处决。", "EXECUTION", { outcome: "NONE" });
    }
    if (!this.evaluateWin(room, executed !== undefined, true)) this.beginOtherNight(room);
    this.changed(room);
  }

  private execute(room: RoomRecord, seat: number, prefix = ""): void {
    const game = this.requireGame(room);
    const wasAlive = game.aliveSeats.includes(seat);
    const roleId = this.assignment(room, seat).roleId;
    const impaired = this.isImpaired(room, seat);
    delete game.executionDeathRoleId;
    delete game.lastExecutedRoleId;
    delete game.lastExecutedSeat;
    if (wasAlive) {
      game.lastExecutedRoleId = roleId;
      game.lastExecutedSeat = seat;
      if (!impaired) game.executionDeathRoleId = roleId;
      this.kill(room, seat);
    }
    this.event(room, `${prefix ? prefix + "：" : ""}${this.nickname(room, seat)} 被处决。${wasAlive ? "" : "该玩家已经死亡。"}`, "EXECUTION", { targetSeat: seat, seats: wasAlive ? [seat] : [], outcome: wasAlive ? "DEATH" : "NO_DEATH" });
  }

  useDayAbility(codeInput: string, playerToken: string, targetSeat: number): void {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const game = this.requireGame(room);
    this.assertPresentationComplete(room);
    const seat = participant.seat!;
    if (!["DAY_DISCUSSION", "NOMINATION", "VOTING"].includes(game.phase)) throw new Error("Day abilities are not available");
    if (!game.aliveSeats.includes(seat)) throw new Error("A dead player cannot use a day ability");
    if (game.phase === "VOTING" && game.nomination?.voterOrder) this.advanceBallot(room, this.gameNow(room));
    const actor = this.assignment(room, seat);
    const target = this.assignment(room, targetSeat);
    if (game.claimDayBySeat[seat] === game.day) throw new Error("今日已经公开宣称过猎魔人");
    game.claimDayBySeat[seat] = game.day;
    game.contextId = randomUUID();
    game.readySeats = [];
    const available = !game.usedAbilitySeats.includes(seat);
    if (actor.perceivedRoleId === "slayer" && available) game.usedAbilitySeats.push(seat);
    this.privateMessage(game, seat, `你以猎魔人身份公开射击了${this.playerLabel(room, targetSeat)}。`, "ACTION");
    const registeredDemon = target.roleType === "DEMON" || this.registeredRole(room, targetSeat, "slayer", ["DEMON"]) === "imp";
    const death = game.aliveSeats.includes(targetSeat) && actor.roleId === "slayer" && available && !this.isImpaired(room, seat) && registeredDemon;
    if (death) this.kill(room, targetSeat);
    this.event(room, `${this.nickname(room, seat)} 以猎魔人身份射击了 ${this.nickname(room, targetSeat)}。${death ? `${this.nickname(room, targetSeat)} 倒下了。` : "枪声散去，但无人死亡。"}`, "SHOT", { actorSeat: seat, targetSeat, seats: death ? [targetSeat] : [], outcome: death ? "DEATH" : "NO_DEATH" });
    if (game.phase === "VOTING") { this.pauseBallotForPresentation(room); attachBallotTiming(game); }
    if (death) this.evaluateWin(room);
    this.deadline(room);
    this.changed(room);
  }

  privateView(codeInput: string, playerToken: string) {
    const { room, participant } = this.authorizedPlayer(codeInput, playerToken);
    const assignment = room.game?.deferredRoleChanges?.find(change => change.seat === participant.seat)?.previous
      ?? room.assignments.find((candidate) => candidate.seat === participant.seat);
    const revealActualRole = room.game?.publicProjection?.revealComplete === true;
    const visibleRoleId = assignment ? (revealActualRole ? assignment.roleId : assignment.perceivedRoleId) : undefined;
    const visibleRole = visibleRoleId ? roleById(visibleRoleId) : undefined;
    const game = room.game;
    const seat = participant.seat!;
    const visible = game ? projectedGame(game) : undefined;
    const history = (game?.privateHistory[seat] ?? []).filter(entry =>
      (revealActualRole || entry.phase !== "GAME_OVER")
      && (!entry.publishAfterEventId || !game?.deferredRoleChanges?.some(change => change.eventId === entry.publishAfterEventId)))
      .map(({ publishAfterEventId: _publication,targetSeatsRevealDay,...entry }) => {if(targetSeatsRevealDay!==undefined&&(game?.publicProjection?.day??0)<targetSeatsRevealDay){const {targetSeats:_targets,...safe}=entry;return {...safe,targetSeats:undefined};}return entry;});
    const available = !!game && this.gameNow(room) >= game.presentationUntil;
    const alive = !!game?.publicProjection?.aliveSeats.includes(seat);
    const daytime = !!game && ["DAY_DISCUSSION", "NOMINATION"].includes(game.phase);
    return {
      protocolVersion: 4 as const, roomInstanceId: room.roomInstanceId, setupId: room.setupId, revision: room.revision, serverNow: this.#now(),
      self: { participantId: participant.id, mode: participant.mode, commandVersion: participant.commandVersion },
      ...(game ? { contextId: game.publicProjection?.contextId ?? game.contextId } : {}),
      rehearsal:{eligible:this.rehearsalEligible(room),canChooseRole:room.state==='LOBBY'&&this.organizer(room)?.id===participant.id&&this.rehearsalEligible(room),...(room.rehearsalRole?.participantId===participant.id&&this.rehearsalEligible(room)?{selectedRoleId:room.rehearsalRole.roleId}:{})},
      canManageBots:this.organizer(room)?.id===participant.id&&room.state==='LOBBY',
      canStepBots:this.organizer(room)?.id===participant.id&&room.botControl.mode==='PAUSED'&&bots(room).length>0,
      canFreezeRehearsal:this.organizer(room)?.id===participant.id&&humans(room).length===1&&bots(room).length>0&&['LOBBY','TUTORIAL','RUNNING'].includes(this.publicView(codeInput).state),
      canAdvanceRehearsal:this.organizer(room)?.id===participant.id&&room.timeline.mode==='MANUAL',
      canCancelTutorial: this.organizer(room)?.id === participant.id && room.state === "TUTORIAL",
      canAbort: this.organizer(room)?.id === participant.id && room.state === "RUNNING" && available,
      canRestart: this.organizer(room)?.id === participant.id && (room.state === "ABORTED" || (room.state === "GAME_OVER" && revealActualRole)) && available,
      canClaimHost: this.organizer(room)?.id !== participant.id && !!this.organizer(room) && this.#now() - this.organizer(room)!.lastSeenAt >= HOST_CLAIM_MS,
      ...(this.startInfoView(room,seat)?{startInfo:this.startInfoView(room,seat)}:{}),
      participant: { id: participant.id, nickname: participant.nickname, seat: participant.seat, tutorialComplete: participant.tutorialComplete },
      state: this.publicView(codeInput).state,
      playMode: room.playMode,
      canClaimSlayer: available && alive && !!game && ["DAY_DISCUSSION", "NOMINATION", "VOTING"].includes(game.phase) && game.claimDayBySeat[seat] !== game.day,
      dayAbilityTargets: room.assignments.map((candidate) => candidate.seat),
      canNominate: available && alive && daytime && !game!.nominatedBySeats.includes(seat),
      nominationTargets: game && available ? room.assignments.map((candidate) => candidate.seat).filter((candidate) => !game.nominatedSeats.includes(candidate)) : [],
      canVote: available && game?.phase === "VOTING" && this.eligibleVoters(game).includes(seat) && !this.voteIsLocked(room, seat),
      canFinishDefense: available && game?.phase === "VOTING" && game.nomination?.nomineeSeat === seat && this.gameNow(room) < (game.nomination?.defenseUntil ?? 0),
      canCancelNomination: available && game?.phase === "VOTING" && game.nomination?.nominatorSeat === seat && !Object.keys(game.voteSubmissions).length && (game.nomination.voteStartsAt === undefined || this.gameNow(room) < game.nomination.voteStartsAt),
      canEndDay: available && alive && daytime,
      dayReady: visible?.readySeats.includes(seat) ?? false,
      ...(visible && alive && assignment?.perceivedRoleId === "butler" ? { butler: { masterSeat: visible.butlerMasterSeat, masterRaised: this.butlerMasterRaised(visible) } } : {}),
      ...(revealActualRole && game ? { storytellerDecisions: game.decisions } : {}),
      messages: history.map(entry => entry.text),
      history,
      ...(visible?.phase === "VOTING" && visible.voteSubmissions[participant.seat!] !== undefined ? { voteRaised: visible.voteSubmissions[participant.seat!] } : {}),
      ...(room.game ? { game: this.publicGame(room), roleConfirmed: room.game.confirmedRoleSeats.includes(participant.seat!), ...(this.privateAction(room, participant.seat!) ? { action: this.privateAction(room, participant.seat!) } : {}) } : {}),
      ...(assignment && visibleRole && ["RUNNING", "GAME_OVER", "ABORTED"].includes(room.state)
        ? { role: { roleId: visibleRole.id, alignment: assignment.alignment, type: visibleRole.type, name: visibleRole.name, summary: visibleRole.summary, beginnerTip: visibleRole.beginnerTip, ...(revealActualRole && assignment.roleId !== assignment.perceivedRoleId ? { perceivedAs: roleById(assignment.perceivedRoleId).name } : {}) } }
        : {}),
    };
  }

  private authorizedPlayer(codeInput: string, playerToken: string) {
    const room = this.find(codeInput);
    const participant = room.participants.find((candidate) => candidate.tokenHash === hashOpaqueToken(playerToken));
    if (!participant || participant.left || participant.mode !== "PLAYER" || participant.seat === undefined) throw new Error("Player authorization failed");
    return { room, participant };
  }

  private createGame(room: RoomRecord): GameRuntime {
    const messages: Record<number, string[]> = {};
    const privateHistory: Record<number, PrivateHistoryEntry[]> = {};
    const goodSeats = room.assignments.filter((assignment) => assignment.alignment === "GOOD").map((assignment) => assignment.seat);
    const redHerringSeat = goodSeats[Math.floor(randomAt(`${room.id}:red-herring`, 0) * goodSeats.length)];
    const seed=randomUUID();
    const game: GameRuntime = {
      presentationVersion:2,startInfo:createStartInfo(room,seed),
      hadBots:bots(room).length>0,rehearsalUsed:room.timeline.mode==="MANUAL"||!!room.rehearsalRole,
      contextId: randomUUID(),
      gameId: `${randomUUID()}:game-${room.gameNumber}`, storytellerSeed: seed, presentationUntil: 0, phaseDeadlineAt: this.gameNow(room) + 180_000, decisions: [], claimDayBySeat: {},
      phase: "ROLE_REVEAL", day: 0,
      aliveSeats: room.assignments.map((candidate) => candidate.seat),
      ghostVoteSeats: room.assignments.map((candidate) => candidate.seat),
      confirmedRoleSeats: [], nominatedBySeats: [], nominatedSeats: [], readySeats: [],
      messages, privateHistory,
      nightSubmissions: {}, voteSubmissions: {}, usedAbilitySeats: [], virginSpentSeats: [],
      executionTied: false,
      ...(redHerringSeat ? { redHerringSeat } : {}),
      events: [],
    };
    room.game=game;room.botControl.memory={};
    initializePresentation(game,this.gameNow(room));
    game.decisions.push({ id: `${game.gameId}:decision-1`, day: 0, ability: "setup", seat: 0, choice: "暗流涌动基础信息与主动能力组合", reason: "角色数量遵循人数配置与男爵修正；镇民足够时兼顾首夜信息和主动能力，身份随机分配。" });
    this.event(room, "身份已私密发放，请每位玩家确认。");
    for (const assignment of room.assignments) {
      const role = roleById(assignment.perceivedRoleId);
      messages[assignment.seat] = [];
      privateHistory[assignment.seat] = [];
      this.privateMessage(game, assignment.seat, `你的身份是${role.name}。${role.summary}`, "IDENTITY");
    }
    const demon = room.assignments.find((candidate) => candidate.roleType === "DEMON");
    const minions = room.assignments.filter((candidate) => candidate.roleType === "MINION");
    if (room.playerCount < 7) {
      const smallGameNotice = "官方 Teensyville 小局规则：恶魔与爪牙互不认识，小恶魔没有三个安全伪装。";
      if (demon) this.privateMessage(game, demon.seat, smallGameNotice, "NOTICE");
      for (const minion of minions) this.privateMessage(game, minion.seat, smallGameNotice, "NOTICE");
    }
    return game;
  }

  private restoreGame(snapshot: GameRuntime, gameId: string, now:number): GameRuntime {
    const legacy = snapshot as GameRuntime & { privateHistory?: Record<number, PrivateHistoryEntry[]> };
    const privateHistory = legacy.privateHistory ?? Object.fromEntries(
      Object.entries(snapshot.messages ?? {}).map(([seat, messages]) => [seat, messages.map((text, index) => ({
        seq: index + 1,
        phase: index === 0 || snapshot.phase === "ROLE_REVEAL" || snapshot.phase === "FIRST_NIGHT" ? "ROLE_REVEAL" as const : "HISTORY" as const,
        day: index === 0 ? 0 : snapshot.day ?? 0,
        kind: index === 0 ? "IDENTITY" as const : "NOTICE" as const,
        text,
      }))]),
    );
    return {
      ...snapshot,
      contextId: snapshot.contextId ?? randomUUID(),
      ...(snapshot.nomination ? { nomination: { ...snapshot.nomination, ballotId: snapshot.nomination.ballotId ?? randomUUID() } } : {}),
      privateHistory,
      gameId: snapshot.gameId ?? gameId,
      storytellerSeed: snapshot.storytellerSeed ?? randomUUID(),
      presentationUntil: snapshot.presentationUntil ?? 0,
      phaseDeadlineAt: snapshot.phaseDeadlineAt ?? now + 180_000,
      decisions: snapshot.decisions ?? [],
      claimDayBySeat: snapshot.claimDayBySeat ?? {},
      ...(snapshot.pendingRavenkeeperSeat !== undefined && !snapshot.nightOrder ? { nightStep: 0, nightOrder: [{ seat: snapshot.pendingRavenkeeperSeat, roleId: "ravenkeeper" }], nightStartAliveSeats: [...new Set([...snapshot.aliveSeats, ...(snapshot.nightDeaths ?? [snapshot.pendingRavenkeeperSeat])])] } : {}),
      events: snapshot.events.map((event) => ({ ...event, kind: event.kind ?? "NOTICE", id: event.id ?? `${gameId}:${event.seq}`, gameId: event.gameId ?? gameId, occurredAt: event.occurredAt ?? 0, startsAt: event.startsAt ?? 0, durationMs: event.durationMs ?? 0 })),
      virginSpentSeats: snapshot.virginSpentSeats ?? [],
      executionTied: snapshot.executionTied ?? false,
    };
  }

  private requireGame(room: RoomRecord): GameRuntime {
    if (!room.game) throw new Error("Game has not started");
    return room.game;
  }

  private assignment(room: RoomRecord, seat: number): RoleAssignment {
    const assignment = room.assignments.find((candidate) => candidate.seat === seat);
    if (!assignment) throw new Error("Unknown seat");
    return assignment;
  }

  private nickname(room: RoomRecord, seat: number): string {
    return room.participants.find((candidate) => candidate.seat === seat)?.nickname ?? `${seat}号`;
  }

  private playerLabel(room: RoomRecord, seat: number): string {
    const participant = room.participants.find((candidate) => candidate.mode === "PLAYER" && candidate.seat === seat);
    return participant ? `${participant.nickname}（${seat}号）` : `${seat}号玩家`;
  }

  private event(room:RoomRecord, message: string, kind: ExperienceEvent["kind"] = "NOTICE", details: Partial<ExperienceEvent> = {}): void {
    const game=this.requireGame(room);
    const duration = experienceTiming(kind,game.presentationVersion).duration;
    const durationMs = this.#presentation ? duration : 0;
    const occurredAt = this.gameNow(room);
    const startsAt = durationMs ? Math.max(occurredAt + 1500, game.presentationUntil) : Math.max(occurredAt, game.presentationUntil);
    const seq = game.events.length + 1;
    game.events.push({ ...details, seq, id: `${game.gameId}:${seq}`, gameId: game.gameId, kind, timingVersion:game.presentationVersion, message: message.trim(), occurredAt, startsAt, durationMs, day: game.day });
    if (durationMs) game.presentationUntil = startsAt + durationMs;
    enqueuePublication(game, game.events.at(-1)!);
    if (["SHOT", "EXECUTION"].includes(kind)) for (const change of game.deferredRoleChanges ?? []) {
      if (!change.eventId) {
        change.eventId = game.events.at(-1)!.id;
        const entry = game.privateHistory[change.seat]?.find(entry => entry.seq === change.historySeq);
        if (entry) entry.publishAfterEventId = change.eventId;
      }
    }
  }

  private privateMessage(game: GameRuntime, seat: number, text: string, kind: PrivateHistoryKind, effect?: PrivateHistoryEntry["effect"], targetSeats?: number[],targetSeatsRevealDay?:number, grimoire?: HistoryView["grimoire"]): void {
    const message = text.trim();
    (game.messages[seat] ??= []).push(message);
    const history = game.privateHistory[seat] ??= [];
    history.push({
      seq: (history.at(-1)?.seq ?? 0) + 1,
      phase: game.phase,
      day: game.day,
      kind,
      text: message,
      ...(grimoire ? { grimoire } : {}),
      ...(effect ? { effect } : {}), ...(targetSeats ? { targetSeats } : {}), ...(targetSeatsRevealDay!==undefined?{targetSeatsRevealDay}:{}),
    });
  }

  private describeNightAction(room: RoomRecord, seat: number, targetSeats: number[]): string {
    const game = this.requireGame(room);
    const assignment = this.assignment(room, seat);
    const perceivedRoleId = assignment.roleId === "drunk" ? assignment.perceivedRoleId : assignment.roleId;
    const targets = targetSeats.map((targetSeat) => this.playerLabel(room, targetSeat));
    if (game.pendingRavenkeeperSeat === seat) return `你选择查验${targets[0]}的角色。`;
    if (perceivedRoleId === "poisoner") return `你选择投毒${targets[0]}。`;
    if (perceivedRoleId === "fortune_teller") return `你选择查验${targets.join("与")}。`;
    if (perceivedRoleId === "butler") return `你选择${targets[0]}作为明天的主人。`;
    if (perceivedRoleId === "monk") return `你选择保护${targets[0]}免受恶魔攻击。`;
    if (perceivedRoleId === "imp") return `你选择袭击${targets[0]}。`;
    return `你选择了${targets.join("与")}。`;
  }

  private changed(room: RoomRecord): void {
    if (room.game) { publishDue(room.game, this.gameNow(room)); syncImmediate(room.game, this.gameNow(room)); }
    this.captureResult(room, this.gameNow(room));
    room.revision += 1; room.lastActivityAt = new Date(this.#now()).toISOString();
  }

  private captureResult(room: RoomRecord, now: number): void {
    const game = room.game;
    if (!game?.publicProjection?.revealComplete || !game.winner || room.state !== "GAME_OVER" || room.lastResult?.gameId === game.gameId) return;
    room.lastResult = { hadBots:game.hadBots,rehearsalUsed:game.rehearsalUsed,releasedWallAt:this.#now(),gameId: game.gameId, releasedAt: now, winner: game.winner, reason: game.winReason ?? "本局结束", days: game.day,
      participants: room.participants.filter(p => p.mode === "PLAYER").map(p => {
        const role = room.assignments.find(a => a.seat === p.seat)!;
        return { controller:p.controller,id: p.id, nickname: p.nickname, ...(p.avatarSnapshot ? { avatar: p.avatarSnapshot } : {}), finalRole: role.roleId, ...(role.perceivedRoleId !== role.roleId ? { perceivedRole: role.perceivedRoleId } : {}) };
      }) };
  }

  private organizer(room: RoomRecord): ParticipantRecord | undefined {
    return room.participants.find((participant) => participant.mode === "PLAYER" && participant.controller==="HUMAN" && !participant.left && participant.id === room.organizerParticipantId)
      ?? room.participants.find((participant) => participant.mode === "PLAYER" && participant.controller==="HUMAN" && !participant.left);
  }

  private publicGame(room: RoomRecord) {
    const raw = this.requireGame(room);
    const projection = raw.publicProjection!;
    const game = projectedGame(raw);
    const visibleAlive = projection.aliveSeats;
    return {
      publishedPhaseStartedAt:projection.publishedPhaseStartedAt,gameId: game.gameId, contextId: game.contextId, revision: room.revision, serverNow: this.gameNow(room),
      presentationVersion:game.presentationVersion,
      presentationUntil: game.presentationUntil, phaseDeadlineAt: game.phaseDeadlineAt,
      ...(game.pauseReason ? { pauseReason: game.pauseReason } : {}),
      phase: game.phase, day: game.day, revealComplete: projection.revealComplete,
      seats: room.participants.filter((participant) => participant.mode === "PLAYER").sort((left, right) => left.seat! - right.seat!).map((participant) => ({
        controller:participant.controller,id: participant.id, avatar: participant.avatarSnapshot, seat: participant.seat!, nickname: participant.nickname, connected: participant.connected,
        alive: visibleAlive.includes(participant.seat!), ghostVoteAvailable: game.ghostVoteSeats.includes(participant.seat!),
      })),
      events: game.events,
      readyCount: game.readySeats.length,
      aliveCount: visibleAlive.length,
      ...(game.nomination ? { nomination: { ballotId: game.nomination.ballotId, nominatorSeat: game.nomination.nominatorSeat, nomineeSeat: game.nomination.nomineeSeat,
        defenseUntil: game.nomination.defenseUntil, voteStartsAt: game.nomination.voteStartsAt, voteEndsAt: game.nomination.voteEndsAt,
        nextCountAt: game.nomination.nextCountAt, countedSeats: game.nomination.countedSeats, countedVotes: game.nomination.countedVotes, voterOrder: game.nomination.voterOrder,
        votesReceived: Object.keys(game.voteSubmissions).length, votersRequired: game.nomination.voterOrder?.length ?? this.eligibleVoters(game).length,
        ...(game.nomination.voterOrder && this.gameNow(room) >= game.nomination.voteStartsAt! && this.gameNow(room) >= game.presentationUntil && game.nomination.countedSeats!.length < game.nomination.voterOrder.length ? { currentVoterSeat: game.nomination.voterOrder[game.nomination.countedSeats!.length] } : {}),
        raisedSeats: Object.entries(game.voteSubmissions).filter(([, raised]) => raised).map(([seat]) => Number(seat)),
        votesRaised: game.nomination.countedVotes ? Object.values(game.nomination.countedVotes).filter(Boolean).length : this.eligibleVoters(game).filter(seat => game.voteSubmissions[seat]).length, threshold: Math.ceil(game.aliveSeats.length / 2) } } : {}),
      ...(game.onBlock ? { onBlock: game.onBlock } : {}),
      executionTied: game.executionTied,
      ...(game.winner ? { winner: game.winner, winReason: game.winReason } : {}),
    };
  }

  private privateAction(room: RoomRecord, seat: number) {
    const game = this.requireGame(room);
    if (this.gameNow(room) < game.presentationUntil || this.startInfoBlocks(room)) return undefined;
    if (game.phase === "ROLE_REVEAL" && !game.confirmedRoleSeats.includes(seat)) return { kind: "CONFIRM_ROLE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "确认你已记住身份" };
    if (game.phase === "FIRST_NIGHT" || game.phase === "OTHER_NIGHT") {
      if (game.nightSubmissions[seat]) return undefined;
      const requirement = this.nightRequirement(room, seat);
      if (requirement) return { kind: requirement.count === 2 ? "SELECT_TWO" : "SELECT_ONE", legalSeats: requirement.legalSeats, minTargets: requirement.count, maxTargets: requirement.count, prompt: requirement.prompt };
    }
    if (game.phase === "VOTING" && this.eligibleVoters(game).includes(seat) && !this.voteIsLocked(room, seat)) return { kind: "VOTE", legalSeats: [], minTargets: 0, maxTargets: 0, prompt: "提前举手或放下；顺时针数到本席时锁票，未举手不消耗鬼票" };
    if ((game.phase === "DAY_DISCUSSION" || game.phase === "NOMINATION") && game.aliveSeats.includes(seat)) {
      if (this.assignment(room, seat).perceivedRoleId === "slayer" && !game.usedAbilitySeats.includes(seat)) return { kind: "SLAYER", legalSeats: room.assignments.map((assignment) => assignment.seat), minTargets: 1, maxTargets: 1, prompt: "你可以公开选择任意玩家发动猎魔人能力（整局一次）" };
      return { kind: "DAY", legalSeats: room.assignments.map((assignment) => assignment.seat), minTargets: 0, maxTargets: 1, prompt: "讨论、提名，或确认结束今天" };
    }
    return undefined;
  }

  private nightRequirement(room: RoomRecord, seat: number): { count: number; legalSeats: number[]; prompt: string } | undefined {
    if(this.startInfoBlocks(room))return undefined;
    const game = this.requireGame(room);
    if (game.pendingRavenkeeperSeat === seat) {
      return { count: 1, legalSeats: room.assignments.map((assignment) => assignment.seat), prompt: "你在夜里死去：选择一名玩家查看其角色" };
    }
    if (!game.aliveSeats.includes(seat)) return undefined;
    const assignment = this.assignment(room, seat);
    const roleId = assignment.roleId === "drunk" ? assignment.perceivedRoleId : assignment.roleId;
    const living = room.assignments.map((candidate) => candidate.seat);
    if (roleId === "poisoner") return { count: 1, legalSeats: living, prompt: "选择今晚投毒的玩家" };
    if (roleId === "fortune_teller") return { count: 2, legalSeats: living, prompt: "选择两名不同的玩家进行占卜" };
    if (roleId === "butler") return { count: 1, legalSeats: room.assignments.map((candidate) => candidate.seat).filter((candidate) => candidate !== seat), prompt: "必须选择一名其他玩家作为你明天的主人（可以选择已死亡玩家）" };
    if (game.phase === "OTHER_NIGHT" && roleId === "monk") return { count: 1, legalSeats: living.filter((candidate) => candidate !== seat), prompt: "选择一名玩家免受恶魔攻击" };
    if (game.phase === "OTHER_NIGHT" && roleId === "imp") return { count: 1, legalSeats: living, prompt: "选择今晚袭击的玩家" };
    return undefined;
  }

  private initializeNight(room: RoomRecord): void {
    if(this.startInfoBlocks(room))throw new RoomError("START_INFO_NOT_AVAILABLE","请先完成当前私密提示");
    const game = this.requireGame(room);
    game.nightStartAliveSeats = [...game.aliveSeats];
    game.nightDeaths = [];
    game.nightStep = 0;
    const order = game.phase === "FIRST_NIGHT" ? FIRST_NIGHT_ORDER : OTHER_NIGHT_ORDER;
    game.nightOrder = order.flatMap((roleId) => room.assignments.filter((assignment) => assignment.perceivedRoleId === roleId && game.aliveSeats.includes(assignment.seat)).map((assignment) => ({ seat: assignment.seat, roleId })));
    delete game.protectedSeat;
    this.deadline(room);
  }

  private settleNightIfReady(room: RoomRecord): void {
    if(this.startInfoBlocks(room))return;
    const game = this.requireGame(room);
    if (!game.nightOrder) this.initializeNight(room);
    while ((game.nightStep ?? 0) < game.nightOrder!.length) {
      const { seat, roleId } = game.nightOrder![game.nightStep!]!;
      const isRaven = roleId === "ravenkeeper" && game.pendingRavenkeeperSeat === seat;
      if (!game.aliveSeats.includes(seat) && !isRaven) { game.nightStep! += 1; continue; }
      if (roleId === "ravenkeeper" && !isRaven) { game.nightStep! += 1; continue; }
      // A new Imp has already benefited from this night's original Imp action.
      if (this.assignment(room, seat).perceivedRoleId !== roleId && !isRaven) { game.nightStep! += 1; continue; }
      const requirement = this.nightRequirement(room, seat);
      if (requirement && !game.nightSubmissions[seat]) return;
      const targets = game.nightSubmissions[seat] ?? [];
      if (roleId === "poisoner" && !this.isImpaired(room, seat)) {
        game.poisonSourceSeat = seat; game.poisonedSeat = targets[0]!;
      } else if (roleId === "monk" && !this.isImpaired(room, seat)) {
        game.protectedSeat = targets[0]!;
      } else if (roleId === "imp") {
        this.resolveNightKill(room, seat, targets[0]);
        if (!room.assignments.some((assignment) => assignment.roleType === "DEMON" && game.aliveSeats.includes(assignment.seat)) || game.aliveSeats.length <= 2) { this.finishNight(room); return; }
      } else if (roleId === "butler") {
        game.butlerMasterSeat = targets[0]!;
      } else if (isRaven) {
        const target = targets[0]!;
        const truthful = this.registeredRole(room, target, "ravenkeeper");
        const shown = this.information(room, seat, roleId, truthful, ROLE_CATALOG.map((role) => role.id));
        this.privateMessage(game, seat, `守鸦人信息：${this.playerLabel(room, target)}是${roleById(shown).name}。`, "INFORMATION",undefined,[target]);
        delete game.pendingRavenkeeperSeat;
      } else this.deliverNightInformation(room, seat, roleId);
      game.nightStep! += 1;
    }
    this.finishNight(room);
  }

  private resolveNightKill(room: RoomRecord, demonSeat: number, selectedSeat: number | undefined): void {
    const game = this.requireGame(room);
    if (selectedSeat === undefined || this.isImpaired(room, demonSeat)) return;
    let target = selectedSeat;
    const selected = this.assignment(room, target);
    if (selected.roleId === "mayor" && game.aliveSeats.includes(target) && !this.isImpaired(room, target) && game.protectedSeat !== target) {
      const options = room.assignments.map((assignment) => assignment.seat);
      // Keeping the attack on the Mayor, an already dead player, or the Demon are all legal.
      target = this.choose(room, demonSeat, "mayor-redirect", options, (candidate) => candidate === selectedSeat ? 2 : !game.aliveSeats.includes(candidate) ? 1 : 3);
    }
    if (!game.aliveSeats.includes(target) || game.protectedSeat === target) return;
    if (this.assignment(room, target).roleId === "soldier" && !this.isImpaired(room, target)) return;
    const raven = this.assignment(room, target).perceivedRoleId === "ravenkeeper";
    this.kill(room, target, target === demonSeat);
    game.nightDeaths!.push(target);
    if (raven) {
      game.pendingRavenkeeperSeat = target;
      delete game.nightSubmissions[target];
    }
  }

  private deliverNightInformation(room: RoomRecord, seat: number, roleId: string): void {
    const game = this.requireGame(room);
    const first = game.phase === "FIRST_NIGHT";
    let message: string | undefined;
    let informationTargets:number[]|undefined;
    let spySnapshot: HistoryView["grimoire"];
    if (roleId === "chef" && first) {
      const evil = room.assignments.filter((assignment) => this.registeredAlignment(room, assignment.seat, `chef-${seat}`) === "EVIL").map((assignment) => assignment.seat);
      const count = evil.filter((candidate) => evil.includes(candidate === room.playerCount ? 1 : candidate + 1)).length;
      message = `厨师信息：相邻邪恶玩家共有 ${this.information(room, seat, roleId, count, Array.from({ length: room.playerCount + 1 }, (_, index) => index))} 对。`;
    } else if (roleId === "empath") {
      const living = [...game.aliveSeats].sort((a, b) => a - b);
      const index = living.indexOf(seat);
      const neighbors = [living[(index - 1 + living.length) % living.length]!, living[(index + 1) % living.length]!];
      informationTargets=[...new Set(neighbors)];
      const count = neighbors.filter((candidate) => this.registeredAlignment(room, candidate, `empath-${seat}`) === "EVIL").length;
      message = `共情信息：你的两位最近存活邻居中有 ${this.information(room, seat, roleId, count, [0, 1, 2])} 位邪恶。`;
    } else if (roleId === "fortune_teller") {
      informationTargets=[...game.nightSubmissions[seat]!];
      const truthful = game.nightSubmissions[seat]!.some((target) => target === game.redHerringSeat || this.registeredRole(room, target, `fortune_teller-${seat}`, ["DEMON"]) === "imp");
      message = `占卜结果：${this.information(room, seat, roleId, truthful, [true, false]) ? "是" : "否"}。`;
    } else if (["washerwoman", "librarian", "investigator"].includes(roleId) && first) {
      const sought = roleId === "washerwoman" ? "TOWNSFOLK" : roleId === "librarian" ? "OUTSIDER" : "MINION";
      const registrations = room.assignments.map((candidate) => ({ seat: candidate.seat, roleId: this.registeredRole(room, candidate.seat, `${roleId}-${seat}`, [sought]) }));
      const valid = registrations.filter((candidate) => roleById(candidate.roleId).type === sought);
      if (valid.length === 0 && !this.isImpaired(room, seat) && roleId === "librarian") message = "图书管理员信息：本局没有外来者。";
      else {
        const legalPool = this.isImpaired(room, seat) || !valid.length ? registrations : valid;
        const others = legalPool.filter((candidate) => candidate.seat !== seat);
        const pool = others.length ? others : legalPool;
        const target = this.choose(room, seat, `${roleId}-target`, pool);
        const decoy = this.choose(room, seat, `${roleId}-decoy`, registrations.filter((candidate) => candidate.seat !== target.seat && candidate.seat !== seat));
        (game.informationPairs ??= {})[seat] = { targetSeat: target.seat, decoySeat: decoy.seat };
        const legalRoles = ROLE_CATALOG.filter((role) => role.type === sought).map((role) => role.id);
        const truthfulRole = roleById(target.roleId).type === sought ? target.roleId : this.choose(room, seat, `${roleId}-plausible`, legalRoles);
        const shown = this.information(room, seat, roleId, truthfulRole, legalRoles);
        const pair = shuffled([target.seat, decoy.seat], `${game.storytellerSeed}:${seat}:pair`, game.decisions.length);
        informationTargets=[...pair];
        message = `${roleById(roleId).name}信息：${this.playerLabel(room, pair[0]!)}与${this.playerLabel(room, pair[1]!)}中，有一位是${roleById(shown).name}。`;
      }
    } else if (roleId === "spy") {
      const input = { assignments: room.assignments, aliveSeats: game.aliveSeats,
        usedAbilitySeats: game.usedAbilitySeats, virginSpentSeats: game.virginSpentSeats,
        ...(game.poisonedSeat === undefined ? {} : { poisonedSeat: game.poisonedSeat }),
        ...(game.poisonSourceSeat === undefined ? {} : { poisonSourceSeat: game.poisonSourceSeat }),
        ...(game.protectedSeat === undefined ? {} : { protectedSeat: game.protectedSeat }),
        ...(game.redHerringSeat === undefined ? {} : { redHerringSeat: game.redHerringSeat }),
        ...(game.butlerMasterSeat === undefined ? {} : { butlerMasterSeat: game.butlerMasterSeat }),
        ...(game.informationPairs ? { informationPairs: game.informationPairs } : {}),
      };
      const key = `${game.phase}:${game.day}:${seat}`;
      const grimoire = (game.spyGrimoires ??= {})[key] ??= this.isImpaired(room, seat)
        ? this.choose(room, seat, "spy-grimoire", grimoireCandidates(input, seat)) : trueGrimoire(input);
      const labels = { POISON: "中毒", PROTECT: "僧侣保护", RED_HERRING: "红鲱鱼", USED: "一次能力已用", VIRGIN: "处女已触发", MASTER: "管家主人", PAIR: "线索" };
      const entries = grimoire.entries.map(entry => {
        const reminders = [entry.alive ? "存活" : "死亡", ...(entry.roleId === "drunk" ? [`酒鬼自认${roleById(entry.perceivedRoleId).name}`] : []),
          ...grimoire.reminders.filter(reminder => reminder.targetSeats.includes(entry.seat)).map(reminder => reminder.kind === "PAIR"
            ? `${roleById(grimoire.entries.find(own => own.seat === reminder.ownerSeat)!.perceivedRoleId).name}线索${reminder.targetSeats[0] === entry.seat ? "目标" : "干扰"}`
            : labels[reminder.kind])];
        const avatar=room.participants.find(player=>player.mode==="PLAYER"&&player.seat===entry.seat)?.avatarSnapshot;
        return {seat:entry.seat,nickname:this.nickname(room,entry.seat),...(avatar?{avatar}:{}),roleName:roleById(entry.roleId).name,alive:entry.alive,reminders};
      });
      // Store the already selected (possibly impaired) night snapshot, never a live grimoire.
      spySnapshot={entries};
      message = `魔典：${entries.map(entry=>`${this.playerLabel(room,entry.seat)} ${entry.roleName} [${entry.reminders.join("、")}]`).join("；")}。`;
    } else if (roleId === "undertaker" && !first && game.lastExecutedSeat !== undefined) {
      informationTargets=[game.lastExecutedSeat];
      const truthful = this.registeredRole(room, game.lastExecutedSeat, "undertaker");
      const shown = this.information(room, seat, roleId, truthful, ROLE_CATALOG.map((role) => role.id));
      message = `送葬信息：今天因处决死亡的是${roleById(shown).name}。`;
    }
    if (message) this.privateMessage(game, seat, message, "INFORMATION",undefined,informationTargets,roleId==="empath"?game.day+1:undefined,spySnapshot);
  }

  private finishNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    const first = game.phase === "FIRST_NIGHT";
    const deaths = game.nightDeaths ?? [];
    game.day = first ? 1 : game.day + 1;
    game.phase = "DAY_DISCUSSION";
    game.contextId = randomUUID();
    game.nightSubmissions = {};
    delete game.nightOrder; delete game.nightStep; delete game.pendingRavenkeeperSeat;
    delete game.nightStartAliveSeats; delete game.protectedSeat;
    this.event(room, deaths.length ? `黎明时发现 ${deaths.map((seat) => this.nickname(room, seat)).join("、")} 死亡。` : "黎明到来，昨夜无人死亡。", "DAWN", { seats: deaths, outcome: deaths.length ? "DEATH" : "NO_DEATH" });
    delete game.nightDeaths;
    if (!this.evaluateWin(room)) this.event(room, `第 ${game.day} 天开始，自由讨论。`);
    this.deadline(room);
  }

  private beginOtherNight(room: RoomRecord): void {
    const game = this.requireGame(room);
    game.phase = "OTHER_NIGHT";
    game.contextId = randomUUID();
    game.readySeats = []; game.nominatedBySeats = []; game.nominatedSeats = []; game.nightSubmissions = {};
    game.executionTied = false;
    delete game.nomination; delete game.onBlock; delete game.poisonedSeat; delete game.poisonSourceSeat; delete game.pendingRavenkeeperSeat;
    this.event(room, "夜幕再次降临。请查看自己的手机。", "NIGHT_FALLS");
    this.initializeNight(room);
    this.settleNightIfReady(room);
  }

  private kill(room: RoomRecord, seat: number, impSelfKill = false): void {
    const game = this.requireGame(room);
    if (!game.aliveSeats.includes(seat)) return;
    const beforeCount = game.aliveSeats.length;
    const killed = this.assignment(room, seat);
    game.aliveSeats = game.aliveSeats.filter((candidate) => candidate !== seat);
    if (game.poisonSourceSeat === seat || killed.roleId === "poisoner") { delete game.poisonedSeat; delete game.poisonSourceSeat; }
    if (killed.roleId === "monk") delete game.protectedSeat;
    if (killed.roleType !== "DEMON") return;
    const scarlet = beforeCount >= 5 ? room.assignments.find((candidate) => candidate.roleId === "scarlet_woman" && game.aliveSeats.includes(candidate.seat) && !this.isImpaired(room, candidate.seat)) : undefined;
    const minions = room.assignments.filter((candidate) => candidate.roleType === "MINION" && game.aliveSeats.includes(candidate.seat));
    const successor = scarlet ?? (impSelfKill && minions.length ? this.choose(room, seat, "imp-successor", minions, (candidate) => 1 / (1 + game.events.filter((event) => event.kind === "NOMINATION" && event.targetSeat === candidate.seat).length)) : undefined);
    if (successor) {
      const previous = structuredClone(successor);
      if (successor.roleId === "poisoner") { delete game.poisonedSeat; delete game.poisonSourceSeat; }
      const old = successor.roleId;
      successor.roleId = "imp"; successor.perceivedRoleId = "imp"; successor.roleType = "DEMON";
      this.decision(room, successor.seat, "demon-succession", `${old} → imp`, scarlet ? `恶魔死亡前 ${beforeCount} 人存活，健康猩红女郎优先接任。` : "小恶魔自杀，从仍存活的爪牙中选择继任者。");
      this.privateMessage(game, successor.seat, "恶魔死亡，你已秘密接替成为新的小恶魔。", "ROLE_CHANGE");
      if (["DAY_DISCUSSION", "NOMINATION", "VOTING"].includes(game.phase)) (game.deferredRoleChanges ??= []).push({ seat: successor.seat, previous, historySeq: game.privateHistory[successor.seat]!.at(-1)!.seq });
    }
  }

  private evaluateWin(room: RoomRecord, executedToday = false, mayorWinEligible = false): boolean {
    const game = this.requireGame(room);
    const living = room.assignments.filter((assignment) => game.aliveSeats.includes(assignment.seat));
    const result = resolveSpecialWin({ ...(executedToday && game.executionDeathRoleId ? { executedRoleId: game.executionDeathRoleId } : {}), livingRoleIds: living.filter((assignment) => !this.isImpaired(room, assignment.seat)).map((assignment) => assignment.roleId), livingCount: game.aliveSeats.length, demonAlive: living.some((assignment) => assignment.roleType === "DEMON"), executedToday, mayorWinEligible });
    if (!result) return false;
    game.phase = "GAME_OVER"; delete game.nomination; game.winner = result.winner; game.winReason = result.reason; room.state = "GAME_OVER";
    game.contextId = randomUUID();
    delete game.pauseReason;
    this.event(room, `${result.winner === "GOOD" ? "善良" : "邪恶"}阵营获胜。`, "GAME_OVER", { outcome: result.winner });
    this.event(room, `身份揭晓：${room.assignments.map((assignment) => {
      const actual = roleById(assignment.roleId).name;
      const mistaken = assignment.roleId !== assignment.perceivedRoleId ? `（本局以为自己是${roleById(assignment.perceivedRoleId).name}）` : "";
      return `${this.playerLabel(room, assignment.seat)} ${actual}${mistaken}`;
    }).join("；")}。`);
    return true;
  }

  private isImpaired(room: RoomRecord, seat: number): boolean {
    return this.assignment(room, seat).roleId === "drunk" || this.requireGame(room).poisonedSeat === seat;
  }

  private registeredRole(room: RoomRecord, seat: number, ability: string, soughtTypes?: string[]): string {
    const assignment = this.assignment(room, seat);
    // Recluse and Spy explicitly retain registration while dead, but never while poisoned.
    if (this.isImpaired(room, seat) || !["recluse", "spy"].includes(assignment.roleId)) return assignment.roleId;
    const allowed = assignment.roleId === "recluse" ? ["MINION", "DEMON"] : ["TOWNSFOLK", "OUTSIDER"];
    const roles = ROLE_CATALOG.filter((role) => allowed.includes(role.type) && (!soughtTypes || soughtTypes.includes(role.type))).map((role) => role.id);
    return this.choose(room, seat, `${ability}-registration`, [assignment.roleId, ...roles], (roleId) => roleId === assignment.roleId ? Math.max(1, roles.length) : 1);
  }

  private registeredAlignment(room: RoomRecord, seat: number, ability: string): "GOOD" | "EVIL" {
    const assignment = this.assignment(room, seat);
    if (this.isImpaired(room, seat) || !["recluse", "spy"].includes(assignment.roleId)) return assignment.alignment;
    return this.choose(room, seat, `${ability}-alignment`, ["GOOD", "EVIL"]);
  }

  private information<T>(room: RoomRecord, seat: number, ability: string, truthful: T, legal: T[]): T {
    const game = this.requireGame(room);
    const impaired = this.isImpaired(room, seat);
    const prior = game.decisions.filter((decision) => decision.seat === seat && decision.ability === ability).map((decision) => decision.choice);
    const shown = chooseInformationResult({ seed: `${game.storytellerSeed}:${seat}:${ability}:${game.day}`, eventSeq: game.decisions.length, truthful, legal, impaired, history: prior, livingCount: game.aliveSeats.length });
    this.decision(room, seat, ability, String(shown), impaired ? "醉毒信息：从合法信息集合中按局势与历史选择；真值仍为合法候选。" : "健康角色依据此时夜序快照及合法登记获得信息。");
    return shown;
  }

  private choose<T>(room: RoomRecord, seat: number, ability: string, legal: T[], weight: (value: T) => number = () => 1): T {
    if (!legal.length) throw new Error(`No legal storyteller choice for ${ability}`);
    const game = this.requireGame(room);
    const prior = game.decisions.filter((decision) => decision.ability === ability).slice(-3).map((decision) => decision.choice);
    const weighted = legal.map((value) => ({ value, weight: Math.max(0.1, weight(value)) * (prior.includes(JSON.stringify(value)) ? 0.7 : 1) }));
    let roll = randomAt(`${game.storytellerSeed}:${game.day}:${seat}:${ability}`, game.decisions.length) * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const selected = weighted.find((entry) => (roll -= entry.weight) < 0)?.value ?? legal.at(-1)!;
    this.decision(room, seat, ability, JSON.stringify(selected), `在 ${legal.length} 个合法候选中，结合既往裁量避免固定座位和固定输出。`);
    return selected;
  }

  private decision(room: RoomRecord, seat: number, ability: string, choice: string, reason: string): void {
    const game = this.requireGame(room);
    game.decisions.push({ id: `${game.gameId}:decision-${game.decisions.length + 1}`, day: game.day, ability, seat, choice, reason });
  }

  private assertPresentationComplete(room:RoomRecord): void {
    const game=this.requireGame(room);
    if (this.gameNow(room) < game.presentationUntil) throw new RoomError("PRESENTATION_PENDING", "公开演出正在同步，请稍候再操作");
  }

  private deadline(room:RoomRecord): void {
    const game=this.requireGame(room);
    game.phaseDeadlineAt = game.phase === "VOTING" && game.nomination?.voteEndsAt !== undefined ? game.nomination.voteEndsAt : Math.max(this.gameNow(room), game.presentationUntil) + (game.phase === "VOTING" ? 60_000 : ["DAY_DISCUSSION", "NOMINATION"].includes(game.phase) ? 10 * 60_000 : 180_000);
    delete game.pauseReason;
  }

}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")&&!url.username&&!url.password;
  } catch {
    return false;
  }
}
