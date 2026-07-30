# Workshop: JC-2 — the orchestration-role contract (`prime | pm | worker`)

**Type**: Data Model
**Plan**: 090-pij-rail-v2
**Spec**: pij-rail-v2-plan.md
**Created**: 2026-07-29
**Status**: Draft
**Value Thesis**: The rail's whole promise — "what is each PM doing now/next, and who needs me" — rests on one bit of truth chainglass does not have and must never invent: *is this seat a PM?* JC-2 buys that bit for the price of one optional descriptor field, and buys it in a shape where absence is a rendered state rather than a guess. The same field is what lets pij's watchdog nudge PMs and only PMs, so one field pays twice across two repos.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Grounded — every claim below about pij's present behaviour is verified against source at `path:line` and against a read-only census of the live registry (2026-07-29); no code exists on either side.

**Selected Value Axes**
1. **Honest absence** — the field must make "undesignated" distinguishable from "designated worker" and from "this pij is too old to have the field", at the type level, on both sides.
2. **Single-writer safety** — pij's registry write law has already lost this exact class of update five times; a new contested field that skips the ownership table is a scheduled incident, not a risk.
3. **Non-duplication of `prime`** — `prime`/`oldPrime` are load-bearing on adoption, revive resolution and the invariant guard. A second source of truth for prime-ness is a correctness bug, not a redundancy.
4. **Cross-repo evolvability** — chainglass ships behind a fake seam now; flipping to the real read must require zero component change and no shape re-guess (the `folder`-vs-`cwd` lesson).
5. **Zero per-row cost** — role must ride projections chainglass already reads (`list --json`, `tree --json`), never an N×`node show` fan-out (measured 179 rows ≈ 80s, `core/cli.ts:2085-2091`).

---

## Purpose

Decide the exact carrier, writer, mutability, audit trail, projection surface and absence semantics for the orchestration role, so that:

- albatross (pij) can implement it without a second round-trip, and
- chainglass can code the rail's role chip, PM entitlement and status-absence discriminators against a shape that will not move when the real field lands.

This workshop **amends one sentence of the plan** (see Conflicts & Amendments) and otherwise implements its rulings.

## Fresh Entrant Outcome

After reading this, someone who has never seen either repo can:

- name the field, its two unions (stored vs projected), and why they differ;
- say which command writes it, with what authority, and what audit event it leaves;
- point at the three JSON reads that carry it and recite each one's absence semantics;
- explain why `prime: true` beats a stored `"pm"` and what happens when both are present;
- explain why 232 of 235 existing seats will render "role unknown" tomorrow and why that is the correct outcome, not a migration failure.

## Key Questions Addressed

1. Is the new field **total** (`prime|pm|worker`) or **partial** (`pm|worker` with `prime` staying a boolean)? — *Both, at different layers.*
2. Who sets it, when, and through which verb? Does `PIJ_ROLE` have anything to do with it? — *A new `orchestration role` verb plus a `link --role` one-call; `PIJ_ROLE` is provably unusable.*
3. Is it mutable, and does a change leave a record? — *Yes; a `role-set` spine event on the `node-linked` template.*
4. Which reads carry it, and what does absence mean in each? — *`list` rows, `tree` nodes, `node show` card; present-and-`null` = unknown, absent key = contract-absent.*
5. What happens to ~232 seats with no role? — *Nothing. No backfill. They converge by adoption.*
6. How does it interact with the watchdog and with sweep-adopt? — *Strict positive match for the watchdog; sweep-adopt does not consume it but is the natural write moment.*
7. What exactly does chainglass register as consumed, and what gaps go on the record? — *Two fields on two reads; three gaps (G-1..G-3).*

---

## Background: the collision, verified

`SessionDescriptor.role?: Role` already exists, where `Role = "parent" | "worker"` (`core/types.ts:11-12`, field at `:166`). It is not a label — it is boot wiring:

- `core/spawn.ts:135,197` puts it in the child's env as `PIJ_ROLE`.
- `core/session-join.ts:79` re-exports it into a joined shell.
- `core/revive.ts:487` defaults it to `"worker"` on revive.
- **`index.ts:282-283` narrows the env value back down**: `role = envRole === "parent" || envRole === "worker" ? envRole : undefined`. Any third word is silently discarded.

That last line is the decisive evidence. Widening `Role` to carry `"pm"` would not fail loudly — a `PIJ_ROLE=pm` seat would boot with `role: undefined` and keep working, and the defect would surface as a PM that never gets nudged. **Ruling upheld: `Role` is not widened, not reused, and `PIJ_ROLE` is not the carrier.**

The second existing designation is `prime?: boolean` / `oldPrime?: boolean` (`core/types.ts:167-170`), written only by `PrimeService` (`core/orchestration/prime.ts:28-37`) under `pij orchestration prime set|retire|unset` (`core/orchestration/cli.ts:17-19`). Its consumers are real and load-bearing:

| Consumer | Site | What breaks if prime-ness gets a second source |
|---|---|---|
| Adoption axis | `core/tree.ts:25-26` — `isUnadopted = prime !== true && effectiveParent === null` | A designated PM that is not `prime` would flip in/out of "unadopted" |
| Revive resolution | `core/revive.ts:368-385` — prime beats non-prime, two primes = `E-AMBIG` | Ambiguity detection reads the wrong field |
| Invariant guard | `core/invariant-guard.ts:16-17` | Guard misses a case |
| Prime discovery | `core/discovery.ts:105-107` `filterPrime` | `list --prime` diverges from the rail |
| Render | `core/cli.ts:2118` (`P`/`O` column), `:4300`, `:4311` | Two different answers on one screen |

