# Phase 1 — Execution Log

**Plan**: 089-first-class-pij · **Phase**: 1 of 4 (Read layer + poller + channel)
**Implementer**: `pij-miserable-nigel` (coder), stream PM `pij-cheap-cheetah`
**Started**: 2026-07-26 · **Repo**: `/Users/jordanknight/substrate/chainglass`, branch `main` (no commits — the orchestrator owns git)

## Method

TDD for T003–T007 and T010: failing test first (RED shown verbatim below), then implementation to
GREEN. At least once per TDD task the gate is proved able to fail — a violation is injected, the test
fires, the violation is removed.

## Fences honoured (self-audit, re-verified at close)

- Zero writes under `~/.pij/**`. Only file **reads** of `~/.pij/spine/**` and **read** verbs
  (`list`, `tree`, `node show`, `spine events`) via `execFile`.
- Zero writes to any `the-flow.json` / `the-flow.md` / `.the-flow-state.json` anywhere. Fixture flows
  are new files under `test/fixtures/flows/`.
- No `tmux` command run. No dev-server restart. No file watcher pointed at `~/.pij`.
- `apps/web/src/lib/sse-manager.ts`, `apps/web/src/lib/sse/**` and `pnpm-lock.yaml` untouched.

---

## T001 — Domain setup

**Status**: ✅ done

**What I did**

- Created `apps/web/src/features/089-first-class-pij/domain.md` following 064-terminal's `domain.md`
  as the format exemplar (Purpose / Boundary Owns+Excludes / Contracts table / Dependencies / Source
  Location / History), extended with two sections this domain specifically needs:
  - a **Ruled Constraints** table (C-01…C-10 verbatim, so a future reader cannot re-litigate them from
    the code alone), and
  - a **Deliberate Absences** table (no stalled badge, no anomaly badges, no archive tier, no
    pane/pid, no seat column in flow views, no estimated gauge) — Finding 04 says these will otherwise
    be refiled as bugs.
- Added `| First-Class pij | 089-first-class-pij | business | — | Plan 089 | active |` to
  `docs/domains/registry.md` (additive row, nothing else touched).
- Added to `docs/domains/domain-map.md` (all additive): the `firstClassPij` mermaid node, its two
  dependency edges (`auth` for the route gate, `events` for `sseManager.broadcast`), and the contract
  table row.

**Discoveries** → tasks.md Discoveries table (D-01).

---

## T002 — Fixtures

**Status**: ✅ done

**What I did**

Built two fixture trees, each with a `README.md` **hazard ledger** — one row per fixture naming the
ruled hazard, the rule it comes from, and the test that asserts it. A fixture with no asserted row is
decoration and the ledger says so.

`test/fixtures/pij/` — synthetic store:

| Fixture | Hazard |
|---|---|
| `store/shipname.json` | single-segment pij id (C-03) |
| `store/pij-normal-seat.json` | the no-hazard control |
| `store/pij-normal-seat.json.tmp-4242-6b1c9d0e` | leftover atomic-replace temp → phantom peer (C-07) |
| `store/archive/pij-archived-seat.json` | tier migration: a vanished hot path is not a deletion (C-07) |
| `store/spine/events.ndjson` | a **torn line** at seq 103, truncated mid-append |
| `store/spine/events.ndjson.tmp-1234-2f7a8c31` | transient temp *inside* `spine/`, carrying far-future seqs 9001/9002 |
| `store/spine/events.lock` | internal file ruled "never parse" |
| `open-vocab-spine/events.ndjson` | unknown `kind`s incl. the live-observed `delivered-unacked-stale` |

`test/fixtures/flows/` — ten synthetic plan folders, one per ruled classification/hazard: `live-088`
(ids `ph1…ph6`, reviews as `branch_of: ph4` excursions, `ph4` entered twice), `no-bag`
(completion falls back to the terminal node), `orphan-node` (array-order pseudo-edge),
`tombstone` (`*.legacy.*` must be ignored), `kitchen-sink` (copied verbatim from
`harness/cli/test/services/flow/fixtures/render/kitchen-sink.json`), `legacy-e308`, `corrupt-nav`,
`corrupt-json`, `untracked-work`, `not-started`.

Typed loaders: `test/fixtures/pij/index.ts` (typed paths + `copyStoreToTemp()`) and
`test/fixtures/flows/index.ts` (`FLOW_FIXTURES` map + `materializeFlowFixture()` /
`materializePlansRoot()`).

**Two fence/tooling decisions, recorded because they are interpretations, not deductions**

