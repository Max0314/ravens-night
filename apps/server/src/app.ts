import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { RoomService, type ParticipantMode, type RoomPlayMode } from "./rooms/service.js";
import { PostgresRoomRepository } from "./db/room-repository.js";
import { LiveRoomRuntime, PersistenceUnavailableError, type RoomRepository } from "./game/live-runtime.js";
import { createRecovery, inviteWhisper, leaveWhisper, member, recoverMembership, respondWhisper, sendWhisper, socialView } from "./rooms/social.js";

type RoomRequest = { Params: { code: string; id?: string }; Body: Record<string, unknown>; Querystring: { token?: string; mode?: string } };
const string = { type: "string", maxLength: 500 };
const tokenProperty = { token: { type: "string", maxLength: 256 }, organizerToken: { type: "string", maxLength: 256 } };
function bodySchema(properties: Record<string, unknown>, required: string[] = []) { return { type: "object", properties: { ...tokenProperty, ...properties }, required, additionalProperties: false }; }

export function buildApp(options: { accessPassword?: string; repository?: RoomRepository; now?: () => number; presentation?: boolean; timers?: boolean } = {}) {
  if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error("Production requires a SESSION_SECRET of at least 32 characters");
  if (process.env.NODE_ENV === "production" && process.env.DATABASE_URL && !process.env.DATA_ENCRYPTION_KEY) throw new Error("Production persistence requires DATA_ENCRYPTION_KEY");
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { redact: ["req.headers.cookie", "req.headers.authorization"], serializers: { req: (req) => ({ method: req.method, url: String(req.url).split("?")[0]!, remoteAddress: req.ip }) } },
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    bodyLimit: 16_384,
  });
  const accessPassword = options.accessPassword ?? process.env.ACCESS_PASSWORD;
  const repository = options.repository ?? (process.env.DATABASE_URL ? new PostgresRoomRepository(process.env.DATABASE_URL) : undefined);
  const runtime = new LiveRoomRuntime(repository, { ...(options.now ? { now: options.now } : {}), presentation: options.presentation ?? process.env.NODE_ENV !== "test" });
  const now = options.now ?? Date.now;
  void app.register(cookie, { secret: process.env.SESSION_SECRET ?? "development-only-session-secret-change-me" });
  void app.register(websocket, { options: { maxPayload: 1024 } });
  if (process.env.STATIC_DIR) void app.register(fastifyStatic, { root: process.env.STATIC_DIR, wildcard: false });
  app.addHook("onReady", async () => { await runtime.initialize(); });
  const lobbyTtl = Number(process.env.ROOM_LOBBY_TTL_MS ?? 2 * 60 * 60_000);
  const activeTtl = Number(process.env.ROOM_ACTIVE_TTL_MS ?? 24 * 60 * 60_000);
  let ticking = false;
  const timer = options.timers === false ? undefined : setInterval(() => {
    if (ticking) return;
    ticking = true;
    void runtime.execute((rooms) => { rooms.advanceTime(now()); rooms.expireIdle(now(), lobbyTtl, activeTtl); }).catch(() => app.log.error("Room clock persistence failed; no uncommitted state was published")).finally(() => { ticking = false; });
  }, 500);
  timer?.unref();
  app.addHook("onClose", async () => { if (timer) clearInterval(timer); await runtime.close(); });

  const attempts = new Map<string, { count: number; reset: number }>();
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if ((! ["GET", "HEAD", "OPTIONS"].includes(request.method) || request.headers.upgrade?.toLowerCase() === "websocket") && origin) {
      const forwardedHost = request.headers["x-forwarded-host"];
      const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0]!.trim() : request.headers.host;
      try { if (new URL(origin).host !== host) return reply.code(403).send({ error: "请求来源不匹配" }); }
      catch { return reply.code(403).send({ error: "请求来源不匹配" }); }
    }
    const pathname = request.url.split("?")[0]!;
    if (/\/auth\/login$|\/join$|\/recover$/.test(pathname) && request.method === "POST") {
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
    if (error instanceof PersistenceUnavailableError) return reply.code(503).send({ error: error.message });
    const failure = error as Error & { validation?: unknown };
    if (failure.validation) return reply.code(400).send({ error: "请求参数不符合规则" });
    const message = failure.message;
    const status = message === "Room not found" ? 404 : /authorization|session is missing|授权/i.test(message) ? 403 : 400;
    return reply.code(status).send({ error: message });
  });
  app.get("/healthz", async () => ({ ok: true, service: "ravens-night" }));
  app.get("/api/auth/session", async (request) => ({ authorized: !accessPassword || signedCookie(request, "ravens_access") === "authorized" }));
  app.post<{ Body: { accessPassword: string } }>("/api/auth/login", { schema: { body: bodySchema({ accessPassword: { type: "string", maxLength: 1024 } }, ["accessPassword"]) } }, async (request, reply) => {
    if (accessPassword && !secureEqual(request.body.accessPassword, accessPassword)) return reply.code(401).send({ error: "访问口令不正确" });
    reply.setCookie("ravens_access", "authorized", { ...cookieOptions("/"), maxAge: 30 * 24 * 60 * 60 });
    return { authorized: true };
  });
  const privateView = (rooms: RoomService, code: string, token: string) => ({ ...rooms.privateView(code, token), ...socialView(rooms.find(code), token) });
  function receipt(request: FastifyRequest<RoomRequest>, token: string) {
    const id = request.headers["x-command-id"];
    if (typeof id !== "string" || !/^[\w-]{8,128}$/.test(id)) return undefined;
    return { code: request.params.code, id, actor: token, fingerprint: createHash("sha256").update(`${request.method}:${request.url}:${JSON.stringify(request.body ?? {})}`).digest("hex") };
  }
  app.post<{ Body: { playerCount: number; organizerName: string; playMode?: RoomPlayMode; voiceRoomUrl?: string } }>("/api/rooms", { schema: { body: bodySchema({ playerCount: { type: "integer", minimum: 5, maximum: 12 }, organizerName: { type: "string", minLength: 1, maxLength: 24 }, playMode: { enum: ["IN_PERSON", "REMOTE", "HYBRID"] }, voiceRoomUrl: { type: "string", maxLength: 2048 } }, ["playerCount", "organizerName"]) } }, async (request, reply) => {
    const result = await runtime.execute((rooms) => rooms.create(request.body.playerCount, request.body.organizerName, request.body.playMode, request.body.voiceRoomUrl));
    reply.setCookie("ravens_organizer", result.organizerToken, cookieOptions(roomPath(result.room.code)));
    return reply.code(201).send({ code: result.room.code, organizerToken: result.organizerToken });
  });
  app.post<RoomRequest>("/api/rooms/:code/join", { schema: { body: bodySchema({ nickname: { type: "string", minLength: 1, maxLength: 24 }, mode: { enum: ["PLAYER", "DISPLAY"] } }, ["nickname", "mode"]) } }, async (request, reply) => {
    const mode = request.body.mode as ParticipantMode;
    const result = await runtime.execute((rooms) => rooms.join(request.params.code, request.body.nickname as string, mode));
    reply.setCookie(mode === "DISPLAY" ? "ravens_display" : "ravens_player", result.token, cookieOptions(roomPath(request.params.code)));
    return reply.code(201).send({ id: result.participant.id, nickname: result.participant.nickname, mode, ...(result.participant.seat ? { seat: result.participant.seat } : {}), token: result.token });
  });
  app.delete<RoomRequest>("/api/rooms/:code/leave", { schema: { body: bodySchema({}) } }, async (request, reply) => {
    const token = participantToken(request, request.body?.token as string | undefined);
    const participant = member(runtime.service.find(request.params.code), token);
    const result = await runtime.execute((rooms) => { if (participant.mode === "PLAYER") leaveWhisper(rooms.find(request.params.code), token); return rooms.leave(request.params.code, token); });
    reply.clearCookie(participant.mode === "DISPLAY" ? "ravens_display" : "ravens_player", { path: roomPath(request.params.code) });
    if (participant.mode === "PLAYER") reply.clearCookie("ravens_organizer", { path: roomPath(request.params.code) });
    return { left: true, ...result };
  });
  app.get<RoomRequest>("/api/rooms/:code", async (request) => {
    const rooms = runtime.service;
    const view = rooms.publicView(request.params.code);
    const token = optionalToken(request);
    if (token) { try { member(rooms.find(request.params.code), token); await runtime.execute((stage) => stage.pulse(request.params.code, token, now())); } catch { /* Public invitation preview does not expose role data. */ } }
    return { ...view, serverNow: now() };
  });
  app.get<RoomRequest>("/api/rooms/:code/me", async (request) => {
    const token = participantToken(request, request.query.token, "PLAYER");
    member(runtime.service.find(request.params.code), token, "PLAYER");
    try { await runtime.execute((rooms) => rooms.pulse(request.params.code, token, now())); }
    catch (error) { if (!(error instanceof PersistenceUnavailableError)) throw error; }
    return privateView(runtime.service, request.params.code, token);
  });
  function command(path: string, properties: Record<string, unknown>, required: string[], change: (rooms: RoomService, code: string, token: string, body: Record<string, unknown>, request: FastifyRequest<RoomRequest>) => unknown, view: "public" | "private" | "result" = "private", organizer = false) {
    app.post<RoomRequest>(`/api/rooms/:code/${path}`, { schema: { body: bodySchema(properties, required) } }, async (request) => {
      const token = organizer ? organizerCredential(request, request.body?.organizerToken as string | undefined) : participantToken(request, request.body?.token as string | undefined);
      const result = await runtime.execute((rooms) => {
        const result = change(rooms, request.params.code, token, request.body ?? {}, request);
        return view === "result" ? result : view === "public" ? rooms.publicView(request.params.code) : privateView(rooms, request.params.code, token);
      }, receipt(request, token));
      // Retried mutations are idempotent, but their response must not rewind the client.
      return view === "result" ? result : view === "public" ? runtime.service.publicView(request.params.code) : privateView(runtime.service, request.params.code, token);
    });
  }
  command("start", {}, [], (rooms, code, token) => rooms.startTutorial(code, token), "public", true);
  command("reset", {}, [], (rooms, code, token) => {
    rooms.reset(code, token);
    const room = rooms.find(code);
    if (room.metadata) delete room.metadata.social;
  }, "public", true);
  command("seats", { participantIds: { type: "array", items: { type: "string" }, maxItems: 12, uniqueItems: true } }, ["participantIds"], (rooms, code, token, body) => rooms.reorderSeats(code, token, body.participantIds as string[]), "public");
  command("ready", { ready: { type: "boolean" } }, ["ready"], (rooms, code, token, body) => rooms.setReady(code, token, body.ready as boolean), "public");
  command("resume", {}, [], (rooms, code, token) => rooms.resume(code, token));
  command("tutorial/complete", {}, [], (rooms, code, token) => rooms.completeTutorial(code, token), "public");
  command("role/confirm", {}, [], (rooms, code, token) => rooms.confirmRole(code, token));
  command("action", { targetSeats: { type: "array", items: { type: "integer", minimum: 1, maximum: 12 }, maxItems: 2, uniqueItems: true } }, ["targetSeats"], (rooms, code, token, body) => rooms.submitAction(code, token, body.targetSeats as number[]));
  command("nominate", { nomineeSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["nomineeSeat"], (rooms, code, token, body) => rooms.nominate(code, token, body.nomineeSeat as number));
  command("nomination/cancel", {}, [], (rooms, code, token) => rooms.cancelNomination(code, token));
  command("nomination/defense/complete", {}, [], (rooms, code, token) => rooms.finishDefense(code, token));
  command("vote", { raised: { type: "boolean" } }, ["raised"], (rooms, code, token, body) => rooms.vote(code, token, body.raised as boolean));
  command("day/ready", {}, [], (rooms, code, token) => rooms.readyToEndDay(code, token));
  command("day/ability", { targetSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["targetSeat"], (rooms, code, token, body) => rooms.useDayAbility(code, token, body.targetSeat as number));
  command("whispers", { targetSeat: { type: "integer", minimum: 1, maximum: 12 } }, ["targetSeat"], (rooms, code, token, body) => inviteWhisper(rooms.find(code), token, body.targetSeat as number));
  command("whispers/:id/respond", { accept: { type: "boolean" } }, ["accept"], (rooms, code, token, body, request) => respondWhisper(rooms.find(code), token, request.params.id!, body.accept as boolean));
  command("whispers/leave", {}, [], (rooms, code, token) => leaveWhisper(rooms.find(code), token));
  command("whispers/:id/messages", { text: { ...string, minLength: 1 } }, ["text"], (rooms, code, token, body, request) => sendWhisper(rooms.find(code), token, request.params.id!, body.text as string));
  command("recovery", {}, [], (rooms, code, token) => createRecovery(rooms.find(code), token), "result");
  app.post<RoomRequest>("/api/rooms/:code/recover", { schema: { body: bodySchema({ recoveryCode: { type: "string", minLength: 20, maxLength: 128 } }, ["recoveryCode"]) } }, async (request, reply) => {
    const commandId = request.headers["x-command-id"];
    const retryId = typeof commandId === "string" && /^[\w-]{8,128}$/.test(commandId) ? commandId : undefined;
    const result = await runtime.execute((rooms) => recoverMembership(rooms, request.params.code, request.body.recoveryCode as string, retryId));
    reply.setCookie("ravens_player", result.token, cookieOptions(roomPath(request.params.code)));
    return result;
  });

  void app.register(async (scope) => {
    scope.get<{ Params: { code: string }; Querystring: { mode?: string } }>("/api/rooms/:code/live", { websocket: true }, (socket, request) => {
      const mode = request.query.mode === "DISPLAY" ? "DISPLAY" : "PLAYER";
      let token: string;
      try { token = participantToken(request, undefined, mode); member(runtime.service.find(request.params.code), token, mode); }
      catch { socket.close(1008, "Session unavailable"); return; }
      const publish = () => {
        if (socket.readyState !== 1) return;
        try {
          member(runtime.service.find(request.params.code), token, mode);
          socket.send(JSON.stringify({ type: "view", room: runtime.service.publicView(request.params.code), ...(mode === "PLAYER" ? { privateView: privateView(runtime.service, request.params.code, token) } : {}), serverNow: now() }));
        } catch { socket.close(1008, "Room or session unavailable"); }
      };
      const unsubscribe = runtime.subscribe((codes) => { if (codes.includes(request.params.code.toUpperCase())) publish(); });
      socket.on("close", unsubscribe);
      socket.on("error", unsubscribe);
      socket.on("message", (message: { toString(): string }) => {
        if (message.toString() !== "ping") return;
        void runtime.execute((rooms) => rooms.pulse(request.params.code, token, now())).then(publish).catch(() => socket.close(1008, "Session unavailable"));
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
