# Workshop: JC-3 — the question-text contract

**Type**: Integration Pattern
**Plan**: 090-pij-rail-v2
**Spec**: pij-rail-v2-plan.md
**Created**: 2026-07-29
**Status**: Draft

**Value Thesis**: The NEEDS-YOU strip is the one part of the rail that asks the human to *act*. Every other panel can degrade to "I don't know" and still be useful; a strip that shows the wrong question, a stale question, or a fabricated one costs Jordan a pane-click and a unit of trust that the rail does not earn back. This workshop fixes the exact bytes that carry a question, the exact read that projects them, and the exact moment they stop being true — so chainglass renders a human's ask verbatim or renders honest absence, and never anything in between.

**Target Proof Level**: Contract Ready
**Current Proof Level**: **Contract Ready (unratified)** — every *existing-behaviour* claim below is verified at `path:line` in the live pij checkout (Evidence Ledger, 21 rows). Every *proposed* field is unbuilt on both sides: zero producer surface exists today. Ratification is albatross's brief; CG codes against the fake seam (plan T005) until then.

**Selected Value Axes**

| Axis | Why it is selected here |
|---|---|
| **Honesty under absence** | A missing question must render as a designed state, never as a blank strip that reads "nobody needs you". |
| **Zero marginal read cost** | The rail already polls one read every 8s. A question-text contract that costs a per-seat spawn is a contract that gets rate-limited into staleness. |
| **Lifecycle symmetry** | A question that never clears is worse than one that never appears. The carrier must clear on exactly the transitions that clear the state it belongs to. |
| **Cross-repo coupling cost** | Every field is a joint contract two repos must keep. Fewer, denser, additively-safe fields beat more, flatter ones. |
| **Reversibility** | If albatross reshapes the field, CG re-points one module. Nothing about the rail's render may depend on the carrier's shape. |

---

## Purpose

Decide, to the byte, how "what a seat is asking the human" travels from pij (producer) to chainglass (consumer), for both honest sources: the **declared** note a seat writes about itself, and the **daemon-detected** boot prompt a seat is wedged on. Produce a contract albatross can implement without a second conversation, and a consumed-field subset CG can code a fake against today.

## Fresh Entrant Outcome

A reader who has never touched either repo can, after this document:

1. Name the two sources, say why they are never conflated, and say which one carries real prose.
2. Point at the field that carries a question, the read verb that projects it, and the five fields CG consumes.
3. Say what a stale unanswered question looks like on screen and explain why chainglass never expires one.
4. Explain why the daemon-detected path renders **nothing at all** today — and what the minimum pij change is that would make it render something.
5. Write the RED test for each absence state, because each has a named `data-reason`.

## Key Questions Addressed

- **KQ-1** What carries the declared note — assignment record, node denorm, or spine event?
- **KQ-2** When does a question stop being true, and who decides — pij or chainglass?
- **KQ-3** What is the length limit, who enforces it, and where does truncation happen?
- **KQ-4** Which allowlisted read projects it, and what is the exact consumed-field subset?
- **KQ-5** What is the daemon-detected path's contract *as it actually exists today*, not as the plan assumed?
- **KQ-6** How does the NEEDS-YOU strip pick its text for each source, including the empty case?
- **KQ-7** How does the note interact with the worst-first badge, given a seat can hold several open assignments?

---

## The finding that reshapes this contract

The plan (§Joint Contracts, JC-3) says the daemon-detected path gives CG "only the pattern tag", and AC-03 asks CG to render a kind-only fallback from it. **That is one step more optimistic than the code.**

The tag is never persisted anywhere chainglass can read. It exists as a local `const label` inside one daemon tick, is spent on a single inbox `notify()` to `spawnedBy`, is latched by an **in-memory** `drive.flaggedHuman` boolean, and is otherwise written only to the daemon's own log line (`core/daemon/loop.ts:262-272`, `daemon.ts:421-431`, `core/daemon/loop.ts:104`). There is no descriptor field, no spine kind, no `SYSTEM_STATES` member, and no projection in any read verb — a repo-wide grep for a needs-human/pane-observation field returns nothing.

Two consequences, both load-bearing:

- **CG has no daemon-detected source at all today.** Not degraded, not kind-only — absent. The fallback string in AC-03 has no input.
- **Daemon detection is boot-window-only.** `driveSession` runs exclusively over `this.index.pending()` (`daemon.ts:398`), and `pending()` is `lifecycle === "pending"` (`core/daemon/index-state.ts:99-101`). Combined with the fixed three-entry pattern table (`core/interstitial.ts:42-50` — `folder-trust` / `login` / `update-prompt`), the daemon can *never* observe "the agent asked the human a mid-task question". It observes "this seat is wedged on a boot prompt".