1. **Flow fixture documents are committed as `*.fixture.json`, never `the-flow.json`.** The packet
   reads "NEVER write `the-flow.json` … anywhere — including in fixtures", then qualifies with
   "fixture flows are NEW files under `test/fixtures/flows/`, never named exactly `the-flow.json`
   inside `docs/plans/`". Rather than pick a reading, I satisfied both: **no file named
   `the-flow.json` is committed anywhere in this repo**, and `materializeFlowFixture()` copies a
   fixture plan folder into an OS temp dir under the real filenames at test time — so the reader is
   still exercised against `the-flow.json` exactly as in production, with full fidelity and zero
   flow-shaped files added to the repo. Flagged to the PM as an interpretation; cheap to change.
2. **`corrupt-json` carries a `.txt` guard suffix.** `biome check .` parses every `.json` in the
   repo, and that fixture is invalid JSON *by construction*. `biome.json` is outside my allowed write
   paths, so the fixture takes an extension the formatter does not claim. The materializer strips it.

**Verification**: `npx biome check test/fixtures/` → `Checked 17 files … No fixes applied.` (exit 0)

---

## T003 — TDD spine cursor (`ISpineCursor`)

**Status**: ✅ done · **14 tests**

**RED #1 — no implementation** (test written first, run before any source existed):

```
Error: Failed to resolve import "…/089-first-class-pij/server/spine-cursor" from
"test/unit/web/pij/spine-cursor.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

**Interface first** (constitution): `server/spine-cursor.interface.ts` — `SpineEvent` (with `kind:
string`, **not** a union, and an index signature so additive fields survive — WS-5), `SpineReadResult`
(`events` / `seq` / `skipped` / `missing` / `readAt`), `ISpineCursor`.

**RED #2 — real behaviour caught a defect in my test, not the code.** First implementation run:

```
 FAIL  … > torn and corrupt lines (C-07) > holds an incomplete trailing line …
AssertionError: expected 1 to be +0
      Tests  1 failed | 13 passed (14)
```

The cursor had been constructed with `since: 106`, but `since` filters *events*, it does not skip
*parsing* — so that read still crossed the fixture's torn line and honestly reported `skipped: 1`.
The test was wrong, not the reader; it now drains the cursor first and asserts the tear there.

**GREEN**:

```
 ✓ test/unit/web/pij/spine-cursor.test.ts (14 tests) 22ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

**Gate proved able to fail** — injected `parsed.seq >= this.cursorSeq` (the inclusive-cursor bug C-08
exists to prevent) and re-ran:

```
   × … exclusive --since semantics (C-08) > is EXCLUSIVE: since=<tip> yields nothing, since=<tip-1> yields exactly the tip
   × … rename and replacement tolerance (C-07) > survives the log being renamed away and replaced under a live reader
   × … cursor survives a reader restart > resumes exclusively from a persisted seq
      Tests  3 failed | 11 passed (14)
```

Violation removed; back to `Tests  14 passed (14)`.

**Design decisions worth carrying forward**

- **Cursor by `seq`, offset by bytes.** `seq` is the correctness guard (exclusive, restart-safe); the
  byte offset is purely an optimisation so a 2s tick does not re-read a multi-MB log (the live log is
  ~19.2k lines today). When they disagree — rename, rotation, truncation — the offset is discarded and
  `seq` alone still guarantees no duplicate is ever emitted. This is what makes rename tolerance fall
  out rather than be bolted on.
- **A partial trailing line is a write in flight, not a tear.** It is buffered and completed on the
  next read. A line that *ends in a newline* and does not parse is a genuine tear: skipped and counted.
  Without this split the fast loop silently loses a real event every time it reads mid-append.
- **`missing: true` is a first-class result, not an error.** C-07's "a vanished path is not a
  deletion" is a *return value* here, so the poller can render honest staleness instead of crashing.
- **The transient-path guard throws at construction.** `isTransientStorePath()` is exported and the
  factory refuses a `*.tmp-<pid>-<uuid>` filename, turning a silent permanently-poisoned cursor into
  an immediate loud error.

---

## T004 — TDD pij CLI record reader (`IPijRecords`)

**Status**: ✅ done · **15 tests**

**RED**: `Error: Failed to resolve import "…/server/pij-records" … Tests  no tests`

**Interface first**: `server/pij-records.interface.ts` — `PijExecutor` (an `execFile`-shaped seam:
command + **fixed argv array**, never a shell string), `PijListRow` / `PijTreeNode` / `PijNodeDetail`
/ `PijStateReport` (all open, with index signatures), `IPijRecords`.

**GREEN**: `Test Files  1 passed (1) · Tests  15 passed (15)`