This is why the plan's ruling "do not duplicate prime designation without addressing the overlap" is the hinge of the whole design.

---

## Decision Space

### D1 — The carrier and its totality

| # | Option | Verdict | Why |
|---|---|---|---|
| D1-a | `orchestrationRole?: "prime" \| "pm" \| "worker"` stored on the descriptor, total, authoritative for all three | **Rejected** | Creates a second writable source of prime-ness against five live consumers (table above). Two fields can disagree; nothing arbitrates. |
| D1-b | `orchestrationRole?: "pm" \| "worker"` stored, and consumers join it to `prime` themselves | **Rejected** | Pushes a two-field join into every consumer, including chainglass. The rail would carry a `role ?? (prime ? 'prime' : null)` expression — i.e. derivation, in the consumer, which AC-03 forbids on principle and which drifts the moment pij adds a fourth word. |
| D1-c | **Store partial, project total.** Descriptor stores `orchestrationRole?: "pm" \| "worker"`; every JSON projection emits a **total** `orchestrationRole: "prime" \| "pm" \| "worker" \| null` computed as `prime === true ? "prime" : (stored ?? null)` | **SELECTED** | One writer per fact (prime-ness stays `PrimeService`'s; pm/worker is the new service's). One field per reader. The projection layer is where the join belongs, and pij already does exactly this join on the same object — `renderSessionForestJson` re-stamps `prime`/`oldPrime` on top of the spread at `core/cli.ts:4340-4344`. The precedent is one line away from where the new line goes. |
| D1-d | No field; derive PM from `Project.primeId` (`core/platform/project.ts:33`) plus tree position | **Rejected** | Tree-position inference, forbidden by standing ruling; and `primeId` names a project's prime, not its PMs. |
| D1-e | Field name `role2` / `seatRole` / `governanceRole` | **Rejected** | `orchestrationRole` is already in the plan text and the albatross brief, matches the existing `pij orchestration` verb family the writer will live in, and is unambiguous next to `role`. |

**Conflict rule (must be implemented, not assumed away):** if a descriptor ever holds both `prime: true` and a stored `orchestrationRole`, the projection emits `"prime"` **and** pij raises a `role-conflict` anomaly through the existing anomalies surface (`core/anomalies.ts`, `pij anomalies`). Precedence is deterministic; the disagreement is still surfaced. Silent precedence is how two-source bugs stay invisible.

**On the two unions sharing one key.** The stored union is a strict subset of the projected union, so a reader that somehow sees the stored form reads a valid member — a widening, never a contradiction. Chainglass never sees the stored form: it reads records through the CLI only (`PIJ_READ_VERBS`, `apps/web/src/features/089-first-class-pij/server/pij-records.ts:31`), and only the spine is file-read. The distinction is still named in both type sketches so nobody has to rediscover it.

### D2 — Who sets it, and when

| # | Option | Verdict | Why |
|---|---|---|---|
| D2-a | Env var, `PIJ_ORCHESTRATION_ROLE`, on the `PIJ_ROLE` precedent | **Rejected** | `PIJ_ROLE`'s own narrowing at `index.ts:282-283` is the argument against it. Env is boot-time-only, so a promotion to PM mid-life is unrepresentable, and it puts the seat in charge of its own designation. |
| D2-b | `pij orchestration role set [<id>] <pm\|worker> [--json]`, `pij orchestration role unset [<id>] [--json]` — a `RoleService` shaped exactly like `PrimeService` | **SELECTED** | Same family, same honour-system posture already documented at `core/orchestration/cli.ts:22` ("any peer may designate any session prime"), same `Result<Change>` shape, same `"cli"` write authority. Default positional `[<id>]` = self, as `prime set` already does. Cheapest correct thing. |
| D2-c | `pij link <child> --parent <pm> [--role <pm\|worker>]` — designate in the adoption call | **SELECTED (additive)** | Adoption is the instant the fact becomes known, and `link` already owns `parentId` with `"cli"` authority (`core/cli.ts:2238`) and already appends its audit event under the platform write lock (`:2254-2270`). One call, per V2-AC-10's one-call doctrine. This is also the migration vector (D5). *(Review note: the control-plane `pij adopt` — pane self-registration, distinct from `link` — also carries `--parent`; whether it grows a matching `--role` is albatross's ergonomics call, same rule as D2-d: writes go through `RoleService`.)* |
| D2-d | `pij_spawn` initial-role argument | **Open — albatross's ergonomics call** | Harmless and probably wanted (`core/spawn.ts:135` already threads a role into env), but not required by any AC. If added, it must write through the same `RoleService`, never straight to the descriptor. |
| D2-e | PM self-declares as the *only* path | **Rejected as the only path, permitted as a case** | The honour system already allows self-designation; the canonical flow is the prime designating at adopt/link. Convention, not enforcement — pij does not police it. |

### D3 — Mutability and audit

