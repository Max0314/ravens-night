import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { PrivateView, RoomView } from "../../apps/web/src/api.js";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const accessPassword = process.env.E2E_ACCESS_PASSWORD ?? (process.env.E2E_BASE_URL ? "0314" : "e2e-only-password");
interface Client { context: BrowserContext; page: Page; nickname: string; id?: string; frames: Array<{ room?: RoomView; privateView?: PrivateView }>; errors: string[]; }
async function json<T>(response: APIResponse): Promise<T> { expect(response.ok(), await response.text()).toBeTruthy(); return response.json() as Promise<T>; }
async function post<T = PrivateView>(client: Client, code: string, action: string, data: Record<string, unknown> = {}): Promise<T> { return json<T>(await client.context.request.post(`${base}/api/rooms/${code}/${action}`, { data, headers: { "X-Room-Mode": "PLAYER" } })); }
async function view(client: Client, code: string): Promise<PrivateView> { return json<PrivateView>(await client.context.request.get(`${base}/api/rooms/${code}/me`)); }
async function client(browser: Browser, nickname: string, viewport = { width: 390, height: 844 }): Promise<Client> {
  const context = await browser.newContext({ viewport, baseURL: base }); const page = await context.newPage();
  const result: Client = { context, page, nickname, frames: [], errors: [] };
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("websocket", (socket) => { if (socket.url().includes("/live?")) socket.on("framereceived", ({ payload }) => { try { result.frames.push(JSON.parse(String(payload))); } catch { /* Ignore control frames. */ } }); });
  await json(await context.request.post(`${base}/api/auth/login`, { data: { accessPassword } }));
  return result;
}
async function open(client: Client, code: string, mode: "PLAYER" | "DISPLAY" = "PLAYER") {
  await client.page.addInitScript((session) => sessionStorage.setItem("ravens_room_session", JSON.stringify(session)), { roomCode: code, mode, participantId: client.id });
  await client.page.goto(base);
}
async function readyTable(browser: Browser, count: number, existingCode?: string): Promise<{ players: Client[]; code: string }> {
  const players = await Promise.all(Array.from({ length: count }, (_, index) => client(browser, index ? `玩家${index + 1}` : "QA房主")));
  const host = players[0]!;
  const code = existingCode ?? (await json<{ code: string }>(await host.context.request.post(`${base}/api/rooms`, { data: { playerCount: count, organizerName: host.nickname, playMode: "IN_PERSON" } }))).code;
  for (const player of players) { player.id = (await post<{ id: string }>(player, code, "join", { nickname: player.nickname, mode: "PLAYER" })).id; await post(player, code, "ready", { ready: true }); await open(player, code); }
  return { players, code };
}
async function begin(players: Client[], code: string, verifyTutorialResume = false) {
  await players[0]!.page.getByRole("button", { name: "开始新手教学", exact: true }).click();
  for (const [index, player] of players.entries()) {
    await player.page.getByRole("button", { name: "跳过教程，查看身份", exact: true }).click();
    if (index === 0 && verifyTutorialResume) {
      await expect(player.page.getByRole("heading", { name: "等待所有玩家", exact: true })).toBeVisible();
      await player.page.reload();
      await expect(player.page.getByRole("heading", { name: "等待所有玩家", exact: true })).toBeVisible();
    }
  }
  await expect(players[0]!.page.getByText("只有你能看到 · 请勿向外展示屏幕", { exact: true })).toBeVisible();
}
async function unlock(player: Client, code: string) {
  for (let pass = 0; pass < 12; pass++) { const current = await view(player, code); const wait = (current.game?.presentationUntil ?? 0) - (current.game?.serverNow ?? Date.now()); if (wait <= 0) return current; await player.page.waitForTimeout(Math.min(wait + 120, 12_000)); }
  throw new Error("Production presentation did not finish");
}
async function settleNight(players: Client[], code: string): Promise<PrivateView[]> {
  for (let pass = 0; pass < 24; pass++) {
    await unlock(players[0]!, code);
    const views = await Promise.all(players.map((player) => view(player, code)));
    if (!["FIRST_NIGHT", "OTHER_NIGHT"].includes(views[0]?.game?.phase ?? "")) return views;
    const pending = views.map((current, index) => ({ current, player: players[index]! })).filter(({ current }) => ["SELECT_ONE", "SELECT_TWO"].includes(current.action?.kind ?? ""));
    expect(pending.length, "a night must expose its next legal actor after choreography").toBeGreaterThan(0);
    for (const { current, player } of pending) {
      const action = current.action!;
      let legal = action.legalSeats;
      if (current.role?.roleId === "imp") legal = legal.filter((seat) => seat !== current.participant.seat && !views.some((candidate) => candidate.participant.seat === seat && ["mayor", "soldier"].includes(candidate.role?.roleId ?? "")));
      await post(player, code, "action", { targetSeats: legal.slice(0, action.maxTargets) });
    }
  }
  throw new Error("Night did not settle");
}
async function display(browser: Browser, code: string): Promise<Client> {
  const screen = await client(browser, "公共大屏", { width: 1440, height: 900 });
  await post(screen, code, "join", { nickname: "公共大屏", mode: "DISPLAY" }); await open(screen, code, "DISPLAY");
  await expect(screen.page.getByText(`鸦钟夜话 · ${code}`, { exact: true })).toBeVisible(); return screen;
}

