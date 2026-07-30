# pij Rail v2 — the left-rail now/next fleet view
**Mode**: Simple
**Plan Version**: 1.2.0 — validation findings 1–10 folded in (see validations/); joint contracts workshopped to Contract Ready and folded in (workshops/001–003, reviewed by cheap-cheetah with two JC-2 factual corrections)
**Created**: 2026-07-29
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from research-dossier.md

## Business Specification

### Research Context

`research-dossier.md` (F-01…F-10, H-01…H-04): the rail tab is additive to the existing `PanelMode` mechanism; the 089 data layer reuses wholesale; new pij reads ride the existing poller + `pij` SSE channel; worktree→main is a props-threading fix. The direction document is `docs/plans/089-first-class-pij/v2-enhancements.md` (16 V2-ACs with CG/PIJ/JOINT owners); the layout contract is `scratch/pij-rail-mock.html` (approved direction, interactive).

### Summary

Replace the pij overlay with a **PIJ tab in the left rail** (sharing the file-tree slot): prime at top, PMs with verbatim two-sentence NOW/NEXT status, workers as dense one-line rows with pij's ruled state words, questions pinned in a NEEDS-YOU strip, click-to-focus via the existing route. Jordan's verdict on v1 — "accurate but not useful" — is the driver: this view answers *what am I working on, and who needs me* at a glance. The sibling pij-side plan (owned by pij-wee-albatross, built in a worktree off the pij repo) supplies the status verb and record changes; this plan proposes the **joint contracts** both sides code against and builds behind fakes until they land.

### Goals

- One glance at the rail answers: what's each PM doing now / next, which workers are active/stopped/blocked, and who is waiting on **me**.
- The rail is always available where work happens (browser view, desktop + mobile), scoped to this project, resolved to main from any worktree.
- Chainglass consumes pij truth **verbatim** (badge, states, status text) — zero local derivation (AC-03 doctrine, H-03).
- The three joint contracts are written once, here, and ratified in the albatross brief before pij codes.

### Non-Goals

- No pij-side implementation (status verb, sweep-adopt, watchdog nudge, role field, question persistence) — that is albatross's plan; ours fakes behind the contracts.
- No change to the `/pij` global page (stays SSE-free by design, F-05/F-08) and no new SSE channel (H-02).
- No periodic status for workers or prime — PM-only, per Jordan's ruling (H-01).
- No tmux writes beyond the existing focus route (C-06 stands).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| 089-first-class-pij | existing | **modify** | New rail view + status consumption; overlay shells retired |
| _platform/panel-layout | existing | **modify** | `PanelMode` gains `'pij'`; per-mode title/actions on `LeftPanel`/`PanelHeader` |
| file-browser | existing | **modify** | Mode registration (`use-panel-state`, URL params), children records in `browser-client` |
| workspace | existing | **consume** | `WorkspaceInfo.path` (main checkout) threaded to the client (F-09) |
| _platform/events | existing | **consume** | Existing `pij` mux channel; event union extended, no membership change (F-08) |

### Joint Contracts (RATIFIED 2026-07-29 — albatross/s074, after independent verification of its PM's review)

**JC-2 ratified as written. JC-1 and JC-3 ratified with two blocking pij-internal amendments (A-1 ownership rows, A-2 watchdog null-anchor), folded into the workshops per the single-source rule — no CG-consumed field changed.** pij's items 1/3/5 code against the amended workshop docs. The single coupling surface between this plan and albatross's. Consumed-field subsets registered like the flow-json contract (H-01 precedent). Absence is always a designed state, never an error.