| # | Option | Verdict | Why |
|---|---|---|---|
| D3-a | Mutable, and added to `DESCRIPTOR_FIELD_OWNER` as `orchestrationRole: "cli"` | **SELECTED — non-negotiable** | `core/registry-write.ts:73-94` is the ownership table; anything not listed is uncontested and takes the writer's value, which means **a daemon tick that snapshots before the role write and persists after will replay the role away**. This is incident #1 verbatim (`registry-write.ts:9-11`: the `currentTask` denorm). Omitting the row is silently lossy — the file says so at `:59-65`. |
| D3-b | Immutable once set | **Rejected** | Promotions and demotions are real; an immutable role forces seat churn. |
| D3-c | Append-only (a non-owner may fill the gap) | **Rejected** | Only `reportedAt` is append-only (`registry-write.ts:103`) because a peer stamps it once and the daemon carries it forward. Role has one writer and no carrier; owner-wins is correct. |
| D3-d | Audit: a spine event `kind: "role-set"` on every *change*, on the `node-linked` template | **SELECTED** | `SPINE_KIND_NODE_LINKED` (`core/platform/types.ts:237-243`) is the exact precedent: uncoupled (descriptor is truth, event is history), appended under the platform write lock + recovery gate, attribution resolved **before** any write. Envelope fields already exist — `prev`/`next` are free strings on `AttributionEnvelope` (`core/platform/types.ts:20-28`). `next` is string-typed and never null, so an `unset` **omits** `next`, exactly as a `--root` link omits it (`platform/types.ts:239-241`). |
| D3-e | No audit event | **Rejected** | Role decides who gets nudged and who carries status. "Who made this a PM, when" is a question that will be asked. |
| D3-f | Add a matching audit event to `prime set/retire/unset` | **Open — flagged asymmetry** | `PrimeService` writes the descriptor and appends nothing (`core/orchestration/prime.ts:35`). After JC-2, role changes are on the spine and prime changes are not. Albatross either closes it or accepts it; chainglass consumes neither event and is unaffected either way. |

### D4 — Projection surface

| # | Read | Verdict | Mechanism | Absence semantics |
|---|---|---|---|---|
| D4-a | `pij list --json` rows | **SELECTED — the primary carrier** | One line in the hand-built row literal (`core/cli.ts:2061-2103`), placed next to `prime`/`oldPrime` at `:2083-2084`. Zero cost: `prime` and the stored role are both descriptor fields, so this is a field read — no spine read, no assignment join, no per-row fan-out, exactly the property the `currentTask` denorm was added to preserve (`:2085-2091`). | Key **always present**. `null` = role unknown. Mirrors `currentTask: d.currentTask ?? null` (`:2094`). |
| D4-b | `pij tree --json` nodes | **SELECTED** | `renderSessionForestJson` (`core/cli.ts:4321`) spreads the descriptor (`:4340`) then re-stamps booleans (`:4343-4344`). The spread means the **stored** partial form would leak through untouched — so the re-stamp is mandatory, not optional: `orchestrationRole: node.prime === true ? "prime" : (node.orchestrationRole ?? null)` goes on the same object literal. | Same: always present, `null` = unknown. |
| D4-c | `pij node show --json` card | **SELECTED** | The card is a hand-built literal (`core/cli.ts:4139`) that inherits nothing; the field must be added explicitly. **Note the pre-existing gap this reveals: the card carries neither `prime` nor `oldPrime` today** — so `node show` currently cannot answer "is this the prime". Adding a total `orchestrationRole` closes that for role. | Same. |
| D4-d | `pij list` / `pij tree` human tables | **Open — albatross's call** | The `P`/`O`/blank column at `core/cli.ts:2118` and `:4300` could become `P`/`O`/`M`/`w`/blank. | — |
| D4-e | A new `pij role list` verb | **Rejected** | A third read for a field already on two reads chainglass polls. |
| D4-f | `pij spine events --json` | **N/A — carries the audit event only, never current state** | Already a total passthrough (`core/cli.ts:4254-4258`). | — |

**The two absences are different and both are real.** This is the "absent-key ≠ empty-value" trap, and it is live here because chainglass will run against pij binaries on both sides of this change:

| Observation | Meaning | CG `data-reason` |
|---|---|---|
| `"orchestrationRole": "pm"` | designated PM — carries status, gets nudged | — |
| `"orchestrationRole": null` | pij knows the field; this seat has no designation | `role-unknown` |
| key absent from the row | this pij predates JC-2 | `role-field-absent` |
| no fleet snapshot at all | the instrument did not report | `fleet-unavailable` (existing) |

Rows 2 and 3 render the **same** chip to the human ("role unknown") and **different** `data-reason` values, so "did the field ship?" and "was this seat designated?" stay separately answerable without asking anyone to remember which pij is installed.

### D5 — Migration for existing seats

Census, read-only, `~/.pij/*.json`, 2026-07-29:

| Measure | Count |
|---|---|
| Flat descriptors | **235** |
| Carrying a `role` key | **3** (all `"worker"`) |
| `prime: true` | **6** |
| `oldPrime: true` | **2** |
| Carrying `parentId` | 36 |
| Carrying `spawnedBy` | 29 |

| # | Option | Verdict | Why |
|---|---|---|---|
| D5-a | **No migration.** Optional additive field; absence is the designed state | **SELECTED** | `SessionDescriptor`'s own stated convention — "all optional ⇒ migration-safe" (`core/types.ts:229`). And it is free at the top: the 6 primes project `"prime"` on day one through the D1-c precedence rule, with zero writes. That *is* the migration. |
| D5-b | Backfill `"worker"` for every non-prime | **Rejected** | Manufactures a fact. An undesignated seat is not a worker; it is undesignated, and the difference is exactly what the rail must render. |
| D5-c | Backfill `"pm"` for tree-lead seats | **Rejected, hard** | This is the forbidden tree-position inference, done once and *persisted* — worse than inferring live, because it launders a guess into the record where nothing downstream can tell it apart from a human decision. |
| D5-d | Converge through sweep-adopt + `link --role` (D2-c) | **SELECTED as the path** | The prime is already being notified of unadopted seats and acting on them (V2-AC-12); the role lands as a by-product of a decision someone actually made. Population converges by use, not by script. |