test("six phones and a TV complete a game with real presentation locks, then restart", async ({ browser }) => {
  const { players, code } = await readyTable(browser, 6); const tv = await display(browser, code);
  try {
    await players[0]!.page.getByRole("button", { name: "将玩家6座位前移" }).click();
    await expect(players[0]!.page.locator(".lobby-player-list li").nth(4)).toContainText("玩家6");
    await begin(players, code, true);
    for (const player of players) await player.page.getByRole("button", { name: "我记住了身份", exact: true }).click();
    let views = await settleNight(players, code);
    await expect(tv.page.getByRole("heading", { name: "自由讨论", exact: true })).toBeVisible();
    await players[0]!.page.getByRole("button", { name: "公开城镇", exact: true }).click();
    await expect(players[0]!.page.getByRole("region", { name: "公开城镇", exact: true })).toBeVisible();
    await players[0]!.page.screenshot({ path: "outputs/ui-qa/town-mobile.png", fullPage: true });
    expect(tv.frames.length).toBeGreaterThan(0); expect(tv.frames.every((frame) => !frame.privateView)).toBe(true);
    for (let day = 0; day < 5 && views[0]?.game?.phase !== "GAME_OVER"; day++) {
      await unlock(players[0]!, code);
      const demon = views.find((current) => current.role?.roleId === "imp" && current.game?.seats.find((seat) => seat.seat === current.participant.seat)?.alive)!;
      const nominatorIndex = views.findIndex((current) => current.canNominate && current.participant.seat !== demon.participant.seat); expect(nominatorIndex).toBeGreaterThanOrEqual(0);
      await post(players[nominatorIndex]!, code, "nominate", { nomineeSeat: demon.participant.seat }); await unlock(players[0]!, code);
      if (day === 0) await players[nominatorIndex]!.page.screenshot({ path: "outputs/ui-qa/defense-mobile.png", fullPage: true });
      const voters = await Promise.all(players.map((player) => view(player, code)));
      for (let index = 0; index < voters.length; index++) if (voters[index]?.canVote) await post(players[index]!, code, "vote", { raised: true });
      const defenderIndex = voters.findIndex((current) => current.canFinishDefense);
      if (defenderIndex >= 0) await post(players[defenderIndex]!, code, "nomination/defense/complete");
      if (day === 0) { await players[0]!.page.waitForTimeout(1_700); await Promise.all([players[0]!.page.screenshot({ path: "outputs/ui-qa/counting-mobile.png", fullPage: true }), tv.page.screenshot({ path: "outputs/ui-qa/counting-display.png" })]); }
      await expect.poll(async () => (await view(players[0]!, code)).game?.phase, { timeout: 45_000, intervals: [300, 500, 1_000] }).not.toBe("VOTING");
      await unlock(players[0]!, code); views = await Promise.all(players.map((player) => view(player, code)));
      for (let index = 0; index < views.length; index++) if (views[index]?.canEndDay) await post(players[index]!, code, "day/ready");
      views = await settleNight(players, code);
    }
    expect(views[0]?.game?.winner).toBe("GOOD"); await unlock(players[0]!, code);
    await expect(players[0]!.page.getByRole("heading", { name: "善良阵营获胜" })).toBeVisible();
    await expect(tv.page.getByRole("heading", { name: "善良获胜", exact: true })).toBeVisible();
    await players[0]!.page.getByRole("button", { name: "同一批人再来一局", exact: true }).click();
    await expect(players[1]!.page.locator(".lobby__heading")).toContainText("6/6 位玩家已入座");
    expect([...players, tv].flatMap((player) => player.errors)).toEqual([]);
  } finally { await Promise.all([...players, tv].map((player) => player.context.close())); }
});

