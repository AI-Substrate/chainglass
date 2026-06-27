# Harnessability Assessment — chainglass

**Run metadata**
- Timestamp: `20260620T230641Z`
- Repo root: `/Users/jordanknight/substrate/084-random-enhancements-3` (git worktree)
- Branch / commit: `084-random-enhancements-3` @ `5b37e7c8`
- Mode: **static** (read-only) — 6 inspector subagents fanned out over disjoint subsystems, this orchestrator merged + scored
- Commands executed: read-only `git`, `ls/find/wc`, `grep`, file reads, `git log --name-only -200`
- Commands skipped: install / build / test / boot / smoke / agent runs / secret reads (env names only)
- Safety notes: no services booted, no deps installed, no state mutated, no external calls, no secret values read. Sensors marked `configured_unverified` were evidenced by file/recipe inspection + prior recorded runs (e.g. Plan 088 logs: swift test 75/75, streamd-smoke 40/40), not executed here.

## Verdict

| Axis | Grade | % |
|---|---|---|
| **Operate-Today** | **A** | 93% |
| **Adaptability** | **B** | 70% |
| Harnessability Index (0.5:0.5) | B | 82% |
| **Final grade** | **B** | — |

- **Readiness:** **H4** (Proveable). The repo's *native* engineering loop already exhibits **H5** traits (compounding friction→improvement); the headline is held at H4 because the **new** `.harness/` engineering-harness front door is not yet operable (boot contract empty).
- **Highest proof level detected:** **L4** (interaction + observable consequence — render checks, contract tests, headless daemon smoke). **L5 reachable** (reproducible clean rerun — wire smokes into CI).
- **Confidence:** **High** (most dimensions have direct file/command evidence; topology clear; B2 temporal-coupling is the one medium-confidence area).

> `final_grade` does **not** hide the weak axis: **Adaptability (B, 70%) trails Operate-Today (A, 93%)**, and the single weakest area is **Architecture enforcement & complexity (E)**.

## Plain-English assessment

**What's ready.** This is an unusually mature repo for agent operation — unsurprising, since it *is* an agentic-development platform. A fresh agent gets: a single `justfile` front door (`just check`, `just fft`, `just preflight`), a pinned reproducible environment (two ways: host `just dev` and Docker `just harness dev`), a **documented auth bypass** (`DISABLE_GITHUB_OAUTH`) so no GitHub app is needed locally, textbook **ports-and-adapters seams** (22 interfaces + 18 fakes, 42 contract suites that run the *same* tests against fake **and** real adapters), a **hermetic unit lane** with no network/creds, rich **machine-readable evidence** (minih `report.json`, `cg --json` envelopes, Playwright console logs, streamd telemetry), and a genuinely **compounding loop** (wishlist `W0XX` → fix tasks, per-run `magicWand` retros, `the-flow` flight plans, 14 ADRs).

**What blocks confident agent work.** Three things, none fatal: (1) **cold-start noise** — ~14 stale root `*.md` scratch docs and a *false* `START_HERE.md` that points at Question-Popper feature docs rather than the system; (2) **the word "harness" means five different things** (Docker container, `harness-verify`, minih, the L3 governance doc, and the new L0 `.harness/`) with nothing disambiguating them at the front door; (3) **architecture rules live only in prose** — nothing fails a build when a forbidden cross-boundary import or a duplicated concept slips in.

**What the agent must still infer.** Whether a change violates an architecture boundary (no sensor); visual correctness beyond HTTP/console (no screenshot-diff); which "harness" a task refers to; and the real on-screen capture fidelity of streamd (headless smoke proves protocol/auth, not pixels).

**Local proof?** Yes — extensively. The only genuinely remote/manual pressure points are the **CLI agent-execution path** (hard-requires `GH_TOKEN`) and **streamd LIVE window capture** (needs macOS TCC grants, host-Mac-only). Both have headless/fake substitutes for everything except the final real-world grant.

## Top blockers (ranked)

