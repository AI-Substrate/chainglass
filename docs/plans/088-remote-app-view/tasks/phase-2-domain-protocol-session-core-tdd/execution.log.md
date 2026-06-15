# Execution Log — Phase 2: Domain, Protocol & Session Core (TDD)

**Plan**: ../../remote-app-view-plan.md · **Phase**: 2 of 6 · **Started**: 2026-06-15
**Mode**: Full · **Companion**: code-review-companion (live per-commit review)

Per-task entries are appended in order, above the footer marker.

---

## T000 — Pre-implement harness seam

**Event**: `/eng-harness-flow --event pre-implement --phase "Phase 2: Domain, Protocol & Session Core (TDD)" --plan-dir docs/plans/088-remote-app-view --prompt-optional=false`
**Outcome**: Router installed (`~/.agents/skills/eng-harness-flow/SKILL.md` present) but this repo has **no `.harness/`** — the seam routes to adoption and **noops** (verdict equivalent to `UNAVAILABLE`). Standard vitest testing applies (`fileParallelism:false`, jsdom for `**/web/**`). No blocker; recorded once, not re-warned.

---

## T001 — Domain setup + feature dir ✅

**Created**:
- `docs/domains/remote-view/domain.md` — Purpose, Owns/Excludes (from spec sketch), §Concepts (ADR-0011: Wire Protocol, Frame-Replay Fake, Viewport Machine, Session, Token Route), Dependencies (per-phase wiring), Source Location, History.
- `apps/web/src/features/088-remote-view/{protocol/fixtures/video,server,hooks,testing,params,sdk,components}` — feature skeleton (`.gitkeep` in the three Phase-2-empty dirs: params/sdk/components).
- `apps/web/app/api/remote-view/token/` dir (route lands in T008); `test/unit/web/features/088-remote-view/` test dir.

**Edited (additive only)**:
- `docs/domains/registry.md` — row `| Remote View | remote-view | business | — | Plan 088 | active |`.
- `docs/domains/domain-map.md` — `remoteView` node + dependency edges (auth wired Phase 2; events/state/sdk/panel-layout designed) + Health Summary row.

**Notes**: No `_platform` source touched (T002 guard makes that permanent). No TS yet → typecheck/lint unaffected. Progress cadence for this phase: task-table checkbox + this log updated per task (the user-watched surfaces); the tasks.md Architecture Map node colours are flipped in one pass at phase end.

## T002 — Dep-direction guard (test-first) ✅

**Created**: `test/unit/web/architecture/platform-no-remote-view.test.ts` — re-roots the `viewer-no-file-browser.test.ts` mechanism (recursive source collect + import-specifier regex) to scan `apps/web/src/features/_platform/` for any `from '…088-remote-view…'` / `import('…088-remote-view…')`; asserts zero. Carries the 5-field Test Doc.

**Result**: `1 passed` (green now, invariant forever after). The guard exists before the domain has consumable code, so a violating import can never land unnoticed.

