# Live-push recheck, 2026-09-06 — Amendment 4 reconfirmed against a source reading

**Context.** pij-minor-unicorn (pij-rs prime), reading main `217d66c3`, reported that
`/v1/events` has one bus with no kind filter (`EventFilter::all()`, http/mod.rs:1959) and
that registration and report verbs publish through it, so `seat.put` / `report.now` /
`report.state` DO fan out — and that my 09-03 probe missed them because a stream without
`since` is live-only, and `since` must be a `{alias: cursor}` object, not an integer.

The `since` correction is right: an integer is refused today ("since must be a JSON object
mapping machine aliases to cursors"). The reader already sends the map form
(`rs-client.ts:141`, `JSON.stringify(from)`), so no code change follows from it.

**The fan-out claim is contradicted by measurement, daemon pid 91391, build `pij-rs 0.1.0`.**

Procedure (all RUN, none read):
1. Learned last cursor by object-`since` replay: 14451.
2. Opened two streams with `curl -sN`, held open 25s:
   A: `/v1/events` (no since). B: `/v1/events?since={"JordansacStudio.localdomain":14451}`.
   Both received `hello` (positive control that the sockets were live).
3. `pij-rs report now …` → daemon confirmed **spine 14452**.
4. `pij-rs send --to pij-xenogeneic-wolverine …` → queued.
5. Waited 8s. Then replayed from 14451 as the ground truth.

Result:

    spine (replay)      14452 report.now (pij-lonely-antelope)
                        14453 message.pushed (wolverine)
                        14454 delivery.outcome (wolverine)
    stream A received   14453, 14454
    stream B received   14453, 14454
    NOT received        14452 — by either stream

So a `report.now` written to the spine while two subscribers were open was delivered to
neither; the messaging frames written 1s later were delivered to both. That is the same
partition Amendment 4 measured on 09-03, reproduced with the positive control it lacked.

**The cursor-burn hazard is also reproduced, not inferred.** Stream B was anchored at
14451, BELOW the report frame, and its last observed cursor is 14454. A naive reader
resuming from its observed cursor would never replay 14452. The split-cursor ruling in
Amendment 4 is what makes this recoverable.

**Where source and wire could both be right.** The bus may carry every kind and the
report/registration path may still publish on a different bus, or publish before the
subscriber filter is bound, or write to the spine without publishing at all. That is
unicorn's to bisect; the counterexample above is precise enough to do it with. Until then
the reader must assume descriptor kinds arrive ONLY by replay — the timer recycle stands.

**What unicorn's answer DOES change.** No rate limit, one sqlite read per replay, "2–8s
is fine". The recycle interval therefore drops from 30s to ~5s, and bp-0003's honest bound
from 30s to ≤10s. Still not the plan's original 2s, still finite.

## Root cause, bisected by pij-minor-unicorn the same hour (pij-rs main `217d66c3`)

The spine has three writers and only one of them broadcasts:

| kinds | writer | broadcasts? |
|---|---|---|
| `message.pushed`, `delivery.*`, `spawn.*`, typing hold/release | `EventBus::publish` (`events/mod.rs:62` — store append THEN `live.send`) | yes |
| `report.now`, `report.state` | `ReportService` appends straight to `services.spine` (`crates/core/src/report.rs:116`, `:241`) | no |
| `seat.put`, `seat.tombstone` | `Registry::put` / `tombstone` run their own `INSERT INTO spine_events` (`crates/store/src/registry.rs:231`, `:314`) | no |

So fan-out is exactly "the kinds that happen to go through the bus". Unicorn's own words:
"I made a 'can' claim from the subscriber side without reading the producers." Upstream
fix shape (ledger item, not started): make the bus the sole spine writer, or have it tail
the table by seq and broadcast anything it did not publish. Until that lands, the ruling in
Amendment 4 is the correct client-side design and the ~5s recycle stands. Two ledger items
recorded on the pij-rs side: the three-writer split, and the absence of an rs API doc for
UI consumers.

## Addendum, same day — registry frames carry neither a timestamp nor a payload

Measured by silkworm (a fresh `seat.put` at spine 14561 with `at:0`), confirmed by unicorn
from source and the live table: **all 1456 `seat.put` rows have `at=0` and `payload=''`**
(`registry.rs:231` hard-codes both); all 93 `seat.tombstone` rows have `at=0` with the
reason as payload (`:314`); `report.*` stamp both. Ledgered upstream with the three-writer
item as one fix.

Consequences for the reader, both already the design: (1) `event.at` is unusable for
latency on registry kinds — measure from a local trigger; (2) a `seat.put` frame is a
notification, never a descriptor — it MUST funnel into `refreshRecords()`, and no fixture
may expect descriptor content in its payload.

## Addendum, same day — role and tombstone have no writer; "req-0040" is not a pij plan

Source-checked by unicorn on pij-rs main `217d66c3`, after the rs default shipped and every
rail card read ROLE UNKNOWN:

- **Role.** `register`/`adopt` take `--parent`, no `--role`; HTTP register/adopt carry no
  role; the store's `assign_role` (`store/orchestration.rs:285`, table `seat_roles`) has one
  caller and it is a test. `/v1/seats.role` is a descriptor column nothing sets — null on
  every row by construction. **`req-0040` appears nowhere in the pij repo**; this plan's
  references to it (oq-0002, impl-guide) name a requirement that was never pij's. Ledgered
  upstream as **pij plan 138 "rs seat observability"** (draft, owner unicorn, minted 2026-09-06): phase 1 = one spine writer + stamped descriptor payloads (this file's two measurements are its RED), phase 2 = `--role` + setter + `seat_roles` joined onto `/v1/seats.role`, phase 3 = close verb + reaper. Unscheduled, awaiting Jordan.
- **Tombstone.** `Registry::tombstone` has one caller, a `cfg(test)` fake. All 93 tombstones
  on the spine are plan-128 hand-writes done store-side. No verb, no reaper. The three
  probe seats from silkworm's proofs stay; they are named in the receipts.

Consequence: role is EXPLICITLY UNAVAILABLE from rs with no owner and no date — the exact
case oq-0004 ruled must be handled permanently, not as a stopgap. The rail banner cites
pij plan 138 phase 2, unscheduled.

## Closed upstream — pij plan 139 deployed 2026-09-08 02:02 (daemon pid 45954)

RAN against the new daemon with two open subscribers (live-only, and since-anchored):
`role-set` 20991, `seat.put` 20992/20993, `spawn.bound` 20994, `seat.tombstone` 20995 and
`report.now` 20183 all arrived on BOTH streams, in order, `at≠0`, payloads decodable
(`seat.put` = full SeatDescriptor; `role-set` = `{actor,action,record}`). The three-writer
split is closed on the wire. New verbs used: `pij-rs role <seat> prime` (self-or-parent),
`pij-rs close <seat>` (owner tombstone, reason `owner-close`). The deploy-time reap took
the roster 918 → 867.

Consequences for the reader: the resume-cursor split and the 5s recycle are now
belt-and-braces rather than the only delivery path; keep them. Two follow-ups dispatched:
map `role` → the rail's field (dropped fact, F4 class), and add `role-set` to the acted-on
kinds. `data.unavailable` (federated peers) is still not surfaced — single machine today.