This does not contradict the standing ruling — it sharpens it. The ruling says declared `--note` is the only question-text source; the code says the daemon path is not even a *kind* source yet, and what it would eventually name is not a question. **Flagged for Jordan/albatross, not silently changed:** AC-03's fallback copy `"asked a question — open the pane"` is wrong for all three tags. Proposed replacement in D6.

---

## Decision Space

### D1 — Carrier for the declared note

| # | Option | Verdict | Reasoning |
|---|---|---|---|
| D1-a | **Descriptor denorm `stateNote`, projected into `pij list --json` rows and the `node show` card** | **SELECTED** | Rides the read CG *already runs* (`pij list --json --badge`, `pij-records.ts:132`) — zero new verbs, zero new spawns, zero new loop, so AC-09 is untouched. It is the same class of field as `currentTask`/`semanticState`, whose row projection is explicitly justified as "a field read — NO spine read, NO assignmentStore join, NO per-row fan-out" (`core/cli.ts:2087-2094`). It inherits `semanticState`'s clear-on-swap machinery for free (D3). |
| D1-b | Assignment record field only (`Assignment.note`) | REJECTED as sole carrier | `pij list` deliberately does not join the assignment store; reading the note would cost N × `pij node show`, measured by pij's own comment at **179 rows ≈ 80s** (`core/cli.ts:2087-2092`). Kept as an *optional* audit companion — see D1-d. |
| D1-c | Spine `state-set` event `refs` (e.g. `note:<text>`) | REJECTED | `refs` is a comma-split structured token list (`core/cli.ts:1341-1347`, `1404-1411`). Prose containing a comma shatters into fragments. Refs are for identifiers; this is prose. |
| D1-d | Spine event `prev`/`next` (canonical assignment JSON) | REJECTED **as CG's read path**, ACCEPTED as a free audit trail | Reading it means `pij spine events --peer <id>` per attention seat — a per-seat spawn the plan rules out. But if albatross *also* authors the note onto the `Assignment` record, it lands in `prev`/`next` automatically: `canonicalRecordLevel` preserves unknown own fields in sorted order by design ("the guards tolerate additive fields and the store preserves them, so prev/next must never silently omit data the persisted record carries", `core/platform/project.ts:100-103`, `core/platform/assignment.ts:132-149`). History for free, consumed by nobody. **Albatross's call; CG consumes neither way.** |
| D1-e | New read verb / new record type | REJECTED | New surface for one string. Violates the "storage rides existing envelopes" line in v2-enhancements §B1. |

### D2 — Field shape

| # | Option | Verdict | Reasoning |
|---|---|---|---|
| D2-a | `stateNote?: { text: string; state: SemanticState; at: string }` | **SELECTED** | Three fields, each earning its place: `text` is the strip's line; `state` says which attention word the note belongs to and is the supersede guard's input (D3); `at` is the only source of the age the mock renders (`scratch/pij-rail-mock.html:340-342`) — the descriptor stamps no timestamp for `semanticState` today, so without `at` the age would need a spine read per seat. |
| D2-b | Flat `semanticNote?: string` | REJECTED | No age (see above) and no self-description: `pij list` rows do **not** project `semanticState` today (`core/cli.ts:2091-2103` vs `node show` at `:4146`), so a bare string arrives with nothing to bind it to. |
| D2-c | Reuse `currentTask` / overload an existing field | REJECTED | `currentTask` is assignment text, already consumed as worker activity (AC-02). Overloading it makes two questions one field. |

**Companion ask (small, same class):** project `semanticState` on the `pij list --json` row alongside `currentTask`. It is a pure descriptor field read, identical in cost to the three already projected there, and it closes a pre-existing CG gap (`PijListRow` has no `semanticState`; `PijNodeDetail` does — `pij-records.interface.ts:28-54` vs `:102`). CG uses it as the badge-free self-consistency guard in D3/D7.

### D3 — Lifecycle: when the note stops being true

