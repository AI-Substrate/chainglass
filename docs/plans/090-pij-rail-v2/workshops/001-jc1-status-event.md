# Workshop: JC-1 — the PM now/next status event contract

**Type**: API Contract (cross-repo: chainglass = consumer, pij = producer)
**Plan**: 090-pij-rail-v2
**Spec**: `pij-rail-v2-plan.md` (§ Joint Contracts · JC-1; AC-09/AC-10)
**Created**: 2026-07-29
**Status**: Draft — proposed to pij-wee-albatross for ratify/amend
**Value Thesis**: A PM's *now/next* is the only unit of situational awareness the rail actually renders. Ruling its exact shape once — write verb, envelope fields, truncation, atomicity, staleness clock, absence — is what lets chainglass build against fakes today and flip one module when pij ships, instead of re-running the 089 `folder`-vs-`cwd` trap across a repo boundary where a mismatch costs two plans.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Evidence-Grounded Draft — every claim about existing pij behaviour carries a verified `path:line` (Evidence Ledger); nothing here has been executed against a real `pij status`, because that verb does not exist yet (`core/cli.ts:666-705` has no `status` key).
**Selected Value Axes**:
1. **Contract precision** — a field-level schema pij can implement without a follow-up question.
2. **Absence honesty** — every "no status" is a named, testable state; never an error, never a blank.
3. **Token economy on the write side** — one call, one line out, zero syntax recall (V2-AC-10/13).
4. **Cold-start correctness** — a browser tab opened at any moment shows the same status the log says.
5. **Forward compatibility** — additive fields land without a CG release; a semantic change is forced to mint a new `kind`.

---

## Purpose

Turn the one-paragraph JC-1 sketch in `pij-rail-v2-plan.md:48-52` into a contract with no remaining guesses: the exact spine line pij writes, the exact subset chainglass reads, how `--state` composes atomically, what happens on truncation / no project / no status / a stale clock, and what "add a field later" means on both sides.

## Fresh Entrant Outcome

Someone who has never seen either repo can, after this document:

- write `pij status` in the pij repo (they know the flags, the lock, the ordering, the failure strings, the denorm, the exit codes);
- write the chainglass consumer (they know which fields to read, which to ignore, where the emission happens, and what each absence renders);
- tell whether a given spine line is a valid JC-1 event by inspection.

## Key Questions Addressed

1. What exactly is on the wire? (worked JSON, both legs)
2. How long may `prev`/`next` be, and who truncates — writer, reader, or CSS?
3. Does the latest status also denorm onto the node descriptor, and does chainglass read that or the spine?
4. `--state <word>`: one spine event or two? In what order? What survives a partial failure?
5. Where does the project attribution come from when the seat has no project?
6. Is "stale" measured from the event's `ts` or from chainglass's receipt?
7. Which fields are *registered* as consumed, and what are the exact absence states?
8. What happens when pij adds a field in six months?

---

## Decision Space

