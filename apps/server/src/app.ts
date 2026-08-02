import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { RoomService, type ParticipantMode } from "./rooms/service.js";
import { PostgresRoomRepository } from "./db/room-repository.js";

export function buildApp(options: { accessPassword?: string } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : true });
  const rooms = new RoomService();
  const accessPassword = options.accessPassword ?? process.env.ACCESS_PASSWORD;
  const repository = process.env.DATABASE_URL ? new PostgresRoomRepository(process.env.DATABASE_URL) : undefined;
  void app.register(cookie, { secret: process.env.SESSION_SECRET ?? "development-only-session-secret-change-me" });
  void app.register(websocket);
  if (process.env.STATIC_DIR) void app.register(fastifyStatic, { root: process.env.STATIC_DIR, wildcard: false });
  if (repository) {
    app.addHook("onReady", async () => { await repository.initialize(); rooms.restore(await repository.loadAll()); });
    app.addHook("onClose", async () => repository.close());
  }
  const persist = async (code: string) => { if (repository) await repository.save(rooms.snapshot(code)); };

  app.addHook("onRequest", async (request, reply) => {
    if (!accessPassword || !request.url.startsWith("/api/") || request.url.startsWith("/api/auth/")) return;
    const cookieValue = request.cookies.ravens_access;
    const unsigned = cookieValue ? request.unsignCookie(cookieValue) : undefined;
    if (!unsigned?.valid || unsigned.value !== "authorized") return reply.code(401).send({ error: "Authorization required" });
  });

  app.get("/healthz", async () => ({ ok: true, service: "ravens-night" }));
  app.get("/api/auth/session", async (request) => {
    if (!accessPassword) return { authorized: true };
    const cookieValue = request.cookies.ravens_access;
    const unsigned = cookieValue ? request.unsignCookie(cookieValue) : undefined;
    return { authorized: Boolean(unsigned?.valid && unsigned.value === "authorized") };
  });
  app.post<{ Body: { accessPassword: string } }>("/api/auth/login", async (request, reply) => {
    if (!accessPassword || secureEqual(request.body.accessPassword ?? "", accessPassword)) {
      reply.setCookie("ravens_access", "authorized", { httpOnly: true, signed: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
      return { authorized: true };
    }
    return reply.code(401).send({ error: "访问口令不正确" });
  });

  app.post<{ Body: { playerCount: number; organizerName: string } }>("/api/rooms", async (request, reply) => {
    try {
      const { room, organizerToken } = rooms.create(request.body.playerCount, request.body.organizerName);
      reply.setCookie("ravens_organizer", organizerToken, participantCookieOptions());
      await persist(room.code);
      return reply.code(201).send({ code: room.code, organizerToken });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to create room" });
    }
  });

  app.post<{ Params: { code: string }; Body: { nickname: string; mode: ParticipantMode } }>(
    "/api/rooms/:code/join",
    async (request, reply) => {
      try {
        const { participant, token } = rooms.join(request.params.code, request.body.nickname, request.body.mode);
        await persist(request.params.code);
        reply.setCookie("ravens_player", token, {
          ...participantCookieOptions(),
        });
        return reply.code(201).send({
          id: participant.id,
          nickname: participant.nickname,
          mode: participant.mode,
          ...(participant.seat ? { seat: participant.seat } : {}),
          token,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to join room";
        return reply.code(message === "Room not found" ? 404 : 400).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { code: string }; Body: { token?: string } }>("/api/rooms/:code/leave", async (request, reply) => {
    try {
      rooms.leave(request.params.code, playerToken(request, request.body?.token));
      await persist(request.params.code);
      reply.clearCookie("ravens_player", { path: "/" });
      reply.clearCookie("ravens_organizer", { path: "/" });
      return { left: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to leave room" });
    }
  });

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (request, reply) => {
    try {
      return rooms.publicView(request.params.code);
    } catch {
      return reply.code(404).send({ error: "Room not found" });
    }
  });

  app.post<{ Params: { code: string }; Body: { organizerToken?: string } }>("/api/rooms/:code/start", async (request, reply) => {
    try {
      rooms.startTutorial(request.params.code, signedCookie(request, "ravens_organizer") ?? request.body?.organizerToken ?? "");
      await persist(request.params.code);
      return rooms.publicView(request.params.code);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to start" });
    }
  });

  app.post<{ Params: { code: string }; Body: { organizerToken?: string } }>("/api/rooms/:code/reset", async (request, reply) => {
    try {
      rooms.reset(request.params.code, signedCookie(request, "ravens_organizer") ?? request.body?.organizerToken ?? "");
      await persist(request.params.code);
      return rooms.publicView(request.params.code);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to reset room" });
    }
  });

  app.post<{ Params: { code: string }; Body: { token?: string } }>("/api/rooms/:code/tutorial/complete", async (request, reply) => {
    try {
      const token = playerToken(request, request.body?.token);
      rooms.completeTutorial(request.params.code, token);
      await persist(request.params.code);
      return rooms.publicView(request.params.code);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to complete tutorial" });
    }
  });

  app.get<{ Params: { code: string }; Querystring: { token?: string } }>("/api/rooms/:code/me", async (request, reply) => {
    try {
      return rooms.privateView(request.params.code, playerToken(request, request.query?.token));
    } catch (error) {
      return reply.code(403).send({ error: error instanceof Error ? error.message : "Access denied" });
    }
  });

  app.post<{ Params: { code: string }; Body: { token?: string } }>("/api/rooms/:code/role/confirm", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.confirmRole(request.params.code, token); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to confirm role" }); }
  });

  app.post<{ Params: { code: string }; Body: { token?: string; targetSeats: number[] } }>("/api/rooms/:code/action", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.submitAction(request.params.code, token, request.body.targetSeats); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to submit action" }); }
  });

  app.post<{ Params: { code: string }; Body: { token?: string; nomineeSeat: number } }>("/api/rooms/:code/nominate", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.nominate(request.params.code, token, request.body.nomineeSeat); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to nominate" }); }
  });

  app.post<{ Params: { code: string }; Body: { token?: string; raised: boolean } }>("/api/rooms/:code/vote", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.vote(request.params.code, token, request.body.raised); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to vote" }); }
  });

  app.post<{ Params: { code: string }; Body: { token?: string } }>("/api/rooms/:code/day/ready", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.readyToEndDay(request.params.code, token); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to end day" }); }
  });

  app.post<{ Params: { code: string }; Body: { token?: string; targetSeat: number } }>("/api/rooms/:code/day/ability", async (request, reply) => {
    try { const token = playerToken(request, request.body?.token); rooms.useDayAbility(request.params.code, token, request.body.targetSeat); await persist(request.params.code); return rooms.privateView(request.params.code, token); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to use ability" }); }
  });

  if (process.env.STATIC_DIR) app.get("/*", async (_request, reply) => reply.sendFile("index.html"));

  return app;
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function participantCookieOptions() {
  return {
    httpOnly: true,
    signed: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  };
}

function signedCookie(request: FastifyRequest, name: string): string | undefined {
  const value = request.cookies[name];
  if (!value) return undefined;
  const unsigned = request.unsignCookie(value);
  return unsigned.valid ? unsigned.value : undefined;
}

function playerToken(request: FastifyRequest, fallback?: string): string {
  const token = signedCookie(request, "ravens_player") ?? fallback;
  if (!token) throw new Error("Player session is missing");
  return token;
}
