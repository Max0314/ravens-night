import {runBotCommand} from './rooms/bot-commands.js';
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyRequest } from "fastify";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {accountClient,type Account} from './auth/account.js';
import {hashOpaqueToken} from './auth/session.js';
import { RoomService, type ParticipantMode, type RoomPlayMode } from "./rooms/service.js";
import { PostgresRoomRepository } from "./db/room-repository.js";
import { LiveRoomRuntime, PersistenceUnavailableError, type RoomRepository } from "./game/live-runtime.js";
import { createRecovery, inviteWhisper, leaveWhisper, member, recoverMembership, respondWhisper, sendWhisper, socialView } from "./rooms/social.js";
import { roomCommandProperties, roomCommandRequired, type RoomCommandContext,type ControlResult,type PresentationAckRequest } from "@ravens/contracts";
import { RoomError, PUBLICATION_TICK_MS } from "./rooms/errors.js";
import { issueJoinTicket, validateJoinTicket, parseJoinTicket, assertJoinCapacity, revokeJoinTicket } from "./rooms/join-ticket.js";
import { profileView } from './auth/game-profile.js';
import { avatarChoices, trustedAvatar, avatarSelectionUrl } from './auth/avatar.js';

import {runBots,stepBot} from './rooms/bot-scheduler.js';
import {activePlayers,bots,humans} from './rooms/bot-types.js';
import {issueSwitchTicket,parseSwitchTicket,validateSwitchSource,switchActorDigest,transferKey,transferReceipts,availableTransferReceipts,TRANSFER_RECEIPT_MS,type JoinTransferReceipt} from './rooms/switch-ticket.js';
import {issueCreationTicket,parseCreationTicket,creationOwner,creationKey,creationOrganizer} from './rooms/creation.js';
type RoomRequest = { Params: { code: string; id?: string }; Body: Record<string, unknown>; Querystring: { token?: string; mode?: string } };
const string = { type: "string", maxLength: 500 };
const tokenProperty = { token: { type: "string", maxLength: 256 }, organizerToken: { type: "string", maxLength: 256 } };
function bodySchema(properties: Record<string, unknown>, required: string[] = []) { return { type: "object", properties: { ...tokenProperty, ...properties }, required, additionalProperties: false }; }