**Day-one expectation, stated so it is not read as a bug:** with pij v2 shipped and no designations made, the rail renders 6 seats as `prime` and every other seat as `role-unknown`. Zero PMs. Zero nudges. That is the contract behaving correctly.

### D6 — Watchdog targeting (V2-AC-13)

| # | Option | Verdict | Why |
|---|---|---|---|
| D6-a | **Nudge iff `orchestrationRole === "pm"`** — strict positive match | **SELECTED** | Precedent and cautionary tale are the same field: `relay?: boolean` yields `"relay (never watched)"` (`core/watchdog.ts:285-288`), added because a watchdog nudge into a bridge peer becomes a real message to a human's phone — the 20-nudge incident (`core/types.ts:222-228`). Unknown role ⇒ silence. |
| D6-b | Nudge everything `!== "worker"` | **Rejected** | Turns absence into eligibility. Would nudge 232 undesignated seats today. |
| D6-c | Nudge seats with children | **Rejected** | Tree-position inference, in pij this time. Same ruling applies to both sides of the contract. |
| D6-d | Nudge the prime too | **Rejected** | Standing ruling: status is PM-only; prime and workers excluded (V2-AC-13). |

The staleness clock stays JC-1's (`kind:"status"` event `ts`); JC-2 supplies only the *eligibility* half. Two contracts, one behaviour, no coupling beyond that.

### D7 — Interaction with sweep-adopt

| # | Question | Ruling |
|---|---|---|
| D7-a | Does sweep-adopt need JC-2? | **No.** It notifies the seat with `prime === true`, which the descriptor already answers (`core/discovery.ts:105-107`). Recorded so albatross does not build a dependency that isn't there — the two items can ship in either order. |
| D7-b | Orphan warnings | Unchanged: **orphans are never warned**, whatever their role. A seat with no governance is not asked to fix its own governance. |
| D7-c | Does `isUnadopted` change? | **No — explicit non-change.** `core/tree.ts:26` keeps keying on `prime !== true`. If it keyed on the new field, designating a seat `"pm"` would silently move it out of the adoption sweep and orphan its subtree. |
| D7-d | Is `link --role` allowed to *demote*? | Yes — the verb is a designation, not a promotion ladder. `RoleService` has no state machine; `pm → worker` is one write and one `role-set` event. |

### D8 — The registered consumed-field subset (flow-json precedent)

Chainglass registers **exactly this**, and nothing wider:

| Producer read | Field | Type as consumed | Required |
|---|---|---|---|
| `pij list --json` row | `orchestrationRole` | `'prime' \| 'pm' \| 'worker' \| null` | tolerated-absent (→ `role-field-absent`) |
| `pij tree --json` node | `orchestrationRole` | `'prime' \| 'pm' \| 'worker' \| null` | tolerated-absent (→ `role-field-absent`) |

Not consumed, deliberately: `node show`'s copy (produced, but the rail needs role for *every* row and the row already carries it — registering it would buy a second read path for no render), the human tables, and the `role-set` spine event (history, not state).

**Tracked gaps** (recorded, not solved — flow-json discipline):

- **G-1 · retired primes fall to unknown.** `prime: false, oldPrime: true` with no stored role projects `null`. Correct (an old prime is not currently anything) but it means the rail shows a retired prime as role-unknown. CG follow-up: `FleetRow` carries `prime?` but not `oldPrime` (`apps/web/src/features/089-first-class-pij/types.ts:63`) — today `oldPrime` lands in `extra` (`server/join.ts:88-93`). Promoting it is a one-line CG change, out of scope here.
- **G-2 · no project dimension.** Role is machine-wide, like `prime`. A seat that is PM of project A and a worker on project B cannot be expressed. Same shape as the flow-json "no seat dimension" gap. Not solved; if it ever bites, the fix is a project-scoped record, not a second descriptor field.
- **G-3 · no role age.** No `roleSetAt` field is proposed; the `role-set` event's `ts` is the history. The rail does not render role age and must not compute one.

### D9 — The fake seam (CG, today)

| # | Option | Verdict |
|---|---|---|
| D9-a | Fake assigns roles from tree depth, labelled fake-only | **SELECTED** (already ruled) — and tightened: the fake must emit the **contract shape**, i.e. present-and-`null` for unknown, never a missing key, so the `role-unknown` path is exercised by the fake and not first met in production. |
| D9-b | A second fake that emits *no* key, to exercise `role-field-absent` | **SELECTED** | One extra fixture; without it, the older-pij path ships unrendered. Two fakes, two `data-reason`s, two test-ids. |
| D9-c | Seam-swap assertion | **SELECTED** | The swap test asserts the production reader has no reference to tree depth — verify by mutation: break the depth inference in the fake and assert the production-path test is unaffected. |

---

## Worked examples

### 1 · `pij list --json` — one row per role state

