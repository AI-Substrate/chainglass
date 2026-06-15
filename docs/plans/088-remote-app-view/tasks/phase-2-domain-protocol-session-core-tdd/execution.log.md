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

<!-- next-entry: append new task entries above this line -->
