import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page } from "@playwright/test";

const accessPassword = process.env.E2E_ACCESS_PASSWORD ?? "0314";

interface TestClient {
  context: BrowserContext;
  page: Page;
  nickname: string;
  consoleErrors: string[];
}

interface PrivateView {
  participant: { seat: number };
  role?: { roleId: string; name: string };
  action?: { kind: string; legalSeats: number[]; maxTargets: number };
  game?: {
    phase: string;
    seats: Array<{ seat: number; alive: boolean }>;
    winner?: "GOOD" | "EVIL";
  };
}

async function enterSite(page: Page): Promise<void> {
  await page.goto("/");
  const password = page.getByRole("textbox", { name: "访问口令" });
  await expect(password).toBeVisible();
  await password.fill(accessPassword);
  await page.getByRole("button", { name: "进入钟楼", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
}

async function newClient(browser: Browser, nickname: string, viewport: { width: number; height: number }): Promise<TestClient> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await enterSite(page);
  return { context, page, nickname, consoleErrors };
}

async function joinPlayer(client: TestClient, code: string): Promise<void> {
  await client.page.getByRole("button", { name: "加入一局", exact: true }).click();
  await client.page.getByRole("textbox", { name: "六位邀请码" }).fill(code);
  await client.page.getByRole("textbox", { name: "你的昵称" }).fill(client.nickname);
  await client.page.getByRole("button", { name: "进入房间", exact: true }).click();
  await expect(client.page.getByText(client.nickname, { exact: true })).toBeVisible();
}

async function joinFromScannedInvite(client: TestClient, code: string): Promise<void> {
  await client.page.goto(`/?room=${code}`);
  const roomCode = client.page.getByRole("textbox", { name: "六位邀请码" });
  await expect(roomCode).toHaveValue(code);
  await client.page.getByRole("textbox", { name: "你的昵称" }).fill(client.nickname);
  await client.page.getByRole("button", { name: "进入房间", exact: true }).click();
  await expect(client.page.getByText(client.nickname, { exact: true })).toBeVisible();
}

async function joinDisplay(client: TestClient, code: string): Promise<void> {
  await client.page.getByRole("button", { name: "加入一局", exact: true }).click();
  await client.page.getByRole("textbox", { name: "六位邀请码" }).fill(code);
  await client.page.getByRole("button", { name: /电视公共大屏/ }).click();
  await client.page.getByRole("button", { name: "进入房间", exact: true }).click();
  await expect(client.page.getByText(`鸦钟夜话 · ${code}`)).toBeVisible();
  await expect(client.page.getByRole("button", { name: "进入全屏", exact: true })).toBeVisible();
  await expect(client.page.getByRole("img", { name: `加入房间 ${code} 的二维码` })).toBeVisible();
}

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function privateView(client: TestClient, code: string): Promise<PrivateView> {
  return json<PrivateView>(await client.context.request.get(`/api/rooms/${code}/me`));
}

async function post(client: TestClient, path: string, data: Record<string, unknown> = {}): Promise<PrivateView> {
  return json<PrivateView>(await client.context.request.post(path, { data }));
}

async function settleNight(clients: TestClient[], code: string): Promise<PrivateView[]> {
  for (let pass = 0; pass < 12; pass += 1) {
    const views = await Promise.all(clients.map((client) => privateView(client, code)));
    const phase = views[0]?.game?.phase;
    if (phase !== "FIRST_NIGHT" && phase !== "OTHER_NIGHT") return views;
    const pending = views
      .map((view, index) => ({ view, client: clients[index]! }))
      .filter(({ view }) => view.action?.kind === "SELECT_ONE" || view.action?.kind === "SELECT_TWO");
    expect(pending.length, `night stalled during ${phase}`).toBeGreaterThan(0);
    for (const { view, client } of pending) {
      const action = view.action!;
      await post(client, `/api/rooms/${code}/action`, { targetSeats: action.legalSeats.slice(0, action.maxTargets) });
    }
  }
  throw new Error("night did not settle within 12 action passes");
}

test("six isolated phones and one TV can complete a full game", async ({ browser }) => {
  const players: TestClient[] = [];
  const organizer = await newClient(browser, "QA主持", { width: 390, height: 844 });
  players.push(organizer);

  try {
    await organizer.page.getByRole("button", { name: "创建房间", exact: true }).click();
    await organizer.page.getByRole("textbox", { name: "你的昵称" }).fill(organizer.nickname);
    await organizer.page.getByRole("combobox", { name: "玩家人数" }).selectOption("6");
    await organizer.page.getByRole("button", { name: "创建房间", exact: true }).click();
    await expect(organizer.page.getByText("1/6 位玩家已入座")).toBeVisible();
    const code = (await organizer.page.locator(".lobby__heading h1").innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    for (let index = 2; index <= 6; index += 1) {
      const client = await newClient(browser, `玩家${index}`, { width: 390, height: 844 });
      players.push(client);
      if (index === 2) await joinFromScannedInvite(client, code);
      else await joinPlayer(client, code);
    }

    const display = await newClient(browser, "电视大屏", { width: 1920, height: 1080 });
    await joinDisplay(display, code);
    await expect(organizer.page.getByText("6/6 位玩家已入座")).toBeVisible({ timeout: 8_000 });
    await players[5]!.page.reload();
    await expect(players[5]!.page.getByText("6/6 位玩家已入座")).toBeVisible();
    await players[4]!.context.setOffline(true);
    await expect(players[4]!.page.getByText(/网络已断开/)).toBeVisible();
    await players[4]!.context.setOffline(false);
    await expect(players[4]!.page.getByText(/网络已断开/)).toBeHidden();
    await expect(players[4]!.page.getByText("6/6 位玩家已入座")).toBeVisible();

    const start = organizer.page.getByRole("button", { name: "开始新手教学", exact: true });
    await expect(start).toBeEnabled();
    await start.click();

    for (const client of players) {
      await expect(client.page.getByText(/教学 1 \/ \d+/)).toBeVisible({ timeout: 8_000 });
      await expect(client.page.getByText("跳过后，游戏中仍可随时打开教程和角色表。")).toBeVisible();
      await client.page.getByRole("button", { name: "跳过教程，查看身份", exact: true }).click();
    }

    for (const client of players) {
      await expect(client.page.getByText(/只有你能看到/)).toBeVisible({ timeout: 8_000 });
    }

    await players[1]!.page.getByRole("button", { name: "我的角色", exact: true }).click();
    await expect(players[1]!.page.getByRole("dialog", { name: "游戏帮助" })).toBeVisible();
    await expect(players[1]!.page.getByText("游玩建议", { exact: true })).toBeVisible();
    await players[1]!.page.goBack();
    await expect(players[1]!.page.getByRole("dialog", { name: "游戏帮助" })).toBeHidden();
    await expect(players[1]!.page.getByText(/只有你能看到/)).toBeVisible();

    for (const client of players) {
      await client.page.getByRole("button", { name: "我记住了身份", exact: true }).click();
    }

    let views = await settleNight(players, code);
    expect(views[0]?.game?.phase).toBe("DAY_DISCUSSION");
    const historyPlayer = players[0]!;
    await expect(historyPlayer.page.getByText("我的身份与线索记录", { exact: true })).toBeVisible({ timeout: 8_000 });
    await historyPlayer.page.getByText("我的身份与线索记录", { exact: true }).click();
    await expect(historyPlayer.page.getByRole("heading", { name: "身份揭晓" })).toBeVisible();
    await expect(historyPlayer.page.getByText("身份", { exact: true }).first()).toBeVisible();
    await expect(display.page.getByRole("heading", { name: "自由讨论" })).toBeVisible({ timeout: 8_000 });
    await expect(display.page.locator(".display__phase")).toContainText("第 1 天 · 白天");
    await expect(display.page.getByRole("region", { name: "村庄公开信息" })).toContainText("村庄进入首夜");
    await expect(display.page.getByRole("region", { name: "村庄公开信息" })).toContainText("第 1 天开始");

    const privateRoleNames = views.flatMap((view) => view.role?.name ? [view.role.name] : []);
    const displayText = await display.page.locator("body").innerText();
    for (const roleName of privateRoleNames) expect(displayText).not.toContain(roleName);

    for (let day = 0; day < 4 && views[0]?.game?.phase !== "GAME_OVER"; day += 1) {
      const living = views[0]!.game!.seats.filter((seat) => seat.alive).map((seat) => seat.seat);
      const demonIndex = views.findIndex((view) => view.role?.roleId === "imp" && living.includes(view.participant.seat));
      expect(demonIndex, "a living demon must exist before nomination").toBeGreaterThanOrEqual(0);
      const nominatorIndex = views.findIndex((view) => living.includes(view.participant.seat) && view.participant.seat !== views[demonIndex]!.participant.seat);
      expect(nominatorIndex).toBeGreaterThanOrEqual(0);

      await post(players[nominatorIndex]!, `/api/rooms/${code}/nominate`, { nomineeSeat: views[demonIndex]!.participant.seat });
      await expect(display.page.getByText("公开投票")).toBeVisible({ timeout: 8_000 });
      if (day === 0) {
        const cancel = players[nominatorIndex]!.page.getByRole("button", { name: "取消本次提名", exact: true });
        await expect(cancel).toBeVisible({ timeout: 8_000 });
        await cancel.click();
        await expect(players[nominatorIndex]!.page.getByText("还可以继续提名")).toBeVisible({ timeout: 8_000 });
        await post(players[nominatorIndex]!, `/api/rooms/${code}/nominate`, { nomineeSeat: views[demonIndex]!.participant.seat });

        const switchingVoter = players[0]!;
        await expect(switchingVoter.page.getByRole("button", { name: "举手赞成", exact: true })).toBeVisible({ timeout: 8_000 });
        await switchingVoter.page.getByRole("button", { name: "举手赞成", exact: true }).click();
        await expect(switchingVoter.page.getByText(/你当前：已举手赞成/)).toBeVisible();
        await switchingVoter.page.getByRole("button", { name: "放下手", exact: true }).click();
        await expect(switchingVoter.page.getByText(/你当前：未举手/)).toBeVisible();
      }
      for (const client of players) await post(client, `/api/rooms/${code}/vote`, { raised: true });

      views = await Promise.all(players.map((client) => privateView(client, code)));
      const readySeats = views[0]!.game!.seats.filter((seat) => seat.alive).map((seat) => seat.seat);
      for (const seat of readySeats) {
        const index = views.findIndex((view) => view.participant.seat === seat);
        await post(players[index]!, `/api/rooms/${code}/day/ready`);
      }

      views = await Promise.all(players.map((client) => privateView(client, code)));
      if (views[0]?.game?.phase === "FIRST_NIGHT" || views[0]?.game?.phase === "OTHER_NIGHT") {
        if (day === 0) {
          await expect(display.page.locator(".display__phase")).toContainText("第 1 夜 · 夜晚", { timeout: 8_000 });
          await expect(display.page.getByRole("region", { name: "村庄公开信息" })).toContainText("夜幕再次降临");
        }
        views = await settleNight(players, code);
      }
    }

    expect(views[0]?.game?.phase).toBe("GAME_OVER");
    expect(views[0]?.game?.winner).toBe("GOOD");
    await expect(display.page.getByText("善良获胜")).toBeVisible({ timeout: 8_000 });
    await expect(display.page.getByText(/身份揭晓/)).toBeVisible();
    await expect(players[0]!.page.getByText("我的身份与线索记录", { exact: true })).toBeVisible({ timeout: 8_000 });

    const rematch = organizer.page.getByRole("button", { name: "同一批人再来一局", exact: true });
    await expect(rematch).toBeVisible({ timeout: 8_000 });
    await rematch.click();
    await expect(organizer.page.getByText("6/6 位玩家已入座")).toBeVisible();
    await expect(players[1]!.page.getByText("6/6 位玩家已入座")).toBeVisible({ timeout: 8_000 });
    await expect(display.page.getByRole("heading", { name: "6/6 位已入座" })).toBeVisible({ timeout: 8_000 });

    const consoleErrors = [...players, display].flatMap((client) => client.consoleErrors);
    expect(consoleErrors).toEqual([]);

    await display.context.close();
  } finally {
    await Promise.all(players.map((client) => client.context.close()));
  }
});

test("leaving the lobby transfers organizer controls to the next player", async ({ browser }) => {
  const clients: TestClient[] = [];
  const owner = await newClient(browser, "原房主", { width: 390, height: 844 });
  clients.push(owner);
  try {
    await owner.page.getByRole("button", { name: "创建房间", exact: true }).click();
    await owner.page.getByRole("textbox", { name: "你的昵称" }).fill(owner.nickname);
    await owner.page.getByRole("combobox", { name: "玩家人数" }).selectOption("5");
    await owner.page.getByRole("button", { name: "创建房间", exact: true }).click();
    const code = (await owner.page.locator(".lobby__heading h1").innerText()).trim();

    for (const nickname of ["接任房主", "三号玩家", "四号玩家", "五号玩家"]) {
      const client = await newClient(browser, nickname, { width: 390, height: 844 });
      clients.push(client);
      await joinPlayer(client, code);
    }

    await owner.page.getByRole("button", { name: "退出房间", exact: true }).click();
    await expect(owner.page.getByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
    const successor = clients[1]!;
    await expect(successor.page.locator(".lobby__host")).toContainText("当前房主：接任房主（你）", { timeout: 8_000 });

    const replacement = await newClient(browser, "补位玩家", { width: 390, height: 844 });
    clients.push(replacement);
    await joinPlayer(replacement, code);
    const start = successor.page.getByRole("button", { name: "开始新手教学", exact: true });
    await expect(start).toBeEnabled({ timeout: 8_000 });
    await start.click();
    await expect(successor.page.getByText(/教学 1 \/ \d+/)).toBeVisible();
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test("the last player leaving destroys the room and returns its public display home", async ({ browser }) => {
  const owner = await newClient(browser, "单人房主", { width: 390, height: 844 });
  const display = await newClient(browser, "客厅大屏", { width: 1920, height: 1080 });
  try {
    await owner.page.getByRole("button", { name: "创建房间", exact: true }).click();
    await owner.page.getByRole("textbox", { name: "你的昵称" }).fill(owner.nickname);
    await owner.page.getByRole("combobox", { name: "玩家人数" }).selectOption("5");
    await owner.page.getByRole("button", { name: "创建房间", exact: true }).click();
    const code = (await owner.page.locator(".lobby__heading h1").innerText()).trim();
    await joinDisplay(display, code);

    await owner.page.getByRole("button", { name: "退出房间", exact: true }).click();
    await expect(owner.page.getByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible();
    await expect(display.page.getByRole("heading", { name: "今夜，每个人都有秘密" })).toBeVisible({ timeout: 8_000 });
    expect((await owner.context.request.get(`/api/rooms/${code}`)).status()).toBe(404);
  } finally {
    await Promise.all([owner.context.close(), display.context.close()]);
  }
});
