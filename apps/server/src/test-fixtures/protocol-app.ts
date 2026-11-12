import { randomUUID } from "node:crypto";
import { buildApp } from "../app.js";

/** Existing HTTP suites use the same explicit v5 join/context handshake as the UI. */
export function protocolApp(options?: Parameters<typeof buildApp>[0]): ReturnType<typeof buildApp> {
  const app = buildApp(options), inject = app.inject.bind(app);
  const bindings = new Map<string, Record<string, unknown>>();
  app.inject = (async (request: any) => {
    if (typeof request === "string") request={url:request};
    const baseHeaders={"x-ravens-protocol":"5",...request.headers};
    if(request.method==="POST"&&request.url==="/api/rooms"&&!request.payload?.createTicket){const ticket=await inject({url:"/api/room-create-ticket",headers:baseHeaders});if(ticket.statusCode!==200)return ticket;const cookie=ticket.cookies.map(c=>`${c.name}=${c.value}`).join("; ");return inject({...request,headers:{...baseHeaders,cookie:[baseHeaders.cookie,cookie].filter(Boolean).join("; "),"x-command-id":baseHeaders["x-command-id"]??randomUUID()},payload:{...request.payload,createTicket:ticket.json().createTicket}});}
    request={...request,headers:baseHeaders};
    const match = /^\/api\/rooms\/([^/]+)\/(.+)$/.exec(request.url ?? "");
    if (!match || !["POST","DELETE"].includes(request.method)) return inject(request);
    const code=match[1]!, path=match[2]!, headers={"x-ravens-protocol":"5",...request.headers};
    let payload = {...request.payload};
    if (path === "join") {
      const ticket = await inject({url:`/api/rooms/${code}/join-ticket?mode=${payload.mode === "DISPLAY" ? "DISPLAY" : "PLAYER"}`,headers});
      payload={joinTicket:ticket.json().joinTicket,...payload};
    } else if (!/^(?:recover$|account\/)/.test(path)) {
      headers["x-command-id"] ??= randomUUID();
      const key=`${code}:${headers["x-command-id"]}`;
      let binding=bindings.get(key);
      if(!binding) {
        const root=(await inject({url:`/api/rooms/${code}`,headers})).json();
        const mine=(await inject({url:`/api/rooms/${code}/me${payload.token?`?token=${payload.token}`:""}`,headers})).json();
        const publicRoom=root.roomInstanceId?root:(await inject({url:`/api/rooms/${code}`,headers})).json();
        binding={roomInstanceId:publicRoom.roomInstanceId,setupId:publicRoom.setupId,expectedCommandVersion:mine.self?.commandVersion??root.self?.commandVersion??0,...(mine.game?{gameId:mine.game.gameId,contextId:mine.contextId,ballotId:mine.game.nomination?.ballotId}:{})};
        bindings.set(key,binding);
      }
      payload={...binding,...payload};
    }
    return inject({...request,headers,payload});
  }) as typeof app.inject;
  return app;
}