| # | Decision | Options | Verdict | Rationale (evidence) |
|---|---|---|---|---|
| **D-1** | Event carrier | (a) new spine `kind:"status"` on the existing envelope · (b) new record type · (c) node-descriptor field only | **(a) Selected** | Envelope already carries `prev`/`next` (`core/platform/types.ts:24-25`) and `kind` is an OPEN vocabulary for external writers (`core/platform/types.ts:5-7`). `"status"` is unclaimed: **0 of 22,622** lines in the live log, and absent from the `SPINE_KIND_*` list (`core/platform/types.ts:217-243`). (b) **Rejected** — new record type, new read path, new fence entry, for zero new capability. (c) **Rejected** — a descriptor field has no history and no `seq`; the rail's freshness axis and the watchdog's clock both want an append-only event. |
| **D-2** | Field mapping | `prev`=what I just did, `next`=what's next · or a JSON blob in `next` | **`prev`/`next` as plain prose — Selected** | The `task-set`/`state-set` kinds already put *canonical JSON* into `prev`/`next` (`core/platform/types.ts:223-226`), so a JSON blob is precedented — and precisely why it must not be reused here. `applyEvent` in the CG poller (`pij-poller.service.ts:330-333`) guards exactly this class of error: "applying `next` there would write a task sentence into the state field". Plain prose keyed by `kind` is unambiguous to both readers. |
| **D-3** | Extra top-level fields (`statusText`, `role`, `age`…) | add them · use only existing envelope fields | **Existing fields only — Selected** | Standing ruling (plan `:49`). Additive fields are *tolerated* by the guards, but every one added now is a field the 089 fake seam must invent and the reader must defend. Nothing in the rail needs one. |
| **D-4** | `prev`/`next` length limit | (a) unlimited · (b) writer truncates silently · (c) writer **refuses** over limit · (d) reader truncates | **(c) 280 chars each, hard E-ARG — Selected**; reader clamps *visually* only | Measured: the live log's longest line is **453 chars**, mean **223** (22,622 lines / 5.08 MB). 2×280 + ~180 envelope ≈ 740 chars/line — 1.6× today's max, immaterial against a 5 MB log. (b) **Rejected**: the log is append-only and irreversible (`core/cli.ts:3700-3703` probe-safety comment exists for exactly this reason); a silent truncation destroys the record *and* never tells the PM. (c) costs one retry turn and teaches the limit. (d) **Rejected as a data rule** — the rail *does* clamp with CSS/line-clamp (T010), but the stored value is always whole. |
| **D-5** | Empty `prev` (a PM's very first status) | omit `prev` · allow `""` · require both | **Require both, non-empty after trim — Selected** | `""` is forbidden by the platform's own rule: absent optionals are `undefined`, and JSON `null`/empty is never "absent" (`core/platform/types.ts:5-7`). Omitting `prev` would mint a **fifth** absence state for the rail to render for no user value. A first status honestly says what it did ("adopted the seat and read the plan"). |
| **D-6** | Control characters in `prev`/`next` | pass through · collapse · reject | **Collapse `\r\n\t` and runs of whitespace to a single space, before the length check — Selected** | The line is NDJSON; `JSON.stringify` escapes newlines so it will not tear, but the rail renders two single-line clamps and a `\n` would render as a space anyway. Collapsing first means the 280 limit is measured on what is actually stored. |
| **D-7** | Node-descriptor denorm | none · denorm and CG reads it · denorm and CG **does not** read it | **Denorm, CG does not consume it (v1) — Selected** | The `currentTask` precedent is explicit about why denorm exists: without it "a UI otherwise pays N × `node show`… (measured: 179 rows ≈ 80s)" (`core/cli.ts:2086-2092`). pij's own PM-only watchdog nudge (V2-AC-13) needs the last status `ts` per seat and must not scan 5 MB of spine per tick — that is the denorm's real consumer. Chainglass's ruled path is the fast-loop spine drain (validation finding 2), which needs no read at all, so consuming the denorm too would give the rail **two truths** to reconcile — and `denormDescriptor` carries a documented race residual (`core/cli.ts:2765-2774`). Registered as **known-but-unconsumed** (a tracked gap, flow-json precedent). See OQ-1. |
| **D-8** | `--state <word>` composition | one merged event · **two events, one lock** · two invocations | **Two events, one lock, ruled order `state-set` → `status` — Selected** | Merging is **Rejected** on a hard consumer fact: s055's watchdog consumes `state-set` **by exact kind name** (`core/platform/types.ts:224-226`), so a state change hidden inside a `status` event becomes invisible to a shipped consumer. Two invocations is **Rejected** by the one-call ruling (V2-AC-10). One lock is available and precedented: `state set` already runs its whole coupled write inside `withPlatformWriteLock` (`core/cli.ts:3823`), and `spine append` takes the same lock for an *uncoupled* append (`core/cli.ts:3679-3691`). |
| **D-9** | Ordering + failure atomicity | status-then-state · state-then-status | **`state-set` first (journaled/coupled), then `status` (uncoupled) — Selected** | The journaled leg must be the one that can fail *before* an irreversible unjournaled append. And a reader that sees a `status` describing a transition should already be able to see the transition. Failure ladder in § Failure Semantics. |
| **D-10** | Correlating the two events | assume adjacent `seq` · structured ref | **Structured ref `state-set:<seq>` on the status event — Selected** | Adjacency holds today (both legs run under one exclusive lock) but is not a contract, and nothing in the envelope promises it. A `type:value` ref is the established idiom — the live log already carries `decision-event:23091` (sampled 2026-07-29). |
| **D-11** | Duplicating `state:<word>` on the status event's refs | yes · no | **No — Selected** | One fact, one carrier. `state-set` already refs `state:<word>` (`core/cli.ts:3841-3848`); duplicating it double-counts for anyone tallying state transitions off the spine. |
| **D-12** | Project attribution | required flag · inferred · both | **Inferred, with an optional `--project` override; omitted when unknowable — Selected** | Ladder in § Project Attribution. `Assignment.projectSlug` is itself optional (`core/platform/types.ts:199`) and the implicit *general* assignment is materialised with **no** `projectSlug` at all (`core/platform/assignment.ts:59-74`), so "no project" is the common, designed case — not a failure. |
| **D-13** | May `pij status` materialise a general assignment? | yes (like `state set`) · no | **No — the status leg is read-only w.r.t. assignments — Selected** | `materializeGeneralIfMissing` is a *write* triggered by a state declaration (`core/cli.ts:3831`). Recording "what I did" must not create an assignment record as a side effect. When `--state` is passed, the **state-set leg** materialises exactly as it does today; the status leg never does. |
| **D-14** | Staleness clock | event `ts` (producer) · CG receipt · both | **Event `ts` — Selected**; receipt used only to clamp negative ages | V2-AC-13 already rules the watchdog clock is "the last `status` event's `ts`". Two clocks would let the rail and the nudge disagree about the same seat. Same-host today: the CG server reads `~/.pij` on the machine that writes it (`start-pij-poller.ts:36,52`), so there is no skew to defend. Cross-host is a recorded gap (OQ-3). |
| **D-15** | Staleness threshold | 20m · 30m · 45m | **30m, one named constant `STATUS_STALE_MS` — Selected** | Not a round number: pij's default watchdog interval is **20 minutes** (`core/watchdog.ts:6`), so a 30m rail threshold guarantees the PM-only nudge has fired **at least once** before the rail publicly calls the status stale. The rail never scolds before the system has asked. Jordan may retune (plan Open Question 1). |
| **D-16** | Where CG learns of a status | new per-PM `spine events --peer` read · **existing fast-loop drain** | **Fast-loop drain — Selected (ruled: validation finding 2 / AC-09)** | The drain already reads every new spine line (`pij-poller.service.ts:196-227`) at <0.01s per tick. A per-PM CLI read costs ~0.45s **per PM per interval** (`pij-records.ts:57`). No new loop, no new channel (F-08), no new fence entry — `spine` is already allowlisted (`pij-records.ts:31`) but is not even needed on this path. |
| **D-17** | Cold start / backfill for a tab opened mid-session | snapshot route calls the CLI · poller holds a map · nothing | **Poller holds `statuses` map; served on the existing `/api/pij/fleet` payload — Selected** | The cursor is constructed with **no `since`**, and defaults to `0` (`spine-cursor.ts:188`; `start-pij-poller.ts:52`) — so the **first fast tick replays the entire log** and the newest status per PM falls out for free, no CLI call. The map exists so a tab connecting at T+5min is not blind until the next write. Additive field on `FleetSnapshotData` (`types.ts:185-190`) — no new route. |
| **D-18** | Versioning | bump `schema_version` on new fields · additive-only + new `kind` for breaks | **Additive-only; a semantic change mints a new `kind` — Selected** | `schema_version` stays `1`; the platform contract already states unknown extra fields are tolerated and migration-safe (`core/platform/types.ts:4-6`), and the CG reader's index signature preserves them (`spine-cursor.interface.ts:20-22`). Re-interpreting `prev`/`next` for `kind:"status"` would retroactively rewrite 22k lines of append-only history — so that path is closed by construction. |
| **D-19** | Verb name collision | `pij status` · `pij pm status` · `pij now` | **`pij status` — Selected**, with a caveat | Free at the top level: `ALLOWED_FLAGS` (`core/cli.ts:666-705`) has no `status` key. **Caveat flagged:** `status` already exists as a *sub*-action of watchdog (`pij watchdog status`, `core/cli.ts:211-221`). Two different "status" nouns in one CLI is a mild ergonomic hazard; albatross may prefer `pij now`. Recorded as OQ-4, not blocking. |

---

## The Event — normative schema

One spine line. Field order matches `buildSpineEvent` (`core/platform/spine.ts:36-54`) with `seq` stamped by the log at append.

| Field | Type | Required | Semantics for `kind:"status"` |
|---|---|---|---|
| `schema_version` | `1` | yes | Fixed. Never bumped for additive fields (D-18). |
| `seq` | number | yes | Stamped by the log, cross-process atomic. **The tie-break key**: newest status per peer = highest `seq`, never highest `ts`. |
| `ts` | ISO-8601 string | yes | Producer clock at append. **The staleness clock** (D-14). |
| `actor` | string | yes | The writing seat. Ignored by CG (`peer` is the key). |
| `kind` | `"status"` | yes | The discriminator. CG matches this **exactly**; unknown kinds are never dropped from the log, just not routed here. |
| `refs` | string[] | yes | `["node:<seat>"]`, plus `"assignment:<id>"` when one is current, plus `"project:<slug>"` when attributed, plus `"state-set:<seq>"` when `--state` was given (D-10). **Never** `state:<word>` (D-11). |
| `peer` | string | yes | **The seat this status is about = the caller.** CG's join key (`peerOf`, `pij-poller.service.ts:316-320`, exact match — never prefix). |
| `project` | string | no | Project slug, when attributable (D-12). **Omitted**, never `""`/`null`. |
| `prev` | string | yes | **What I just did.** ≤280 chars, whitespace-collapsed, non-empty. |
| `next` | string | yes | **What's next.** ≤280 chars, whitespace-collapsed, non-empty. |
| `actorProvenance` | `"resolved"` | yes | Must be `"resolved"`. An `"asserted"` self is refused (D-20 below). |
| `repo` | string | no | Not set by this verb. Tolerated if a future pij sets it. |

**Self-resolution rule (D-20).** `pij status` takes **no `<node>` positional** — the peer is the calling seat. If the seat can only be *asserted* rather than *resolved* (`ACTOR_PROVENANCES`, `core/platform/types.ts:14`), the command **refuses with `E-NOID`**. A status attributed to a guessed seat is worse than no status: the rail would render one PM's now/next under another PM's name, and there is no way to detect it after the fact.

### Worked example — bare status

```json
{"schema_version":1,"seq":23104,"ts":"2026-07-29T04:12:07.881Z","actor":"pij-cheap-cheetah","kind":"status","refs":["node:pij-cheap-cheetah","assignment:pij-cheap-cheetah/general","project:chainglass"],"peer":"pij-cheap-cheetah","project":"chainglass","prev":"Folded the ten validation findings into plan 090 and cut v1.1.0.","next":"Write the three joint-contract workshops so albatross can ratify before coding.","actorProvenance":"resolved"}
```

### Worked example — `--state question` (two lines, one lock, ruled order)

```json
{"schema_version":1,"seq":23105,"ts":"2026-07-29T05:40:02.113Z","actor":"pij-cheap-cheetah","kind":"state-set","refs":["node:pij-cheap-cheetah","assignment:pij-cheap-cheetah/general","project:chainglass","state:question"],"peer":"pij-cheap-cheetah","project":"chainglass","prev":"{…canonicalAssignmentJson…}","next":"{…canonicalAssignmentJson…}","actorProvenance":"resolved"}
{"schema_version":1,"seq":23106,"ts":"2026-07-29T05:40:02.119Z","actor":"pij-cheap-cheetah","kind":"status","refs":["node:pij-cheap-cheetah","assignment:pij-cheap-cheetah/general","project:chainglass","state-set:23105"],"peer":"pij-cheap-cheetah","project":"chainglass","prev":"Drafted JC-1 and measured the pij surfaces it depends on.","next":"Waiting on Jordan to rule the 30m staleness threshold before JC-2.","actorProvenance":"resolved"}
```

Note the `state-set` leg's `prev`/`next` carry canonical assignment JSON — that is its existing, ruled shape (`core/platform/types.ts:223-226`, built at `core/cli.ts:3849-3853`). JC-1 does not touch it.

---

## CLI Flow (write side — pij)

### Command

```
pij report now "<what I just did>" "<what's next>" [--state <word>] [--project <slug>] [--json]
```

- Positionals: exactly 2, both required (`MAX_POS["status"] = 2`).
- `ALLOWED_FLAGS["status"] = new Set(["state", "project", "actor", "json"])`.
- `--state <word>` must be a member of the closed `SEMANTIC_STATES` vocabulary (`core/types.ts:99-109`) — an unknown word is `E-ARG` naming the whole vocabulary, exactly as `state set` does today (`core/cli.ts:1336-1338`).
- No `--json` needed for the normal path (token economics, V2-AC-10); `--json` emits the stamped status event verbatim, matching `state set`'s `--json` behaviour (`core/cli.ts:3908`).

### Example output lines (stdout, exit 0)

Bare:

```
status set on pij-cheap-cheetah (spine 23104)
```

With `--state`:

```
status set on pij-cheap-cheetah, state question (assignment pij-cheap-cheetah/general, spine 23105+23106)
```

One line each — deliberately shaped after the existing `state ${state} set on ${node} (assignment ${id}, spine ${seq})` (`core/cli.ts:3910`) so the confirmations read as one family.

### Failure semantics (exact ladder)

Both legs run inside **one** `platformWriteLock.withPlatformWriteLock(...)` closure, following the `state-set` template (`core/cli.ts:3823-3910`).

| Failure point | What has landed | Exit | Message shape |
|---|---|---|---|
| Arg validation (empty/over-length text, bad state word, no `--project` value) | nothing | `E-ARG`, non-zero | names the offending arg and the limit/vocabulary |
| Self not resolvable | nothing | `E-NOID`, non-zero | `pij status writes as the calling seat, and this seat could not be resolved` |
| `state-set` leg fails (journal / assignment write / append) | nothing, or the existing WAS-set residue | non-zero, code from the leg | reuse the existing strings verbatim (`core/cli.ts:3874`) — **no status event is attempted** |
| `status` append fails after `state-set` succeeded | state IS set, no status event | non-zero | `state '<w>' WAS set on '<id>' (assignment <a>, spine <n>), but the status event failed to append (<why>)` — WAS-set framing, mirroring `core/cli.ts:3874-3878` |
| Everything lands, denorm fails | both events landed | non-zero | `status WAS recorded on '<id>' (spine <n>), but the node descriptor could not be updated (<why>)` — the record is truth; the denorm is a cache (`core/cli.ts:2765-2768`) |

**The atomicity claim, stated precisely:** JC-1 is *not* all-or-nothing across both events. It is **serialised and never reordered** (one lock), **never partially-state-set** (the coupled write's own journal guarantees that), and **always honestly reported** when the second leg fails. A caller that sees exit 0 has both events. A caller that sees non-zero must read the message — the WAS-set family names exactly what landed.

### Node denorm (D-7)

> **AMENDMENT A-1 (ratified 2026-07-29, albatross/s074 — blocking, pij-internal):** all four denorm fields below require `DESCRIPTOR_FIELD_OWNER` rows (`"cli"`) in `core/registry-write.ts` — WS-002 names omission incident-#1 class, and this workshop's original text failed to apply that law to its own fields. pij lands the ownership rows as ONE prerequisite change ahead of items 1 and 3. No CG-consumed field changes.

After both legs, via the existing `denormDescriptor` idiom (fresh re-read + `writeExact`, `core/cli.ts:2775-2803`):

| Descriptor field | Type | Meaning |
|---|---|---|
| `statusPrev` | string | latest `prev` |
| `statusNext` | string | latest `next` |
| `statusAt` | ISO-8601 | latest status event `ts` |
| `statusSeq` | number | latest status event `seq` |

Projected into `pij list --json` rows beside `currentTask` (`core/cli.ts:2093-2094`) and into the `node show` card (`core/cli.ts:4147-4149`). **Consumer for v1 = pij's own PM-only watchdog nudge**, not chainglass.

### Watchdog nudge text (V2-AC-13 — PM-only, paste-ready)

Shaped after `buildWatchdogTurn` (`core/watchdog.ts:187-195`) so it reads as the same voice:

```
[pij watchdog #7 for pij-cheap-cheetah] Your now/next is 41m old. Update it in ONE call:
pij report now "<what you just did>" "<what's next>"
Add --state <blocked|question|hold|waiting|ready|failed|cancelled|done> if you are also changing state.
```

Fires only when `orchestrationRole === "pm"` (JC-2) **and** `now − statusAt > threshold` **or** `statusAt` is absent. Prime and workers are excluded by ruling (H-01). The literal command is present so the PM spends zero tokens recalling syntax.

> **AMENDMENT A-2 (ratified 2026-07-29, albatross/s074 — blocking, pij-internal):** keying the nudge clock on `statusAt` alone hits `isFireDue`'s null-anchor branch and **never fires for a PM who has never reported** — the exact target population. Fix: a never-null floor anchor (the `archive.ts` pattern) so an absent `statusAt` counts as "stale since designation", not "never due". No CG-consumed field changes.

---

## Consumer Flow (read side — chainglass)

### Where the emission happens

`tickFast` (`pij-poller.service.ts:196-227`). Two hazards must be handled explicitly, or the contract silently produces nothing:

1. **The `!known` guard must not gate status events.** Today `tickFast` drops any event whose peer is not already in the fleet map (`pij-poller.service.ts:213`) — correct for `fleet-delta`, because a spine event cannot build a row. A **status** event needs no row: it carries its own peer, text and clock. Status collection therefore runs *outside* that guard.
2. **`MAX_BROADCASTS_PER_FAST_TICK = 1`** (`pij-poller.service.ts:51`) is asserted by the existing poller tests. Adding `status-delta` means a tick can emit two messages. **Ruling: the constant's meaning becomes "at most one broadcast *per event type* per fast tick"** — re-document it in place and have `poller.test.ts` assert ≤1 of each type. This is a real, named change to a load-bearing constant; it is called out here rather than discovered in T007.

Within a tick, statuses coalesce **last-wins by `seq`** per peer, exactly like the row coalescing above it. One `status-delta` per tick, carrying complete records (never patches — same reason `fleet-delta` carries full rows, `types.ts:146-149`).

### Channel event (new `PijChannelEvent` union member, `types.ts:151-172`)

```ts
export interface PijStatusRecord {
  peer: PijId;
  /** What the PM just did. Verbatim, whole, never re-derived. */
  prev: string;
  /** What the PM does next. Verbatim, whole. */
  next: string;
  /** Producer clock. THE staleness clock. */
  ts: string;
  /** Spine seq. The tie-break key. */
  seq: number;
  /** Present only when pij attributed one. */
  project?: string;
}

// added to PijChannelEvent:
| {
    type: 'status-delta';
    seq: number;                 // cursor seq the tick reflects
    at: string;                  // CG receipt stamp — NOT the age clock
    statuses: PijStatusRecord[]; // complete records, newest-per-peer for this tick
  }
```

Snapshot backfill: `FleetSnapshotData` (`types.ts:185-190`) gains `statuses: PijStatusRecord[]` — additive, existing `/api/pij/fleet` route, no new endpoint.

### Registered consumed-field subset (V2-AC-11, flow-json precedent)

| Field | Status | Note |
|---|---|---|
| `kind` | **consumed** | exact-match `"status"` — never an exhaustive switch (`spine-cursor.interface.ts:20-22`) |
| `peer` | **consumed** | join key, exact match |
| `prev` | **consumed** | rendered verbatim (AC-03) |
| `next` | **consumed** | rendered verbatim (AC-03) |
| `ts` | **consumed** | staleness clock |
| `seq` | **consumed** | newest-wins tie-break |
| `project` | **tolerated, unconsumed** | rail's project label comes from the fleet row; tracked gap |
| `actor`, `actorProvenance`, `refs`, `repo`, `schema_version` | **tolerated, unconsumed** | preserved through the reader, never rendered |
| `statusPrev/Next/At/Seq` (descriptor denorm) | **known, unconsumed** | tracked gap — see OQ-1 |
| *any future field* | **tolerated** | index signature preserves it; adding it to this table is a one-module change |

**Two tracked gaps** (named, per the flow-json precedent): (1) the node denorm is written but not read by CG; (2) there is no cross-host clock reconciliation.

### Absence states — four `data-reason`s, four test-ids (AC-04)

| `data-reason` | Discriminator | Renders |
|---|---|---|
| `not-a-pm` | JC-2 `orchestrationRole` present and ≠ `"pm"` | nothing — **carries no status by design**; not a gap |
| `role-unknown` | JC-2 `readSeatRole` returns absent-kind (value `null` **or** key missing — WS-002 keeps the two distinguishable on the role chip's own `data-role-reason` axis) | "role not declared" chip; status slot omitted, never guessed from tree depth |
| `no-status-yet` | role is `pm`, zero `kind:"status"` seen for this peer | "no now/next recorded yet" |
| `status-stale` | newest status age > `STATUS_STALE_MS` (30m) | **the text, still rendered verbatim**, plus a loud age chip. Stale ≠ absent — blanking a stale status destroys the only information there is |

**Not an absence state, deliberately kept separate:** `spine-unreadable` — `PollerStatus.spineMissing === true` or `lastError !== null` (`types.ts:128-131`). This is an *instrument outage*, rendered as a panel-level banner, never as a per-PM absence. Collapsing it into `no-status-yet` would report "this PM has recorded nothing" when the truth is "we cannot see". Absent-key ≠ empty-value.

### Age computation

```
ageMs = max(0, receivedOrNow − Date.parse(status.ts))
```

Clamped at 0: a future-dated `ts` (clock nudge) renders as "just now", never as a negative age. The delta's own `at` is a receipt stamp and is **never** the age basis (D-14).

---

## Fake seam (AC-10) — what CG builds today

`server/pij-status.contract.ts` exports the consumed-field types above and a fake generator producing **contract-exact** `PijStatusRecord`s — including the four absence states, the 280-char boundary, and a stale record straddling `STATUS_STALE_MS`. The fake must never emit a shape the schema above forbids (empty `prev`, `project: null`, 281 chars); the seam-swap test replaces it with a stub "real" reader and asserts zero consumer changes.

---

## Evidence Ledger

Every claim about existing behaviour, with the `path:line` verified read-only on 2026-07-29. pij paths are relative to `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/`; chainglass paths to `/Users/jordanknight/substrate/chainglass/apps/web/src/features/089-first-class-pij/`.

| # | Claim | Evidence |
|---|---|---|
| E-01 | The spine envelope already carries free-string `prev`/`next` | `core/platform/types.ts:24-25` (`AttributionEnvelope`) |
| E-02 | `SpineEvent` extends that envelope and adds `schema_version`, `seq`, `kind`, `peer?`, `project?`, `repo?` | `core/platform/types.ts:246-252` |
| E-03 | `kind` is an OPEN vocabulary for external writers; unknown extra fields tolerated; absent optionals are `undefined`, never `null` | `core/platform/types.ts:3-9` |
| E-04 | `"status"` is not among the kinds pij emits | `core/platform/types.ts:217-243` (no `SPINE_KIND_STATUS`) |
| E-05 | `"status"` is unclaimed in live data: **0 occurrences of `"kind":"status"` in 22,622 lines / 5,076,991 bytes**; 61 distinct kinds; `system-state` = 22,274 (98.5%) | `~/.pij/spine/events.ndjson`, read-only measurement 2026-07-29 |
| E-06 | Longest live spine line = **453 chars**; mean = **223 chars** | same measurement |
| E-07 | `buildSpineEvent` accepts and emits `prev`/`next` (omitting them when `undefined`) | `core/platform/spine.ts:36-54`, specifically `:49-50` |
| E-08 | The `spine append` CLI does **not** expose `prev`/`next` — its flag set is `kind, refs, peer, project, actor, bare, json` | `core/cli.ts:693` (allowlist); `core/cli.ts:3696-3704` (call site passes no `prev`/`next`) |
| E-09 | `spine events` accepts `--since/--peer/--project/--json`; `--since` is exclusive, `peer`/`project` are exact matches | `core/cli.ts:694`; `core/platform/spine.ts:56-64` |
| E-10 | `spine events --json` returns the whole filtered array in one `JSON.stringify` (no paging, no cap) | `core/cli.ts:4251-4258` |
| E-11 | `state set` is a coupled write: journal → assignment write → markCommitted → `appendOnce` → chain seq → clear → denorm, all inside `withPlatformWriteLock` | `core/cli.ts:3817-3910`; lock at `:3823`; journal `:3858`; `appendOnce` `:3870`; denorm `:3897` |
| E-12 | `spine append` also takes the platform write lock but is **uncoupled** — no journal entry of its own | `core/cli.ts:3679-3691` |
| E-13 | The WAS-set failure-framing language already exists and is the house style for partial platform writes | `core/cli.ts:3874`, `:3882`, `:3890`, `:3899` |
| E-14 | `state set`'s success line is `state <w> set on <id> (assignment <a>, spine <n>)` | `core/cli.ts:3910` |
| E-15 | `state-set` refs carry `state:<word>`; its `prev`/`next` carry canonical assignment JSON | `core/cli.ts:3841-3853`; `core/platform/types.ts:223-226` |
| E-16 | s055's watchdog consumes `system-state`/`state-set` **by exact kind name** — hiding a state change inside another kind breaks a shipped consumer | `core/platform/types.ts:224-226`, `:232-235` |
| E-17 | `SEMANTIC_STATES` is a closed, human-ruled 8-word vocabulary; an unknown word is `E-ARG` naming the whole list | `core/types.ts:99-109`; `core/cli.ts:1336-1338` |
| E-18 | The descriptor already carries the `currentAssignment`/`currentTask`/`semanticState` denorm | `core/types.ts:313,315,321` |
| E-19 | `denormDescriptor` re-reads the latest descriptor then `writeExact`s; carries a documented race residual | `core/cli.ts:2775-2803`; residual comment `:2765-2774` |
| E-20 | The denorm exists precisely to avoid N × `node show` — "measured: 179 rows ≈ 80s" | `core/cli.ts:2086-2092` |
| E-21 | `pij list --json` projects the denorm beside `currentTask`; `node show` projects it into the card | `core/cli.ts:2093-2094`; `core/cli.ts:4147-4149` |
| E-22 | `Assignment.projectSlug` is optional | `core/platform/types.ts:195-211`, specifically `:199` |
| E-23 | The implicit *general* assignment is materialised with `task: "general"` and **no** `projectSlug` | `core/platform/assignment.ts:59-74` |
| E-24 | Actor provenance is a two-word vocabulary `resolved | asserted` | `core/platform/types.ts:12-16` |
| E-25 | `status` is free as a top-level verb — the flag table has no `status` key | `core/cli.ts:666-705` |
| E-26 | …but `status` **already exists** as a watchdog sub-action (`pij watchdog status`) — **and (ledger correction, albatross ratification) a THIRD status noun exists: `pij daemon status` (`cli.ts:1071`)**, strengthening the OQ-4 case for `pij now` | `core/cli.ts:211-221`; `core/cli.ts:1016-1034`; `cli.ts:1071` |
| E-27 | pij's default watchdog interval is 20 minutes | `core/watchdog.ts:6` |
| E-28 | The watchdog turn already embeds paste-ready commands in a `[pij watchdog #N for <id>] …` frame | `core/watchdog.ts:187-195` |
| E-29 | pij's existing `Role` union is `"parent" | "worker"` — different semantics, not to be widened (JC-2's problem, noted here for boundary) | `core/types.ts:12`; `core/types.ts:164-166` |
| E-30 | CG's fast loop drains the spine cursor, coalesces, and emits at most one `fleet-delta` | `pij-poller.service.ts:196-227` |
| E-31 | The drain **drops** events whose peer is not already in the fleet map | `pij-poller.service.ts:213` |
| E-32 | `MAX_BROADCASTS_PER_FAST_TICK = 1` is an asserted constant | `pij-poller.service.ts:51` |
| E-33 | `peerOf` matches `peer` exactly, falling back to a `node:` ref | `pij-poller.service.ts:316-320` |
| E-34 | `applyEvent` refuses to apply `next` for any kind but `system-state`, explicitly to avoid writing a task sentence into a state field | `pij-poller.service.ts:330-333` |
| E-35 | `emit()` is the single broadcast egress, typed against `PijChannelEvent` | `pij-poller.service.ts:301-308` |
| E-36 | The spine cursor is constructed with **no `since`**, and `since` defaults to `0` — so the first tick replays the whole log | `start-pij-poller.ts:52`; `spine-cursor.ts:188` |
| E-37 | CG reads `$PIJ_HOME` defaulting to `~/.pij` on the same host that writes it | `start-pij-poller.ts:36` |
| E-38 | `spine` is already in the read-only fence's allowlist; the fence rejects any argv containing `set` in any position | `pij-records.ts:31`; `:37-55`; `:81-99` |
| E-39 | A pij CLI invocation costs ~0.42–0.48s; the spine file read costs <0.01s | `pij-records.ts:57`; `pij-poller.service.ts:19-22` |
| E-40 | `PollerStatus` already distinguishes `spineMissing` and `lastError` from an empty fleet | `types.ts:119-136` |
| E-41 | `fleet-delta` carries full rows, never patches, to make AC-03's never-re-derive rule enforceable | `types.ts:146-149` |
| E-42 | The CG reader's `SpineEvent` type is deliberately open (`kind: string` + index signature) | `spine-cursor.interface.ts:15-38` |
| E-43 | A `type:value` ref pointing at another spine event is an established idiom in live data (`decision-event:23091`) | `~/.pij/spine/events.ndjson`, sampled line seq 23097, 2026-07-29 |

**Not verified / explicitly out of scope:** any behaviour of `pij status` itself (does not exist); JC-2's `orchestrationRole` carrier (WS-002); JC-3's question text (WS-003); whether the spine log is ever rotated or tier-migrated (no rotation code was searched for — see OQ-2).

---

## Open Questions

**RESOLVED**

- **R-1 — Storage carrier.** Existing spine envelope, `kind:"status"`, `prev`/`next`. No new record type. (D-1/D-2, E-01…E-07)
- **R-2 — Length rule.** 280 chars each, whitespace-collapsed, writer **refuses** over-limit; reader clamps visually only. (D-4/D-6, E-06)
- **R-3 — Empty text.** Both positionals required, non-empty. No fifth absence state. (D-5, E-03)
- **R-4 — `--state` composition.** Two events, one `withPlatformWriteLock`, `state-set` → `status`, correlated by a `state-set:<seq>` ref. Never merged — s055 consumes `state-set` by exact name. (D-8/D-9/D-10, E-11/E-16)
- **R-5 — Failure atomicity.** Not all-or-nothing across both events; serialised, never partially-state-set, always honestly reported via the existing WAS-set framing. (§ Failure Semantics, E-13)
- **R-6 — Project attribution.** `--project` → current assignment's `projectSlug` → omitted. "No project" is designed (the *general* assignment has none). (D-12, E-22/E-23)
- **R-7 — Staleness clock.** Event `ts`, producer-stamped; receipt only clamps negatives. Threshold 30m, one named constant, chosen because it exceeds pij's 20m watchdog interval. (D-14/D-15, E-27)
- **R-8 — CG read path.** The existing fast-loop drain, re-broadcast as `status-delta`. No per-PM `spine events --peer`, no new loop, no new channel, no fence change. (D-16, E-30/E-38/E-39)
- **R-9 — Cold start.** Free: the cursor defaults to `since = 0`, so the first tick replays the whole log; the poller holds a `statuses` map and serves it on the existing fleet snapshot. (D-17, E-36)
- **R-10 — Absence states.** Four `data-reason`s (`not-a-pm`, `role-unknown`, `no-status-yet`, `status-stale`), plus `spine-unreadable` as a *panel-level instrument outage*, explicitly not one of the four. Stale still renders its text. (§ Absence states, E-40)
- **R-11 — Versioning.** `schema_version` stays 1; additive fields tolerated; a semantic change to `prev`/`next` mints a new `kind`. (D-18, E-03/E-42)
- **R-12 — Node denorm.** Yes, four fields (`statusPrev/Next/At/Seq`), projected into `list --json` and `node show`; consumed by pij's watchdog, **not** by chainglass in v1. (D-7, E-18…E-21)

**RESOLVED AT RATIFICATION (2026-07-29, albatross/s074)**

- **OQ-2 → NO, definitively.** The spine log is byte-append-only and permanent — no rotation, compaction, or tier-migration anywhere. `since = 0` replay is complete history for all time. **OQ-1 therefore resolves NO** — CG never needs the denorm fallback.
- **OQ-7 → allow the write, nudge only PMs** — forced by the no-migration ruling (WS-002 D5).

**OPEN**
- **OQ-3 (joint, low)** — Cross-host clock skew. Producer `ts` is the sole clock (R-7) and both processes are on one host today (E-37). If CG ever reads a remote `~/.pij`, staleness becomes unreliable in a way no field currently exposes. **Recorded as a tracked gap, not designed around.**
- **OQ-4 → RESOLVED (Jordan, in-pane, 2026-07-29): the `pij report` family.** JC-1's verb is `pij report now`; `state set/clear/verify` MOVE under the family (`report state|clear|verify`), the old spelling unships. Grammar rationale: bare-noun surface reads, imperatives act — `report` is an imperative first-person self-claim; and with the writes gone, `pij state <id>` becomes a pure-noun read, dissolving the status/state collision instead of working around it. **Records unchanged** — the spine event, denorm fields, and CG consumed subsets are untouched (spelling, not data).
- **OQ-5 (CG, must-decide-in-T007)** — `MAX_BROADCASTS_PER_FAST_TICK = 1` (E-32) becomes "≤1 per event type". This changes the meaning of a constant an existing test asserts. Flagged here so T006/T007 land it deliberately. *(Landed in T007 with per-type assertions.)*
- **OQ-6 (Jordan)** — The 30m threshold (D-15). Reasoned from the 20m watchdog interval, but it is a taste call and one constant to retune.
- **A-4 (CG sizing note, from ratification)** — the cold-start `statuses` map grows without eviction: 1,429 distinct spine peers vs 237 hot seats (6:1). CG bounds the served map (see plan T007 note).

---

## Conflicts with standing rulings

**None found.** Two places where this document goes *beyond* a standing ruling rather than against it, called out so they are ratified deliberately:

1. The one-call ruling says "atomic with optional state set". This document defines "atomic" precisely as *one lock, ruled order, never partially-state-set, WAS-set reporting* — **not** as a single indivisible event, because merging would break a shipped consumer (E-16).
2. The plan's JC-1 sketch (`pij-rail-v2-plan.md:50`) names the read side as `pij spine events --peer <id> --json`. Validation finding 2 already superseded that with the fast-loop drain, and this document follows the finding. The `spine events` read remains valid as a **human/debug** path and is what makes a JC-1 event independently inspectable — it is simply not chainglass's production path.