**Note**: scope is the `_platform/*` feature tree only (precedent re-rooted) — no separate package sweep (packages don't import feature dirs). Pre-existing env wart: a stale `apps/cli/dist/web/standalone/apps/web/tsconfig.json` triggers a non-fatal tsconfck warning under vitest; tests still run + pass.

## T003 — Protocol messages (Zod) + JSON fixtures ✅ (TDD: RED→GREEN)

**RED**: wrote `test/unit/web/features/088-remote-view/protocol-messages.test.ts` (6 cases, 5-field Test Docs) + `protocol/fixtures/messages.json` first → ran, failed on missing module.
**GREEN**: implemented `protocol/messages.ts` (zod v4 `z.discriminatedUnion('t', …)` for `ClientMessage`/`ServerMessage`, `InputEvent` on `k`, `Mods`, `WindowDescriptor`, `ErrorCode` enum (7 codes), `WindowStateName`). Parse-at-boundary helpers `parseClientMessage`/`parseServerMessage` return `null` on invalid **or unknown `t`** (forward-compat, never throw); unknown fields stripped by Zod default. `encodeMessage` = JSON.stringify. → **6 passed**.

**Coverage proven by test**: every client `t` (8) + server `t` (8) + all 7 error codes + all 7 InputEvent kinds present in the fixture; round-trip identity for all fixtures; malformed→null; unknown-`t`→null; extra-fields stripped.

**Cross-language**: `fixtures/messages.json` is the canonical source of truth the Swift daemon (Task 4.2) round-trips — drift rule: any protocol change regenerates this + `frame-header.json` (T004) and re-runs T003 + T004 + Task 4.2.

**Dep pin (Finding/validation)**: added `"zod": "^4.3.5"` to `apps/web/package.json` + synced `pnpm-lock.yaml` (offline; resolves to the already-hoisted `4.3.6`) — guards the v4 `discriminatedUnion` semantics against monorepo hoist drift (v3 deps coexist). Pre-existing unrelated peer warning (`@xterm/addon-canvas`) unchanged.

## T004 — Binary 16-byte header codec ✅ (TDD: RED→GREEN)

**Fixture ground truth**: generated `protocol/fixtures/frame-header.json` hex via an **independent** DataView reference (not `binary.ts`), so the committed bytes are trustworthy ground truth, not circular. Row 4 = `2^53+1` (9007199254740993) to force the BigInt u64 path.
**RED→GREEN**: wrote `protocol-binary.test.ts` (5 cases, 5-field Test Docs) → implemented `protocol/binary.ts` (`encodeFrameHeader`/`decodeFrameHeader`/`encodeFrame`/`decodeFrame`/`toChunkInit`; DataView big-endian; `getBigUint64`/`setBigUint64` for u64). → **5 passed**.

**Proven**: each fixture row encodes to its exact committed hex; decodes back (incl. u64 > 2^53 without precision loss); header+payload round-trip; `toChunkInit` yields `{type:'key'|'delta', timestamp:number, data}` (EncodedVideoChunk bridge, node-safe — no WebCodecs constructed); unknown frame type (0x02) + too-short buffers → `null` (drop silently).

**Cross-language**: `frame-header.json` is the **binary** drift guard (Swift Task 4.2 matches byte-for-byte); folded into the T003 drift rule (any protocol change regenerates `messages.json` + `frame-header.json` and re-runs T003 + T004 + Task 4.2).

## T006 — Session machine (pure transitions) ✅ (TDD)

Done **before** T005 (depends only on T003; pure → no fake needed). `server/session-machine.ts` — pure `transition(state, event)` reducer, no I/O. **11 tests green.**

**All 10 viewport states** modelled + proven reachable: `picker · attaching · live · degraded · reconnecting · displaced · windowGone · sessionLost · daemonDown · error` (the validation-flagged 10th, `daemonDown`, included).

**Race rules encoded + tested**:
- **R3** — `displaced` NEVER auto-reconnects: every socket/timer/reconnect event leaves it `displaced`; only explicit `RECLAIM`/`PICK_WINDOW`/`DETACH` move it (grep-checkable: the only paths out of `displaced` are those three cases).
- **R7** — attach-while-attaching = last-click-wins (`PICK_WINDOW` from any state → `attaching`, new windowId, attempts reset).
- **R9** — CLEAN `SOCKET_CLOSED` does NOT enter `reconnecting` (intentional teardown); only UNEXPECTED close does; `DETACH` → `picker`.
- **reconnecting fork** — `RECONNECT_EXHAUSTED{daemonHealthy:true}` → `sessionLost`; `{false}` → `daemonDown` (R6 health fork).
- **error mapping** — `errorCodeToState`: `E_SESSION_UNKNOWN`→`sessionLost`, `E_WINDOW_GONE`→`windowGone`, others→`error` (carrying the code for the AC-14 card).
- keyframe-first: `attaching`→`live` only on a keyframe (delta keeps waiting); backoff `[250,1000,3000]`, MAX 3.

Exports `MAX_RECONNECT_ATTEMPTS`, `RECONNECT_BACKOFF_MS`, `initialState`, `transition`, `errorCodeToState` for T007.

## T005 — Frame-replay fake (AC-12) ✅

`testing/fake-streamd.ts` — a Node `ws` server, a third implementation of the Workshop-003 protocol. **7 tests green.** Copied the Phase 1 video set (254 real `sck-capture` frames + manifest) into `protocol/fixtures/video/` and **owns it from here** (never mutates the `external-research/` seed). Fixture reader is dependency-free (fs + manifest) so it runs in the Phase 3 Docker container (Finding 06). Binds ephemeral `:0`, full teardown in `afterEach`.

**Pinned window descriptor** lives in `testing/fixtures.ts` (`FAKE_WINDOW` = `{id:34202, app:'Godot', title:'spike-target', pixelWidth:800, pixelHeight:656, scale:2}`) — the one source the fake, the T009 service, and the Phase 3 picker share (manifest has no window fields).

**Proven behaviours (all the Done-When obligations):**
- hello → hello-ok (pinned window) → video-config (from manifest) → binary keyframe (seq 0) → deltas via `pushFrames` (seq 1,2,3…).
- **Reattach**: R2 — a 2nd hello on a live session displaces the old viewer (`displaced` + close 4002), new viewer gets a keyframe; R1 — after a clean close the session is `unwatched`, a fresh hello resumes `streaming` with a keyframe.
- **ping→pong** (echoes `sentAt`, adds `daemonAt`); **WS heartbeat ping** (`sendHeartbeatPing`); **socket-death** → session `unwatched` (R5 substrate; displaced old socket's close does NOT reset the new slot).
- `request-keyframe` and `resume` each yield a fresh keyframe.
- Cue API: `sendDisplaced` / `sendWindowState` / `sendError` deliver the matching frames.
- **Drop-simulation**: `dropFrames(n)` makes the next sequence jump by n (observable gap 2→8) — the HUD/degraded substrate.
- **Input log**: received `input` events captured in order (AC-3 serialization half).
- Shape-only auth: a tokenless upgrade → `error E_AUTH` + close.

Pre-existing env wart (non-fatal): tsconfck `EXTENDS_RESOLVE` warning from the stale `apps/cli/dist` tsconfig; tests pass.

<!-- next-entry: append new task entries above this line -->
