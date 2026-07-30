# Plan 089 v2 — the useful pij view

**Status:** draft — mockup first, Jordan's approval, then the work request to pij prime.
**Verdict driving this (Jordan, 2026-07-29):** v1 shows an accurate hierarchy of pij stuff, but it is not *useful*. v2 changes the content model, not just the layout: the view answers "who is doing what, and what's next" instead of "who exists".

**Mockup:** `scratch/pij-rail-mock.html` — single-page static HTML, light palette, interactive: clicking any seat switches a pretend tmux pane (per-seat scrollback + tmux status bar with the selected window starred), PM teams collapse/expand, FILES/PIJ tabs toggle. This is the contract for the layout; approve or mark it up before anything below moves.

---

## The shape

- Canonical structure is always **prime → project manager → project team members**. A PM runs a project team.
- Only **PMs** carry a status. Prime and workers do not — a PM's now/next is the unit of situational awareness.
- **Now + next:** every time a PM starts or stops work it records a two-sentence summary — what it just did, what is next.
- Orphans stop being a rendered band; pij eliminates them at the source (sweep-adopt, below), so the UI can assume a tree.

## A — What chainglass builds (this seat)

1. **Move the pij view into the left rail**, sharing the file-tree slot as a `FILES | PIJ` tab pair. The terminal keeps the whole main area. The overlay (F-14) and the fleet page get retired or demoted once the rail lands — decision for Jordan at build time.
2. **Roster layout** (per mockup): prime card at top; PM cards below with project name, state dot, question chip when asking, and NOW/NEXT lines with a freshness age; workers as one-line rows under their PM with state (active / stopped / blocked / question), worktree tag, and activity.
3. **Scope: this project only, resolved to main.** If the workspace is a worktree, the view anchors back to the main checkout — prime always lives in main. (Membership itself keeps the v1 rule: the tree decides, with `--all`.)
4. **Click a seat → its tmux pane.** Reuses the Phase-4 focus route; human click only (C-06 stands).
5. **Consume the status record verbatim** (AC-03 — never re-derive), with designed absence states: *no status yet*, *status stale* (watchdog threshold), and *not a PM — carries no status by design*. Each a distinct `data-reason`, N states → N test-ids, per doctrine.
6. **Name the instrument's window next to rendered counts.** `pij list` is the hot tier — measured 2026-07-29 (albatross): 215 hot rows vs 234 flat descriptors vs 4,037 archive entries, ~5% of the recorded population. A count labelled "seats" would render absence as a state; label it as what it is ("N seats currently hot" or equivalent). This applies to every aggregate the rail shows.

## B — What we ask pij prime (pij-wee-albatross) to build

> Not yet sent. Goes as a work request after Jordan approves the mockup and this doc.