test("public gunshots reach every phone and TV by WS; a private poison action reaches only its actor", async ({ browser }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "The deterministic poison bag is supplied by the local-only test server");
  const { poisonRoomCode } = JSON.parse(await readFile("outputs/e2e/fixture.json", "utf8")) as { poisonRoomCode: string };
  const { players, code } = await readyTable(browser, 5, poisonRoomCode); const tv = await display(browser, code);
  try {
    await begin(players, code);
    const initial = await Promise.all(players.map((player) => view(player, code)));
    const poisonIndex = initial.findIndex((current) => current.role?.roleId === "poisoner"); expect(poisonIndex).toBeGreaterThanOrEqual(0);
    for (const player of players) await player.page.getByRole("button", { name: "我记住了身份", exact: true }).click();
    const poisoner = players[poisonIndex]!; await unlock(poisoner, code);
    const before = await view(poisoner, code); const target = before.action!.legalSeats.find((seat) => seat !== before.participant.seat)!;
    const publicBefore = (await json<RoomView>(await tv.context.request.get(`${base}/api/rooms/${code}`))).game?.events ?? [];
    await poisoner.page.locator(".seat-choices button").filter({ has: poisoner.page.locator("span", { hasText: new RegExp(`^${target}$`) }) }).click();
    await poisoner.page.getByRole("button", { name: "确认选择（1/1）", exact: true }).click();
    await expect(poisoner.page.getByRole("status", { name: "仅你可见的行动回执" })).toBeVisible();
    await expect(poisoner.page.getByRole("heading", { name: "毒液已悄然倾下" })).toBeVisible();
    await poisoner.page.screenshot({ path: "outputs/ui-qa/live-poison-mobile.png" });
    for (const other of [...players.filter((_, index) => index !== poisonIndex), tv]) await expect(other.page.getByRole("status", { name: "仅你可见的行动回执" })).toBeHidden();
    const publicAfter = (await json<RoomView>(await tv.context.request.get(`${base}/api/rooms/${code}`))).game?.events ?? [];
    const newPublic = publicAfter.filter((event) => !publicBefore.some((old) => old.id === event.id));
    expect(newPublic.some((event) => /投毒|毒液|poison/i.test(JSON.stringify(event)))).toBe(false);
    const views = await settleNight(players, code);
    const shooter = players[views.findIndex((current) => current.canClaimSlayer)]!;
    const safeTarget = views.find((current) => !["imp", "recluse"].includes(current.role?.roleId ?? ""))!.participant.seat;
    const shot = await post(shooter, code, "day/ability", { targetSeat: safeTarget });
    const event = [...shot.game!.events].reverse().find((entry) => entry.kind === "SHOT")!; expect(event.durationMs).toBe(4_500); expect(event.startsAt! - event.occurredAt!).toBeGreaterThanOrEqual(1_500);
    await expect.poll(() => [...players, tv].every((player) => player.frames.some((frame) => frame.room?.game?.events.some((entry) => entry.id === event.id))), { timeout: 4_000 }).toBe(true);
    for (const player of [...players, tv]) await expect(player.page.getByRole("dialog", { name: "城镇公开演出" })).toBeVisible();
    await shooter.page.waitForTimeout(Math.max(0, event.startsAt! + 1_600 - Date.now()));
    await Promise.all([shooter.page.screenshot({ path: "outputs/ui-qa/live-shot-mobile.png" }), tv.page.screenshot({ path: "outputs/ui-qa/live-shot-display.png" })]);
    expect(tv.frames.every((frame) => !frame.privateView)).toBe(true); await unlock(shooter, code);
    for (const player of [...players, tv]) await expect(player.page.getByRole("dialog", { name: "城镇公开演出" })).toBeHidden();
    expect([...players, tv].flatMap((player) => player.errors)).toEqual([]);
  } finally { await Promise.all([...players, tv].map((player) => player.context.close())); }
});