Field order follows the real literal at `core/cli.ts:2061-2103`; `orchestrationRole` sits with the other designation fields at `:2083-2084`.

```jsonc
[
  {
    "id": "pij-wee-albatross",
    "folder": "/Users/jordanknight/pi-hacking/pij",
    "dataDir": "/Users/jordanknight/.pij/pij-wee-albatross",
    "pid": 40321,
    "state": "idle",
    "activity": "idle",
    "liveness": "active",
    "lastEventAt": "2026-07-29T10:41:02.118Z",
    "boundModel": "claude-opus-4-6",
    "boundProvider": "anthropic",
    "effort": "high",
    "failureReason": null,
    "bindHealth": "bound",
    "degraded": false,
    "terminal": null,
    "watchdog": { "state": "watching" },
    "prime": true,
    "oldPrime": false,
    "orchestrationRole": "prime",   // projected from prime:true — NOT stored
    "currentAssignment": "asg-0f31",
    "currentTask": "pij rail v2 — sibling plan",
    "planId": null,
    "badge": "working",
    "unadopted": false
  },
  {
    "id": "pij-brisk-heron",
    "folder": "/Users/jordanknight/substrate/chainglass",
    "prime": false,
    "oldPrime": false,
    "orchestrationRole": "pm",      // stored on the descriptor
    "currentTask": "090 rail — phase 1",
    "badge": "question",
    "unadopted": false
  },
  {
    "id": "pij-lit-marlin",
    "folder": "/Users/jordanknight/substrate/chainglass",
    "prime": false,
    "oldPrime": false,
    "orchestrationRole": "worker",
    "currentTask": "T009b rail grouping",
    "badge": "working",
    "unadopted": false
  },
  {
    "id": "pij-old-tern",
    "folder": "/Users/jordanknight/substrate/chainglass",
    "prime": false,
    "oldPrime": false,
    "orchestrationRole": null,      // ← 232 of 235 seats look like this on day one
    "currentTask": null,
    "badge": "idle",
    "unadopted": true
  }
]
```

An older pij simply has no `orchestrationRole` key on any row — CG's `role-field-absent` case, distinct from `pij-old-tern`'s `null`.

### 2 · `pij node show <id> --json` — excerpt

The card is hand-built (`core/cli.ts:4139`); the new field goes next to the axis fields. Note that `prime`/`oldPrime` are absent from the card today — a pre-existing gap this field partly closes.

```jsonc
{
  "id": "pij-brisk-heron",
  "harness": "claude",
  "lifecycle": "bound",
  "parent": "pij-wee-albatross",
  "spawnedBy": "pij-wee-albatross",
  "orchestrationRole": "pm",        // ← new; total union, null when unknown
  "systemState": "working",
  "semanticState": "question",
  "badge": "question",
  "currentAssignment": "asg-0f31",
  "currentTask": "090 rail — phase 1",
  "planId": "090-pij-rail-v2",
  "assignments": [ /* … unchanged … */ ],
  "paneId": "%17",
  "windowId": "@4",
  "state": "working",
  "activity": "working",
  "liveness": "active",
  "cwd": "/Users/jordanknight/substrate/chainglass"
}
```

### 3 · The audit event, via `pij spine events --peer pij-brisk-heron --json`

```jsonc
{
  "schema_version": 1,
  "seq": 20194,
  "kind": "role-set",
  "peer": "pij-brisk-heron",
  "actor": "pij-wee-albatross",
  "actorProvenance": "resolved",
  "ts": "2026-07-29T11:02:44.907Z",
  "refs": ["node:pij-brisk-heron"],
  "prev": "worker",
  "next": "pm"
}
```

An `unset` **omits** `next` (string-typed, never null — `core/platform/types.ts:239-241`) and keeps `prev`. A first designation omits `prev`.

### 4 · pij-side type sketch

```ts
// core/types.ts — additive, optional, migration-safe (the convention at types.ts:229)

/** Orchestration designation for the prime → PM → team shape.
 *  STORED FORM ONLY — `"prime"` is never stored here: prime-ness is
 *  `prime?: boolean`, owned by PrimeService, and the projections join the two.
 *  Distinct from `Role` (types.ts:12), which is boot wiring for PIJ_ROLE and
 *  is NOT widened. */
export type StoredOrchestrationRole = "pm" | "worker";

/** PROJECTED FORM — what `list --json`, `tree --json` and `node show --json`
 *  emit. Total vocabulary; `null` means "no designation on record". */
export type OrchestrationRole = "prime" | StoredOrchestrationRole;

export interface SessionDescriptor {
  // … existing fields …
  readonly prime?: boolean;                              // types.ts:168 — unchanged
  readonly oldPrime?: boolean;                           // types.ts:170 — unchanged
  readonly role?: Role;                                  // types.ts:166 — UNCHANGED, do not widen
  /** Honour-system orchestration designation (pm|worker). Absent means
   *  undesignated — never "worker". CLI-owned (registry-write.ts). */
  readonly orchestrationRole?: StoredOrchestrationRole;  // ← the only new field
}

// core/registry-write.ts — MANDATORY row; omitting it re-runs incident #1.
export const DESCRIPTOR_FIELD_OWNER = {
  prime: "cli",
  oldPrime: "cli",
  orchestrationRole: "cli",   // ← new
  parentId: "cli",
  // … unchanged …
} as const satisfies Partial<Record<keyof SessionDescriptor, DescriptorWriter>>;

// core/orchestration/role.ts — PrimeService's shape, verbatim (prime.ts:13-38)
export interface RoleChange {
  readonly id: SessionId;
  readonly orchestrationRole: StoredOrchestrationRole | undefined;
  readonly changed: boolean;
}

export class RoleService {
  constructor(private readonly registry: RegistryPort) {}
  set(id: SessionId, role: StoredOrchestrationRole): Result<RoleChange> { /* … */ }
  unset(id: SessionId): Result<RoleChange> { /* … */ }
  // update(): re-read, compare, then registry.write({...d, orchestrationRole}, "cli").
  // The "cli" declaration is what makes the write land (registry-write.ts:59-65).
}

/** The ONE join. Used by every projection; never duplicated in a consumer. */
export function projectOrchestrationRole(d: SessionDescriptor): OrchestrationRole | null {
  if (d.prime === true) return "prime";        // precedence: prime always wins
  return d.orchestrationRole ?? null;
}

/** Deterministic precedence does not mean a silent disagreement. */
export function hasRoleConflict(d: SessionDescriptor): boolean {
  return d.prime === true && d.orchestrationRole !== undefined;
}
```