1. **PM status — ride the spine for storage, one call for UX.** Measured 2026-07-29: the spine envelope already carries free string fields `prev`/`next` (task-set events put whole canonical-assignment JSON in them) and `kind` is open for external writers; storage needs no new record type. But the front door must be **one call that does the entire update** — tokens are expensive, and every extra command is an extra agent turn. Proposed shape:

   ```
   pij status "<what I just did>" "<what's next>" [--state <word>] [--assignment <id>]
   ```

   One atomic call: appends the `status` spine event (`prev`=did, `next`=next, `peer`=self, project inferred from the seat's current assignment) and, when `--state` is given, performs the `state set` in the same invocation — a PM stopping work runs exactly one command, not two or three. Token economics apply to the *output* too: the confirmation is one short line, no `--json` needed on the write, and the watchdog's stale-status nudge includes the ready-to-paste command so the PM spends zero tokens on syntax recall. History (append-only), freshness (event `ts`), and our read path (`spine events --peer <id> --json`, already allowlisted) all fall out free. Optional: denorm the latest status onto the node the way `currentTask` already is. Field shape still a **joint contract** (flow-json precedent).
2. **Prime sweep-adopt** — when a *prime* calls any pij command and unadopted seats exist in its repo or its worktrees, **the prime is notified** and adopts them. **Orphans themselves are never warned** (Jordan's ruling 2026-07-29 — a seat with no governance shouldn't be asked to fix its own governance). Net effect: there is always a tree.
3. **Watchdog status nudge** — PMs with a stale now/next get reminded to update it at watchdog time. Non-PM seats and prime are excluded.
4. **Role in the record** — pij needs to know which seats are PMs for 1 and 3 to target correctly, and the canonical prime→PM→team shape should be expressible/checkable. Shape of this is albatross's call; our need is "the UI can tell a PM from a worker without inferring it".
5. **Skill-route updates** so seats actually exercise the above (status on start/stop, prime adoption habits) — automation in the definition of done, per the standing rule from the dove briefings.
6. **Question text on the needs-human record** — the current contract carries only the kind; the rail wants to show *what* is being asked (mockup: "NEEDS YOU" strip). New field, same joint-contract treatment as the status shape (V2-AC-16).
7. **A reason on attention states** — `state set blocked` records the word only (`--refs` is structured, not prose), so the rail can't say *why* a seat is blocked without a pane-click. Ask: an optional `--note "<one line>"` on `state set` for the attention words (blocked/question). This does **not** reopen periodic status for workers (that stays PM-only) — it's one line, at the transition, in the same single call.

## Feature → AC → owner map

Owner legend: **CG** = chainglass (this seat, plan-089 pipeline) · **PIJ** = pij prime (pij-wee-albatross) · **JOINT** = contract agreed before either side codes.

| AC | Feature | Acceptance criterion | Owner |
|----|---------|----------------------|-------|
| V2-AC-01 | Rail placement | The pij view renders as a `PIJ` tab sharing the file-tree slot; the terminal area is untouched. Overlay/fleet-page fate decided before this lands. | CG |
| V2-AC-02 | Roster shape | Prime at top, PMs below, workers nested under their governing PM — rendered from the tree, never inferred from cwd or naming. | CG |
| V2-AC-03 | Tree is total | Every seat in the project has a parent; unadopted count for the repo trends to 0 via sweep-adopt. UI may assume a tree but must still render the (transitional) orphan case as a designed state, not hide it. | CG render / PIJ guarantee |
| V2-AC-04 | PM now/next | PM cards show the two-sentence now + next **verbatim** (AC-03 doctrine: consumed, never re-derived) with an updated-age. | CG render / PIJ record |
| V2-AC-05 | Worker rows | One line per worker: state (active / stopped / blocked / question), current activity (= assignment task text), worktree tag, age. **Blocked ≠ question, and both are pij's ruled words**: blocked = waiting on another seat/process, resolves without the human, rendered loud (red); question = waiting on the *human*, answered in UI or terminal, rendered violet and pinned in NEEDS YOU. | CG |
| V2-AC-06 | Click → pane | Clicking a seat selects its tmux pane via the existing focus route; human click only (C-06); refusal states from Phase 4 carry over unchanged. | CG |
| V2-AC-07 | Worktree resolution | In a worktree workspace the view anchors to the main checkout (prime lives in main), and says so in the scope line. | CG |
| V2-AC-08 | Absence states | Three distinct `data-reason`s: *no status yet*, *status stale*, *not a PM — carries no status by design*. N states → N test-ids. | CG |
| V2-AC-09 | Window labelling | Every rendered count names its instrument's window (`pij list` = hot tier, 215/4,271 measured 2026-07-29) — "N seats currently hot", never a bare census claim. | CG |
| V2-AC-10 | Status record | `pij status "<did>" "<next>" [--state <word>]` — **the entire update in one call** (spine `status` event + optional semantic-state set, atomically; project/peer inferred). Terse one-line confirmation; the watchdog nudge carries the paste-ready command. Storage is the existing spine envelope (`prev`/`next`); CG reads via `spine events` (already allowlisted). Optional node denorm follows the `currentTask` pattern. | PIJ (small) |
| V2-AC-11 | Status contract | The consumed field subset (now, next, updatedAt at minimum) is registered as a consumer contract with gaps tracked — flow-json precedent. | JOINT |
| V2-AC-12 | Sweep-adopt | When a **prime** runs any pij command and unadopted seats exist in its repo or worktrees, the prime is notified and adopts. **Orphans are never warned** (Jordan ruling 2026-07-29). | PIJ |
| V2-AC-13 | Watchdog nudge | Watchdog reminds PMs — and only PMs — with a stale now/next to update it, and the reminder **contains the paste-ready one-call command** (token economics: zero syntax recall). Prime and workers excluded. Staleness clock = the last `status` event's `ts`. | PIJ |
| V2-AC-14 | Role in the record | A seat's role (prime / PM / worker) is readable from the record, so the UI and the watchdog can target PMs without inferring. | PIJ record / JOINT shape |
| V2-AC-15 | Skill-route automation | The skill routes make PMs actually run the status verb at start/stop of work — automation in the definition of done, not a request to remember. | PIJ |
| V2-AC-16 | Questions surfaced | A seat waiting on a human question is pinned in a "NEEDS YOU" strip at the top of the rail (with the question text and age) *and* marked in place; clicking either jumps to its pane. **Contract gap:** the needs-human ruling carries a kind-chip only. But the daemon already *extracts* the question label at detection (`daemon/loop.ts` needs-human path) and then drops it after one notify — persisting that label (spine event, same carrier as status, or a node field) closes the gap without new detection work. Seats that declare `state set question` cover the rest. | CG render / JOINT record |

## Open questions (for Jordan)

- What happens to the v1 overlay and `/pij` fleet page once the rail exists — retire, or keep the overlay as the cross-workspace/global view?
- Status staleness threshold (mockup shows a nudge at ~45m) — pij's watchdog cadence or our own?
- Does clicking a *PM* focus its pane too, or expand/collapse the team? (Mockup assumes: click anywhere on the seat row → pane.)

## Sequence

1. Jordan reviews `scratch/pij-rail-mock.html` and this doc; markups folded in.
2. Status-record field contract sketched with albatross (before code on either side).
3. Work request to albatross (section B); chainglass rail build (section A) proceeds in parallel behind a faked status record.
4. Standard pipeline per phase: tasks dossier → opus validation → fleet → cross-model review → gates → single-committer commit.