test("whispers stay private, support leaving, and room ownership transfers", async ({ browser }) => {
  const { players, code } = await readyTable(browser, 5);
  try {
    await players[0]!.page.getByRole("button", { name: "退出房间", exact: true }).click();
    await expect(players[1]!.page.locator(".lobby__host")).toContainText("玩家2（你）");
    const replacement = await client(browser, "补位玩家"); players.push(replacement);
    replacement.id = (await post<{ id: string }>(replacement, code, "join", { nickname: replacement.nickname, mode: "PLAYER" })).id; await post(replacement, code, "ready", { ready: true }); await open(replacement, code);
    const active = players.slice(1); await begin(active, code);
    for (const player of active) await player.page.getByRole("button", { name: "我记住了身份", exact: true }).click();
    const views = await settleNight(active, code); const sender = active[0]!; const receiver = active[1]!;
    for (const player of [sender, receiver]) await player.page.getByRole("button", { name: "公开城镇", exact: true }).click();
    await post(sender, code, "whispers", { targetSeat: views[1]!.participant.seat }); await receiver.page.getByRole("button", { name: "接受邀请", exact: true }).click();
    await sender.page.getByLabel("私聊内容").fill("只属于这间房的线索"); await sender.page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(receiver.page.getByText("只属于这间房的线索", { exact: true })).toBeVisible();
    await receiver.page.screenshot({ path: "outputs/ui-qa/whisper-mobile.png", fullPage: true });
    expect(JSON.stringify((await view(active[2]!, code)).social)).not.toContain("只属于这间房的线索");
    await receiver.page.getByRole("button", { name: "返回广场", exact: true }).click(); await expect(sender.page.getByLabel("私聊内容")).toBeHidden();
  } finally { await Promise.all(players.map((player) => player.context.close())); }
});

test("leaving the last seat destroys its room and returns the display home", async ({ browser }) => {
  const host = await client(browser, "单人房主"); let tv: Client | undefined;
  try {
    await host.page.goto(base); await host.page.getByRole("button", { name: "创建房间", exact: true }).click();
    await host.page.getByRole("textbox", { name: "你的昵称" }).fill(host.nickname); await host.page.getByRole("combobox", { name: "玩家人数" }).selectOption("5"); await host.page.getByRole("button", { name: "创建房间", exact: true }).click();
    const code = (await host.page.locator(".lobby__heading h1").innerText()).trim(); tv = await display(browser, code);
    await host.page.getByRole("button", { name: "退出房间", exact: true }).click(); await expect(tv.page.getByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
    expect((await host.context.request.get(`${base}/api/rooms/${code}`)).status()).toBe(404);
  } finally { await host.context.close(); await tv?.context.close(); }
});