### 5 · chainglass-side type sketch

```ts
// features/089-first-class-pij/server/pij-status.contract.ts (JC-2 half)

/** JC-2 consumed vocabulary. Consumed VERBATIM (AC-03) — never re-derived,
 *  never inferred from tree position in the production path. */
export type OrchestrationRole = 'prime' | 'pm' | 'worker';

/** Why a seat has no role. N states → N test-ids (H-03). */
export type RoleAbsenceReason =
  | 'role-unknown'        // key present, value null — pij knows, seat undesignated
  | 'role-field-absent';  // key absent — this pij predates JC-2

export type SeatRole =
  | { kind: 'known'; role: OrchestrationRole }
  | { kind: 'absent'; reason: RoleAbsenceReason };

/** The ONLY reader. Takes the raw row/node record; the discriminator lives here
 *  so no component ever tests for null itself. */
export function readSeatRole(record: Record<string, unknown>): SeatRole {
  if (!('orchestrationRole' in record)) {
    return { kind: 'absent', reason: 'role-field-absent' };
  }
  const raw = record.orchestrationRole;
  if (raw === 'prime' || raw === 'pm' || raw === 'worker') {
    return { kind: 'known', role: raw };
  }
  // null, or any word this CG build does not know — honest unknown, never a guess.
  return { kind: 'absent', reason: 'role-unknown' };
}

/** JC-1 entitlement gate. A seat carries periodic status IFF it is a PM.
 *  `false` here feeds AC-04's `not-a-PM` reason; absence feeds `role-unknown`. */
export function carriesStatus(seat: SeatRole): boolean {
  return seat.kind === 'known' && seat.role === 'pm';
}

// types.ts — FleetRow gains one promoted field (it lands in `extra` otherwise,
// via join.ts:88-93, which is functional but untyped).
export interface FleetRow {
  // … existing …
  prime?: boolean;
  /** JC-2, verbatim. `null` = pij reported unknown; the key is absent on
   *  pre-JC-2 pij. Read through `readSeatRole`, never destructured raw. */
  orchestrationRole?: OrchestrationRole | null;
}
```

A forward-compatibility note worth keeping in the code comment above `readSeatRole`: an unrecognised word (pij adds a fourth role) falls to `role-unknown`, not to a crash and not to a silent `worker`. The rail degrades to "unknown" and someone notices; it never mislabels.

### 6 · Render decision table (the rail)

| `readSeatRole` | Role chip | Carries NOW/NEXT? | Status absence `data-reason` when no status |
|---|---|---|---|
| `known: prime` | PRIME | no | `not-a-pm` |
| `known: pm` | PM | **yes** | `no-status-yet` / `stale` |
| `known: worker` | (no chip; worker row form) | no | `not-a-pm` |
| `absent: role-unknown` | ROLE? (muted) | no | `role-unknown` |
| `absent: role-field-absent` | ROLE? (muted) | no | `role-unknown` |

