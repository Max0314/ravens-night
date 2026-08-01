# Full-Auto Clocktower Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate, containerize, and deploy an invitation-based, full-auto storyteller social-deduction web game for 5–12 phone players plus one public display.

**Architecture:** A pnpm TypeScript monorepo contains a pure deterministic game engine, a Fastify HTTP/WebSocket application, and a React/Vite PWA. PostgreSQL stores accounts, rooms, append-only game events, and snapshots; a single application instance serializes commands per room. Production runs behind the server's existing Nginx according to its ops conventions; Docker Compose binds the app only to a loopback port selected after server inspection.

**Tech Stack:** TypeScript, pnpm workspaces, React, Vite, Fastify, WebSocket, TypeBox, PostgreSQL, Drizzle ORM, Vitest, Playwright, Docker Compose, Nginx.

## Global Constraints

- All human participants are players; no DM, secret admin view, or manual adjudication exists.
- First release supports 5–12 players, one beginner script, phone portrait layouts, and a 1080p/4K public display.
- Public and private response schemas are separate; the display never receives hidden instance data.
- The event log plus seed must replay to the same state after browser refresh or container restart.
- UI uses the approved original midnight-gothic direction: `#080B12`, `#121A28`, `#B58B43`, `#EEE4CD`, `#8F303B`.
- Beginner onboarding lasts 3–5 minutes and uses progressive, contextual guidance.
- Production PostgreSQL is not exposed on the host; the app runs as a non-root container.
- Do not modify or overwrite existing server Nginx sites, ports, Docker networks, or ops-managed files.

## Planned File Structure

```text
apps/web/                         React PWA and three authorized UI modes
apps/server/                      Fastify API, WebSocket gateway, room coordinator
packages/contracts/               TypeBox command/event/view contracts
packages/content/                 Original localized role metadata and tutorials
packages/game-engine/             Pure state machine, role rules, storyteller policy
packages/ui/                      Design tokens and reusable components
tests/e2e/                        Multi-context Playwright journeys
deploy/docker-compose.yml         App and PostgreSQL production stack
deploy/nginx.example.conf         WebSocket-capable reference proxy
docs/deployment.md                Server inspection, deploy, backup, rollback
```

---

### Task 1: Monorepo, quality gates, and container baseline

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`
- Create: `apps/web/package.json`, `apps/server/package.json`
- Create: `packages/{contracts,content,game-engine,ui}/package.json`
- Create: `deploy/docker-compose.yml`, `deploy/Dockerfile`, `.env.example`
- Test: `tests/smoke/workspace.test.ts`

**Interfaces:**
- Produces workspace scripts `lint`, `typecheck`, `test`, `build`, and `test:e2e`.
- Produces Compose services `app` and `postgres`; Nginx remains host-managed.

- [ ] **Step 1: Write a failing workspace smoke test**

```ts
import { access } from "node:fs/promises";
import { test } from "vitest";

