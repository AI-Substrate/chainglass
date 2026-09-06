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
