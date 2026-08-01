import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { RoomService, type ParticipantMode } from "./rooms/service.js";

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : true });
  const rooms = new RoomService();
  void app.register(cookie, { secret: process.env.SESSION_SECRET ?? "development-only-session-secret-change-me" });
  void app.register(websocket);

  app.get("/healthz", async () => ({ ok: true, service: "ravens-night" }));

  app.post<{ Body: { playerCount: number; organizerName: string } }>("/api/rooms", async (request, reply) => {
    try {
      const { room, organizerToken } = rooms.create(request.body.playerCount, request.body.organizerName);
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
        reply.setCookie("ravens_player", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24,
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

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (request, reply) => {
    try {
      const room = rooms.find(request.params.code);
      return {
        code: room.code,
        state: room.state,
        playerCount: room.playerCount,
        participants: room.participants.map(({ tokenHash: _tokenHash, ...participant }) => participant),
      };
    } catch {
      return reply.code(404).send({ error: "Room not found" });
    }
  });

  return app;
}