test("workspace exposes required deploy files", async () => {
  await Promise.all([
    access("deploy/docker-compose.yml"),
    access("deploy/Dockerfile"),
    access(".env.example"),
  ]);
});
```

- [ ] **Step 2: Run `pnpm vitest tests/smoke/workspace.test.ts` and confirm it fails because the files do not exist.**
- [ ] **Step 3: Add the workspace manifests, strict TypeScript settings, lint/format scripts, multi-stage non-root Dockerfile, PostgreSQL health check, and `.env.example`.**
- [ ] **Step 4: Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `docker compose -f deploy/docker-compose.yml config`.**
- [ ] **Step 5: Commit with `chore: scaffold full-auto game workspace`.**

### Task 2: Contracts, persistence schema, and authentication

**Files:**
- Create: `packages/contracts/src/{commands,events,views,transport}.ts`
- Create: `apps/server/src/db/{schema,client,migrate}.ts`
- Create: `apps/server/src/auth/{password,session,routes}.ts`
- Create: `apps/server/src/rooms/{codes,repository,routes}.ts`
- Test: `apps/server/src/auth/auth.test.ts`, `apps/server/src/rooms/codes.test.ts`

**Interfaces:**
- Produces `PublicGameView`, `PlayerGameView`, `OrganizerLobbyView` as disjoint schemas.
- Produces `hashPassword()`, `verifyPassword()`, `createSession()`, `createRoomCode()`.
- Produces tables `users`, `sessions`, `rooms`, `room_participants`, `games`, `game_events`, `game_snapshots`.

- [ ] **Step 1: Write tests proving passwords are not stored directly, room codes omit ambiguous characters, and `PublicGameView` rejects hidden fields.**

```ts
expect(await verifyPassword("night-secret", await hashPassword("night-secret"))).toBe(true);
expect(createRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
expect(() => PublicGameViewSchema.Check({ ...publicView, roleId: "demon" })).toThrow();
```

- [ ] **Step 2: Run the focused tests and confirm missing exports fail.**
- [ ] **Step 3: Implement TypeBox schemas, Argon2id password helpers, hashed opaque sessions, Drizzle schema, migrations, registration/login/logout, room creation, and invite lookup.**
- [ ] **Step 4: Run authentication and room tests against an isolated PostgreSQL test container.**
- [ ] **Step 5: Commit with `feat: add auth room contracts and persistence`.**

### Task 3: Deterministic engine and setup distribution

**Files:**
- Create: `packages/game-engine/src/{types,state,commands,events,reducer,rng,setup,win}.ts`
- Create: `packages/game-engine/src/__tests__/{setup,replay,invariants}.test.ts`
- Create: `packages/content/src/{roles,script,zh-CN}.ts`

**Interfaces:**
- Consumes command and event contracts from `@app/contracts`.
- Produces `createGame(config, seed)`, `decide(state, command)`, `reduce(state, event)`, `replay(events)`.
- Produces exact 5–12 player distributions from the approved design spec.

- [ ] **Step 1: Write table tests for every 5–12 player distribution and a replay determinism test.**

```ts
expect(distributionFor(8)).toEqual({ townsfolk: 5, outsider: 1, minion: 1, demon: 1 });
expect(replay(events)).toEqual(events.reduce(reduce, initialState));
```

- [ ] **Step 2: Run tests and confirm distribution and replay functions are absent.**
- [ ] **Step 3: Implement seeded PRNG, immutable state, command validation, append-only events, setup modifiers, seat assignment, phase transitions, generic death, nomination, voting, execution, and base win checks.**
- [ ] **Step 4: Add property tests preventing duplicate seats, negative ghost votes, two executions per day, or actions from dead nominators.**
- [ ] **Step 5: Run engine tests and commit with `feat: add deterministic game engine core`.**

### Task 4: Beginner role pack and automated storyteller policy

**Files:**
- Create: `packages/game-engine/src/roles/{townsfolk,outsiders,minions,demon}.ts`
- Create: `packages/game-engine/src/storyteller/{information,registration,redirect,timeout}.ts`
- Create: `packages/game-engine/src/night/{order,resolution}.ts`
- Test: `packages/game-engine/src/roles/*.test.ts`, `packages/game-engine/src/storyteller/*.test.ts`

**Interfaces:**
- Produces 22 role modules with `setup`, `legalActions`, `resolve`, and `onEvent` hooks.
- Produces `chooseInformationResult(context)`, `chooseRegistration(context)`, and `resolveKill(context)` using the game seed and event sequence.

- [ ] **Step 1: Write interaction tests for poison duration, drunken misinformation, outsider-count modification, protection, demon immunity, first-nomination execution, ghost votes, demon succession, red-herring detection, night-death lookup, and special wins.**
- [ ] **Step 2: Run focused tests and confirm all role hooks fail before implementation.**
- [ ] **Step 3: Implement the 22 typed role modules, explicit night order, legal target rules, status duration, registration choices, kill redirects, special win priority, and seed-based timeouts.**
- [ ] **Step 4: Add storyteller-policy properties: every result is legal, poisoned output has identical transport shape, and the same seed/event sequence gives the same choice.**
- [ ] **Step 5: Run all engine tests with coverage thresholds of 95% statements/branches for `packages/game-engine`.**
- [ ] **Step 6: Commit with `feat: implement beginner roles and auto storyteller`.**

### Task 5: Room coordinator, authorized views, and real-time transport

**Files:**
- Create: `apps/server/src/game/{coordinator,event-store,snapshots,views}.ts`
- Create: `apps/server/src/realtime/{gateway,connections,protocol}.ts`
- Create: `apps/server/src/app.ts`, `apps/server/src/index.ts`
- Test: `apps/server/src/game/{coordinator,views,recovery}.test.ts`, `apps/server/src/realtime/gateway.test.ts`

**Interfaces:**
- Consumes `decide/reduce/replay` from the engine.
- Produces `RoomCoordinator.submit(actor, commandId, command)` with per-room serialization and idempotency.
- Produces `getPublicView()`, `getPlayerView(participantId)`, and lobby-only organizer capabilities.

- [ ] **Step 1: Write concurrency tests sending duplicate votes and simultaneous nominations, plus view tests that recursively scan the public payload for hidden keys.**
- [ ] **Step 2: Run tests and confirm coordinator/view exports are missing.**
- [ ] **Step 3: Implement transactional event append, phase snapshots, per-room command queues, authorized view projection, WebSocket resume by event sequence, heartbeat, online state, and reconnect pause.**
- [ ] **Step 4: Start PostgreSQL, run recovery tests, terminate and recreate the coordinator, and verify the resulting view and PRNG position match.**
- [ ] **Step 5: Commit with `feat: add realtime room coordinator and recovery`.**

### Task 6: Design system, PWA shell, and generated-art pipeline

**Files:**
- Create: `packages/ui/src/{tokens,Button,Panel,RoleCard,SeatRing,Countdown}.tsx`
- Create: `packages/ui/src/styles/{fonts,base,motion}.css`
- Create: `apps/web/src/{main,App,routes,api,realtime}.tsx`
- Create: `apps/web/public/manifest.webmanifest`, `apps/web/src/assets/README.md`
- Test: `packages/ui/src/*.test.tsx`, `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces reusable responsive components with no game-state ownership.
- Uses the approved colors and supports `prefers-reduced-motion` and low-performance mode.

- [ ] **Step 1: Write component tests for 44px touch targets, keyboard focus, reduced motion, role-card privacy cover, and 64px portrait fallback.**
- [ ] **Step 2: Run tests and confirm the components are missing.**
- [ ] **Step 3: Implement tokens, typography, etched panels, buttons, role cards, seat ring, countdown, responsive breakpoints, PWA manifest, offline reconnect shell, and image `srcset` conventions.**
- [ ] **Step 4: Add an asset validation script requiring AVIF/WebP card, avatar, and icon variants for each content role; generated neutral draft assets may be used during engine development but must pass the same manifest checks.**
- [ ] **Step 5: Run UI unit tests, Axe checks, and production build; commit with `feat: add midnight gothic design system`.**

### Task 7: Join flow, lobby, onboarding, and public display

**Files:**
- Create: `apps/web/src/pages/{Home,Login,CreateRoom,JoinRoom,Lobby,Tutorial,Display}.tsx`
- Create: `apps/web/src/features/onboarding/{steps,RoleLesson,PracticeVote}.tsx`
- Create: `apps/web/src/features/lobby/{SeatPicker,Presence,DisplayApproval}.tsx`
- Test: `apps/web/src/pages/*.test.tsx`, `tests/e2e/lobby.spec.ts`

**Interfaces:**
- Consumes organizer/player/display sessions and authorized WebSocket views.
- Produces the complete pre-game journey and a public-display-only route.

- [ ] **Step 1: Write route tests for organizer login, nickname/code join, display approval, seat binding, all-player readiness, and tutorial acknowledgements.**
- [ ] **Step 2: Run tests and confirm routes fail.**
- [ ] **Step 3: Implement the polished home page, six-character code input, QR rendering, player/display mode selection, seat lobby, connectivity test, 3–5 minute onboarding, practice vote, and private role lesson.**
- [ ] **Step 4: Run Playwright with eight phone contexts and one 1080p display through role confirmation.**
- [ ] **Step 5: Commit with `feat: add lobby onboarding and public display`.**

### Task 8: Night, day, nomination, voting, and results UI

**Files:**
- Create: `apps/web/src/pages/Game.tsx`
- Create: `apps/web/src/features/game/{NightAction,PrivateInfo,Discussion,Nomination,Vote,GhostVote,Results,RuleHelp}.tsx`
- Create: `apps/web/src/features/display/{NightScreen,DawnScreen,DiscussionScreen,VoteScreen,ResultsScreen}.tsx`
- Test: `apps/web/src/features/game/*.test.tsx`, `tests/e2e/full-game.spec.ts`

**Interfaces:**
- Consumes only `PlayerGameView` on player routes and only `PublicGameView` on display routes.
- Produces all actionable commands with stable `commandId` idempotency keys.

- [ ] **Step 1: Write UI tests for legal target disabling, irreversible confirmation, hidden waiting screens, contextual help, nominations, vote threshold, tie display, and ghost-vote confirmation.**
- [ ] **Step 2: Run tests and confirm missing feature components fail.**
- [ ] **Step 3: Implement phone night actions, information reveal/replay, discussion timer, nomination defense, ordered voting, execution, results timeline, “what do I do now?” help, and matching atmospheric public screens.**
- [ ] **Step 4: Run a five-player and eight-player full-game Playwright scenario including poison, night death, execution, demon succession, disconnect, refresh, and victory.**
- [ ] **Step 5: Commit with `feat: complete playable day and night experience`.**

### Task 9: Security, multi-device reliability, and visual QA

**Files:**
- Create: `tests/e2e/{privacy,reconnect,viewports}.spec.ts`
- Create: `tests/load/rooms.mjs`, `scripts/check-secrets.mjs`
- Modify: `apps/server/src/app.ts`, `apps/web/src/styles/*`
- Create: `docs/security.md`

**Interfaces:**
- Produces repeatable CI verification for privacy, recovery, concurrency, and supported viewports.

- [ ] **Step 1: Add failing tests for cross-player access, forged seats, expired sessions, code brute-force limits, CSRF, hidden-field leakage, and container restart recovery.**
- [ ] **Step 2: Add screenshot assertions at 360×640, 390×844, 430×932, 1920×1080, and 3840×2160.**
- [ ] **Step 3: Implement remaining security headers, validation, rate limits, log redaction, responsive fixes, and focus/readability fixes found by the tests.**
- [ ] **Step 4: Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` and a 20-room/260-connection load test with P95 broadcast under 300ms.**
- [ ] **Step 5: Commit with `test: verify privacy recovery and multi-device play`.**

### Task 10: Deployment documentation and target-server release

**Files:**
- Create: `deploy/nginx.example.conf`, `scripts/deploy.sh`, `scripts/backup.sh`, `scripts/restore.sh`
- Create: `docs/deployment.md`, `docs/operations.md`
- Modify: `deploy/docker-compose.yml`, `.env.example`, `README.md`

**Interfaces:**
- Consumes the target server's discovered ops directory, Nginx include conventions, Docker network, and assigned loopback port.
- Produces a health-checked HTTPS deployment and rollback instructions.

- [ ] **Step 1: Write a deployment smoke script that fails unless `/healthz`, WebSocket upgrade, database migration status, and static asset caching all pass.**
- [ ] **Step 2: Reconnect to `cpl@1.14.72.50`; read the ops documentation and inspect Nginx, active ports, Docker networks, DNS conventions, certificate ownership, backup paths, and deployment directories without modifying them.**
- [ ] **Step 3: Select a non-conflicting loopback port and an ops-compliant subdomain; verify its DNS A/AAAA record resolves to the server before requesting a certificate.**
- [ ] **Step 4: Implement project-scoped deploy/backup/restore scripts and an Nginx server block with WebSocket proxy headers, request-size limits, timeouts, security headers, and immutable asset caching.**
- [ ] **Step 5: Upload or pull the release into the approved server directory, create the server-only `.env`, build images, migrate, start Compose, and install the Nginx include using the server's required privilege workflow.**
- [ ] **Step 6: Run local-on-server health checks, external HTTPS smoke tests, multi-phone WebSocket checks, backup/restore rehearsal, and inspect logs for secret leakage.**
- [ ] **Step 7: Commit deployment docs with `docs: add production deployment and operations runbook`; tag the deployed revision and report subdomain, port, service names, backup location, and rollback command.**

## Plan Self-Review

- Every approved specification section maps to a task: scope/auth (2, 7), engine/roles/storyteller (3, 4), realtime/recovery (5), UI/art/onboarding (6–8), security/testing (9), Compose/Nginx/deployment (1, 10).
- Public/private view types have one canonical name throughout the plan.
- No implementation task depends on a later task's interface.
- Deployment does not assume SSH credentials, DNS, Nginx layout, port, or privilege model before server inspection.
- Every implementation step names its concrete output and verification command; draft art assets must be replaced before acceptance.