| Transition | Producer behaviour (proposed) | Mechanism it rides | Consumer behaviour |
|---|---|---|---|
| `state set question --note "…"` | `stateNote = { text, state:"question", at:now }` | `denormDescriptor` call at `core/cli.ts:3897-3901` gains one field | Pinned in NEEDS-YOU |
| `state set <word>` **without** `--note` | `stateNote` **dropped** | same call, field omitted | Note disappears — a note never survives the state word it was written for |
| `state set blocked --note "…"` | `stateNote = { …, state:"blocked" }` | same | Renders **in place on the row**, never in the strip (D7) |
| `pij state clear` | `stateNote` cleared | `core/cli.ts:3996-4002` already passes `semanticState: undefined`; the exact-write destructure at `:2789` must gain `stateNote` — **HAZARD-1** | Strip empties |
| `pij task set` (assignment swap) | `stateNote` cleared | same destructure at `:2789`, already reached from `:3800-3804` | Strip empties |
| Assignment *closed* | **unspecified today** — closing does not appear to re-run `denormDescriptor` | — | Covered by CG's supersede guard (below) — **OPEN-1** |

> **AMENDMENT A-1 (ratified 2026-07-29, albatross/s074 — blocking, pij-internal):** `stateNote` requires a `DESCRIPTOR_FIELD_OWNER` row (`"cli"`) in `core/registry-write.ts` — the WS-002 write-law this workshop cited but did not apply to its own field. pij lands it in the same prerequisite change as WS-001's four status-denorm rows. No CG-consumed field changes.

**HAZARD-1 — the one-line omission that pins a wrong question forever.** `denormDescriptor` clears stale state with an explicit destructure of a *single named field*: `const { semanticState: _stale, ...rest } = latest;` (`core/cli.ts:2789`). A new `stateNote` that is not added to that destructure survives `state clear` and survives an assignment swap. The symptom is the worst one this feature has: an answered question pinned at the top of the rail indefinitely. **The ask names this line explicitly.**

**CG's defence-in-depth (assume HAZARD-1 will be missed once).** The rail renders the note only when it is self-consistent with the seat's declared state:

```
render note  ⟺  stateNote !== undefined && row.semanticState === stateNote.state
otherwise    →  data-reason="note-superseded"   (render nothing, count nothing)
```

This is a *badge-free* guard, deliberately — see HAZARD-2 in D8.

**What a stale unanswered question looks like.** Ruling: **chainglass never expires a question.** A question does not stop needing a human because it is old; an aging strip entry that silently vanished would be the exact failure this feature exists to prevent. Instead:

- `now − stateNote.at > QUESTION_AGED_MS` (named constant, default **30m**, same file as JC-1's staleness constant, separate value) → the strip entry keeps its place and gains `data-aged="true"` plus an emphasised age ("asked 3h ago").
- It leaves the strip only when the record says so: `state clear`, a new `state set`, an assignment swap, or the supersede guard firing.
- The aged state is a *render* variant, never a filter. Aged questions are still counted in `NEEDS YOU (n)`.

### D4 — Length limit and truncation

| # | Option | Verdict | Reasoning |
|---|---|---|---|
| D4-a | **Producer hard-caps at 200 chars; over-length → `E-ARG` naming the limit. Newlines rejected.** | **SELECTED** | pij is fail-loud by construction for exactly this class (`--refs takes a comma-separated list`, `core/cli.ts:1338`). Silent truncation is worse than a rejected write: the half-question that survives ("Should I raise MAX_CHANNELS from 20 to") reads like a complete, different question. The retry cost is one line — and per the one-call rule, the seat re-issues the *same single* command. 200 chars is ~3× the mock's live samples (50–70 chars, `scratch/pij-rail-mock.html:255,272`) and still fits a `title=` tooltip comfortably. |
| D4-b | Producer truncates silently | REJECTED | Fabricates a plausible-but-different question. Directly against verbatim-consumption doctrine. |
| D4-c | Producer truncates + sets `truncated: true` | REJECTED | A fourth field and a fourth render state to buy back what a one-line error already gives. |
| D4-d | Consumer truncates in JS | REJECTED | CG truncates in **CSS only** — `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`, full text in `title=` (both already in the approved mock: `:92` and `:292`). Nothing in the render path may produce a string pij did not write. |

### D5 — How chainglass reads it

| Item | Decision |
|---|---|
| Verb | `pij list --json --badge` — **already the poller's slow-loop read** (`pij-records.ts:132`); `list` is in `PIJ_READ_VERBS` (`pij-records.ts:31`) |
| New reads | **None.** No `node show`, no `spine events`, no per-seat spawn, no third loop |
| Cadence | The existing 8s slow loop. A declared question is a human-latency event; 8s is inside the noise |
| Consumed-field subset (registered like flow-json) | `id`, `badge`, `semanticState`, `stateNote.text`, `stateNote.state`, `stateNote.at` |
| Explicitly **not** consumed | `assignments[]`, spine events, `node show`, the daemon log, the inbox `notify` text |
| Tracked gaps | (1) daemon-detected source unobservable — D6/D0; (2) assignment-close clearing unspecified — OPEN-1 |
| Fence note | `PIJ_FORBIDDEN_TOKENS` contains `'set'` (`pij-records.ts:36-53`) — CG can never *write* a note even by accident. Correct and unchanged |

### D6 — The daemon-detected path, contracted as it actually is

Three honest tiers. **Only D0 is real today.**

| Tier | Producer state | Where the tag lives | CG render | `data-reason` |
|---|---|---|---|---|
| **D0 — today** | Tag exists only inside one tick; one `notify` to `spawnedBy`; in-memory `flaggedHuman`; a log line | **nowhere readable** | **Nothing.** Contributes zero strip rows. The strip's empty state says "no declared questions" and never "nobody needs you" | `daemon-detected-not-observable` |
| **D1 — minimum ask** (small) | Daemon persists the tag on the descriptor: `interstitial?: { label: "folder-trust"\|"login"\|"update-prompt"\|"interstitial"; at: string; paneId: string }`, cleared when readiness leaves interstitial | descriptor → `list` row projection | Kind-only chip, **boot-prompt wording** (below), tag as `title=` | `daemon-detected-tag-only` |
| **D2 — explicit stretch, never assumed** | Daemon persists a redacted pane excerpt alongside the tag | same descriptor field, extra key | Text rendered with a "detected, unverified" provenance chip — never styled identically to a declared note | `daemon-detected-text` |

**Where the tag would be persisted, if D1 is taken: the descriptor, not the spine.** The tag is daemon-owned mechanical telemetry — the same class as `systemState`, which is explicitly daemon-computed and explicitly *not* externally owned (`core/types.ts:322-324`). The daemon already owns descriptor writes through `persistDaemonWrite`. A spine event is the wrong shape: the spine is append-only and the daemon ticks continuously, so a re-latching interstitial would pump an irreversible log; pij's own probe-safety guard exists because two stray appends in one day were judged a problem (`core/cli.ts:1419-1428`).

**Tag vocabulary (closed, three entries + fallback):** `folder-trust`, `login`, `update-prompt` (`core/interstitial.ts:42-50`), plus the literal `"interstitial"` the daemon substitutes when a verdict carries no label (`core/daemon/loop.ts:270,272`). CG treats the vocabulary as closed and renders an unknown tag as the generic wedged case rather than as text.

**Copy flag (needs Jordan/albatross sign-off, not applied unilaterally):** AC-03's kind-only fallback string is `"asked a question — open the pane"`. All three tags are boot prompts, and detection only runs while `lifecycle === "pending"` — none of them is a question the agent asked. Proposed: **`"stuck on a startup prompt (<tag>) — open the pane"`**. This is a wording conflict with the plan text, surfaced deliberately.

### D7 — How the NEEDS-YOU strip picks its text

One pure function, one row per case, one test-id per row.

| # | Source | Condition | Strip? | Rendered line | `data-reason` |
|---|---|---|---|---|---|
| 1 | Declared | `semanticState === "question"` ∧ `stateNote.state === "question"` | **yes** | `stateNote.text` verbatim, CSS-ellipsised, full text in `title` | `declared-note` |
| 2 | Declared | `semanticState === "question"` ∧ no `stateNote` | **yes** | `"asked a question — open the pane"` | `declared-no-note` |
| 3 | Declared | `stateNote.state === "blocked"` | **no** | note renders **on the worker row** (loud/red per AC-03), not in the strip | `blocked-note-inline` |
| 4 | Declared | `stateNote` present ∧ `semanticState !== stateNote.state` | **no** | nothing; not counted | `note-superseded` |
| 5 | Daemon-detected | any (D0) | **no** | nothing | `daemon-detected-not-observable` |
| 6 | Daemon-detected | D1 shipped, `interstitial` present | **yes**, visually distinct | boot-prompt wording + tag chip | `daemon-detected-tag-only` |
| 7 | — | no rows from any source | **strip hidden** | empty state names the window: *"no declared questions"* — never "nobody needs you" | `strip-empty-declared-only` |

**Ruling: `blocked` never enters the strip.** The strip answers "who needs *me*". `blocked` is defined as waiting on another seat or process and resolves without the human (V2-AC-05). The `--note` still applies to `blocked` (plan §B7) — it is a *reason*, rendered in place, so the rail can say why without a pane-click. Two different jobs for one field, kept apart by `stateNote.state`.

### D8 — Interplay with the badge

**Verified:** `BADGE_SEVERITY` (`core/state.ts:125-140`) orders `blocked` (`:129`) above `question` (`:130`) above `waiting` (`:134`). **`question` outranks `waiting` — confirmed.** The badge is worst-first across *every open assignment* plus the mechanical axis, and is consumed verbatim (AC-03).

**HAZARD-2 — why the strip must not be gated on the badge.** A seat with two open assignments — one `blocked`, one `question` — badges `blocked`. A strip driven off `badge === "question"` would silently drop a real, unanswered human question. Meanwhile `stateNote`/`semanticState` are denorms of the **current** assignment only, so they can legitimately disagree with the badge.

**Ruling — two fields, two jobs, neither derived from the other:**

- The row's **state word and dot** come from `badge`, verbatim, always.
- The strip's **pin decision** comes from `stateNote.state` (guarded by `semanticState`), never from `badge`.
- CG never recomputes the badge from the note, and never suppresses a note because the badge disagrees. A seat may correctly render a `blocked` badge *and* a pinned question.

### D9 — CLI surface (one-call discipline)

```
pij state set <node> <state> [--assignment <id>] [--refs a,b,…] [--note "<one line>"] [--actor <label>] [--json]
```

> **AMENDMENT (Jordan in-pane ruling, 2026-07-29 — spelling only, records unchanged):** the surface above is superseded by the `pij report` family: `pij report question "<what I need from you>"` · `pij report blocked "<what I am waiting on>"` — the note text is a **positional**, not a `--note` flag, and the state writes move under `report` (first-person self-claims). This *structurally enforces* OPEN-4's "no note on hold": there is no `report hold <text>` form to type. `stateNote{text,state,at}`, the spine kinds, and every CG-consumed field keep their ratified shapes. Additionally documented (not a contract change): **inline markdown is permitted in the text fields** — it survives D-6-style whitespace collapsing untouched. CG's verbatim-into-clamp render shows it as literal characters, which is **deliberately kept as the safety posture**: the text is authored by any agent on the machine, so markdown-to-HTML rendering is an injection surface and is not to be added without a sanitisation design (block markdown is deferred pij-side with that requirement attached).

```
(superseded flag-spelling, kept for the line-pinned ask table below)
```

Producer-side asks, each pinned to a line:

| # | Change | Location |
|---|---|---|
| 1 | Add `"note"` to the `state set` flag allowlist | `core/cli.ts:699` — currently `new Set(["assignment","refs","actor","json"])` |
| 2 | Valued flag (must **not** join `BOOLEAN_FLAGS`, same as `--refs`) + `if (flags.note === true) return err("E-ARG", …)` | `core/cli.ts:1330-1355` |
| 3 | Accept `--note` **only** with `blocked` or `question`; otherwise `E-ARG` naming both words | `core/cli.ts:1336-1339` (beside the `isSemanticState` guard) |
| 4 | Enforce ≤200 chars and no newline; `E-ARG` naming the limit | same |
| 5 | Stamp the denorm: `stateNote: { text, state: cmd.state, at: isoNow }` | `core/cli.ts:3897-3901` |
| 6 | **Add `stateNote` to the stale-clearing destructure** — HAZARD-1 | `core/cli.ts:2789` |
| 7 | Project `stateNote` (and `semanticState`) on `list --json` rows | `core/cli.ts:2091-2103` |
| 8 | Project `stateNote` on the `node show` card | `core/cli.ts:4139-4152` |
| 9 | *(optional, albatross's call)* author `note` onto the `Assignment` record for the free `prev`/`next` audit trail | `core/platform/types.ts:195-211` |

The note rides the **same** invocation as the state — never a second command. Confirmation stays one short line.

---

## Sequence diagrams

### Path A — declared (the only real question-text source)

```mermaid
sequenceDiagram
    autonumber
    participant Seat as pij seat (worker/PM)
    participant CLI as pij CLI (state set)
    participant Desc as node descriptor
    participant Spine as spine log
    participant Poll as CG poller (8s slow loop)
    participant Rail as PIJ rail / NEEDS-YOU

    Seat->>CLI: pij state set <id> question --note "Raise MAX_CHANNELS 20→32?"
    Note over CLI: ONE call — state + note, atomically
    CLI->>CLI: guard: semantic word ∈ {blocked,question}, ≤200 chars, single line
    CLI->>Spine: append kind:"state-set" (refs state:question; prev/next = assignment JSON)
    CLI->>Desc: denorm semanticState="question", stateNote={text,state,at}
    CLI-->>Seat: state question set on <id> (assignment a-…, spine 4211)

    Poll->>CLI: pij list --json --badge   (existing read, no new verb)
    CLI-->>Poll: rows[] incl. badge, semanticState, stateNote
    Poll->>Rail: broadcast on the existing `pij` channel
    Rail->>Rail: guard semanticState === stateNote.state
    Rail-->>Rail: pin verbatim text, age from stateNote.at

    Seat->>CLI: pij state clear <id>            (human answered)
    CLI->>Desc: denorm semanticState=undefined, stateNote cleared (HAZARD-1 line)
    Poll->>Rail: next tick — strip empties
```

### Path B — daemon-detected (as it exists today, D0)

```mermaid
sequenceDiagram
    autonumber
    participant Pane as tmux pane (booting seat)
    participant Loop as daemon driveSession
    participant Inbox as spawnedBy inbox
    participant Log as daemon log
    participant Poll as CG poller
    participant Rail as PIJ rail / NEEDS-YOU

    Note over Loop: runs ONLY for lifecycle==="pending" (daemon.ts:398)
    Pane->>Loop: capturePane → "Do you trust the files in this folder?"
    Loop->>Loop: classifyInterstitial → {action:"needs-human", label:"folder-trust"}
    Loop->>Inbox: notify(spawnedBy, "🙋 <id> needs a human: folder-trust")
    Loop->>Loop: drive.flaggedHuman = true   (IN MEMORY — dies with the process)
    Loop->>Log: "spawn <id>: needs-human (folder-trust)"
    Note over Loop,Log: pane text DISCARDED · no descriptor write · no spine event

    Poll->>Poll: pij list --json --badge
    Note over Poll: no field carries the tag — nothing to consume
    Poll->>Rail: rows without any needs-human signal
    Rail-->>Rail: contributes ZERO strip rows<br/>data-reason="daemon-detected-not-observable"

    rect rgb(240,240,240)
    Note over Loop,Rail: D1 (minimum ask) would insert:<br/>Loop→Desc: interstitial={label,at,paneId} → projected on list rows → kind-only chip
    end
```

---

## Worked examples

### W1 — declared question, pinned (the happy path)

`pij list --json --badge` row, proposed fields in **bold**:

```json
{
  "id": "pij-quiet-otter",
  "folder": "/Users/jordanknight/substrate/chainglass",
  "state": "idle",
  "activity": "done",
  "liveness": "active",
  "lastEventAt": "2026-07-29T11:02:41.118Z",
  "badge": "question",
  "currentAssignment": "a-8f31c2",
  "currentTask": "Raise the mux channel ceiling for the soak run",
  "planId": null,
  "unadopted": false,
  "semanticState": "question",
  "stateNote": {
    "text": "OK to raise MAX_CHANNELS from 20 to 32 for the soak?",
    "state": "question",
    "at": "2026-07-29T11:02:40.900Z"
  }
}
```

Rail render — `data-reason="declared-note"`:

```
NEEDS YOU (1)
quiet-otter   OK to raise MAX_CHANNELS from 20 to 32 for the soak?      12m
```

### W2 — declared blocked with a reason (note, no pin)

```json
{
  "id": "pij-pale-crane",
  "badge": "blocked",
  "semanticState": "blocked",
  "currentTask": "Land the poller drain test",
  "stateNote": {
    "text": "waiting on otter's mux ceiling change to land on main",
    "state": "blocked",
    "at": "2026-07-29T10:31:07.402Z"
  }
}
```

Rail render — `data-reason="blocked-note-inline"`; **absent from the strip**:

```
● blocked   pale-crane   Land the poller drain test        ⑂ wt-poller   41m
            waiting on otter's mux ceiling change to land on main
```

### W3 — question declared, no note (kind-only fallback)

```json
{ "id": "pij-brisk-heron", "badge": "question", "semanticState": "question" }
```

`data-reason="declared-no-note"`:

```
NEEDS YOU (1)
brisk-heron   asked a question — open the pane                            4m
```

### W4 — superseded note (HAZARD-1 fired; CG catches it)

```json
{
  "id": "pij-quiet-otter",
  "badge": "working",
  "semanticState": null,
  "stateNote": { "text": "OK to raise MAX_CHANNELS from 20 to 32 for the soak?",
                 "state": "question", "at": "2026-07-29T11:02:40.900Z" }
}
```

`semanticState (null) !== stateNote.state ("question")` → `data-reason="note-superseded"`. Nothing rendered, nothing counted. The stale question does **not** pin.

### W5 — badge/note disagreement (HAZARD-2; both render)

A seat holding two open assignments — `blocked` on one, `question` on the current one:

```json
{
  "id": "pij-still-vireo",
  "badge": "blocked",
  "semanticState": "question",
  "stateNote": { "text": "Which branch should the fix land on — main or 090?",
                 "state": "question", "at": "2026-07-29T09:55:12.000Z" }
}
```

Row word = `blocked` (badge, verbatim). Strip = pinned, because `semanticState === stateNote.state === "question"`. Both true at once; neither derived from the other.

### W6 — the daemon-detected empty case (D0, today)

Three seats wedged on `folder-trust` prompts. Every `pij list` row is byte-identical to a healthy booting seat. The strip renders:

```
NEEDS YOU
no declared questions
```

with `data-reason="strip-empty-declared-only"`. **Never** "nobody needs you" — the instrument cannot see the boot-prompt population at all, and the copy says only what it measured.

### W7 — the optional audit trail (D1-d), if albatross authors the record field

The existing `state-set` spine event carries it for free, because `canonicalRecordLevel` preserves additive own fields:

```json
{
  "schema_version": 1, "seq": 4211, "kind": "state-set",
  "peer": "pij-quiet-otter", "project": "chainglass",
  "refs": ["node:pij-quiet-otter","assignment:a-8f31c2","project:chainglass","state:question"],
  "prev": "{\"schema_version\":1,\"id\":\"a-8f31c2\",…,\"note\":\"OK to raise MAX_CHANNELS…\"}",
  "next": "{\"schema_version\":1,\"id\":\"a-8f31c2\",…,\"note\":\"OK to raise MAX_CHANNELS…\"}"
}
```

CG consumes none of this. It exists so the question is answerable after the fact.

### W8 — the D1 descriptor shape, if the stretch tier is taken

```json
{
  "id": "pij-lone-swift",
  "badge": "starting",
  "interstitial": { "label": "folder-trust", "at": "2026-07-29T11:14:02.771Z", "paneId": "%37" }
}
```

Render — `data-reason="daemon-detected-tag-only"`, visually distinct from a declared note:

```
NEEDS YOU (1)
lone-swift   stuck on a startup prompt (folder-trust) — open the pane     8s
```

---

## Fake-seam shape (CG builds against this today, plan T005)

The fake generator emits contract-exact rows for all seven D7 cases, and — importantly — the D0 case is generated by emitting **no signal at all**, not by emitting an empty string. A fake that produces `interstitial: {}` would train the render on a shape pij does not produce (the `folder`-vs-`cwd` class of trap, H-04). Seam swap: replace the generator with the real `list` row parser; consumers unchanged.

---

## Evidence Ledger

Every row verified read-only in `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/` and `/Users/jordanknight/substrate/chainglass/` on 2026-07-29. No writes, no git commands.

| # | Claim (existing behaviour) | Evidence `path:line` |
|---|---|---|
| E-01 | The daemon's needs-human "label" is a fixed three-entry pattern tag — `folder-trust`, `login`, `update-prompt` — not question text | `core/interstitial.ts:42-50`; returned at `:81` |
| E-02 | The real pane text is discarded: one `notify` to `spawnedBy`, an in-memory `flaggedHuman` latch, then the verdict is returned and dropped | `core/daemon/loop.ts:262-272`; latch declared `:104` |
| E-03 | The needs-human outcome reaches only the daemon's own log line — no descriptor write, no spine append | `daemon.ts:421-431` |
| E-04 | Interstitial detection runs **only** for `lifecycle === "pending"` seats — boot-window-only, never mid-task | `daemon.ts:398`; `core/daemon/index-state.ts:99-101` |
| E-05 | `classifyInterstitial` has exactly two call sites, both on the pending-seat drive path | `core/daemon/loop.ts:234`; `core/readiness.ts:75` |
| E-06 | No needs-human/pane-observation field exists anywhere in the pij source | repo-wide grep for `paneObservation\|needsHuman\|needs_human` → 0 non-test hits |
| E-07 | `SEMANTIC_STATES` includes `question` (and `blocked`); the vocabulary is closed and byte-ruled | `core/types.ts:99-108` (`blocked` `:100`, `question` `:101`) |
| E-08 | `state set` accepts only `assignment`, `refs`, `actor`, `json` — **no prose note today** | `core/cli.ts:699`; usage string `:1331`; `--refs` guard `:1338` |
| E-09 | `--refs` is comma-split into tokens — unusable for prose | `core/cli.ts:1341-1347` (and `:1404-1411` for `spine append`) |
| E-10 | `state set` denorms `semanticState` onto the descriptor; `state clear` and `task set` denorm it away | `core/cli.ts:3900` (set), `:4000` (clear), `:3803` (task set) |
| E-11 | The stale-clearing mechanism is a destructure of one **named** field — a new sibling field would survive unless added here (HAZARD-1) | `core/cli.ts:2789` |
| E-12 | `pij list --json` projects `currentAssignment`/`currentTask`/`planId` as pure field reads and **does not project `semanticState`**; the comment justifies exactly this class of additive projection (179 rows ≈ 80s via `node show`) | `core/cli.ts:2087-2103` |
| E-13 | `pij node show --json` projects `semanticState` and `badge` | `core/cli.ts:4146`, `:4149` |
| E-14 | `BADGE_SEVERITY` orders `blocked` > `question` > `waiting` — **question outranks waiting, confirmed** | `core/state.ts:125` (array), `:129`, `:130`, `:134` |
| E-15 | Additive own fields on the `Assignment` record survive canonicalisation into spine `prev`/`next` by design | `core/platform/assignment.ts:106-114`, `:132-149`; `core/platform/project.ts:92-105` |
| E-16 | The `Assignment` record has no note field today; `states[]` are spine seq refs | `core/platform/types.ts:195-211` |
| E-17 | CG already runs `pij list --json --badge` on the poller's slow loop — the note costs zero new reads | `apps/web/src/features/089-first-class-pij/server/pij-records.ts:132` |
| E-18 | CG's read fence allowlists `list` and forbids any argv containing `set` — CG can never write a note | `…/server/pij-records.ts:31`, `:37-53`, `:81-95` |
| E-19 | `PijListRow` carries no `semanticState`; `PijNodeDetail` does — the pre-existing consumer gap the companion ask closes | `…/server/pij-records.interface.ts:28-54` vs `:102` |
| E-20 | The approved mock renders the question as a single CSS-ellipsised line with the full text in `title=`, and shows a `NEEDS YOU (n)` count | `scratch/pij-rail-mock.html:92`, `:292`, `:325`, `:339-342` |
| E-21 | Mock sample question lengths are 50–70 chars — the 200-char cap is ~3× headroom | `scratch/pij-rail-mock.html:255`, `:272` |

---

## Open Questions

| # | Status | Question | Resolution / next evidence |
|---|---|---|---|
| Q-1 | **RESOLVED** | Carrier for the declared note? | Descriptor denorm `stateNote`, projected on `list` rows + `node show` (D1-a). Spine `prev`/`next` is a free audit trail, consumed by nobody. |
| Q-2 | **RESOLVED** | Field shape? | `{ text, state, at }` — plus the companion ask to project `semanticState` on list rows (D2). |
| Q-3 | **RESOLVED** | Length limit and who truncates? | Producer rejects >200 chars or any newline with `E-ARG`; consumer truncates in CSS only, full text in `title` (D4). |
| Q-4 | **RESOLVED** | Which read projects it, and what does CG consume? | `pij list --json --badge`; subset `id, badge, semanticState, stateNote.{text,state,at}` (D5). |
| Q-5 | **RESOLVED** | Does `blocked` enter the NEEDS-YOU strip? | No. Note renders inline on the row; the strip is human-waiting only (D7 row 3). |
| Q-6 | **RESOLVED** | Is the strip gated on `badge`? | No — HAZARD-2. Badge drives the row word; `stateNote.state` (guarded by `semanticState`) drives the pin (D8). |
| Q-7 | **RESOLVED** | Does `question` outrank `waiting` in the badge? | Yes — verified `core/state.ts:130` vs `:134`. |
| Q-8 | **RESOLVED** | What does the daemon-detected path contract to today? | Nothing readable (D0). Zero strip rows, `data-reason="daemon-detected-not-observable"`. D1 (persist the tag on the descriptor) is the minimum ask; D2 (pane excerpt) is the explicit stretch. |
| Q-9 | **OPEN-1 → RESOLVED at ratification** | Does closing an assignment clear `stateNote`? | **The transition does not exist**: `closeAssignment` has no caller (albatross verified caller-free). The supersede guard is never exercised by this path — it stays as defence-in-depth only. |
| Q-10 | **OPEN-2** | AC-03's fallback copy `"asked a question — open the pane"` is wrong for all three boot-prompt tags. Adopt `"stuck on a startup prompt (<tag>) — open the pane"`? | Jordan's call. Affects D6/D7 row 6 and W8 only; the declared path's no-note fallback (D7 row 2) keeps its wording, which is correct there. |
| Q-11 | **OPEN-3** | `QUESTION_AGED_MS` default 30m — same value as JC-1's status staleness, or its own? | Shipped as a separate named constant beside JC-1's, both retunable. Jordan may collapse them. |
| Q-12 | **OPEN-4 → RESOLVED at ratification** | Should `--note` be permitted on `hold`? | **No — blocked+question only**, as proposed. |