1. **[HIGH] CI typecheck is narrower than local** — CI runs root `tsc --noEmit` only; local `just typecheck` loops every workspace. → swap `ci.yml:71` for `just typecheck` (effort **XS**).
2. **[HIGH] Architecture boundaries are prose, not a sensor** — `biome` is recommended-only; the "Search Before Creating" rule is human-enforced. → add `dependency-cruiser`/boundary lint to `just check`+CI (effort **M**). *Single weakest area.*
3. **[HIGH] Root `*.md` sprawl drowns the front door** — `START_HERE.md` is a false front door. → archive ~14 stale docs, fix `START_HERE`, leave README+AGENTS (effort **S**).
4. **[HIGH] "harness" overloaded 5 ways** — no front-door disambiguation. → add a terminology table + record the coexist-vs-supplant decision at the adopt bridge (effort **S**).
5. **[HIGH] native/streamd has zero CI coverage** — swift test + smokes are host-only. → add a macOS CI job (swift test + headless `just streamd-smoke`) (effort **M**).

## Highest-leverage improvements (executable)

| # | Action | Gap | Effort | Unblocks |
|---|---|---|---|---|
| 1 | CI runs `just typecheck` (not root-only tsc) | G01 | XS | L2 |
| 2 | Add `pnpm audit --audit-level=high` CI step | G09 | XS | L2 |
| 3 | Doc hygiene: archive sprawl, fix START_HERE, harness-terminology table, cross-link governance docs | G03/G04/G16 | S | L0 |
| 4 | Fill the engineering-harness boot contract by **wrapping existing commands** | G13 | M | L1 |
| 5 | `dependency-cruiser` boundary sensor in check+CI | G02 | M | L2 |
| 6 | macOS CI job: `swift test` + headless `streamd-smoke` | G05 | M | L4 |
| 7 | biome complexity + max-lines, knip, jscpd in check lane | G07 | M | L2 |

## First safe agent session plan

1. **Orient** — read `README.md` then `AGENTS.md` (NOT `START_HERE.md`/`INDEX.md` — stale).
2. **Map** — read `docs/c4/README.md` (L1→L3) + `docs/domains/registry.md` + `docs/adr/README.md` (read-only).
3. **Disambiguate "harness"** — read `docs/project-rules/harness.md` (L3) + `.harness/engineering-harness.md` (L0); `grep '^harness|^streamd' justfile`.
4. **Read the ledgers** — `docs/plans/076-harness-workflow-runner/harness-wishlist.md` + `docs/retros/`.
5. **Prove liveness read-only** — `just preflight` (non-destructive).

## Harness surfaces

| Surface | Role | Status |
|---|---|---|
| `justfile` (root) | canonical command front door | present |
| `harness/` + harness CLI (Docker dev container) | existing "harness" #1 — L3 | present |
| minih agent runner | existing "harness" #3 — agent-exec + retros | present |
| `just harness-verify` | existing "harness" #2 — page compile smoke | present |
| `docs/project-rules/harness.md` | existing "harness" #4 — L3 governance | present |
| `.harness/engineering-harness.md` | **NEW** engineering-harness (this adoption) | **L0 — boot contract TODO** |
| `.harness/adopt.flow.json` | adopt flight plan (scout→inject→build-boot→bridge) | in progress |

## Repository topology

- **Languages:** TypeScript, Swift, just/shell. **Runtimes:** Node 20.19.0 (pinned), Swift toolchain.
- **Layout:** pnpm@9.15.4 + turbo monorepo — `apps/{web,cli}` + `packages/{mcp-server,positional-graph,shared,workflow,workgraph}` + `harness/`; **`native/streamd`** (Swift SwiftPM, **outside** the pnpm graph).
- **Services:** Next.js 16 web (React 19), `cg` CLI, MCP server (stdio), workflow engine, node-pty terminal WS sidecar, streamd capture/encode/WS daemon.
- **CI:** `lint(biome) / build(turbo) / typecheck(tsc) / test(vitest --coverage) → gate(alls-green)`.
- **Persistence:** file-based JSON + driverless single-file SQLite — **no server DB/cache/queue/search driver** in any manifest.