**Gate proved able to fail** — injected the silent repo-scoping bug (`const cwd = this.defaultCwd`,
dropping the per-call cwd):

```
 FAIL  … > per-call cwd — the silent repo-scoping trap > threads an explicit cwd to the executor for repo-scoped tree reads
      Tests  1 failed | 14 passed (15)
```

Restored → `Tests  15 passed (15)`.

**Live smoke against the real store** (read verbs only; the real adapter, not a fake):

```
list(): rows=178  >100 = true
list(): sample keys = id,folder,dataDir,pid,state,activity,liveness,lastEventAt
tree(chainglass): roots=3 first=pij-awkward-mongoose
tree(harness-eng): roots=4 first=pij-adjacent-fly
repo-scoping is real (different trees) = true
nodeShow(): badge=idle systemState=idle (badge consumed verbatim)
fence: raw(['close',…]) rejected -> E-FENCE: [pij] "close" is not a read verb — this feature is read-only (C-02)
```

Deliberately **not** committed as a repo test: it depends on a live pij store on the host and would
make the unit suite machine-dependent. Recorded here instead, with the reproduction in the log.

**Design decisions**

- **`assertReadOnlyArgv()` is a runtime fence, not a comment.** `PIJ_READ_VERBS` allowlists the head
  token and `PIJ_FORBIDDEN_TOKENS` rejects a mutating token in *any* position — because `project
  list` reads and `project set` writes, and both start with an allowlisted head. T010's static check
  covers the source; this covers a value that arrives at runtime, which static analysis cannot see.
- **Three distinct failure codes, because a human reads them.** `E-<CODE>` (pij said no) /
  `E-EXIT` (pij died) / `E-TIMEOUT` (pij never answered) / `E-PARSE` / `E-SHAPE`. Collapsing them
  would make AC-08's trichotomy unrenderable. `E-SHAPE` specifically stops list-shape drift from
  surfacing as a *plausible empty fleet*.
- **`tree({ cwd })` makes cwd required by type.** The repo-scoping trap cannot be forgotten at a call
  site; the test then proves the value is actually threaded, not merely accepted.

---

## T005 — TDD flow reader (`IFlowReader`)

**Status**: ✅ done · **24 tests**

**RED**: `Error: Failed to resolve import "…/server/flow-reader" … Tests  no tests`

**GREEN**: `Test Files  1 passed (1) · Tests  24 passed (24)`

**Gate proved able to fail** — injected the ruled id-pattern trap, replacing `node.type === 'phase'`
with `/^phase-/.test(node.id)`:

```
 FAIL  … the phase rail (C-09) > finds phases by type, not by id pattern, and orders them by walking next[]
 FAIL  … the phase rail (C-09) > does not invent the array-order edge for an orphan node
 FAIL  … the phase rail (C-09) > marks the current phase from nav.now
 FAIL  … phase activations (never "coder activations") > counts cursor entries per node …
 FAIL  … hostile and evolving documents > reads the kitchen-sink adversarial fixture without crashing
      Tests  5 failed | 19 passed (24)
```

Five tests fire because 088's phases are `ph1…ph6` — the pattern finds **zero**. Restored →
`Tests  24 passed (24)`.

**Rules implemented, each traceable to a ruling**