export function buildApp(options: { resolveAccount?:(header:string|undefined)=>Promise<Account|null>;accessPassword?: string; repository?: RoomRepository; now?: () => number; presentation?: boolean; timers?: boolean } = {}) {
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error("Production requires a SESSION_SECRET of at least 32 characters");
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL && !process.env.DATA_ENCRYPTION_KEY) throw new Error("Production persistence requires DATA_ENCRYPTION_KEY");
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { redact: ["req.headers.cookie", "req.headers.authorization"], serializers: { req: (req) => ({ method: req.method, url: String(req.url).split("?")[0]!, remoteAddress: req.ip }) } },
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    bodyLimit: 16_384,
  });
  const accessPassword = options.accessPassword ?? process.env.ACCESS_PASSWORD;
  const repository = options.repository ?? (process.env.DATABASE_URL ? new PostgresRoomRepository(process.env.DATABASE_URL) : undefined);
  const sessionSecret = process.env.SESSION_SECRET ?? "development-only-session-secret-change-me";
  const runtime = new LiveRoomRuntime(repository, {botSecret:sessionSecret, ...(options.now ? { now: options.now } : {}), presentation: options.presentation ?? process.env.NODE_ENV !== "test" });
  const now = options.now ?? Date.now;
  const resolveAccount=options.resolveAccount??accountClient(),accounts=new WeakMap<FastifyRequest,Account|null>();
  const accountKey=process.env.FRIBENCH_CLIENT_SECRET??randomBytes(32).toString('base64url');
  const accountToken=(sub:string,code:string,id:string)=>createHmac('sha256',accountKey).update(JSON.stringify(['seat-v1',sub,code,id])).digest('base64url');
  const assertToken=(request:FastifyRequest,token:string)=>{
    const code=(request.params as {code?:string}).code;if(!code)return token;
    const room=runtime.service.find(code),hash=hashOpaqueToken(token),participant=room.participants.find(value=>!value.left&&value.tokenHash===hash);
    if(participant?.controller==='BOT')throw new RoomError('BOT_EXTERNAL_ACCESS','人机席位不能用于登录或恢复',403);
    const owner=participant?.accountId??(room.organizerTokenHash===hash?room.organizerAccountId:undefined);
    if(owner&&owner!==accounts.get(request)?.sub)throw Error('账号与座位授权不匹配');return token;
  };
  function participantToken(request:FastifyRequest,fallback?:string,mode?:ParticipantMode){const token=optionalToken(request,mode)??fallback;if(!token)throw Error('Player session is missing');return assertToken(request,token);}
  function organizerCredential(request:FastifyRequest,fallback?:string){return assertToken(request,signedCookie(request,'ravens_player')??signedCookie(request,'ravens_organizer')??fallback??'');}
  void app.register(cookie, { secret: process.env.SESSION_SECRET ?? "development-only-session-secret-change-me" });
  void app.register(websocket, { options: { maxPayload: 1024 } });
  if (process.env.STATIC_DIR) void app.register(fastifyStatic, { root: process.env.STATIC_DIR, wildcard: false });
  const lobbyTtl = Number(process.env.ROOM_LOBBY_TTL_MS ?? 2 * 60 * 60_000);
  const activeTtl = Number(process.env.ROOM_ACTIVE_TTL_MS ?? 24 * 60 * 60_000);
  let ticking = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook("onReady", async () => {
    await runtime.initialize();
    // No clock writes may race startup's all-room migration transaction.
    if (options.timers === false) return;
    timer = setInterval(() => {
      if (ticking) return;
      ticking = true;
      void runtime.execute((rooms) => { rooms.advanceTime(now()); runBots(rooms); rooms.expireCreations(now()); rooms.expireIdle(now(), lobbyTtl, activeTtl); }).catch(() => app.log.error("Room clock persistence failed; no uncommitted state was published")).finally(() => { ticking = false; });
    }, PUBLICATION_TICK_MS);
    timer.unref();
  });
  app.addHook("onClose", async () => { if (timer) clearInterval(timer); await runtime.close(); });

  const attempts = new Map<string, { count: number; reset: number }>();
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if(request.url.startsWith('/api/')){
      accounts.set(request,await resolveAccount(request.headers.cookie));
      if(process.env.NODE_ENV==='production'&&(!['GET','HEAD','OPTIONS'].includes(request.method)||request.headers.upgrade?.toLowerCase()==='websocket')&&origin!==(process.env.PUBLIC_ORIGIN??'https://clocktower.fribench.cn'))return reply.code(403).send({error:'请求来源不匹配，请从本站重新操作'});
    }
    if ((! ["GET", "HEAD", "OPTIONS"].includes(request.method) || request.headers.upgrade?.toLowerCase() === "websocket") && origin) {
      const forwardedHost = request.headers["x-forwarded-host"];
      const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0]!.trim() : request.headers.host;
      try { if (new URL(origin).host !== host) return reply.code(403).send({ error: "请求来源不匹配" }); }
      catch { return reply.code(403).send({ error: "请求来源不匹配" }); }
    }
    const pathname = request.url.split("?")[0]!;
    const roomApi=/^\/api\/rooms(?:\/|$)/.test(pathname)||pathname==='/api/room-create-ticket';
    if(roomApi&&!request.headers.upgrade&&!(request.method==='GET'&&/^\/api\/rooms\/[^/]+\/summary$/.test(pathname))&&request.headers['x-ravens-protocol']!=='6')return reply.code(426).send({errorCode:'CLIENT_UPGRADE_REQUIRED',error:'游戏已更新，请刷新页面后继续',refreshRequired:true});
    if (/\/auth\/login$|\/join$|\/recover$|\/switch-ticket$|\/presentations\/ack$/.test(pathname) && request.method === "POST") {
      const key = `${request.ip}:${pathname.split("/").at(-1)}`;
      const current = attempts.get(key);
      const entry = current && current.reset > now() ? current : { count: 0, reset: now() + 60_000 };
      entry.count += 1; attempts.set(key, entry);
      if (attempts.size > 5000) for (const [oldKey, value] of attempts) if (value.reset <= now()) attempts.delete(oldKey);
      if (entry.count > 60) return reply.code(429).send({ error: "操作太频繁，请稍后再试" });
    }
    if (!accessPassword || !request.url.startsWith("/api/") || request.url.startsWith("/api/auth/")) return;
    if (signedCookie(request, "ravens_access") !== "authorized") return reply.code(401).send({ error: "请重新输入访问口令" });
  });
  app.addHook("onSend", async (_request, reply) => { reply.header("X-Content-Type-Options", "nosniff").header("Referrer-Policy", "same-origin").header("Cache-Control", "no-store"); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof RoomError) return reply.code(error.status).send({ errorCode: error.errorCode, error: error.message, refreshRequired: error.refreshRequired, ...error.details });
    if (error instanceof PersistenceUnavailableError) return reply.code(503).send({ errorCode: "SAVE_UNAVAILABLE", error: error.message });
    const failure = error as Error & { validation?: unknown };
    if (failure.validation) return reply.code(400).send({ errorCode: "INVALID_REQUEST", error: "请求参数不符合规则" });
    const message = failure.message;
    const status = message === "Room not found" ? 404 : /authorization|session is missing|授权/i.test(message) ? 403 : 400;
    return reply.code(status).send({ errorCode: status === 404 ? "ROOM_NOT_FOUND" : status === 403 ? "SEAT_REMOVED" : "INVALID_ACTION", error: message });
  });
  app.get("/healthz", async (_request,reply) => {try{await repository?.health?.();return{ok:true,service:'ravens-night'};}catch{return reply.code(503).send({ok:false,service:'ravens-night'});}});
  app.get("/api/auth/session", async (request) => ({ authorized: !accessPassword || signedCookie(request, "ravens_access") === "authorized" }));
  app.get('/api/account',async request=>{const account=accounts.get(request);return{signedIn:Boolean(account),guestClaimAvailable:account?!runtime.service.accountClaim(account.sub):false,rooms:account?runtime.service.accountRooms(account.sub):[],...(account?{profile:profileView(account,runtime.service.accountProfile(account.sub))}:{} )};});
  app.get('/api/account/avatars',async()=>({avatars:avatarChoices}));
  app.post<{Body:{nickname:string|null;avatar:string|null;expectedRevision:number}}>('/api/account/profile',{schema:{body:bodySchema({nickname:{anyOf:[{type:'string',maxLength:24},{type:'null'}]},avatar:{anyOf:[{type:'string',maxLength:200},{type:'null'}]},expectedRevision:{type:'integer',minimum:0}},['nickname','avatar','expectedRevision'])}},async(request,reply)=>{
    const account=accounts.get(request);if(!account)return reply.code(401).send({error:'请先登录账号'});
    const profile=await runtime.execute(rooms=>rooms.updateAccountProfile(account,request.body.nickname,request.body.avatar,request.body.expectedRevision));
    return {profile};
  });
  app.post<RoomRequest>('/api/rooms/:code/account/resume',{schema:{body:bodySchema({participantId:{type:'string',maxLength:100}},['participantId'])}},async(request,reply)=>{
    const account=accounts.get(request);if(!account)return reply.code(401).send({error:'请先登录账号'});
    const result=await runtime.execute(rooms=>{
      const room=rooms.find(request.params.code),participant=room.participants.find(value=>!value.left&&value.accountId===account.sub&&value.id===request.body.participantId);
      if(!participant)throw Error('座位授权不匹配');
      rooms.syncAccountProfile(room,participant,account);
      const token=accountToken(account.sub,room.code,participant.id);if(participant.tokenHash!==hashOpaqueToken(token))revokeJoinTicket(room,participant.id);participant.tokenHash=hashOpaqueToken(token);if(room.organizerParticipantId===participant.id)room.organizerTokenHash=participant.tokenHash;room.revision++;
      return{id:participant.id,mode:participant.mode,code:room.code,token};
    });
    reply.setCookie(result.mode==='PLAYER'?'ravens_player':'ravens_display',result.token,cookieOptions(roomPath(result.code)));return{id:result.id,mode:result.mode,code:result.code,self:runtime.service.self(result.code,result.token,account.sub)};
  });
  const signPreview=(sub:string,payload:string)=>createHmac('sha256',accountKey).update(JSON.stringify(['guest-claim',sub,payload])).digest('hex');
  app.post<RoomRequest>('/api/rooms/:code/account/guest-preview',{schema:{body:bodySchema({})}},async(request,reply)=>{
    const account=accounts.get(request);if(!account)return reply.code(401).send({error:'请先登录账号'});
    if(runtime.service.accountClaim(account.sub))throw Error('本账号在鸦钟夜话的游客认领机会已使用');
    if(runtime.service.accountRooms(account.sub).length)throw Error('账号已有房间，不能覆盖');
    const token=participantToken(request,undefined,'PLAYER'),room=runtime.service.find(request.params.code),participant=member(room,token,'PLAYER');
    if(participant.accountId)throw Error('此座位已经归属账号');
    const payload=Buffer.from(JSON.stringify({code:room.code,id:participant.id,revision:room.revision,expires:now()+30*60_000})).toString('base64url');
    return{previewToken:payload+'.'+signPreview(account.sub,payload),code:room.code,nickname:participant.nickname,seat:participant.seat,consumesOpportunity:false,self:runtime.service.self(room.code,token)};
  });
  app.post<RoomRequest>('/api/rooms/:code/account/guest-claim',{schema:{body:bodySchema({previewToken:{type:'string',maxLength:2000},confirm:{const:true}},['previewToken','confirm'])}},async(request,reply)=>{
    const account=accounts.get(request);if(!account)return reply.code(401).send({error:'请先登录账号'});
    const raw=request.body.previewToken as string,[payload,signature,...extra]=raw.split('.');
    if(!payload||!signature||extra.length||!secureEqual(signPreview(account.sub,payload),signature))throw Error('预览无效，请重新预览');
    const preview=JSON.parse(Buffer.from(payload,'base64url').toString()) as {code:string;id:string;revision:number;expires:number};
    if(preview.code!==request.params.code.toUpperCase()||preview.expires<=now())throw Error('预览已过期，请重新预览');
    const result=await runtime.execute(rooms=>{
      const old=rooms.accountClaim(account.sub);if(old){if(old.previewHash===hashOpaqueToken(raw))return{code:old.roomId,id:old.participantId};throw Error('本账号在鸦钟夜话的游客认领机会已使用');}
      const room=rooms.find(preview.code),token=participantToken(request,undefined,'PLAYER'),participant=member(room,token,'PLAYER');
      if(preview.revision!==room.revision||preview.id!==participant.id)throw Error('房间已变化，请重新预览');
      rooms.claimAccount(room.code,token,account.sub,hashOpaqueToken(raw),accountToken(account.sub,room.code,participant.id));return{code:room.code,id:participant.id};
    });
    const token=accountToken(account.sub,result.code,result.id);
    const self=runtime.service.self(result.code,token,account.sub);
    reply.setCookie('ravens_player',token,cookieOptions(roomPath(result.code)));return{claimed:true,...result,self};
  });
  app.post<{ Body: { accessPassword: string } }>("/api/auth/login", { schema: { body: bodySchema({ accessPassword: { type: "string", maxLength: 1024 } }, ["accessPassword"]) } }, async (request, reply) => {
    if (accessPassword && !secureEqual(request.body.accessPassword, accessPassword)) return reply.code(401).send({ error: "访问口令不正确" });
    reply.setCookie("ravens_access", "authorized", { ...cookieOptions("/"), maxAge: 30 * 24 * 60 * 60 });
    return { authorized: true };
  });
  app.get<RoomRequest>("/api/rooms/:code/result", async request => {
    const token = participantToken(request, request.query.token);
    const self = runtime.service.self(request.params.code, token, accounts.get(request)?.sub);
    return { result: runtime.service.find(request.params.code).lastResult ?? null, self };
  });
  const privateView = (rooms: RoomService, code: string, token: string) => ({ ...rooms.privateView(code, token), room: publicView(rooms, code, token, rooms.find(code).participants.find(p => p.tokenHash === hashOpaqueToken(token))?.accountId), ...socialView(rooms.find(code), token) });
  const publicView = (rooms: RoomService, code: string, token: string, accountId?: string) => ({ ...rooms.publicView(code), self: rooms.self(code, token, accountId) });
  function receipt(request: FastifyRequest<RoomRequest>, token: string) {
    const id = request.headers["x-command-id"];
    if (typeof id !== "string" || !/^[\w-]{8,128}$/.test(id)) throw new RoomError("COMMAND_ID_REQUIRED", "请求缺少操作编号，请刷新", 400);
    const accountId = accounts.get(request)?.sub;
    return { code: request.params.code, id, actor: token, fingerprint: createHash("sha256").update(`${request.method}:${request.url}:${JSON.stringify(request.body ?? {})}`).digest("hex"),
      context: request.body as unknown as RoomCommandContext, ...(accountId ? { accountId } : {}) };
  }
  const creationRate=(key:string)=>{const old=attempts.get('create:'+key),entry=old&&old.reset>now()?old:{count:0,reset:now()+60000};entry.count++;attempts.set('create:'+key,entry);if(entry.count>10)throw new RoomError('CREATE_RATE_LIMIT','创建操作过于频繁，请稍后再试',429);};
  app.get('/api/room-create-ticket',async(request,reply)=>{
    const account=accounts.get(request);let context=signedCookie(request,'ravens_create_context');if(!context){context=randomBytes(32).toString('base64url');reply.setCookie('ravens_create_context',context,{...cookieOptions('/'),sameSite:'lax'});}
    const kind=account?'ACCOUNT' as const:'GUEST' as const,owner=creationOwner(sessionSecret,kind,account?.sub??context);creationRate(owner);return issueCreationTicket(sessionSecret,kind,owner,now());
  });
  app.post<{Body:{playerCount:number;organizerName:string;creationVersion?:2;playMode?:RoomPlayMode;voiceRoomUrl?:string;createTicket:string}}>('/api/rooms',{schema:{body:bodySchema({creationVersion:{const:2},playerCount:{type:'integer',minimum:5,maximum:12},organizerName:{type:'string',minLength:1,maxLength:24},playMode:{enum:['IN_PERSON','REMOTE','HYBRID']},voiceRoomUrl:{type:'string',maxLength:2048},createTicket:{type:'string',maxLength:2000}},['playerCount','organizerName','createTicket'])}},async(request,reply)=>{
    const ticket=parseCreationTicket(sessionSecret,request.body.createTicket),id=request.headers['x-command-id'];if(typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id))throw new RoomError('COMMAND_ID_REQUIRED','缺少创建操作编号',400);
    const account=accounts.get(request),guestContext=signedCookie(request,'ravens_create_context'),key=creationKey(sessionSecret,ticket.actorDigest,id);
    const name=request.body.organizerName.trim(),mode=request.body.playMode??'IN_PERSON',voice=request.body.creationVersion===2?request.body.voiceRoomUrl?.trim()||undefined:mode==='IN_PERSON'?undefined:request.body.voiceRoomUrl?.trim()||undefined;
    if(request.body.creationVersion===2&&request.body.playMode!==undefined)throw new RoomError('INVALID_REQUEST','统一创建不接受房间模式',400);
    if(!name||/[\u0000-\u001f\u007f]/.test(name))throw new RoomError('INVALID_REQUEST','昵称请输入1至24个字符',400);
    const fingerprint=createHash('sha256').update(JSON.stringify(request.body.creationVersion===2?[2,request.body.playerCount,name,voice??null]:[request.body.playerCount,name,mode,voice??null])).digest('hex');
    const result=await runtime.execute(rooms=>{
      const prior=rooms.creationRequest(key),owner=ticket.actorKind==='ACCOUNT'?account?creationOwner(sessionSecret,'ACCOUNT',account.sub):undefined:guestContext?creationOwner(sessionSecret,'GUEST',guestContext):undefined;
      if(ticket.actorKind==='ACCOUNT'&&owner!==ticket.actorDigest)throw new RoomError('CREATION_OWNER_CHANGED','登录身份已变化，请重新创建',403);
      if(prior){
        if(prior.payload.actorKind!==ticket.actorKind||prior.actorDigest!==ticket.actorDigest)throw new RoomError('CREATION_OWNER_CHANGED','创建身份已变化',403);
        if(prior.fingerprint!==fingerprint)throw new RoomError('CREATION_ID_REUSED','同一创建操作不能修改参数');
        if(prior.expiresAt<=now())throw new RoomError('CREATE_TICKET_EXPIRED','创建恢复凭据已过期',410);
        let room;try{room=rooms.find(prior.payload.code);}catch{throw new RoomError('CREATED_ROOM_GONE','原房间已结束，请重新创建',410);}
        if(room.roomInstanceId!==prior.payload.roomInstanceId)throw new RoomError('CREATED_ROOM_GONE','原房间已结束',410);
        return{code:room.code,organizerToken:creationOrganizer(sessionSecret,key,room.roomInstanceId),creationId:id};
      }
      if(owner!==ticket.actorDigest||ticket.actorKind!==(account?'ACCOUNT':'GUEST'))throw new RoomError('CREATE_CONTEXT_CHANGED','创建身份已变化，请重新发起创建');
      if(ticket.expiresAt<=now())throw new RoomError('CREATE_TICKET_EXPIRED','创建凭据已过期，请重新创建',410);
      creationRate(ticket.actorDigest);
      const created=rooms.create(request.body.playerCount,name,mode,voice),room=rooms.find(created.room.code),organizerToken=creationOrganizer(sessionSecret,key,room.roomInstanceId);room.organizerTokenHash=hashOpaqueToken(organizerToken);room.metadata={...room.metadata,creationKey:key};if(account)room.organizerAccountId=account.sub;
      rooms.putCreationRequest({key,actorDigest:ticket.actorDigest,fingerprint,payload:{actorKind:ticket.actorKind,code:room.code,roomInstanceId:room.roomInstanceId,createdAt:now()},expiresAt:now()+86400000});
      return{code:room.code,organizerToken,creationId:id};
    });
    reply.setCookie('ravens_organizer',result.organizerToken,cookieOptions(roomPath(result.code)));if(guestContext)reply.setCookie('ravens_create_context',guestContext,{...cookieOptions('/'),sameSite:'lax'});return reply.code(201).send(result);
  });
  app.get<RoomRequest>('/api/rooms/:code/summary',async request=>{const room=runtime.service.find(request.params.code),roster=activePlayers(room),canJoin=room.state==='LOBBY'&&(roster.length<room.playerCount||bots(room).length>0);return{code:room.code,roomInstanceId:room.roomInstanceId,state:room.state,playerCount:room.playerCount,activeHumanCount:humans(room).length,botCount:bots(room).length,occupiedAvatars:[...new Set(roster.flatMap(p=>p.avatarSnapshot?[avatarSelectionUrl(p.avatarSnapshot)]:[]))],canJoin,willReplaceBot:canJoin&&roster.length===room.playerCount};});
  const expectedControlVersion={type:'integer',minimum:0};
  function control(path:string,properties:Record<string,unknown>,required:string[],bindGame:boolean,apply:(rooms:RoomService,code:string,token:string,body:Record<string,unknown>)=>ControlResult){
    app.post<RoomRequest>(`/api/rooms/:code/${path}`,{schema:{body:bodySchema({...roomCommandProperties,expectedControlVersion,...properties},[...roomCommandRequired,'expectedControlVersion',...required])}},async request=>{
      const token=organizerCredential(request,request.body.token as string|undefined);
      const controlResult=await runtime.execute(rooms=>{rooms.validateControlCommand(request.params.code,token,request.body as unknown as RoomCommandContext,request.body.expectedControlVersion as number,bindGame,accounts.get(request)?.sub);return apply(rooms,request.params.code,token,request.body);},{...receipt(request,token),requireHost:true,resultKind:'result'});
      return{...privateView(runtime.service,request.params.code,token),controlResult};
    });
  }
  control('bots',{count:{type:'integer',minimum:1,maximum:11},fill:{const:true},clear:{const:true}},[],false,(rooms,code,token,body)=>rooms.changeBots(code,token,body));
  control('bots/control',{autoNominate:{type:'boolean'},mode:{enum:['RUNNING','PAUSED']},pace:{enum:['NORMAL','SLOW']}},[],false,(rooms,code,token,body)=>rooms.changeBotControl(code,token,body.mode as 'RUNNING'|'PAUSED'|undefined,body.pace as 'NORMAL'|'SLOW'|undefined,body.autoNominate as boolean|undefined));
  control('bots/step',{},[],true,(rooms,code,token)=>stepBot(rooms,code,token));
  control('bots/command',{command:{enum:['END_DAY','NOMINATE_ONCE','SHOOT_ONCE']},targetSeat:{type:'integer',minimum:1,maximum:12}},['command'],true,(rooms,code,token,body)=>runBotCommand(rooms,code,token,body.command as import('@ravens/contracts').BotTestCommand,body.targetSeat as number|undefined));
  control('rehearsal/role',{roleId:{anyOf:[{type:'string',minLength:1,maxLength:50},{type:'null'}]}},['roleId'],false,(rooms,code,token,body)=>rooms.changeRehearsalRole(code,token,body.roleId as string|null));
  control('rehearsal/clock',{mode:{enum:['MANUAL','WALL']}},['mode'],false,(rooms,code,token,body)=>rooms.changeRehearsalClock(code,token,body.mode as 'MANUAL'|'WALL'));
  control('rehearsal/advance',{},[],true,(rooms,code,token)=>rooms.advanceRehearsal(code,token));
  app.get<RoomRequest>("/api/rooms/:code/join-ticket", async request => {
    const mode = request.query.mode;
    if (mode !== "PLAYER" && mode !== "DISPLAY") throw new RoomError("INVALID_MODE", "请选择玩家或大屏", 400);
    return issueJoinTicket(runtime.service.find(request.params.code), mode, now(), sessionSecret);
  });
  app.post<RoomRequest>('/api/rooms/:code/switch-ticket',{schema:{body:bodySchema({sourceRoomInstanceId:{type:'string',minLength:1,maxLength:100},targetCode:{type:'string',pattern:'^[A-Z2-9]{6}$'},targetRoomInstanceId:{type:'string',minLength:1,maxLength:100}},['sourceRoomInstanceId','targetCode','targetRoomInstanceId'])}},async request=>{
    const token=participantToken(request,undefined,'PLAYER'),account=accounts.get(request);
    const source=runtime.service.find(request.params.code);
    runtime.service.self(source.code,token,account?.sub);
    if(source.roomInstanceId!==request.body.sourceRoomInstanceId)throw new RoomError('ROOM_INSTANCE_CHANGED','原房间已变化，请重新确认');
    const host=runtime.service.assertHost(source.code,token);
    if(host.mode!=='PLAYER'||host.controller!=='HUMAN')throw new RoomError('HOST_REQUIRED','只有当前玩家房主可以关闭旧房间',403);
    const target=runtime.service.find(request.body.targetCode as string);
    if(target.code===source.code)throw new RoomError('SAME_ROOM','已经在这个房间，无需换房',400);
    if(target.roomInstanceId!==request.body.targetRoomInstanceId)throw new RoomError('ROOM_INSTANCE_CHANGED','目标房间已变化，请重新打开邀请');
    return issueSwitchTicket(sessionSecret,source,host,target,account?.sub,now());
  });
  app.post<RoomRequest>("/api/rooms/:code/join", { schema: { body: bodySchema({ switchTicket:{type:'string',minLength:20,maxLength:2000}, avatar:{anyOf:[{type:"string",maxLength:200},{type:"null"}]}, expectedProfileRevision:{type:"integer",minimum:0}, nickname: { type: "string", minLength: 1, maxLength: 24 }, mode: { enum: ["PLAYER", "DISPLAY"] }, joinTicket: { type: "string", minLength: 20, maxLength: 2000 } }, ["nickname", "mode", "joinTicket"]) } }, async (request, reply) => {
    const mode = request.body.mode as ParticipantMode;
    const result = await runtime.execute((rooms) => {
      const account = accounts.get(request), room = rooms.find(request.params.code);
      const rawSwitch=request.body.switchTicket as string|undefined;
      if(rawSwitch&&mode!=='PLAYER')throw new RoomError('INVALID_MODE','换房关闭只适用于手机玩家',400);
      const transfer=rawSwitch?parseSwitchTicket(sessionSecret,rawSwitch):undefined;
      const joinBearer=transfer?parseJoinTicket(request.body.joinTicket as string,room,mode,sessionSecret):undefined;
      const key=rawSwitch?transferKey(rawSwitch,request.body.joinTicket as string):undefined;
      const fingerprint=createHash('sha256').update(JSON.stringify([request.body.nickname,mode,request.body.avatar??null,request.body.expectedProfileRevision??null,request.body.joinTicket,rawSwitch??null])).digest('hex');
      if(transfer){
        if(transfer.targetCode!==room.code||transfer.targetInstance!==room.roomInstanceId)throw new RoomError('ROOM_INSTANCE_CHANGED','目标房间已变化，请重新打开邀请');
        if(transfer.actorDigest!==switchActorDigest(sessionSecret,account?.sub))throw new RoomError('ACCOUNT_MISMATCH','登录身份已变化，请重新确认换房',403);
        const prior=transferReceipts(room)[key!];
        if(prior&&prior.expiresAt>now()){
          if(prior.fingerprint!==fingerprint)throw new RoomError('COMMAND_ID_REUSED','同一次换房不能修改资料或目标');
          const participant=room.participants.find(p=>p.id===prior.participantId&&!p.left&&p.mode==='PLAYER'&&p.controller==='HUMAN');
          if(!participant||participant.tokenHash!==prior.targetCredentialHash||prior.targetInstance!==room.roomInstanceId||prior.sourceCode!==transfer.sourceCode||prior.sourceInstance!==transfer.sourceInstance||prior.sourceActorHash!==hashOpaqueToken(transfer.hostHash))throw new RoomError('SEAT_REMOVED','原目标座位已失效，请恢复座位',403);
          let token:string|undefined;
          if(prior.credentialKind==='ACCOUNT'){
            if(!account||account.sub!==prior.accountId||participant.accountId!==account.sub)throw new RoomError('ACCOUNT_MISMATCH','账号与目标座位不匹配',403);
            token=accountToken(account.sub,room.code,participant.id);
          }else{
            if(participant.accountId)throw new RoomError('SEAT_REMOVED','原游客凭据已失效，请恢复座位',403);
            token=prior.credentialKind==='EXISTING_GUEST_COOKIE'?optionalToken(request,'PLAYER'):joinBearer!.token;
            if(prior.credentialKind==='NEW_GUEST_TICKET'&&((room.metadata?.revokedJoinTickets as Record<string,number>|undefined)?.[joinBearer!.hash]??0)>now())throw new RoomError('SEAT_REMOVED','原加入凭据已撤销，请恢复座位',403);
          }
          if(!token||hashOpaqueToken(token)!==participant.tokenHash)throw new RoomError('SEAT_REMOVED','原目标座位凭据已失效，请恢复座位',403);
          return{participant,token,closedRoomCode:prior.sourceCode};
        }
      }
      const source=transfer?validateSwitchSource(rooms,transfer,sessionSecret,account?.sub,now()):undefined;
      const retained=transfer?availableTransferReceipts(room,now()):undefined;
      let existingGuestCookie=false;
      const joinTarget=()=>{
      const cookie = optionalToken(request, mode);
      const existing = cookie ? room.participants.find(p => !p.left && p.mode === mode && p.tokenHash === hashOpaqueToken(cookie)) : undefined;
      if (existing) {
        existingGuestCookie=!existing.accountId;
        if(existing.controller==='BOT')throw new RoomError('BOT_EXTERNAL_ACCESS','人机座位不支持外部访问',403);
        rooms.self(room.code, cookie!, account?.sub);
        if (account) rooms.syncAccountProfile(room,existing,account);
        return { participant: existing, token: cookie! };
      }
      const accountSeat = account ? room.participants.find(p => !p.left && p.mode === mode && p.accountId === account.sub) : undefined;
      if (accountSeat && account) {
        const token = accountToken(account.sub, room.code, accountSeat.id);
        if (accountSeat.tokenHash !== hashOpaqueToken(token)) revokeJoinTicket(room, accountSeat.id);
        accountSeat.tokenHash = hashOpaqueToken(token);
        rooms.syncAccountProfile(room,accountSeat,account);
        if (room.organizerParticipantId === accountSeat.id) room.organizerTokenHash = accountSeat.tokenHash;
        room.revision++;
        return { participant: accountSeat, token };
      }
      const ticket = validateJoinTicket(request.body.joinTicket as string, room, mode, now(), sessionSecret);
      const used = room.participants.find(p => p.joinTicket?.hash === ticket.hash);
      if (used) {
        if (used.left || used.tokenHash !== used.joinTicket!.credentialHash || (used.accountId && used.accountId !== account?.sub)) throw new RoomError("JOIN_TICKET_REVOKED", "原加入凭据已失效，请恢复原座位");
        const token = used.accountId ? accountToken(used.accountId, room.code, used.id) : ticket.token;
        if (used.tokenHash !== hashOpaqueToken(token)) throw new RoomError("JOIN_TICKET_REVOKED", "原加入凭据已失效，请恢复原座位");
        return { participant: used, token };
      }
      if (ticket.setupId !== room.setupId) throw new RoomError("SETUP_CHANGED", "人数或座序已变化，请重新加入");
      if(mode==='PLAYER'&&account&&request.body.expectedProfileRevision!==undefined){
        const profile=profileView(account,rooms.accountProfile(account.sub));
        if(profile.revision!==request.body.expectedProfileRevision||profile.nickname!==request.body.nickname||profile.avatar!==request.body.avatar)throw new RoomError('PROFILE_STALE','资料已更新，请确认后继续加入',409,false,{joinTicketConsumed:false,profile});
      }
      if(!account&&request.body.expectedProfileRevision!==undefined)throw new RoomError('INVALID_REQUEST','资料版本仅适用于账号',400);
      const guestAvatar=mode==='PLAYER'&&!account&&request.body.avatar!==undefined?trustedAvatar(request.body.avatar):undefined;
      if(mode==='PLAYER'&&!account&&request.body.avatar!==undefined&&!guestAvatar)throw new RoomError('INVALID_PROFILE','请选择可用头像',400);
      if(typeof request.body.nickname!=='string'||!request.body.nickname.trim()||/[\u0000-\u001f\u007f]/.test(request.body.nickname))throw new RoomError('INVALID_PROFILE','请输入有效昵称',400);
      assertJoinCapacity(room, now());
      const result = rooms.join(room.code,mode==='DISPLAY'?'公共大屏':account?rooms.accountProfile(account.sub)?.nickname??request.body.nickname as string:request.body.nickname as string,mode,mode==='PLAYER'?(account?profileView(account,rooms.accountProfile(account.sub)).avatar??undefined:guestAvatar):undefined);
      const participant = room.participants.find(p => p.id === result.participant.id)!;
      const token = account ? accountToken(account.sub, room.code, participant.id) : ticket.token;
      if (account) rooms.bindAccount(room.code, result.token, account.sub, token);
      participant.tokenHash = hashOpaqueToken(token);

      if (account) rooms.syncAccountProfile(room,participant,account);
      participant.joinTicket = { hash: ticket.hash, expiresAt: ticket.expiresAt, credentialHash: participant.tokenHash };
      if (room.organizerParticipantId === participant.id) room.organizerTokenHash = participant.tokenHash;
      return { participant, token };

      };
      const joined=joinTarget();
      if(transfer&&source){
        // The target recovery/new-seat path succeeded. Both changes are still staged:
        // a commit failure publishes neither the join nor the source deletion.
        const receipt:JoinTransferReceipt={sourceCode:source.source.code,sourceInstance:source.source.roomInstanceId,targetInstance:room.roomInstanceId,sourceActorHash:hashOpaqueToken(transfer.hostHash),participantId:joined.participant.id,credentialKind:joined.participant.accountId?'ACCOUNT':existingGuestCookie?'EXISTING_GUEST_COOKIE':'NEW_GUEST_TICKET',targetCredentialHash:joined.participant.tokenHash,...(joined.participant.accountId?{accountId:joined.participant.accountId}:{}),fingerprint,expiresAt:now()+TRANSFER_RECEIPT_MS};
        rooms.closeForSwitch(source.source.code,transfer.sourceInstance,transfer.hostId,transfer.hostHash,source.host.accountId);
        room.metadata={...room.metadata,joinTransfers:{...retained,[key!]:receipt}};room.revision++;
        return{...joined,closedRoomCode:source.source.code};
      }
      return{...joined,closedRoomCode:undefined};
    });
    reply.setCookie(mode === "DISPLAY" ? "ravens_display" : "ravens_player", result.token, cookieOptions(roomPath(request.params.code)));
    if(result.closedRoomCode){reply.clearCookie('ravens_player',{path:roomPath(result.closedRoomCode)});reply.clearCookie('ravens_organizer',{path:roomPath(result.closedRoomCode)});}
    return reply.code(201).send({ id: result.participant.id, nickname: result.participant.nickname, mode, ...(result.participant.seat ? { seat: result.participant.seat } : {}), token: result.token,...(result.closedRoomCode?{closedRoomCode:result.closedRoomCode}:{}), self: runtime.service.self(request.params.code, result.token, accounts.get(request)?.sub) });
  });
  app.delete<RoomRequest>("/api/rooms/:code/leave", { schema: { body: bodySchema(roomCommandProperties, roomCommandRequired) } }, async (request, reply) => {
    const token = participantToken(request, request.body?.token as string | undefined);
    const participant = member(runtime.service.find(request.params.code), token);
    const result = await runtime.execute((rooms) => {
      rooms.validateCommand(request.params.code, token, request.body as unknown as RoomCommandContext, "ROOM", accounts.get(request)?.sub);
      return rooms.leave(request.params.code, token);
    }, { ...receipt(request, token), resultKind: "result" });
    reply.clearCookie(participant.mode === "DISPLAY" ? "ravens_display" : "ravens_player", { path: roomPath(request.params.code) });
    if (participant.mode === "PLAYER") reply.clearCookie("ravens_organizer", { path: roomPath(request.params.code) });
    return { left: true, ...result, self: null };
  });
  app.get<RoomRequest>("/api/rooms/:code", async (request) => {
    const token = optionalToken(request);
    if (token) {
      assertToken(request,token);
      runtime.service.self(request.params.code, token, accounts.get(request)?.sub);
      await runtime.execute(stage => {
        stage.self(request.params.code, token, accounts.get(request)?.sub);
        stage.pulse(request.params.code, token, now());
      });
      return publicView(runtime.service, request.params.code, token, accounts.get(request)?.sub);
    }
    return runtime.service.publicView(request.params.code);
  });
  app.get<RoomRequest>("/api/rooms/:code/me", async (request) => {
    const token = participantToken(request, request.query.token, "PLAYER");
    member(runtime.service.find(request.params.code), token, "PLAYER");
    try { await runtime.execute((rooms) => rooms.pulse(request.params.code, token, now())); }
    catch (error) { if (!(error instanceof PersistenceUnavailableError)) throw error; }
    return privateView(runtime.service, request.params.code, token);
  });
  // UI receipts are independent from the gameplay command version/ballot queue.
  app.post<RoomRequest>('/api/rooms/:code/presentations/ack',{schema:{body:bodySchema({
    roomInstanceId:roomCommandProperties.roomInstanceId,gameId:roomCommandProperties.gameId,
    entries:{type:'array',minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,required:['historySeq','disposition'],properties:{historySeq:{type:'integer',minimum:1},disposition:{enum:['COMPLETE','SKIP']}}}},
  },['roomInstanceId','gameId','entries'])}},async request=>{
    const token=participantToken(request,request.body?.token as string|undefined,'PLAYER');
    member(runtime.service.find(request.params.code),token,'PLAYER');
    return runtime.execute(rooms=>rooms.acknowledgePresentations(request.params.code,token,request.body as unknown as PresentationAckRequest));
  });
  function command(path: string, properties: Record<string, unknown>, required: string[], change: (rooms: RoomService, code: string, token: string, body: Record<string, unknown>, request: FastifyRequest<RoomRequest>) => unknown, view: "public" | "private" | "result" | "profile" = "private", organizer = false, scope: "ROOM" | "GAME" | "BALLOT" | "OPTIONAL_GAME" = "ROOM") {
    if (["vote", "nomination/cancel", "nomination/defense/complete"].includes(path)) scope = "BALLOT";
    else if (["role/confirm", "action", "nominate", "day/ready", "day/ability", "resume", "first-night-info/ack"].includes(path)) scope = "GAME";
    else if (path.startsWith("whispers")) scope = "OPTIONAL_GAME";
    app.post<RoomRequest>(`/api/rooms/:code/${path}`, { schema: { body: bodySchema({ ...roomCommandProperties, ...properties }, [...roomCommandRequired, ...required]) } }, async (request) => {
      const token = organizer ? organizerCredential(request, (request.body?.organizerToken ?? request.body?.token) as string | undefined) : participantToken(request, request.body?.token as string | undefined);
      const result = await runtime.execute((rooms) => {
        rooms.validateCommand(request.params.code, token, request.body as unknown as RoomCommandContext, scope, accounts.get(request)?.sub);
        const result = change(rooms, request.params.code, token, request.body ?? {}, request);
        return ["result","profile"].includes(view) ? result : undefined;
      }, { ...receipt(request, token), resultKind: ["result","profile"].includes(view) ? "result" : "view" });
      // Retried mutations are idempotent, but their response must not rewind the client.
      return view === "profile" ? {...privateView(runtime.service,request.params.code,token),...result as object} : view === "result" ? { ...result as object, self: runtime.service.self(request.params.code, token, accounts.get(request)?.sub) } : view === "public" ? publicView(runtime.service, request.params.code, token, accounts.get(request)?.sub) : privateView(runtime.service, request.params.code, token);
    });
  }
  command("start", { tutorialMode: { enum: ["SKIP", "OPTIONAL"] }, markHostReady: { type: "boolean" } }, [], (rooms, code, token, body) => rooms.startTutorial(code, token, body.tutorialMode as "SKIP" | "OPTIONAL" ?? "SKIP", body.markHostReady === true), "public", true);
  command("reset", {}, [], (rooms, code, token) => {
    rooms.reset(code, token);
    const room = rooms.find(code);
    if (room.metadata) delete room.metadata.social;
  }, "public", true, "OPTIONAL_GAME");
  command("tutorial/cancel", {}, [], (rooms, code, token) => rooms.cancelTutorial(code, token), "public", true);
  command("participants/:id/remove", { confirm: { const: true }, cancelTutorial: { type: "boolean" } }, ["confirm"], (rooms, code, token, body, request) => rooms.removeParticipant(code, token, request.params.id!, body.cancelTutorial === true), "public", true);
  command("abort", { confirm: { const: true } }, ["confirm"], (rooms, code, token) => rooms.abort(code, token), "private", true, "GAME");
  command("reopen", { confirm: { const: true } }, ["confirm"], (rooms, code, token) => rooms.reopen(code, token), "public", true, "OPTIONAL_GAME");
  command("host/claim", { expectedOrganizerId: { type: "string", maxLength: 100 } }, ["expectedOrganizerId"], (rooms, code, token, body) => rooms.claimHost(code, token, body.expectedOrganizerId as string), "public");
  command("seats", { participantIds: { type: "array", items: { type: "string" }, maxItems: 12, uniqueItems: true } }, ["participantIds"], (rooms, code, token, body) => rooms.reorderSeats(code, token, body.participantIds as string[]), "public");
  command("ready", { ready: { type: "boolean" } }, ["ready"], (rooms, code, token, body) => rooms.setReady(code, token, body.ready as boolean), "public");
  command("resume", {}, [], (rooms, code, token) => rooms.resume(code, token));
  command("tutorial/complete", {}, [], (rooms, code, token) => rooms.completeTutorial(code, token), "public");
  command("role/confirm", {}, [], (rooms, code, token) => rooms.confirmRole(code, token));
  command('first-night-info/ack',{infoId:{type:'string',pattern:'^[a-fA-F0-9-]{36}$'}},['infoId'],(rooms,code,token,body)=>rooms.acknowledgeStartInfo(code,token,body.infoId as string));
  command('profile',{nickname:{type:'string',minLength:1,maxLength:24},avatar:{type:'string',maxLength:200}},['nickname','avatar'],(rooms,code,token,body)=>rooms.updateGuestProfile(code,token,body.nickname as string,body.avatar as string),'profile');
  command("action", { targetSeats: { type: "array", items: { type: "integer", minimum: 1, maximum: 12 }, maxItems: 2, uniqueItems: true } }, ["targetSeats"], (rooms, code, token, body) => rooms.submitAction(code, token, body.targetSeats as number[]));
  command("nominate", { nomineeSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["nomineeSeat"], (rooms, code, token, body) => rooms.nominate(code, token, body.nomineeSeat as number));
  command("nomination/cancel", {}, [], (rooms, code, token) => rooms.cancelNomination(code, token));
  command("nomination/defense/complete", {}, [], (rooms, code, token) => rooms.finishDefense(code, token));
  command("vote", { raised: { type: "boolean" } }, ["raised"], (rooms, code, token, body) => rooms.vote(code, token, body.raised as boolean));
  command("day/ready", { ready: { type: "boolean" } }, ["ready"], (rooms, code, token, body) => rooms.readyToEndDay(code, token, body.ready as boolean));
  command("day/ability", { targetSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["targetSeat"], (rooms, code, token, body) => rooms.useDayAbility(code, token, body.targetSeat as number));
  command("whispers", { targetSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["targetSeat"], (rooms, code, token, body) => inviteWhisper(rooms.find(code), token, body.targetSeat as number));
  command("whispers/:id/respond", { accept: { type: "boolean" } }, ["accept"], (rooms, code, token, body, request) => respondWhisper(rooms.find(code), token, request.params.id!, body.accept as boolean));
  command("whispers/leave", {}, [], (rooms, code, token) => leaveWhisper(rooms.find(code), token));
  command("whispers/:id/messages", { text: { ...string, minLength: 1 } }, ["text"], (rooms, code, token, body, request) => sendWhisper(rooms.find(code), token, request.params.id!, body.text as string));
  command("recovery", {}, [], (rooms, code, token) => createRecovery(rooms.find(code), token, now()), "result");
  app.post<RoomRequest>("/api/rooms/:code/recover", { schema: { body: bodySchema({ recoveryCode: { type: "string", minLength: 20, maxLength: 128 } }, ["recoveryCode"]) } }, async (request, reply) => {
    const commandId = request.headers["x-command-id"];
    const retryId = typeof commandId === "string" && /^[\w-]{8,128}$/.test(commandId) ? commandId : undefined;
    const result = await runtime.execute((rooms) => recoverMembership(rooms, request.params.code, request.body.recoveryCode as string, retryId,accounts.get(request)?.sub,now()));
    reply.setCookie("ravens_player", result.token, cookieOptions(roomPath(request.params.code)));
    return { ...result, self: runtime.service.self(request.params.code, result.token, accounts.get(request)?.sub) };
  });

  void app.register(async (scope) => {
    scope.get<{ Params: { code: string }; Querystring: { mode?: string;protocol?:string } }>("/api/rooms/:code/live", { websocket: true }, (socket, request) => {
      if(request.query.protocol!=="6"){socket.close(1008,"Client upgrade required");return;}
      const mode = request.query.mode === "DISPLAY" ? "DISPLAY" : "PLAYER";
      let token: string;
      try { token = participantToken(request, undefined, mode); member(runtime.service.find(request.params.code), token, mode); }
      catch { socket.close(1008, "Session unavailable"); return; }
      const publish = async () => {
        if (socket.readyState !== 1) return;
        try {
          accounts.set(request,await resolveAccount(request.headers.cookie));assertToken(request,token);
          member(runtime.service.find(request.params.code), token, mode);
          socket.send(JSON.stringify({ type: "view", room: publicView(runtime.service, request.params.code, token, accounts.get(request)?.sub), ...(mode === "PLAYER" ? { privateView: privateView(runtime.service, request.params.code, token) } : {}), serverNow: now() }));
        } catch (error) { socket.close(error instanceof RoomError && error.status >= 500 ? 1013 : 1008, "Room or session unavailable"); }
      };
      const unsubscribe = runtime.subscribe((codes) => { if (codes.includes(request.params.code.toUpperCase())) void publish(); });
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
      socket.on("message", (message: { toString(): string }) => {
        if (message.toString() !== "ping") return;
        void resolveAccount(request.headers.cookie).then(account=>{accounts.set(request,account);assertToken(request,token);return runtime.execute((rooms) => rooms.pulse(request.params.code, token, now()));}).then(publish).catch(error => socket.close(error instanceof PersistenceUnavailableError || error instanceof RoomError && error.status >= 500 ? 1013 : 1008, "Session unavailable"));
      });
      publish();
    });
  });
  if (process.env.STATIC_DIR) app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  return app;
}

function secureEqual(left: string, right: string): boolean { return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest()); }
function roomPath(code: string): string { return `/api/rooms/${code.toUpperCase()}`; }
function cookieOptions(path: string) { return { httpOnly: true, signed: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path, maxAge: 24 * 60 * 60 }; }
function signedCookie(request: FastifyRequest, name: string): string | undefined { const value = request.cookies[name]; if (!value) return undefined; const unsigned = request.unsignCookie(value); return unsigned.valid ? unsigned.value : undefined; }
function optionalToken(request: FastifyRequest, mode?: ParticipantMode): string | undefined {
  const requested = mode ?? (request.headers["x-room-mode"] === "DISPLAY" ? "DISPLAY" : undefined);
  if (requested === "DISPLAY") return signedCookie(request, "ravens_display");
  if (requested === "PLAYER") return signedCookie(request, "ravens_player");
  return signedCookie(request, "ravens_player") ?? signedCookie(request, "ravens_display");
}
function participantToken(request: FastifyRequest, fallback?: string, mode?: ParticipantMode): string { const token = optionalToken(request, mode) ?? fallback; if (!token) throw new Error("Player session is missing"); return token; }
function organizerCredential(request: FastifyRequest, fallback?: string): string { return signedCookie(request, "ravens_player") ?? signedCookie(request, "ravens_organizer") ?? fallback ?? ""; }
