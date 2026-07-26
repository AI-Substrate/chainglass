# First-Class pij Support in the Chainglass UI
**Mode**: Full
**Plan Version**: 1.1.0
**Created**: 2026-07-26
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

📚 Incorporates findings from research-dossier.md (same folder — the discovery-phase decision packet; evidence IDs F-01…F-14 referenced below are its rows).

### Research Context

A full discovery phase ran as pij stream `first-class-pij-support-in-the-chainglass-ui` (2026-07-26): both data contracts were ruled by their owning primes (pij: dove; builder-flow: meadowlark), chainglass is a **registered named read-only consumer** of both, and the delivery architecture (server poller → mux SSE) was confirmed viable end-to-end with every chainglass-side piece already in place. Key numbers: 179 hot seats (135KB list), repo-scoped tree 7KB, archive 1,988 vs 196 hot, flow data in 3 of 85 plan dirs.

### Summary

Chainglass gains a read-only observatory over the pij agent platform and the /builder flow work spine: a fleet view of seats (who exists, what they hold, what condition they're in), a visual session tree (repo-scoped default; global prime-rooted view), and a per-plan phase/progress view — delivered live over the existing multiplexed SSE with one well-behaved server-side reader. The governing doctrine, ruled repeatedly during discovery: **report what was observed, never what it means.**

### Goals

- See the fleet for the current workspace at a glance: seat, harness, model (pinned vs observed), badge, current assignment/task, freshness.
- See the session forest visually — repo-scoped by default, global prime-rooted tree as its own view.
- See a plan's flow state: phase rail, current position, phase activations, review state, completion — with the five absence states rendered distinctly.
- One SSE channel (`pij`), one server-side poller; the pij store sees a single reader regardless of tab count.
- Every empty view distinguishable from a broken read (see AC-08/AC-09 — this is a named deliverable, not a fallback).

### Non-Goals

- **No writes anywhere**: not to `~/.pij` (CLI verbs included — v1 runs zero mutating verbs), not to any `the-flow.*` file. The two sole-writer fences are **one policy**.
- **No actions** (Q&A, task set, state verify): deferred to a later actions phase per Jordan's ruling. The one sanctioned exception is tmux window focus (P4, constraint C-06).
- **No stalled indicator** (the string means two mechanisms today), **no anomaly badges** (advisory surface has live defects), **no finished-and-undeclared** rendering until pij's detectors settle.
- **No pane content**: no attach, no capture, no keystrokes, no auto-refresh; live-pane viewing via 088 pixel stream is future work, not this plan.
- **No archive tier**: hot tier + idle < 2 days only (Jordan's Q5 ruling); admin/history views later.
- **No seat/agent column in flow views**: the dimension does not exist in flow data (F-09); activation counts are labelled **phase activations**.
- **No question-popper integration** (Jordan: review later).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| 089-first-class-pij | **NEW** | **create** | The observatory: server read layer, poller, API routes, views, panel |
| 027-central-notify-events | existing | **consume** | `ICentralEventNotifier`/`sseManager.broadcast` seam for the `pij` channel |
| _platform (panel-layout, sdk, themes) | existing | **consume** | PanelShell page composition; SDK command + keybinding for the overlay toggle |
| lib/sse (mux) | existing | **consume** | `useChannelEvents` client; `/api/events/mux` transport (ADR-0015) |
| 064-terminal | existing | **consume** (boundary only) | Pattern precedent for the overlay panel; its attach path is **never** pointed at pij panes |
| app shell (instrumentation, dashboard layout) | existing | **modify** | Fourth bootstrap singleton; header button; sidebar nav entries |

#### New Domain Sketches

##### 089-first-class-pij [NEW]
- **Purpose**: Read-only observation of the pij platform (registry + spine) and builder-flow work spine, joined and delivered live to the browser.
- **Boundary Owns**: pij store readers (spine file cursor, CLI record reads), flow-file reader (five absence states), the two-loop poller service, the `pij` SSE channel vocabulary, snapshot API routes, all pij/flow view components, the pij overlay panel, join logic (pij id keyed; workspace `path` ↔ descriptor `folder`; `provenance.plan_id`/plan-folder ↔ project).
- **Boundary Excludes**: SSE transport (lib/sse), watcher machinery (045 — deliberately NOT used against `~/.pij`, C-04), pane viewing (088), any mutation of any store (nothing owns this because it must not exist).

### Constraints (ruled during discovery — bind every phase)

Three named principles, each earned by a real near-miss:

1. **Observer-perturbs-instrument** — a browser tmux attach reflows panes and corrupts the daemon's `BUSY_RE` liveness read. Any read surface over a system that infers state from rendered output has this hazard.
2. **The inverted instrument** — a terminal seat behaving correctly (silent after `done`) reads to the stall detector as confirmation it is broken. Displays amplify this; render observables, not verdicts.
3. **Split the observable rather than pick a default** — ruled three times in one day (`paneObservation`, `expired` surfacing, flow absence). When a state could mean two things, carry the observable separately.

Hard rules:

| # | Constraint | Source |
|---|---|---|
| C-01 | Four forbidden affordances: no close/`--force`/reap, no daemon restart, no keystrokes to panes, no auto-refreshing pane content | dove, adopted as hard constraint |
| C-02 | Sole-writer fences, one policy: never write `~/.pij/**` or `the-flow.json`/`the-flow.md`/`.the-flow-state.json`; surfaced file paths get a machine-owned annotation | pij invariant + flow contract |
| C-03 | Never key a row on pane id or pid (both recycle); pij ids may be single-segment; never pattern-match id shapes | F-03/H-05 |
| C-04 | Never file-watch `~/.pij` (descriptors rewrite every tick × 179 seats); poll on our clock. Flow files are the opposite: file-watching IS intended (atomic replace → watch rename; `.json` only) | F-04/F-09 |
| C-05 | Provenance in UI copy: `effort`/`boundModel` render as *pinned* until observed; context gauge value or honest `unknown`, never an estimate | F-03 |
| C-06 | tmux window focus (`select-window` via `windowId`) **only** as a direct response to a deliberate human click — never automatic, never on an arriving event | dove ruling |
| C-07 | File-reader hazards: tier-migration rename (a vanished record path is NOT a deletion); filter `*.tmp-*` in directory scans | F-12 |
| C-08 | Spine cursor semantics: `--since` exclusive; system-state events dominate ~100:1 — filter server-side before fan-out | F-02, proven |
| C-09 | Flow reading: filter `type=="phase"` (never id patterns); walk `next[]`/`branch_of` (never trust rendered chains); tolerate unknown statuses/types (schema unenforced on mutation); completion = `nav.bag.status`, never file set; ignore `*.legacy.*` | F-09 |
| C-10 | Two-loop poller: spine cursor (1–2s) carries transitions; slow loop (5–10s) carries the freshness axis + context gauges specifically (they have no spine events) | F-04, dove-corrected |

### Testing Strategy

- **Approach**: Hybrid (Round 1). TDD for the read layer, poller, join, and derivation-adjacent logic (P1); lightweight component/render tests for views (P2–P4).
- **Rationale**: The read layer encodes ruled contracts where a wrong read is a confident lie; views are conventional React over typed props.
- **Focus Areas**: NDJSON cursor (torn lines, rename, tmp filtering), five flow absence states, empty-state trichotomy, 100:1 filter, join keys, absence-vs-null field semantics.
- **Excluded**: pixel-perfect visual tests; the mux transport itself (contract-tested in plan 072).
- **Mock Usage**: Targeted fakes only (constitution P4): fixture pij store directory (synthetic descriptors/spine), meadowlark's 19-node lab flow + the `kitchen-sink` adversarial fixture (offered; F-09), fake clock for cadence tests. Real code everywhere else.

### Documentation Strategy

- **Location**: `docs/how/pij-observatory.md` (consumer guide: what is shown, what is deliberately not, the honesty doctrine) + standard feature `domain.md`.
- **Rationale**: The deliberate absences (no stalled, no anomaly badges) will otherwise be re-litigated as bugs.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=1, T=1
- **Confidence**: 0.75
- **Assumptions**: pij CLI ≥ current verbs stable per dove's named-consumer commitment; harness ≥ 0.12.0+PR81 (live-verified); dev server runs from this repo (bare CLI calls repo-scope — cross-workspace calls set `cwd` explicitly).
- **Dependencies**: needs-human field (dove, in flight — additive when it lands); `harness flow agent` verb (unbuilt — excluded from scope, F-09).
- **Risks**: see § Risks.
- **Phases**: 4.

### Acceptance Criteria

1. **AC-01 (pipeline)**: With the dev server running and ≥1 live pij seat in this repo, the fleet view shows the seat within 10s of spawn and its badge transition within 3s of a spine `system-state` event — over exactly one EventSource per browser (verify via ADR-0015's probe).
2. **AC-02 (single reader)**: N open tabs produce exactly one poller and one spine cursor server-side; the pij store sees no additional readers per tab.
3. **AC-03 (fleet row)**: A row shows id, harness, model with provenance (`pinned` vs `observed` wording visible), badge (from `pij list`/`node show` derived values — never re-derived client-side), current task, assignment, and freshness ("as of Xs ago") — and never renders pane id or pid as identity.
4. **AC-04 (repo scope)**: Default fleet view lists only seats whose `folder` is under the current workspace `path`; scope toggle reveals the global set; hot tier + idle < 2d only.
5. **AC-05 (tree)**: Repo-scoped tree renders parent/child structure from CLI tree output with `unadopted` and prime marked; global view groups by prime with expandable subtrees. Rows whose seat joins to a **live** flow carry an inline phase-position chip ("phase x of y", current status) — joined via assignment→project→flow (Finding 09), absent (not faked) when no live flow joins (Jordan ruling 2026-07-26).
6. **AC-06 (flow phase view)**: For a live flow: phase rail (spine only, `type=="phase"`), current position from `nav.now` (chore → owning phase via `branch_of`), done/total counts, per-phase activation counts labelled "phase activations", review state including excursion reviews; completion states from `nav.bag.status`.
7. **AC-07 (five absence states)**: A plan folder renders exactly one of: live · legacy (predates the flow CLI) · untracked work (artifacts, no flow) · not started · corrupt — each visually distinct, none rendered as an error, none as blank.
8. **AC-08 (empty-state honesty, fleet)**: An empty fleet view states which of three conditions holds — *no seats here* / *poller not running* (last poll timestamp stale/absent) / *store unreadable* (read error surfaced) — and a human can tell them apart without opening devtools.
9. **AC-09 (degraded honesty)**: Daemon down ⇒ views render last-known data with visible staleness ("data as of …"); they never blank and never pretend freshness.
10. **AC-10 (forbidden affordances)**: The rendered UI contains no control that closes/reaps a seat, restarts the daemon, sends pane input, or auto-refreshes pane content; window-focus exists only as an explicit per-row human click (C-06) scoped to current-workspace seats.
11. **AC-11 (fences)**: Static analysis/tests prove the feature's server code opens no write handle under `~/.pij` and no flow file path; mutating pij verbs absent from the codepath.
12. **AC-12 (overlay panel)**: Header button (near theme selector) + SDK command/keybinding toggles a right-edge pij panel (064-sibling) showing the compact fleet; state survives route changes within the workspace.

### Risks & Assumptions

See `research-dossier.md` § Risks (verified table). Plan-level additions: the `pij` CLI shells from a Next.js route/service must set `cwd` per target workspace or results silently repo-scope to the server's cwd; `execFile` (never shell) with fixed argv.

### Open Questions

None critical. Two Jordan checkpoints are scheduled inside phases rather than left open: tree-viz approach (P4 spike → POC review) and panel information density (P4 review). Panel-vs-page resolved as sequencing: page first (roadrunner: fleet view first), panel in P4.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Tree visualization (global prime-rooted, ~180 nodes) | Spike/POC | Feasibility + taste: Jordan explicitly wants POC designs before committing ("will look real good using some html lib I imagine") | Which rendering approach (pure CSS/SVG tree, existing React tree lib, mermaid-style)? Collapse/expand model at prime boundaries? Density at 179 seats? |

### Clarifications

#### Session 2026-07-26

- Q: Workflow Mode → **A: Full** (Jordan; with a standing mandate: drive continuously, stop only for genuine human input).
- Q: Testing → **A: Hybrid** (TDD read layer, lightweight views).
- Q: Mocks → **A: Targeted fakes/fixtures only** (incl. meadowlark's lab flow).
- Q: Docs → **A: docs/how/ + domain.md**.
- Ruled by stream prime (roadrunner), recorded not re-asked: one SSE channel `pij` for v1; fleet view before phase view (82/85 plans have no flow data — F-10); feature dir `089-first-class-pij`.
- Ruled by Jordan earlier this stream: read-only v1, actions later; default repo scope + global prime tree; hot tier + <2d idle; bones-first; pop-over panel via header button; popper integration deferred.
- PM sequencing call under the go-mandate (flagged for review, not blocking): v1 delivers page-first, overlay panel in P4 — both were wanted; only order was open.
- **RATIFIED (Jordan, 2026-07-26)**: click-a-seat resolves to `tmux select-window` (4.4). Basis: his chainglass in-browser xterm (064) is an *already-attached* client on the fleet session, so `select-window` surfaces the seat's window in the terminal he's already using — browser or native — while creating **no new attach** (the part dove ruled hazardous). The 088 pixel stream remains the safe path if a per-seat embedded view is ever wanted. Evidence note (browser co-attach is routine on this host) routed to dove via roadrunner.

## Planning Seam

_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Tree visualization (Spike/POC — deliberately embedded as P4's spike-first task with a Jordan review checkpoint rather than a pre-plan workshop).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings, constraints, ACs |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical markers; open items are scheduled checkpoints |
| G2 | Constitution | PASS | Interface-first (P1 interfaces precede adapters), TDD where ruled, fakes over mocks, DI factory pattern |
| G3 | Architecture | PASS | Server code in feature `server/`; clean dependency direction; no cross-package violations |
| G4 | ADR Compliance | PASS | ADR-0015 (joins the mux, adds no EventSource), ADR-0010 (central notifier seam), ADR-0009 (module registration), ADR-0011 (domain concepts in domain.md) |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | P1 test tasks precede implementation (TDD); P2–P4 carry validation tasks (lightweight) |
| G7 | Domain Completeness | PASS | One NEW domain with setup task (T1.1); manifest covers all phase files |

### Summary

Build a read-only pij/flow observatory as feature `089-first-class-pij`: Phase 1 delivers the contract-bound read layer and two-loop poller broadcasting on one `pij` mux channel (TDD, fixture-backed); Phase 2 the workspace-scoped fleet page (first populated view, exercises the whole pipeline); Phase 3 the flow phase view with its five absence states; Phase 4 the global prime tree (spike-first POC with Jordan review) and the header-toggled overlay panel. Honesty requirements (empty-state trichotomy, provenance wording, staleness display) are acceptance criteria, not polish.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/089-first-class-pij/domain.md` | 089-first-class-pij | contract | Domain doc (T1.1) |
| `…/089-first-class-pij/types.ts` | 089-first-class-pij | contract | Channel message + view types |
| `…/089-first-class-pij/server/pij-store-reader.ts` (+ `.interface.ts`) | 089-first-class-pij | internal / contract | Spine file cursor + CLI record reads |
| `…/089-first-class-pij/server/flow-reader.ts` (+ `.interface.ts`) | 089-first-class-pij | internal / contract | Flow JSON reader, five absence states |
| `…/089-first-class-pij/server/pij-poller.service.ts` | 089-first-class-pij | internal | Two-loop poller, filter, broadcast |
| `…/089-first-class-pij/server/join.ts` | 089-first-class-pij | internal | Seat↔workspace↔project↔flow join |
| `apps/web/app/api/pij/fleet/route.ts` | 089-first-class-pij | contract | Snapshot: fleet (auth-gated) |
| `apps/web/app/api/pij/tree/route.ts` | 089-first-class-pij | contract | Snapshot: tree (repo/global) |
| `apps/web/app/api/pij/flow/route.ts` | 089-first-class-pij | contract | Snapshot: plan-dir flow states |
| `apps/web/app/api/pij/focus/route.ts` | 089-first-class-pij | contract | **The one mutating route**: POST window-focus (4.4), auth-gated, C-06 |
| `apps/web/instrumentation.ts` | app shell | cross-domain | Fourth HMR-safe bootstrap singleton |
| `apps/web/app/(dashboard)/workspaces/[slug]/pij/page.tsx` (+ components) | 089-first-class-pij | internal | Fleet + repo tree page |
| `apps/web/app/(dashboard)/pij/page.tsx` | 089-first-class-pij | internal | Global prime-tree page (P4) |
| `…/089-first-class-pij/components/*` (fleet-table, tree-view, phase-rail, empty-states, provenance-chip, overlay-panel, header-button) | 089-first-class-pij | internal | Views |
| `test/fakes/fake-pij-store.ts`, `test/fixtures/pij/**`, `test/fixtures/flows/**` | 089-first-class-pij | internal | Fixture store + flows (lab flow, kitchen-sink) |
| `docs/how/pij-observatory.md` | 089-first-class-pij | contract | Consumer guide incl. deliberate absences |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Spine is path-stable for named consumers; record paths are not (`pij-platform.md` § Path stability) | Spine by file cursor; records via `pij … --json` (`execFile`, fixed argv, per-workspace `cwd`) |
| 02 | Critical | Transitions ride the spine; freshness + context gauges do not (no spine events) | Two loops (C-10); slow loop fetches exactly the freshness axis + gauges |
| 03 | Critical | `system-state` dominates ~100:1; mux fan-out must be filtered server-side | Filter in the poller before `broadcast` — first line of the service, not an optimisation |
| 04 | Critical | Empty views are the primary surface (82/85 plans; any fleet can be empty) and a blank panel is indistinguishable from a working panel with nothing to show | AC-07/AC-08/AC-09 are named deliverables with their own components and tests |
| 05 | High | The mux (`handleMuxRequest`, `MAX_CHANNELS` in `app/api/events/mux/route.ts`) + `useChannelEvents` + `sseManager.broadcast` (`src/lib/sse-manager.ts`) already exist; `channelsKey` rotation on adding a channel is expected and self-heals | Join, don't build; do not add migration logic for the two-leader window |
| 06 | High | `instrumentation.ts` has an established HMR-safe global-flag singleton idiom (3 precedents) | Poller bootstrap copies the idiom exactly (flag + try/catch + SIGTERM cleanup) |
| 07 | High | 064's attach is an interactive keyboard + resize clamp — pointed at a pij pane it corrupts the daemon's own liveness classifier | The observatory never links a pij seat to the 064 attach path; window focus is `select-window` only, C-06 |
| 08 | Medium | Flow files: atomic replace surfaces as **rename** on macOS; watch the `.json` only; `events[]` length + `nav.now` is a sufficient change signature | Flow watcher (chokidar per 045 precedent is fine HERE — flow files are quiet) with rename handling; or mtime poll fallback |
| 09 | Medium | `provenance.plan_id` now env-fillable (harness PR 81 live) and populated in 088; join order: `plan_id` → repo+branch+plan-folder convention | Join helper tries data first, convention second, and marks which was used |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Read layer + poller + channel | 089-first-class-pij | Contract-bound readers, two-loop poller, `pij` channel, snapshot APIs — proven by tests before any UI | None |
| 2 | Workspace fleet + repo tree page | 089-first-class-pij | First populated view; exercises pipeline end-to-end; empty-state trichotomy | Phase 1 |
| 3 | Flow phase view | 089-first-class-pij | Phase rail + five absence states + activations for the current workspace's plans | Phase 1 (2 for page shell) |
| 4 | Global prime tree + overlay panel | 089-first-class-pij | Tree-viz spike → POC review → global view; header-button overlay panel | Phases 1–2 |

#### Phase 1: Read layer + poller + channel

**Objective**: Everything server-side, contract-bound and test-proven: readers, join, poller, broadcast, snapshot routes.
**Required inputs** (field-level schemas the TDD tasks consume — snapshotted where external): `references/flow-answers-for-chainglass-ui.md` (flow contract, Q1–Q8 + safe subset), `references/pij-firstclass-discovery.md`, `/Users/jordanknight/pi-hacking/pij/docs/how/pij-platform.md` (the ruled on-disk contract incl. § Path stability), `/Users/jordanknight/pi-hacking/pij/docs/how/pij-for-ui-consumers.md`; full flow field reference: `/Users/jordanknight/substrate/harness-engineering/scratch/flow-ui-dossier.md`.
**Domain**: 089-first-class-pij
**Delivers**: interfaces + adapters for pij store and flow reads; two-loop poller; `pij` channel events; `/api/pij/*` snapshot routes; fixtures + fakes; bootstrap.
**Depends on**: None
**Key risks**: NDJSON edge cases (torn lines, rename-under-read); CLI `cwd` scoping; fan-out noise if the filter is wrong.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Domain setup: `domain.md`, source dirs, registry + domain-map entries | 089-first-class-pij | Files exist; registry lists domain with contracts | New-domain rule |
| 1.2 | Fixtures first: `test/fixtures/pij/` synthetic store (descriptors incl. single-segment id, tmp file, archive dir) + `test/fixtures/flows/` (kitchen-sink, legacy-E308, pre-flow artifacts dir, empty dir; meadowlark's lab flow when received) | 089-first-class-pij | Fixtures load; each encodes one ruled hazard | Kitchen-sink alone is sufficient to proceed; lab flow is additive, never blocking |
| 1.3 | TDD: spine cursor reader tests → impl (`ISpineCursor`): exclusive `--since` semantics over the ndjson file, torn/corrupt line skip, `*.tmp-*` ignore, rename tolerance, cursor persistence across restart | 089-first-class-pij | Red→green; injecting a torn line + a tmp file changes nothing; cursor survives reader restart | C-07/C-08; prove the gate can fail: a test must fail before the fix |
| 1.4 | TDD: record reader tests → impl (`IPijRecords`): `execFile` pij `list/tree/node show/state --json` with per-call `cwd`, timeout, E-code mapping; never re-derives badges | 089-first-class-pij | Fake executor tests pass; real smoke against live store returns 179±; wrong-cwd test proves silent repo-scoping is caught | Finding 01 |
| 1.5 | TDD: flow reader tests → impl (`IFlowReader`): five absence states, `provenance` gate, `nav.bag.status` completion fallback chain, phase filter by `type`, activations from `cursor-moved`, excursion reviews via `branch_of`, unknown enums tolerated | 089-first-class-pij | Each fixture maps to exactly its ruled state; kitchen-sink renders without crash; 088 fixture reads as in_progress | C-09 |
| 1.6 | TDD: join tests → impl: seat↔workspace (`folder` under `path`), flow↔project (`plan_id` first, convention fallback, provenance-of-join recorded), keyed on pij id only | 089-first-class-pij | Single-segment id passes; pane-id/pid keys impossible by type | C-03, Finding 09 |
| 1.7 | TDD: channel contract first: `PijChannelEvent` union in `types.ts` (`fleet-delta` — full row per changed seat, `flow-delta`, `poller-status`), each kind with a serialization test; then poller service: fast loop (spine cursor, default 2s, system-state filtered), slow loop (freshness + gauges, default 8s), diff→broadcast on `pij` channel; degraded mode (store unreadable → `poller-status` event, keep last-known). **Acquisition model**: slow loop makes ONE global `pij list --json` call; workspace scoping is a server-side filter on `folder` under workspace `path` (F-13); per-workspace `cwd` is needed only for repo-scoped `tree` calls. Every delta carries the spine cursor `seq` it reflects | 089-first-class-pij | Every `broadcast` call type-checks against `PijChannelEvent`; fake-clock tests: 100 system-state events → ≤ configured fan-out; store error → `poller-status` event, no crash, no blank | C-08/C-10, Findings 03; deltas are full rows so AC-03's never-re-derive rule is enforceable |
| 1.8 | Snapshot routes `/api/pij/{fleet,tree,flow}` (auth-gated, per-workspace param) + poller status endpoint (last poll ts, cursor seq, error). **Consistency**: every snapshot response carries the spine cursor `seq` it was built at (deltas carry theirs per 1.7) | 089-first-class-pij | Route tests: 401 unauthenticated; shapes typed in `types.ts`; snapshot `seq` present; status endpoint is what AC-08 renders | AC-08 needs this |
| 1.9 | Bootstrap in `instrumentation.ts` (HMR-safe flag idiom, SIGTERM cleanup) | app shell | Dev server boots, poller logs one start; HMR does not double-start | Finding 06; **no dev-server restart without Jordan's nod** |
| 1.10 | Fence proof: test asserting no write-mode `fs` calls / no mutating pij verbs in feature server code (lint rule or import audit) | 089-first-class-pij | AC-11 red→green demonstrated | C-02 |

#### Phase 2: Workspace fleet + repo tree page

**Objective**: The first thing a human sees, populated on day one, honest when empty.
**Domain**: 089-first-class-pij
**Delivers**: `workspaces/[slug]/pij` page (fleet table + repo tree tab), empty-state components, provenance chips, live updates via `useChannelEvents`, sidebar nav.
**Depends on**: Phase 1
**Key risks**: Freshness display drift; scope filter correctness.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Fleet view per the **ratified POC** (`scratch/pij-observatory-poc.html`, Jordan-approved 2026-07-26 — the design reference for this phase): **prime shells** containing one **section per child** (PM team or standalone worker) — section header = flow chip + assignment title + seat count, meta line = project + worktree, seats appear exactly once with a single role-chip vocabulary (Prime/PM/Coder/Reviewer/Worker), per-team **flow stage strip** (research › plan › phN › ship), non-prime roots under an explicit "outside any prime" heading. Subscribe to the `pij` channel BEFORE snapshot fetch, buffer deltas, drop those with `seq` ≤ snapshot `seq`, apply the rest; columns per AC-03; hot + <2d idle filter; scope toggle (workspace/global list) | 089-first-class-pij | Each running sub-project readable as one block (PM + children + task title); AC-03/AC-04 demonstrable against live store; race test: a delta arriving between subscribe and snapshot response is neither lost nor overwritten | Grouping from CLI tree structure (effective parent), never re-derived; ordering per 1.7/1.8 seq |
| 2.2 | Empty-state trichotomy component (no seats / poller stale / store unreadable) driven by the poller status endpoint | 089-first-class-pij | AC-08: all three states reproducible in tests (fixture + stopped poller + unreadable store) | Finding 04 |
| 2.3 | Provenance + freshness rendering: pinned/observed wording, "as of Xs", staleness banner when daemon-tick stale | 089-first-class-pij | AC-09 demonstrated with daemon stopped in dev | C-05 |
| 2.4 | Repo tree tab: CLI tree JSON → collapsible tree; `unadopted`/prime marks; no pane/pid anywhere in DOM | 089-first-class-pij | AC-05 (repo half); DOM audit test for C-03 | |
| 2.5 | Nav + validation pass: sidebar entry, page renders in prod build, lightweight component tests for 2.1–2.4 | 089-first-class-pij | `pnpm build` clean; tests green | |

#### Phase 3: Flow phase view

**Objective**: The work-spine view: which phase, how far, how active — honest about absence.
**Domain**: 089-first-class-pij
**Delivers**: plan list for the workspace with per-plan flow state; phase rail; activations; five absence renderings; flow-file watcher.
**Depends on**: Phase 1 (Phase 2's page shell)
**Key risks**: Absence-state misclassification (the "renders a completed plan as broken" trap).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Plan scanner: glob `docs/plans/*/` per workspace (never `harness flow list` — it can't see flight plans), classify via `IFlowReader` | 089-first-class-pij | This repo classifies as: 82 untracked-or-not-started, 2 legacy, 1 live | F-10 |
| 3.2 | Phase rail component: spine phases, position, done/total, review state (spine + excursion), phase-activation counts labelled exactly that | 089-first-class-pij | AC-06 against 088 fixture (shows in_progress ph6, excursion reviews rv4*) | C-09 |
| 3.3 | Five absence-state renderings as distinct designed states (not fallbacks) | 089-first-class-pij | AC-07: five fixtures → five visually distinct, correctly-worded renders | Finding 04 |
| 3.4 | Flow-file change detection: watch `docs/plans/*/the-flow.json` (rename-aware) → poller emits flow deltas on the `pij` channel | 089-first-class-pij | Editing the fixture flow via `harness flow` verbs updates the view without reload | Finding 08; C-02 note: we watch, never write |
| 3.5 | Validation pass: component tests; docs/how draft §flow view | 089-first-class-pij | Tests green | |

#### Phase 4: Global prime tree + overlay panel

**Objective**: The global lens and the quick-glance surface — with Jordan's taste in the loop before the tree is built for real.
**Domain**: 089-first-class-pij
**Delivers**: tree-viz spike + POC review checkpoint; global `/pij` page (prime-rooted); header button + overlay panel; window-focus action under C-06.
**Depends on**: Phases 1–2
**Key risks**: Tree readability at ~180 nodes (the whole reason for the spike).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | **Spike**: 2–3 throwaway tree-rendering POCs (scratch location, real global tree JSON as input) — approach comparison for Jordan | 089-first-class-pij | Go/no-go verdict + chosen approach + discovered constraints recorded in execution log; **Jordan reviews the POCs** (his explicit ask) | Spike code discarded; learnings promoted |
| 4.2 | Global prime tree page `/pij`: primes as roots with paths, expandable fleets, chosen approach from 4.1 | 089-first-class-pij | AC-05 (global half) at live scale (~196 hot seats) | |
| 4.3 | Overlay panel (064-sibling): header button near theme selector, SDK command + keybinding, compact fleet list, z-order over terminal overlay | 089-first-class-pij | AC-12 | F-14 pattern |
| 4.4 | Window-focus action: per-row button → auth-gated POST `/api/pij/focus` → `tmux select-window -t <windowId>`; route validates the seat is live and in the requesting workspace; never fired from events | 089-first-class-pij | AC-10: route rejects out-of-workspace/unknown seats (tested); server code audit shows the only `select-window` call site is the route handler; client audit shows the only caller is the row-button onClick (no event handler, effect, or timer reaches it) | C-06; the ONE mutating route in v1, present in the Domain Manifest |
| 4.5 | Ship-readiness pass: `docs/how/pij-observatory.md` complete (incl. deliberate absences), domain.md final, full test suite + build green | 089-first-class-pij | All ACs demonstrable; docs list every not-shown-on-purpose | |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.7, 1.9, 2.1 | live probe per ADR-0015 method |
| AC-02 | 1.7, 1.9 | poller singleton test + tab probe |
| AC-03 | 1.4, 2.1, 2.3 | component tests + live smoke |
| AC-04 | 1.6, 2.1 | join tests + fixture |
| AC-05 | 2.4, 4.2 | tree tests + live scale check |
| AC-06 | 1.5, 3.2 | 088 fixture |
| AC-07 | 1.5, 3.3 | five fixtures |
| AC-08 | 1.8, 2.2 | three reproduced states |
| AC-09 | 1.7, 2.3 | daemon-stopped dev check |
| AC-10 | 4.4 + absence-by-design | DOM/code audit |
| AC-11 | 1.10 | fence test red→green |
| AC-12 | 4.3 | component test + manual |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pij CLI `--json` shape drift | Low (named-consumer commitment) | Medium | Shapes typed once in `types.ts`; readers tolerate unknown fields; dove notifies |
| Absence-state misclassification | Medium | High (confident lie) | Each state has a fixture + test; classification logic lives in one function |
| Poller degrades silently | Medium | High | Status endpoint + AC-08; degraded mode is an explicit event, not an absence |
| `needs-human` lands mid-build | High | Low (additive) | Field is additive to fleet row; no rework by design |
| Tree unreadable at scale | Medium | Medium | 4.1 spike with Jordan review before 4.2 |
| CLI cost on contended host | Low | Low | Slow-loop CLI calls at 8–10s; spine by file (<10ms measured) |