| Rule | Source |
|---|---|
| Classification is ONE signal: `provenance` present? | Q8 decision procedure |
| Completion = `nav.bag.status`, else the **terminal node's** status. Never the file set | Q8 — the trap that would render in-flight 088 as done |
| Phases by `type == "phase"`, never an id pattern | Q2 correction 1 (088 uses `ph1…ph6`) |
| Order by walking `next[]` from real roots | Q7 item 7 (088's `nodes[]` is stored newest-first — array order renders the rail **backwards**) |
| Orphans surfaced but flagged `offSpine`, never spliced into the chain | Q7 item 7 (meadowlark's orphan rendered a `research --> z1 --> plan` edge that does not exist) |
| Excursions (`branch_of`) excluded from the rail | Q7 item 8 |
| Reviews collected from BOTH spine and excursions | Q2 correction 2 (088's three reviews are all excursions — a rail-only count reports zero) |
| `assumed`/`known` never counted as done | Q7 item 1 |
| Unknown statuses/types carried verbatim | Q7 item 6 (schema unenforced on mutation; invalid values are on disk now) |
| `*.legacy.*` ignored entirely | Q8 item 3 |
| `agents[]` not bound | Q2 (populated by nothing until the v2 `harness flow agent` verb) |
| Signature = `events.length + ':' + nav.now` | Finding 08 |

**Every failure is a `FlowState`, never an exception.** A missing folder, an unparseable document and
a dangling `nav.now` all return a classified summary — the reader runs inside a poller tick over
every plan folder in a workspace, so one bad document must not take out the scan.

---

## T006 — TDD join

**Status**: ✅ done · **13 tests**

**RED #1**: import unresolved (no `server/join.ts`).
**RED #2**: `TypeError: asPijId is not a function` — the branding helper lived in `types.ts` and the
join module had not re-exported it. Fixed by re-exporting from `join.ts`, which is where raw ids
become keys and therefore where a reader will look for it.

**GREEN**: `Test Files  1 passed (1) · Tests  13 passed (13)`

**Gate proved able to fail** — replaced the segment-aware containment check with the naive
`resolve(folder).startsWith(resolve(workspacePath))`:

```
 FAIL  … joinSeatsToWorkspace > does NOT treat a sibling with a shared prefix as inside the workspace
      Tests  1 failed | 12 passed (13)
```

That is not a hypothetical here: worktrees are named `<repo>-2`, so a prefix filter would show
another repo's seats as this repo's, plausibly and invisibly. Restored → `Tests  13 passed (13)`.

**How "paneId/pid keys impossible" is actually enforced** (the phase's stated success criterion):

1. `PijId` is a **branded** string (`string & { __brand: 'PijId' }`), so a `pid: number` will not
   compile as a map key and a bare string must pass through `asPijId()` — a deliberate, greppable act.
2. `FleetRow` **does not have** `pid`, `paneId` or `dataDir` at all. `toFleetRow()` strips them from
   the promoted fields *and* from the `extra` passthrough bag. You cannot render, key, or match on a
   field that does not exist. (`dataDir` goes too: it is a record path, and record paths are
   explicitly not a stable contract.)
3. `indexFleetById(): Map<PijId, FleetRow>`.

**The flow↔project join records its own basis**: `{ planId, via, confident }` where `via` is
`provenance.plan_id` (data, `confident: true`) → `plan-folder-convention` (inference,
`confident: false`) → `none` (honest nothing). `provenance.agent` is deliberately never consulted —
it is the driving skill's name (`the-flow` in every flight plan in existence), not a seat.

---

## T007 — Channel contract THEN poller

**Status**: ✅ done · **22 tests**

**Contract first**, as the task requires. `types.ts` declares `PijChannelEvent` — three variants
(`fleet-delta` · `flow-delta` · `poller-status`), **every one carrying the spine `seq` it reflects**.
The serialization tests prove each survives `JSON.stringify` (which `sseManager.broadcast` performs)
including the two values most likely to be mangled: a single-segment `PijId` and a `contextCurrent`
whose value is the literal `'unknown'`.

The exhaustiveness proof is `describeEvent()` in the test: a `switch` with a `const unreachable:
never = event` fallthrough. A fourth variant added to the union without a handler **fails
`tsc -p tsconfig.test.json`** — the contract is enforced by the build, not by review.

**RED**: `Error: Failed to resolve import "…/server/pij-poller.service" … Tests  no tests`

**RED #2 — my test was wrong, again usefully.** The 100-event fan-out test named seats
(`pij-seat-0..2`) that were not in the fleet, so the poller correctly ignored all 100 as unknown
peers and broadcast nothing: `expected +0 to be 1`. The fix made the seats real, so the collapse
now demonstrates *the filter working* rather than *events being discarded*.

**GREEN**: `Test Files  1 passed (1) · Tests  22 passed (22)`

**Gate proved able to fail** — removed the fan-out filter (one broadcast per touched seat instead of
one per tick):

```
     → expected 3 to be less than or equal to 1
 FAIL  … the fan-out filter (Finding 03, C-08) > collapses 100 system-state events into at most one broadcast per tick
      Tests  1 failed | 21 passed (22)
```

Restored → `Tests  22 passed (22)`.

**Design decisions**

- **The filter is the first thing the fast loop does.** A tick emits **at most one** `fleet-delta`
  (`MAX_BROADCASTS_PER_FAST_TICK = 1`), carrying the coalesced final state of every seat touched.
  100 events over 3 seats → 1 message, not 100.
- **A spine event never fabricates a row.** It carries a peer id and a transition — not a folder, a
  harness or a model. An event for a seat we have never read is ignored; the seat arrives on the next
  slow loop with a real record behind it. This is the difference between a rendered row that is backed
  by a record and one that is a guess.
- **Only `system-state` may write `row.state`.** `task-set`/`state-set` transitions ride refs and
  their `next` payload means something else entirely — applying it would put a task *sentence* into
  the state field. Other kinds mark the seat touched without inventing a state.
- **`removed[]` says "gone from this view", never "died".** A seat leaving the hot list is usually a
  48h-TTL tier migration (C-07). The wire format deliberately carries no inference about why.
- **Degraded mode keeps last-known rows.** AC-09 requires views that never blank and never pretend
  freshness; clearing the fleet on a store error would do both at once.
- **AC-08's trichotomy is proved distinguishable at the source**: never-started
  (`running: false`, `lastRecordsPollAt: null`), running-and-empty (`fleetSize: 0`, `lastError: null`),
  and unreadable (`lastError: {code,…}`) are three distinct status shapes, asserted as such.

---

## T008 — Snapshot routes

**Status**: ✅ done · **17 tests**

**RED**: `Error: Failed to resolve import "…/app/api/pij/fleet/route" … Tests  no tests`

**GREEN**: `Test Files  1 passed (1) · Tests  17 passed (17)`

**Gate proved able to fail** — removed the `requirePijSession()` guard from the tree route:

```
 FAIL  … authentication … > every snapshot route returns 401 with no session
 FAIL  … authentication … > does not touch the store at all when unauthenticated
      Tests  2 failed | 15 passed (17)
```

Restored → `Tests  17 passed (17)`.

**Shape**: `server/route-deps.ts` mirrors `MuxDeps` exactly (`{ authFn, poller }` + a `defaultDeps`
built at the `GET` boundary), so every handler is unit-testable without a session. All four routes are
`dynamic = 'force-dynamic'` and every response carries `Cache-Control: no-store` — a cached poller
status is a lie with a timestamp on it.

**Decisions**

- **`/fleet` and `/status` never spawn a process**; they read the poller's in-memory snapshot. Three
  requests → zero CLI calls, asserted. That is the server half of AC-02.
- **`/tree` and `/flow` require `?workspace=`** (400 without). For `/tree` the value becomes the CLI
  `cwd` — the silent repo-scoping trap closed at the HTTP surface, not just in the adapter. For
  `/flow` it is the plans root; defaulting to the server's own repo would show chainglass's plans
  inside every workspace.
- **A read failure is 503 with the pij code**, not 500 and not an empty result. "Store unreadable" is
  a *rendered state* (AC-08's third leg); returning `[]` would be the confident lie.
- **The `PollerStatus` ships inside the fleet payload**, so the empty-state component can be honest
  from a single response.
- **`pid` / `paneId` / `dataDir` never appear in a response body** — asserted against the serialized
  text, not just the typed object. A field absent from the wire cannot be rendered or keyed on by any
  future client, however careless.

---

## T009 — Bootstrap (fourth HMR-safe singleton)

**Status**: ✅ done · **7 tests**

Added the fourth block to `apps/web/instrumentation.ts`, copying the existing idiom exactly (Finding
06 — three precedents in the file): a dedicated `globalThis` flag
(`__pijObservatoryBootstrapped`), a `try/catch` that **resets the flag** so a later boot can retry,
`SIGTERM` + `SIGINT` cleanup, and a one-line startup breadcrumb. Additive only — nothing else in the
file was touched.

`server/start-pij-poller.ts` holds the singleton. Two levels of idempotence, because there are two
ways to double-start: `getPijPoller()` memoises the instance on `globalThis` (survives HMR), and
`PijPollerService.start()` no-ops if already running.

**GREEN**: `Test Files  1 passed (1) · Tests  7 passed (7)`

**Gate proved able to fail** — removed the singleton guard so `getPijPoller()` constructs a fresh
poller per call:

```
 FAIL  … HMR-safe singleton (AC-02) > returns the same instance on every call
 FAIL  … HMR-safe singleton (AC-02) > start() twice does not start a second poller
      Tests  2 failed | 5 passed (7)
```

Restored → `Tests  7 passed (7)`.

**One design point worth keeping**: construction does **not** start the loops. A route that arrives
before the bootstrap has run therefore gets a real poller reporting `running: false` — which is
exactly AC-08's "poller not running" state, the one condition a human can act on — rather than a
crash or a fabricated empty fleet.

**The dev server was NOT restarted** (Jordan's nod required, per the task note). Proof is unit tests +
`pnpm typecheck` + `pnpm build`, exactly as the task specifies. The production build resolves all four
routes as dynamic:

```
├ ƒ /api/pij/fleet
├ ƒ /api/pij/flow
├ ƒ /api/pij/status
├ ƒ /api/pij/tree
```

---

## T010 — Fence proof (AC-11, C-02)

**Status**: ✅ done · **10 assertions, all 10 demonstrated able to fail**

`test/unit/web/pij/fence.test.ts` statically analyses every `.ts`/`.tsx` file under
`apps/web/src/features/089-first-class-pij/**` and `apps/web/app/api/pij/**`, with comments and
import lines stripped first (this feature's prose necessarily *names* the verbs it forbids, and
`import { readFile, readdir }` sits in the same namespace as the write APIs).

The ten assertions: a non-empty guarded set · no write-mode fs API · every `open()` is mode `'r'` ·
no mutating pij verb · mutating verbs in `pij-records.ts` appear **only** inside its denylist · no
mutating `harness flow` verb · never names `the-flow.md` or `.the-flow-state.json` · no
chokidar/`fs.watch` against `~/.pij` (C-04) · no shell (`execSync`/`spawnSync`/`shell: true`) · no
tmux / `send-keys` / `select-window` / `attach-session` (C-01, C-06).

**Red→green, round 1** — six real violations injected into `spine-cursor.ts` (a `writeFileSync`
helper, a `['close', …]` argv, a `tmux select-window` argv, a `.the-flow-state.json` constant, a
chokidar watch, and an `open(path, 'w')`):

```
 FAIL  … > opens no write-mode filesystem handle anywhere in the feature
 FAIL  … > opens files only in read mode
 FAIL  … > names no mutating pij verb
 FAIL  … > never constructs the derived render or the legacy state file as a target
 FAIL  … > never watches ~/.pij with a file watcher (C-04)
 FAIL  … > never sends keystrokes to a pane or drives tmux (C-01, C-06)
      Tests  6 failed | 4 passed (10)
```

**Round 2** — three more injected into `pij-records.ts` (a `flow create` argv, an
`execSync(cmd, { shell: true })`, and a stray `'close'` *after* the denylist):

```
 FAIL  … > the record adapter names mutating verbs ONLY inside its denylist
 FAIL  … > names no mutating harness flow verb
 FAIL  … > never shells out through a shell (fixed argv only)
      Tests  3 failed | 7 passed (10)
```

**Round 3 — the anti-vacuous guard.** A static check whose glob has drifted passes perfectly while
proving nothing. Renaming the guarded root to a directory that does not exist:

```
 FAIL  … > guards a non-empty set of source files (the check itself must not silently cover zero)
 FAIL  … > opens files only in read mode
      Tests  2 failed | 8 passed (10)
```

Note what that round shows: **eight of the ten assertions passed vacuously** on an empty file set.
Only the file-count guard and the open-mode assertion (which requires `openCalls.length > 0`) caught
it. That is precisely the "green that lies" this guard exists for, and it is now covered.

All injections removed → `Tests  10 passed (10)`.

**The runtime half** of the same policy lives in `pij-records.ts`'s `assertReadOnlyArgv()` and is
covered in `pij-records.test.ts` — static analysis cannot see a verb that arrives as a value.
Verified live against the real store: `raw(['close', …])` → `E-FENCE`.

---

## Gates — all run in full

Discovered from `package.json` (`typecheck` / `lint` / `test` / `build`) plus the test-tree typecheck
gate added in `4f81a60b8` (`tsconfig.test.json`, which the root tsconfig excludes). All five run to
completion, not first-fail.

| # | Gate | Command | Exit | Result |
|---|------|---------|------|--------|
| 1 | Typecheck (src) | `pnpm typecheck` | **0** | clean |
| 2 | Typecheck (test tree) | `npx tsc -p tsconfig.test.json --noEmit` | **0** | clean |
| 3 | Lint | `pnpm lint` | **0** | `Checked 1703 files in 419ms. No fixes applied.` |
| 4 | Unit + integration | `pnpm test` | 1 | `Test Files  1 failed | 506 passed | 8 skipped (515)` · `Tests  3 failed | 6718 passed | 63 skipped (6784)` |
| 5 | Production build | `pnpm build` | **0** | `Tasks: 7 successful, 7 total` · `✓ Compiled successfully in 8.1s` |

**Plan 089's own suites: 8 files, 122 tests, all passing.**

```
 ✓ test/unit/web/pij/spine-cursor.test.ts  (14 tests)
 ✓ test/unit/web/pij/pij-records.test.ts   (15 tests)
 ✓ test/unit/web/pij/flow-reader.test.ts   (24 tests)
 ✓ test/unit/web/pij/join.test.ts          (13 tests)
 ✓ test/unit/web/pij/poller.test.ts        (22 tests)
 ✓ test/unit/web/pij/routes.test.ts        (17 tests)
 ✓ test/unit/web/pij/bootstrap.test.ts     ( 7 tests)
 ✓ test/unit/web/pij/fence.test.ts         (10 tests)
 Test Files  8 passed (8) · Tests  122 passed (122)
```

### The 3 failures are pre-existing on `main` — proved, not assumed

```
 FAIL  test/integration/web/dashboard-navigation.test.tsx > … should show Dev section with navigation to Workflow page
 FAIL  test/integration/web/dashboard-navigation.test.tsx > … should maintain layout consistency across pages
 FAIL  test/integration/web/dashboard-navigation.test.tsx > … should preserve sidebar collapsed state during navigation
     → Unable to find an element with the text: /dev/i
```

Two independent checks:

1. **No overlap.** `grep -nE "instrumentation|domain-map|registry|089|pij"` over that test file
   returns nothing. My only non-new source file is `apps/web/instrumentation.ts` (a Next.js server
   hook a React component test never imports).
2. **Reproduced without my change.** `apps/web/instrumentation.ts` was restored to HEAD, the suite
   re-run, and my version restored:

```
--- running the failing suite at HEAD instrumentation ---
 FAIL  … should show Dev section with navigation to Workflow page
 FAIL  … should maintain layout consistency across pages
 FAIL  … should preserve sidebar collapsed state during navigation
 Test Files  1 failed (1) · Tests  3 failed (3)
```

Same three failures with none of my source changes in place. The sidebar's Dev section is present in
the source but rendered inside the non-compact rail; the test's expectation and the component last
diverged at `4f7f1e426` / `0c0204e28`, both of which pre-date this phase. **Out of scope for Phase 1
and not touched** — flagged to the PM rather than fixed, since `dashboard-sidebar.tsx` is on the
do-not-modify list.

### Build hygiene: 2 Turbopack warnings introduced, then removed

The first build passed (exit 0) but emitted two Turbopack NFT-tracing warnings traced to
`spine-cursor.ts` → `start-pij-poller.ts` → the fleet route: a runtime-resolved fs path makes the
tracer assume the whole project is a data dependency and pull it into the standalone output. Applied
the documented remedy (`join(/* turbopackIgnore: true */ options.spineDir, fileName)`) — the spine
path is resolved from `$PIJ_HOME` and lives entirely outside this repo, so nothing in the project is
genuinely traceable through it.

`Turbopack build encountered 2 warnings` → `1 warnings`, and the remaining one traces to
`packages/workflow/dist/**`, which this phase never touched. **Net contribution: zero warnings.**

---

## Fence self-audit (re-verified at close)

| Fence | Evidence |
|---|---|
| No write under `~/.pij/**` | `fence.test.ts` (10 assertions, all proved able to fail) + `assertReadOnlyArgv()` at runtime + live check: `raw(['close',…])` → `E-FENCE` |
| No mutating pij verb | Same. Only `list` / `tree` / `node show` / `state` argv exist in the source |
| No write to `the-flow.*` / `.the-flow-state.json` | `fence.test.ts`; and **no file named `the-flow.json` is committed anywhere in this repo** — fixtures are `*.fixture.json`, materialized to real names in an OS temp dir at test time |
| Nothing under `docs/plans/` modified except this tasks dir | `git status --porcelain` shows exactly: `M apps/web/instrumentation.ts`, `M docs/domains/domain-map.md`, `M docs/domains/registry.md`, plus new untracked files |
| `sse-manager.ts` / `lib/sse/**` / `pnpm-lock.yaml` untouched | Not in `git status`; the poller *consumes* `broadcast` and modifies nothing |
| No dev-server restart, no `tmux`, no watcher on `~/.pij` | No such command run this session; asserted statically by `fence.test.ts` |
| `instrumentation.ts` additive only | One new global-flag const + one new block; no existing line changed |

## Handoff notes for Phase 2

- Subscribe to the `pij` channel **before** fetching `/api/pij/fleet`, buffer arriving deltas, drop
  those with `seq <= snapshot.seq`. Both halves of that contract are in place and tested.
- `fleet-delta` rows are **full replacements**. Do not write field-level merge logic — that is what
  keeps AC-03's never-re-derive rule enforceable.
- `FleetRow.badge` is `undefined` until a `node show` has been made for that seat: `pij list` rows
  carry no badge. Render the absence honestly; do **not** derive one from `state`.
- `PollerStatus` is already in the fleet payload — AC-08's trichotomy needs no second request.
- The flow watcher (3.4) is the one place a file watcher is *intended*. `fence.test.ts`'s C-04
  assertion bans watcher APIs across the whole feature today, so Phase 3 must narrow that assertion to
  the pij side rather than delete it.

---

# Fix 1 — spine cursor replacement identity (review finding 1, HIGH)

**Packet**: `scratch/pij-firstclass-packets/p1-fix-1.md`. Scope: exactly this finding, nothing else.
All Phase 1 fences remained in force; no fence was touched.

## The defect, restated from the code

`read()` reset the byte offset only under `size < this.offset`. That catches a replacement that
**shrank** and nothing else. Atomic replace is temp+rename, and the replacement is very often the
same size or larger (a compaction, a tier migration, a fresh log that has already caught up). In
that case the cursor kept a byte offset belonging to a **dead inode**, read from the middle of the
new file, and dropped its entire prefix — including events with `seq >` the cursor — **permanently**,
while still returning `missing: false` and `skipped: 0`. Silent, unrecoverable without a restart,
and invisible to every existing test: the one replacement test only exercised the shrink path.

## RED (new coverage, against the unfixed implementation)

Two tests added to `test/unit/web/pij/spine-cursor.test.ts`, in the existing
`rename and replacement tolerance (C-07)` block.

The first is the packet's required case: drain the cursor to 106, then `renameSync` a replacement
over the log that is **at least as large** as what was already read, holding a duplicate `seq: 106`
line plus a genuinely new `seq: 301`. The duplicate line is padded so the stale offset lands *inside*
the new event's line — so a size-only reader sees a fragment, not the event.

```
 ❯ test/unit/web/pij/spine-cursor.test.ts (16 tests | 2 failed) 323ms
   × FileSpineCursor > rename and replacement tolerance (C-07) > resets on an atomic replacement that is NOT smaller than what it had already read 23ms
     → expected [] to deeply equal [ 301 ]
   × FileSpineCursor > rename and replacement tolerance (C-07) > treats the log vanishing between stat and open as the rename window, not an exception 2ms
     → expected [ { schema_version: 1, …(9) }, …(4) ] to deeply equal []
 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
```

`expected [] to deeply equal [ 301 ]` is the finding exactly: the whole prefix of the replacement is
gone, and the read reported itself healthy.

## The fix (reviewer's spec, adopted verbatim)

1. **Identity, not size.** `read()` now records `dev:ino` from the same `stat` it already made and
   discards both `offset` and `pending` the instant that identity changes — *regardless* of how the
   sizes compare. The shrink check is kept underneath for same-inode truncation. The exclusive
   `seq >` guard still does the de-duplication, so a replacement that repeats old lines is harmless.
2. **ENOENT after a successful stat is the same rename window.** `stat` and `open` are two syscalls
   and the registry renames records under live readers. That gap now degrades identically to an
   absent file — `missing: true`, cursor held, `offset`/`pending` untouched — instead of throwing out
   of a method the contract documents as never throwing on a missing store.
3. The range read became an injectable `readChunk` (defaulting to the real one), because the
   stat/open gap cannot be hit deterministically against the real fs. Same test-only seam the
   `fileName` option already provided; the production path is unchanged.

## GREEN

```
 ✓ test/unit/web/pij/spine-cursor.test.ts (16 tests) 22ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

## Gate proved able to fail (single variable)

The RED above was against the whole unfixed file. To prove the new test pins *this* guard and not
something incidental, the identity reset alone was disabled (`if (false && …)`) with everything else
left in place:

```
   × FileSpineCursor > rename and replacement tolerance (C-07) > resets on an atomic replacement that is NOT smaller than what it had already read 7ms
     → expected [] to deeply equal [ 301 ]
      Tests  1 failed | 15 passed (16)
```

Exactly one test fires, and it is the right one — the ENOENT test stays green, confirming the two
changes are independently pinned. Implementation restored; 16/16 green again.

## Gates

| Gate | Command | Exit | Result |
|---|---|---|---|
| pij unit suite | `npx vitest run test/unit/web/pij/` | **0** | `Test Files 8 passed (8)`, `Tests 124 passed (124)` (was 122; +2) |
| typecheck (src) | `pnpm typecheck` | **0** | clean |
| typecheck (test tree) | `npx tsc -p tsconfig.test.json --noEmit` | **0** | clean |
| lint | `npx biome check <feature> <tests>` | **0** | clean (formatted with `--write` after the edit) |

Files touched by this fix — **two**, both already owned by Phase 1:

- `apps/web/src/features/089-first-class-pij/server/spine-cursor.ts`
- `test/unit/web/pij/spine-cursor.test.ts`

Nothing committed; git remains the orchestrator's.