## Axis A — Operate-Today scorecard (28/30)

| Dim | Band | Pts | Evidence (abridged) |
|---|---|---|---|
| A1 Cold-start orientation | Partial | 2 | README+AGENTS strong; ~14 stale root `*.md` + false `START_HERE.md` mislead |
| A2 Setup & env contract | Strong | 3 | pinned runtimes, documented secrets+defaults, doctor/preflight, two dev envs |
| A3 Locality of infra | Strong | 3 | no remote infra; auth bypass; fakes for every external dep; loopback services |
| A4 Front door & discoverability | Strong | 3 | single justfile; `just --list` default; --json-first wf/harness layer *(graded above-scale, capped)* |
| A5 Boot & health/readiness | Partial | 2 | strong primitives (preflight/doctor/health) but no single root `just up`/`doctor` |
| A6 Seed/fixture/reset | Strong | 3 | test-data/seed idempotent; cross-language fixtures; fake-streamd teardown |
| A7 Interaction surfaces | Strong | 3 | 32 API routes, ~25 CLI groups, MCP tools, WS, documented auth bypass |
| A8 Deterministic sensors | Strong | 3 | lint+tsc+vitest+build CI-gated; +audit/swift/smoke/harness-verify *(above-scale, capped)* |
| A9 Observability & evidence | Strong | 3 | minih report.json, --json envelopes, console logs, streamd telemetry, 313 exec logs |
| A10 Compounding loop | Strong | 3 | wishlist→fix tasks, magicWand retros, run history, flight plans, ADRs |

## Axis B — Adaptability scorecard (21/30)

| Dim | Band | Pts | Evidence (abridged) |
|---|---|---|---|
| B1 Coupling & blast radius | Partial | 2 | acyclic + layered, but fan-in hubs (shared 405, workflow 133) |
| B2 Temporal/change coupling | Weak | 1 | TS protocol ↔ Swift daemon co-change (medium confidence) |
| B3 Cohesion & locality | Partial | 2 | clear features; tests far from code; god files up to 3348L |
| B4 Seams & substitution | Strong | 3 | ports-and-adapters; 42 fake+real contract suites |
| B5 Hermetic testability | Strong | 3 | offline unit lane separated from e2e; per-test isolation |
| B6 Side-effect isolation | Strong | 3 | fakes/sinks over mocks; prod model client only in prod container |
| B7 State evolution | Partial | 2 | strong wire-protocol versioning; no schemaVersion/migration for persisted state |
| B8 Arch boundary enforceability | **Weak** | 1 | **prose only — no executable sensor** (weakest area) |
| B9 Complexity/size/navigability | Weak | 1 | no complexity/size/dup/dead-code sensors; mega-files |
| B10 Inner-loop speed | Strong | 3 | turbo cache, split lanes, deterministic clocks, idempotent cleanup |

## Assessment matrix (A–F)

| Area | Grade |
|---|---|
| Setup & environment | A |
| State, interaction & observability | A |
| Compounding loop | A |
| Seams & test substitution | A |
| Inner-loop speed | A |
| Command front door & sensors | A |
| Cold-start & documentation | C |
| Structure & coupling | C |
| State evolution | C |
| **Architecture enforcement & complexity** | **E** |

## Scenario probes (proof ceilings)

1. **UI / user-flow loop** → `just harness-verify <route>` → L4 (HTTP+DOM+screenshot+console). Missing: visual-regression sensor.
2. **Remote-view streaming loop** → `just streamd-smoke && just streamd-test` → L5 headless / L4 live (host-Mac). Missing: macOS CI runner.
3. **CLI behavior loop** → `cg <cmd> --json` → L4. Missing: GH_TOKEN-free fake for agent-exec.
4. **Contract / seam loop** → `vitest run test/contracts` (fake AND real) → L5. Missing: real Phase-5 remote-view adapter to run the suite against.
5. **Architecture-rule loop** → *(no sensor today)* → **L0 prose**. Missing: dependency-cruiser/boundary lint. *Biggest gap.*