**JC-1 · PM status event** — **authoritative: `workshops/001-jc1-status-event.md`** (Contract Ready). Headline: spine `kind:"status"` on the existing envelope, `prev`/`next` ≤280 chars whitespace-collapsed (writer refuses over-limit, never truncates); `--state` composes as **two events under one write lock, ruled order `state-set`→`status`**, correlated by a `state-set:<seq>` ref (merging would break s055's exact-kind consumer); node denorm `statusPrev/Next/At/Seq` written for **pij's watchdog**, not consumed by CG. **CG production read = the fast-loop spine drain** re-broadcast as `status-delta` (`spine events` remains the human/debug inspection path only). Staleness clock = producer `ts`; threshold 30m (`STATUS_STALE_MS`) chosen to exceed pij's 20m watchdog interval. Absence: `not-a-pm` · `role-unknown` · `no-status-yet` · `status-stale` (stale still renders its text), plus panel-level `spine-unreadable` as an instrument outage, never a per-PM absence.

**JC-2 · Orchestration role** — **authoritative: `workshops/002-jc2-orchestration-role.md`** (Contract Ready). Headline: **store partial, project total** — the descriptor stores `orchestrationRole?: "pm" | "worker"`; every JSON projection (`list` rows, `tree` nodes with re-stamp over the spread, `node show`) emits total `"prime" | "pm" | "worker" | null` via `prime === true ? "prime" : (stored ?? null)`, so prime-ness keeps its single writer (PrimeService, five live consumers) and a both-present descriptor raises a `role-conflict` anomaly. Writers: `pij orchestration role set|unset` (PrimeService-shaped `RoleService`) + `link --role`; **`orchestrationRole: "cli"` in `DESCRIPTOR_FIELD_OWNER` is mandatory** or the daemon replays the write away (incident #1). Audit: `role-set` spine event. **No migration** — 6 primes project free on day one; the rest converge via sweep-adopt + `link --role`. The existing `Role = "parent" | "worker"` union is untouched (`PIJ_ROLE` silently narrows unknown words — provably unusable). CG absence axes: role chip carries `data-role-reason` (`role-unknown` = key present+null · `role-field-absent` = pre-JC-2 pij); both map to `role-unknown` on the *status* axis. Production never infers role from tree position; the fake seam may, labelled fake-only, plus a second no-key fixture so `role-field-absent` is exercised.

**JC-3 · Question text** — **authoritative: `workshops/003-jc3-question-text.md`** (Contract Ready). Headline: **declared** notes ride a descriptor denorm `stateNote: { text, state, at }` projected on `list --json` rows (+ `node show`), read by the poller's existing 8s slow loop — zero new reads; producer caps at 200 chars/no newlines and refuses over-limit; the note clears with the state word it was written for (**HAZARD-1**: pij's stale-clearing destructure at `core/cli.ts:2789` must gain `stateNote` or an answered question pins forever — CG carries a `semanticState === stateNote.state` supersede guard as defence-in-depth). **CG never expires a question** — aged (>`QUESTION_AGED_MS`, 30m) is a render variant, never a filter; and the NEEDS-YOU pin keys on `stateNote.state`, **never the badge** (**HAZARD-2**: a seat blocked on A and asking on B badges `blocked`). `blocked` notes render inline on the row, never in the strip. **Daemon-detected is three tiers and only D0 is real today**: the workshop found the plan was *still* one step optimistic — not even the pattern tag is persisted (in-memory latch + one notify), and detection runs only for `lifecycle === "pending"`, so it can never see a mid-task question. D0 = contributes zero strip rows (`daemon-detected-not-observable`); D1 = minimum ask, persist the tag on the descriptor; D2 = pane-excerpt stretch. Companion ask: project `semanticState` on `list` rows. ⚠️ Copy pending Jordan: the D1 chip wording should be boot-prompt phrasing ("stuck on a startup prompt (<tag>)"), not "asked a question" — all three tags are startup interstitials.

### Testing Strategy

- **Approach**: Hybrid — RED-first unit tests (vitest) for logic: membership/grouping, status-event consumption + staleness, absence-state discriminators, poller status reads, toggle repoint. Lightweight render assertions (testids per state — N states → N test-ids, H-03) for the rail view.
- **Mock Usage**: Targeted — injected fake pij executor (established 089 seam); **faked status events are generated behind JC-1's exact shape**, never an invented one (the folder-vs-cwd lesson, H-04 class).
- **Excluded**: real pij CLI in CI; visual pixel testing (Jordan confirms renders).

### Documentation Strategy

- **Location**: none new — this plan + `v2-enhancements.md` carry the design; the joint contracts section is the reference albatross consumes.

### Complexity

- **Score**: CS-3 (medium) · **Breakdown**: S=2, I=1, D=1, N=0, F=0, T=1 · **Confidence**: 0.85
- **Assumptions**: mockup layout stands; overlay retires (per Jordan's "move our pij output to share the same space as file tree").
- **Dependencies**: pij-side verbs land *after* — CG ships behind fakes; nothing here blocks on albatross.
- **Risks**: see § Risks. **Phases**: 1 (Simple).

### Acceptance Criteria

| # | Criterion (observable) | v2 ref |
|---|---|---|
| AC-01 | A **PIJ** tab renders beside FILES in the left rail on **both** desktop and mobile browser surfaces; selecting it shows the fleet view in the same slot; the tree tab is unaffected; the mode toast names the right mode | V2-AC-01 |
| AC-02 | Roster renders prime → PMs → workers **from the tree (with `--all`)**, never from path/naming; each PM card shows project, state dot, NOW/NEXT verbatim + age; workers are one-line rows (state word, activity = task text, worktree tag, age) | V2-AC-02/04/05 |
| AC-03 | `blocked` renders loud (red; its note inline on the row, never in the strip); `question` renders violet AND pinned in the NEEDS-YOU strip per WS-003 D7's seven ruled cases (declared note verbatim / declared-no-note fallback / superseded hidden / daemon D0 contributes nothing / strip-empty names its window); the pin keys on `stateNote.state`, never the badge; clicking a pinned seat jumps to it | V2-AC-05/16, WS-003 |
| AC-04 | The four status absence states (no-status-yet / stale / not-a-PM / role-unknown) each render a distinct `data-reason` with its own test-id; none is ever conflated with an error | V2-AC-08 |
| AC-05 | Clicking a seat row selects its tmux pane via the existing focus route — human click only; all Phase-4 refusal states carry over unchanged | V2-AC-06 |
| AC-06 | In a worktree workspace the rail anchors to the main checkout (`WorkspaceInfo.path` threaded, F-09) and the scope line says so; `getMainRepoPath()` is not called | V2-AC-07 |
| AC-07 | Every rendered count names its window ("N seats currently hot" phrasing or equivalent); no bare census claims | V2-AC-09 |
| AC-08 | All three `pij:toggle` triggers (explorer button, sidebar button, SDK command/Ctrl+Shift+F) open/switch to the rail PIJ tab when on `/browser`; **from any other workspace route they navigate to `/workspaces/<slug>/browser?panel=pij`** (validation finding 1); overlay panel/wrapper/provider are removed; `/pij` global page unchanged; `WORKSPACE_SSE_CHANNELS` untouched, `'pij'` still present | V2-AC-01, F-06 |
| AC-09 | PM status arrives via the existing `pij` channel as a new event-union member emitted from the **existing fast-loop spine-cursor drain** (the fast tick already reads new spine events — a `kind:"status"` event is recognised there and re-broadcast as `status-delta`); no new SSE channel, no third polling loop, no per-PM spawns (validation finding 2) | F-07/F-08 |
| AC-10 | With pij's v2 surface absent (today), the rail runs entirely on the JC-1/JC-2/JC-3 fake seams and every AC above holds in its fake-backed form; flipping any seam to the real read requires no component change (asserted by a seam-swap test) | JC-1..3 |

### Risks & Assumptions

| Item | Note |
|---|---|
| Joint contracts drift if albatross's plan reshapes them | The brief ratifies JC-1..3 **before** pij codes; CG's fake seam is one module, cheap to re-point |
| Duplicated children records (F-02) | T002 extracts the shared record first — the tab cannot half-land |
| `pij:toggle` partial repoint double-fires vs `overlay:close-all` (F-06) | T010 moves listener + retirement + AC-12-era tests as one change |
| 280px fixed rail width (F-03) | The mock already designs to ~300px; degrade by truncation, never overflow |

### Open Questions

1. Status staleness threshold — default **30m** (`STATUS_STALE_MS`); Jordan may retune (WS-001 OQ-6). Related: `QUESTION_AGED_MS` is a **separate** 30m constant (WS-003 OPEN-3) — Jordan may collapse the two.
2. PM row click: focus the pane (planned, per mock) vs expand/collapse-only — chevron handles collapse separately.
3. Daemon-detected chip copy (WS-003 D6): "stuck on a startup prompt (<tag>)" proposed over "asked a question" — the three tags are boot interstitials, not questions. Jordan signs off.
4. Promote `oldPrime` onto `FleetRow` so retired primes render as retired rather than role-unknown (WS-002 Q-14/G-1) — one-line follow-up, Jordan's call.
5. **Post-ship follow-up (from butterfly's integration-defect report, 2026-07-30)**: the rail's state chain `badge ?? state ?? 'unknown'` is safe today (poller always requests `--badge`; live-proven: declared `waiting` renders over daemon `working`; butterfly re-proved with `blocked` at spine 24881) — but the `?? state` middle fallback would *silently* substitute the daemon-flattened vocabulary if badge were ever absent. Change fallback to a designed `unknown`; assert a declared blocked/question renders over an active daemon view; assert `systemState` is never a fallback source either (under `--badge` it comes back null while `state` stays populated — `state` is the only remaining carrier of the flattened vocabulary); and **pin `badge` and `state` to different values in the fixture** (butterfly's live probe row is ready-made) — a fixture where they agree passes whether or not precedence works. |

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Joint contracts JC-1..3 | API Contract | Cross-repo coupling surface; cheap to workshop, expensive to re-lay | Exact field names; does status denorm onto the node; question-text carrier |

*(Judgment: JC-1..3 as proposed are small and grounded in measured surfaces; a workshop is optional — the albatross brief itself acts as the ratification step. Jordan decides at the seam.)*

### Clarifications

#### Session 2026-07-29

- Q: Workflow mode → **A: Simple** (single phase, inline tasks).
- Q: Testing strategy → **A: Hybrid** (RED-first logic, lightweight view assertions).
- Q: Mock usage → **A: Targeted** (fake executor + JC-shaped fakes only).
- Q: Documentation → **A: None new**.
- Standing rulings inherited from the session (H-01): status is PM-only; "q" = question (blocked ≠ question); sweep-adopt notifies the prime only; one-call status UX; overlay's space moves to the file-tree slot (Jordan: "we will move our pij output to share the same space as file tree").
- Validation session (opus critic, findings 1–10 folded in at v1.1.0): status events ride the existing fast-loop spine drain, not a new read; JC-2 names its carrier (`orchestrationRole`, never widening pij's existing `Role`); JC-3 splits declared-note text from daemon pattern tags (the "daemon already extracts the question" premise was false); off-`/browser` toggles navigate to `browser?panel=pij`. **Interim role stance pending Jordan's eyes**: the JC-2 *fake seam* assigns roles from tree depth (labelled fake-only); the production path renders role-unknown until the real field lands — tree depth is never consumed as "PM" outside the fake.

## Planning Seam

_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all three joint contracts workshopped to Contract Ready (2026-07-29, opus panel + review pass).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings (F-01…F-10, H-01…H-04) |
| workshops/001-jc1-status-event.md | y | **authoritative** — JC-1 contract detail |
| workshops/002-jc2-orchestration-role.md | y | **authoritative** — JC-2 contract detail (store-partial/project-total amendment folded into §Joint Contracts) |
| workshops/003-jc3-question-text.md | y | **authoritative** — JC-3 contract detail (daemon D0/D1/D2 tiering folded in) |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 answered; no critical markers; 2 non-blocking open questions |
| G2 | Constitution | PASS | Interface-seam + injected-adapter pattern continued (089 precedent) |
| G3 | Architecture | PASS | All work inside apps/web feature/platform boundaries; workspace consumed via existing interface |
| G4 | ADR Compliance | PASS | ADR-0015 honored (extend `pij` channel union, no membership change); ADR-0009 SDK command repointed, not bypassed |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Hybrid: RED-first tasks precede impl for logic (T004/T006/T008 pairs); view tasks carry testid assertions |
| G7 | Domain Completeness | PASS | 5 domains, all existing, all in registry; manifest covers every task file |

### Summary

Add a `pij` mode to the existing left-rail tab mechanism, render a dense fleet view (per the approved mock) on the reused 089 data layer, extend the poller with an on-demand PM-status read behind the proposed JC-1 contract (faked until pij ships), thread the main-checkout path to the client for worktree resolution, and retire the overlay shells by repointing the single `pij:toggle` seam. One phase; the joint-contract section is the interface albatross's sibling plan consumes.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/_platform/panel-layout/types.ts` | _platform/panel-layout | contract | `PanelMode` union +`'pij'` |
| `apps/web/src/features/_platform/panel-layout/components/left-panel.tsx` | _platform/panel-layout | internal | per-mode title/actions |
| `apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | _platform/panel-layout | internal | per-mode title/actions |
| `apps/web/src/features/041-file-browser/hooks/use-panel-state.ts` | file-browser | internal | modes array + toast fix |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | file-browser | contract | URL literal union +`'pij'` |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | cross-domain | shared children record + pij tab content (both surfaces) |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | workspace | cross-domain | thread `mainPath` (F-09) |
| `apps/web/src/features/089-first-class-pij/components/pij-rail-view.tsx` (new) | 089-first-class-pij | internal | the dense rail view (mock contract) |
| `apps/web/src/features/089-first-class-pij/hooks/use-pij-status.ts` (new) | 089-first-class-pij | internal | JC-1 consumption + staleness + absence discriminator |
| `apps/web/src/features/089-first-class-pij/server/pij-status.contract.ts` (new) | 089-first-class-pij | contract | JC-1/2/3 consumed-field types + fake seam |
| `apps/web/src/features/089-first-class-pij/server/pij-poller.service.ts` | 089-first-class-pij | internal | `refreshStatus()` (on-demand, signature-gated) |
| `apps/web/src/features/089-first-class-pij/types.ts` | 089-first-class-pij | contract | `PijChannelEvent` union + `status-delta` |
| `apps/web/src/features/089-first-class-pij/hooks/use-pij-overlay.tsx` | 089-first-class-pij | internal | listener repoint → retirement |
| `apps/web/src/features/089-first-class-pij/components/pij-overlay-panel.tsx` | 089-first-class-pij | internal | **delete** (retire) |
| `apps/web/app/(dashboard)/workspaces/[slug]/pij-overlay-wrapper.tsx` | 089-first-class-pij | internal | **delete** (retire) |
| `apps/web/src/features/089-first-class-pij/sdk/register.ts` | _platform/sdk (consume) | cross-domain | command handler repoint (navigate when off `/browser`) |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | workspace | cross-domain | remove `PijOverlayWrapper` mount; **`WORKSPACE_SSE_CHANNELS` unchanged** (finding 6) |
| `apps/web/src/features/089-first-class-pij/lib/fleet-grouping.ts` | 089-first-class-pij | internal | rail grouping: tree = structure; role labels from JC-2 only (finding 7) |
| `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | terminal (consume) | cross-domain | regression surface only — renders `LeftPanel` in `'sessions'` mode (finding 10) |
| `test/unit/web/pij/*` | 089-first-class-pij | internal | RED-first suites + testid assertions |

### Key Findings

Lifted from the dossier — IDs preserved: **F-01** (tab is additive), **F-02** (duplicated children records — extract first), **F-03** (no per-mode header; 280px), **F-05** (reuse/retire split), **F-06** (`pij:toggle` one seam, three triggers), **F-07** (`refreshFlows` shape for new reads), **F-08** (never a new channel), **F-09** (thread `mainPath`; `getMainRepoPath()` is a trap), **F-10** (pij-side surfaces measured; JC targets), **H-04** (tree decides membership, `--all` included).

### Implementation

**Objective**: Ship the rail-tab fleet view end to end on faked JC contracts, with the overlay retired and the data path ready to flip to real pij reads.
**Testing Approach**: Hybrid (business half § Testing Strategy) — RED tasks precede their implementation tasks for all logic.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Extract the duplicated `LeftPanel` children record into one shared `leftPanelChildren` | file-browser | `browser-client.tsx` | Desktop + mobile render from the single record; existing tree/changes behaviour unchanged (tests green) | F-02; do first |
| [x] | T002 | Add `'pij'` to `PanelMode`, modes array, URL param union; fix the hardcoded two-way mode toast | _platform/panel-layout, file-browser | `types.ts`, `use-panel-state.ts`, `file-browser.params.ts` | PIJ tab selectable on both surfaces; deep-link `?panel=pij` works; toast names "PIJ" | AC-01, F-01/F-04 |
| [x] | T003 | Per-mode title/actions on `LeftPanel`/`PanelHeader`; pij mode gets its own title + refresh | _platform/panel-layout | `left-panel.tsx`, `panel-header.tsx` | pij tab no longer shows "Files"/tree-refresh; tree **and sessions** modes byte-identical (terminal page renders `'sessions'` — finding 10) | F-03 |
| [x] | T004 | RED: contract tests for JC-1 consumption — newest-by-seq wins, staleness at threshold edge, all four absence discriminators (`data-reason` union, pure function) | 089-first-class-pij | `test/unit/web/pij/pij-status.test.ts` | Tests exist and fail for the right reason | AC-04/AC-10 |
| [x] | T005 | JC contract module + fake seams for **all three contracts**: consumed-field types for JC-1/2/3, fake generators producing contract-exact shapes (JC-2 fake may infer role from tree depth, labelled as fake-only inference), seam interfaces the poller + hooks share | 089-first-class-pij | `server/pij-status.contract.ts` | T004 greens; a seam-swap test replaces each fake with a stub "real" impl and asserts zero consumer changes (finding 9) | AC-10, findings 5/9 |
| [x] | T006 | RED: poller tests — the **fast-loop spine-cursor drain** recognises `kind:"status"` events and re-broadcasts as `status-delta`; no new loop, no per-PM spawn, coalescing rules hold | 089-first-class-pij | `test/unit/web/pij/poller.test.ts` (extend — finding 8) | Failing tests pin the drain-path emission | AC-09, finding 2 |
| [x] | T007 | Emit `status-delta` from the existing fast-tick cursor drain + `PijChannelEvent` union member; wire through existing broadcast egress; poller holds a `statuses` map served on the fleet snapshot (cold start) | 089-first-class-pij | `pij-poller.service.ts`, `types.ts` | T006 greens; status collection sits OUTSIDE the `!known` guard (WS-001); `MAX_BROADCASTS_PER_FAST_TICK` re-documented as ≤1 **per event type** with tests asserting each (WS-001 OQ-5) | AC-09, finding 2, WS-001; **A-4 (ratification)**: the statuses map is bounded — serve only hot-fleet peers, evict peers absent from the fleet after each slow-loop refresh (1,429 spine peers vs 237 hot measured) |
| [x] | T008 | RED: `usePijStatus` hook tests — per-PM status map from channel events + snapshot, age computation, threshold constant | 089-first-class-pij | `test/unit/web/pij/use-pij-status.test.tsx` | Failing tests | AC-02/AC-04 |
| [x] | T009 | `usePijStatus` hook consuming `status-delta` via existing `useChannelEvents` subscription | 089-first-class-pij | `hooks/use-pij-status.ts` | T008 greens | |
| [x] | T009a | RED: rail grouping tests — nesting from the tree (with `--all`), role labels **only** from JC-2 (role-unknown when absent; fake-seam roles pass through), no tree-depth role inference in the production path | 089-first-class-pij | `test/unit/web/pij/rail-grouping.test.ts` | Failing tests; asserts `groupFleet`'s tree-lead inference is not consumed as "PM" | AC-02, finding 7 |
| [x] | T009b | Rail grouping: adapt/extend `fleet-grouping.ts` — tree gives structure, JC-2 gives role chips + status entitlement | 089-first-class-pij | `lib/fleet-grouping.ts` | T009a greens | finding 7 |
| [x] | T010 | Rail view component per the mock: prime card, PM cards (NOW/NEXT/ASK + age), worker rows (badge word, task text, wt tag, note), NEEDS-YOU strip, hot-tier-labelled counts; testid per state | 089-first-class-pij | `components/pij-rail-view.tsx` | AC-02/03/04/07 testids assert; no fixed-width/`whitespace-nowrap` overflow classes — truncation classes present (finding 9; 280px is Jordan's visual confirm) | Mock = layout contract |
| [x] | T011 | Focus wiring: seat rows use existing `SeatFocusProvider`/focus route | 089-first-class-pij | `pij-rail-view.tsx` | AC-05 — refusal states render as in FleetView | reuse F-05 |
| [x] | T012 | Thread `mainPath` (`WorkspaceInfo.path`) through browser page → client → rail; scope line shows `⑂ <wt> → main` when applicable | workspace, 089-first-class-pij | `browser/page.tsx`, `browser-client.tsx`, `pij-rail-view.tsx` | AC-06 test: worktree workspace fetches fleet/tree against main path; `getMainRepoPath` has zero new callers | F-09 |
| [x] | T013 | Repoint + retire: `pij:toggle` (all 3 triggers) opens the rail tab on `/browser` and **navigates to `/workspaces/<slug>/browser?panel=pij` from any other route**; delete overlay panel/wrapper/provider incl. the `layout.tsx` mount; migrate the AC-12-era toggle tests | 089-first-class-pij | `use-pij-overlay.tsx` → replacement, deletions per manifest, `layout.tsx`, `sdk/register.ts`, tests | AC-08 — three-trigger test covers on-browser AND off-browser cases; `WORKSPACE_SSE_CHANNELS` unchanged with `'pij'` present; no `overlay:close-all` double-fire; grep shows no overlay imports | F-06, findings 1/6 |
| [ ] | T014 | Gates: typecheck + full vitest + lint; verify test tree compiles (the class-closer lesson) | — | repo | All green, exit codes verbatim in execution log | H-03 discipline |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002, T003 | T002 done-when (both surfaces + deep-link + toast) |
| AC-02 | T009a, T009b, T010 | T009a grouping tests + T010 testids |
| AC-03 | T010, T011 | T010 testids (blocked/question/strip) |
| AC-04 | T004, T005 | T004 discriminator tests (4 states → 4 test-ids) |
| AC-05 | T011 | T011 done-when (refusal parity) |
| AC-06 | T012 | T012 worktree test |
| AC-07 | T010 | T010 count-label testid |
| AC-08 | T013 | T013 three-trigger test |
| AC-09 | T006, T007 | T006 poller tests |
| AC-10 | T005 | T005 seam-swap done-when |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| JC shapes reshaped by albatross after CG codes | Medium | Low | Fake seam is one module (T005); brief ratifies before pij codes |
| Tab half-lands on one surface | Low | Medium | T001 extraction makes it structurally impossible |
| Toggle repoint breaks a trigger silently | Medium | Medium | T013 keeps the three-trigger test as one unit |
| Poller status reads add process cost | Low | Low | On-demand + signature-gated (F-07); no new loop |
