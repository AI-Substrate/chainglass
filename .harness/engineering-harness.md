# Engineering harness

> **AGENTS START HERE → `harness instructions`** — the CLI's baked agent
> briefing (envelope contract, role split, discovery loop). Then
> `harness instructions <verb>` per verb.

## Boot command
`harness boot` → wraps **`just typecheck`** (per-workspace `tsc --noEmit`) — a fast,
read-only "is the system healthy to work on?" proof. Deliberately *not* `just check`:
that conflates boot (health) with backpressure (lint/test), which the harness models as
separate verbs — and `just check` is currently red on 46 pre-existing format violations
(see Back-pressure gaps), which would make boot permanently noisy. Lint/format/test stay
as backpressure sensors. Richer dev-server + `/api/health` boot = later Improve-beat
upgrade. Extension: `.harness/extensions/boot/extension.ts`.

## Health check
`just check` exit 0 = healthy. Live-system probes (when a dev server is up):
`just preflight` (CLI freshness + dev-server PID + workspace dir, exits non-zero) ·
`GET /api/health` → `{status:"ok"}` (`apps/web/app/api/health/route.ts`) ·
`just harness-require` (curls the app port).

## Interact method
`DISABLE_GITHUB_OAUTH=true` (auth bypass → fake session, `apps/web/src/auth.ts:60`) ·
`cg <cmd> --json` (structured CLI envelope) · `createTestContainer()` (fully-faked,
network-free app, `apps/web/src/lib/di-container.ts:738`) · `fake-streamd` (remote-view
WS without a daemon, `apps/web/src/features/088-remote-view/testing/fake-streamd.ts`).

## Observe method
minih run artifacts (`agents/code-review-companion/runs/*/output/report.json` —
findings + `retrospective.magicWand`) · `cg --json`/`--stream` envelopes ·
`just harness-verify <path>` (real render: HTTP 2xx + console + Turbopack ⨯) ·
Playwright `.playwright-mcp/console-*.log` + screenshots · streamd `stats`/`client-stats`.

## Deterministic signal inventory
Static (CI-gated): biome lint · per-workspace `tsc --noEmit` · `vitest run` (+coverage, 50%) ·
`turbo build`. On-demand: `pnpm audit --audit-level=high` · `swift test` (native/streamd) ·
`just streamd-smoke` (headless daemon: auth/handshake/frames/lifecycle, L5) ·
`just remote-view-stream-smoke` (fake-streamd replay) · `just harness-verify` (render, L4) ·
42 `*.contract.test.ts` (fake-AND-real adapter parity). Full inventory + proof levels:
`.harness/reports/harnessability/001-chainglass/report.md` (Back-pressure surface inventory).

## Evidence paths
`agents/code-review-companion/runs/*/output/` (report.json, events.ndjson) ·
`.playwright-mcp/` (console logs, screenshots) · `docs/plans/*/tasks/*/execution.log.md` (313) ·
`docs/plans/*/tasks/*/reviews/` · `.harness/reports/harnessability/` (this assessment).

## Injection map

Host flow = **`/the-flow`** (the in-repo SDD pipeline: `docs/plans/<ord>-<slug>/`). It is
already harness-aware and **self-fires** `/eng-harness-flow --hook …` at its own seams
(the-flow invariant 9 + `~/.claude/skills/the-flow/references/harness-seams.md`). Per
eng-harness adopt Step 3 (`adopt.md:142`, "host flow self-fires") **no weave is needed** —
this table just records the moments it already covers. Plain branch/PR work (no the-flow)
is the one uncovered path; cover it later via `AGENTS.md` if it matters.

| Lifecycle hook (`--hook`) | the-flow seam (`--event` alias) | Fires from |
|---|---|---|
| `pre-flight` | `session-start`, `pre-implement` | the-flow guided engine — boot validation before work |
| `pre-coding` | `post-spec` | the-flow — backpressure survey once a spec/plan settles |
| `coding` | `task-pause` | the-flow — silent in-flight observe mid-implement |
| `post-coding` | `phase-end` | the-flow — per-phase retro drain |
| `post-flight` | `plan-complete` | the-flow — terminal harvest + improve |

## Back-pressure gaps
Named honestly from the scout (`.harness/reports/harnessability/001-chainglass/report.md`):
- **`just check` is currently RED — 46 pre-existing biome-format violations across ~14 files** (boot's first finding, 2026-06-20). Three buckets: (1) CLI-generated JSON — `docs/plans/086,087/the-flow.json` trip biome the same way `.harness/` did (biome ↔ harness JSON-format disagreement; candidate fix: biome-ignore `docs/plans/**/the-flow.json` + `**/*.flow.json`); (2) cross-language `088-remote-view/protocol/fixtures/*.json` — must NOT be reformatted (Swift reads them byte-wise; candidate fix: biome-ignore the fixtures dir); (3) genuine source debt — `image-actions.ts`, `save-image.ts`, `session-machine.ts`, `messages.ts`, `image-editor.tsx` (fix via `just format`). None introduced by adoption.
- **Architecture boundaries are prose, not a sensor** (weakest area, E) — no dependency-cruiser/boundary lint; nothing fails a build on a forbidden import.
- **No complexity/size/dup/dead-code sensors** — several >2000-line mega-files unguarded.
- **CI typecheck narrower than local** (root `tsc` only vs per-workspace) — cheap XS fix.
- **native/streamd has zero CI coverage** — swift test + smokes are host-Mac-only.
- **No pre-commit gate** — enforcement deferred to CI or manual `just fft`.
- **Boot is static-health only** — a dev-server + `/api/health` boot would prove the *running* system (Improve-beat upgrade).
- **streamd LIVE capture + workspace-register + GitHub OAuth** are manual/host-Mac (mitigated by headless smokes + `DISABLE_GITHUB_OAUTH`).

## Current maturity snapshot
**L0 — seeded at inception by `harness init`; nothing proven yet.**
<!-- The single, current L0–L4 level the harness is ACTUALLY at. Updated ONLY at
     the Improve beat (never by boot, which is read-only). See maturity-assessment.md. -->