## Services, environment & remote-dependency exposure

- **No remote infra to stand up.** Auth bypassable (`DISABLE_GITHUB_OAUTH`). Every external/model dep has a Fake in `createTestContainer`. Services are loopback (MCP stdio, terminal WS, streamd JWT localhost, CDP).
- **Two real pressure points:** `GH_TOKEN` (CLI agent-exec path only) and **streamd LIVE capture** (macOS TCC, host-Mac-only). Headless smoke proves the daemon protocol/auth without TCC.
- Env: names only, no secrets read. Key vars: `AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET`, `DISABLE_GITHUB_OAUTH`, `GH_TOKEN`, `CG_REMOTE_VIEW__DAEMON_PORT`, `TERMINAL_WS_*`, `HARNESS_*`, `NEXT_PUBLIC_ENABLE_*`.

## State, fixtures, reset & cleanup

`harness test-data create/clean/status` (idempotent, deterministic slugs), `harness seed`, cross-language fixtures (single source-of-truth TS↔Swift), `fake-streamd` (owns/never-mutates seed, full teardown), `just reset`/`clean`. Gap: no single "reset all runtime state" across `session-store.db` + `.chainglass` + `session-state`; orphaned `.pids.json`/`.tmp` leak in `.chainglass`.

## Observability & evidence

minih run artifacts (`report.json` findings + `retrospective.magicWand`, `events.ndjson`, JSON schemas), `cg --json/--stream` envelopes, pino structured logs, `harness-verify` JSON (httpStatus + consoleErrors), Playwright screenshots + `console-*.log`, streamd `stats/client-stats` telemetry, 313 `execution.log.md`. No central metrics/trace backend (OTel) — per-run artifacts only.

## Codebase affordance recommendations (proposed, not applied)

1. **[low]** GH_TOKEN-free fake/dry-run mode for `cg` agent-execution (reuse `FakeAgentAdapter`) — unblocks G15/L3.
2. **[low]** Scriptable workspace registration (expose `harness seed` at root) — removes the click-op (G14).
3. **[medium]** `schemaVersion` + forward-migration for persisted JSON/sqlite state (G11).

## Harness-only recommendations

- Boot harness scenarios under `createTestContainer()` (fully-faked, network-free, isolated).
- Drive remote-view scenarios against `startFakeStreamd` (no Mac daemon, Docker-safe).
- Extend any new external seam via interface + fake + `*.contract.ts` (proven parity pattern).
- Use the shared JSON/fixture oracle as the cross-language golden source.
- **Wire the engineering-harness boot/health/observe verbs to WRAP existing commands** (`just dev`/`preflight`/`harness-verify`/`streamd-smoke` + minih artifacts) — don't invent new ones.

## Onboarding consolidation notes

- Redirect/archive `START_HERE.md`, `INDEX.md`, `DOCUMENTATION_INDEX.md` (stale feature scratch).
- Fold still-true parts of `HARNESS_INDEX/INTERFACES/SUMMARY.md` into the engineering-harness governance doc; archive the rest.
- Cross-link `docs/project-rules/harness.md` (L3) ↔ `.harness/engineering-harness.md` (L0); state the authority boundary.

## Human questions

1. **At the adopt bridge:** coexist with the L3 Docker `just harness dev`, or rename one so "harness" stops meaning five things?
2. Should the engineering-harness boot wrap the **host `just dev`** path or the **Docker `just harness dev`** path as its primary?

## Evidence & inference log

See `evidence.jsonl` (per-finding provenance). Headline findings are inline in the scorecards above. The one **inference** (not direct evidence): TS↔Swift temporal coupling (B2), from `git log --name-only -200` breadth, not per-pair statistics.