Note the deliberate many-to-one at the right edge: AC-04 names **four** status absence states, and both role absences map onto `role-unknown` there. The two role absences stay distinguishable on their own axis (the chip's `data-role-reason`), which is where the distinction is actually useful. Two axes, each total; not one axis with five values.

---

## Evidence Ledger

Every row below was read this session. pij paths are relative to `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/` (read-only; no writes, no git). Chainglass paths are relative to the repo root.

| # | Claim | Evidence | Verified |
|---|---|---|---|
| E-01 | `Role = "parent" \| "worker"` exists and is described as riding in `PIJ_ROLE` | `core/types.ts:11-12` | ✅ read |
| E-02 | `SessionDescriptor.role?: Role` | `core/types.ts:166` | ✅ read |
| E-03 | `PIJ_ROLE` **silently narrows** — any third word becomes `undefined` | `index.ts:282-283` | ✅ read |
| E-04 | `Role` has live consumers: spawn env, joined-shell env, revive default | `core/spawn.ts:135,197`; `core/session-join.ts:79`; `core/revive.ts:487` | ✅ grep + read |
| E-05 | `prime?: boolean` / `oldPrime?: boolean` on the descriptor | `core/types.ts:167-170` | ✅ read |
| E-06 | `prime`/`oldPrime` are written **only** by `PrimeService`, declaring `"cli"` | `core/orchestration/prime.ts:28-37` | ✅ read |
| E-07 | The verbs are `pij orchestration prime set\|retire\|unset [<id>]`, honour-system posture stated in the usage text | `core/orchestration/cli.ts:17-22` | ✅ read |
| E-08 | Adoption keys on `prime !== true` | `core/tree.ts:25-26` | ✅ read |
| E-09 | Revive resolution keys on `prime`; two primes = `E-AMBIG` | `core/revive.ts:368-385` | ✅ read |
| E-10 | Invariant guard reads `prime`/`oldPrime` | `core/invariant-guard.ts:16-17` | ✅ grep |
| E-11 | `filterPrime` selects `prime === true` | `core/discovery.ts:105-107` | ✅ grep |
| E-12 | The registry write law is per-field ownership; anything unlisted is uncontested; **omitting the declaration is silently lossy for your own field** | `core/registry-write.ts:42-46, 59-65, 73-94` | ✅ read |
| E-13 | Incident #1 was exactly this class: CLI-stamped denorms replayed away by a daemon write | `core/registry-write.ts:9-11` | ✅ read |
| E-14 | `reportedAt` is the sole append-only contested field | `core/registry-write.ts:98-103` | ✅ read |
| E-15 | `pij link` writes with `"cli"` authority and appends `node-linked` under the platform write lock, resolving attribution before any write | `core/cli.ts:2238, 2254-2270` | ✅ read |
| E-16 | `SPINE_KIND_NODE_LINKED` is uncoupled audit history; `next` is omitted (never null) on a `--root` link | `core/platform/types.ts:237-243` | ✅ read |
| E-17 | `prev`/`next` are free optional strings on the spine envelope | `core/platform/types.ts:20-28`, `:246-253` | ✅ read |
| E-18 | `spine append` does **not** expose `--prev`/`--next` (flags: kind, refs, peer, project, actor, bare, json) | `core/cli.ts:693` | ✅ read |
| E-19 | `spine events --json` is a total passthrough of the event objects | `core/cli.ts:4254-4258` | ✅ read |
| E-20 | `pij list --json` rows are a **hand-built literal**; `prime`/`oldPrime` are stamped there | `core/cli.ts:2061-2103`, specifically `:2083-2084` | ✅ read |
| E-21 | The denorm fields are on the row precisely to avoid N×`node show` (measured 179 rows ≈ 80s) | `core/cli.ts:2085-2091` | ✅ read |
| E-22 | Row absence convention is present-and-null (`currentTask: d.currentTask ?? null`) | `core/cli.ts:2093-2094` | ✅ read |
| E-23 | `unadopted` is stamped on the row as an explicit boolean | `core/cli.ts:2102` | ✅ read |
| E-24 | `SessionTreeNode extends Omit<SessionDescriptor,"planId">` — descriptor fields flow into tree nodes structurally | `core/types.ts:388` | ✅ read |
| E-25 | `renderSessionForestJson` **spreads the node** then re-stamps `prime`/`oldPrime` — so a stored partial field would leak unless re-stamped alongside | `core/cli.ts:4321, 4340-4344` | ✅ read |
| E-26 | The `node show` card is hand-built and inherits nothing; it carries **neither `prime` nor `oldPrime`** today | `core/cli.ts:4139-4174` | ✅ read |
| E-27 | Human `list`/`tree` render a single `P`/`O`/blank designation column | `core/cli.ts:2118`; `:4300, 4311` | ✅ read |
| E-28 | Descriptor convention: "all optional ⇒ migration-safe" | `core/types.ts:229` | ✅ read |
| E-29 | `denormDescriptor` is the CLI-stamps-descriptor precedent, using `writeExact` because it must be able to *clear* a contested field | `core/cli.ts:2775-2803` | ✅ read |
| E-30 | Watchdog already has a strict never-watch exclusion (`relay`) with a named human-readable state | `core/watchdog.ts:280-288` | ✅ read |
| E-31 | The 20-nudge incident is the documented reason watchdog targeting must not guess | `core/types.ts:222-228` | ✅ read |
| E-32 | ~~No `adopt` verb exists~~ **CORRECTED (review pass, cheap-cheetah):** `pij adopt` DOES exist — in the control-plane surface (`cli.ts:3823,3857` at the extension root), not the platform `core/cli.ts` verb table this row read. It is **pane self-registration** (a seat registering its own tmux pane), not governance reparenting — so `link --role` remains the right designation vehicle for D2-c, but albatross must also decide whether `adopt --parent` grows a `--role` too (it is the other one-call moment the fact is known). | control-plane `cli.ts:3823,3857`; platform `core/cli.ts:747-750` | ✅ re-verified |
| E-33 | Live census: **235** flat descriptors; **3** carry `role` (all `"worker"`); **6** `prime:true`; **2** `oldPrime:true`; 36 `parentId`; 29 `spawnedBy` | `~/.pij/*.json`, read-only `ls`/`grep -l` count, 2026-07-29 | ✅ measured |
| E-34 | CG reads pij records only through allowlisted CLI verbs | `apps/web/src/features/089-first-class-pij/server/pij-records.ts:31` | ✅ read |
| E-35 | `FleetRow` already carries `prime?: boolean` and an `extra: Record<string, unknown>` catch-all for additive fields | `apps/web/src/features/089-first-class-pij/types.ts:63, 77` | ✅ read |
| E-36 | `toFleetRow` routes any non-promoted, non-forbidden key into `extra` — so `orchestrationRole` lands there untyped until promoted | `apps/web/src/features/089-first-class-pij/server/join.ts:30-33, 88-93` | ✅ read |
| E-37 | `PijTreeNode` carries `prime?: boolean` and an `[additive: string]: unknown` index signature | `apps/web/src/features/089-first-class-pij/server/pij-records.interface.ts:76-85` | ✅ read |
| E-38 | `groupFleet`/`FleetSection` today treat the tree lead as the section lead — the structure that must **not** become a role label | `apps/web/src/features/089-first-class-pij/lib/fleet-grouping.ts:38-47, 137-152` | ✅ read |

**Not verified / explicitly out of scope:** no pij command was executed and no pij test was run this session; every behavioural claim above is a source read plus a file-count census. Anything asserting *runtime* behaviour (e.g. "the daemon tick would in fact replay an undeclared role write") is an inference **from** E-12/E-13, which document the same defect happening five times — strong, but it is reasoning from a documented incident list, not from a reproduction. If albatross wants that at proof level, the cheap experiment is a unit test against `applyWriteLaw` with and without the ownership row.

---

## Conflicts & Amendments

**One amendment to the plan text, flagged rather than absorbed.**

`pij-rail-v2-plan.md:53` reads: *"a **new** field, `orchestrationRole: "prime" | "pm" | "worker"`, on the descriptor"*. D1-c stores only `"pm" | "worker"` on the descriptor and **projects** the total union. Consumers see exactly the union the plan names, on exactly the reads the plan names, so **no chainglass code changes and no AC changes** — but the sentence describing pij's storage is now wrong and should read "…projected as `"prime" | "pm" | "worker" | null` on `list`/`tree`/`node show`, stored as `"pm" | "worker"`." Reason for the amendment: the plan's own ruling that prime designation must not be duplicated cannot be honoured by a totally-stored field.

**No other conflict with the standing rulings.** Checked one by one: canonical prime → PM → team (D1 vocabulary is exactly that); PM-only periodic status (D6 + `carriesStatus`); production never infers role from tree position (D5-c, D6-c, D9-c all refuse it, on both sides); absent role renders a designed state (D4 absence table, two `data-reason`s); sweep-adopt notifies the prime only, orphans never warned (D7-a/b); prime designation not duplicated (D1-c precedence + conflict anomaly).

---

## Open Questions

| # | Question | Status | Resolution / owner |
|---|---|---|---|
| Q-01 | Field name — `orchestrationRole`? | **RESOLVED** | Yes. Matches the plan, matches the `pij orchestration` verb family it is written by, unambiguous next to `role`. |
| Q-02 | Total or partial union? | **RESOLVED** | Store `"pm"\|"worker"`; project `"prime"\|"pm"\|"worker"\|null`. Prime always wins; a conflict raises an anomaly rather than being silently absorbed (D1-c). |
| Q-03 | Env var carrier? | **RESOLVED — no** | `index.ts:282-283` narrows unknown values to `undefined`, and env is boot-time-only. |
| Q-04 | Who writes it? | **RESOLVED** | `pij orchestration role set\|unset [<id>] <pm\|worker>` (a `PrimeService`-shaped `RoleService`), plus `pij link --role` for the one-call adopt+designate. |
| Q-05 | Contested-field ownership? | **RESOLVED — mandatory** | `orchestrationRole: "cli"` in `DESCRIPTOR_FIELD_OWNER`. Without it the daemon replays the write away (incident #1). |
| Q-06 | Audit on change? | **RESOLVED** | `kind: "role-set"` spine event on the `node-linked` template; `prev`/`next` carry the words; `unset` omits `next`. |
| Q-07 | Which reads carry it? | **RESOLVED** | `list --json` rows (primary), `tree --json` nodes (must re-stamp over the spread), `node show --json` card. Always-present key, `null` = unknown. |
| Q-08 | Migration for 232 undesignated seats? | **RESOLVED — none** | Absence is the state; 6 primes project for free; the population converges via sweep-adopt + `link --role`. |
| Q-09 | Watchdog targeting? | **RESOLVED** | Strict `=== "pm"`. Today that nudges nobody, which is correct. |
| Q-10 | CG consumed subset? | **RESOLVED** | `orchestrationRole` on `list` rows and `tree` nodes only; gaps G-1..G-3 on the record. |
| Q-11 | Should `prime set/retire/unset` also append a spine event? | **OPEN — albatross** | After JC-2, role history is on the spine and prime history is not. CG consumes neither; purely a pij-side consistency call. |
| Q-12 | Does `pij_spawn` get an initial-role argument? | **OPEN — albatross** | Wanted for ergonomics, required by no AC. Must write through `RoleService`, never straight to the descriptor. |
| Q-13 | Does the human `P`/`O` column grow `M`/`w`? | **OPEN — albatross** | Cosmetic; CG consumes JSON only. |
| Q-14 | Should CG promote `oldPrime` off `extra` onto `FleetRow` so retired primes render as retired rather than role-unknown (gap G-1)? | **OPEN — Jordan / CG follow-up** | One-line change in `join.ts` + `types.ts`; out of scope for JC-2, listed so it is not rediscovered as a bug. |
| Q-15 | Is a fourth role word (e.g. `reviewer`) foreseeable? | **OPEN — low stakes** | `readSeatRole` already degrades an unknown word to `role-unknown` rather than crashing or defaulting, so the answer does not block the contract. |
