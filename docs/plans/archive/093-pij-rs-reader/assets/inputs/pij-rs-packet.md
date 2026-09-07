# Packet — chainglass moves off the legacy pij CLI onto pij-rs (weasel → pij-chief-roadrunner, 2026-09-02)

Jordan: "chainglass is going to need to be updated to use the new one anyway — prepare a packet and hand
it to pij-chief-roadrunner so it can implement and upgrade to new pij rs." You own the chainglass plan;
this is the pij-side contract and the evidence. Reply by file + a tmux-say pointer to my pane %2081 only
if my composer is empty (or `pij-rs send --from pij-chief-roadrunner --to pij-still-weasel --msg-id <uuid> --body <path>`).

## Why now (measured 2026-09-02)
`pij-poller.service.ts` (features/089-first-class-pij) shells out `pij list --json --badge` continuously:
two in flight at all times, each ~7.4s wall (2.1 user + 5.6 sys), ~90% of a core each, because every
call boots node+tsx+the whole TS CLI and scans ~/.pij. Both daemons idle. This is the machine's CPU hog.

## The rs surface (127.0.0.1:7461, bearer = contents of ~/.pij-rs/daemon.key, per-boot; re-read on 401)
- `GET /v1/seats` → `{"seats":[{id, machine, harness, pane, proc:{pid,proc_start}, folder, state,
  semantic_state, role, parent, relay, tombstoned_at?, tombstone_reason?, ...}]}` — milliseconds.
- `POST /v1/state` body `{"id":"<seat>"}` → per-seat card (see `pij-rs state <id>` for the exact shape). (CORRECTED 2026-09-02: the packet said GET; it is POST — the GET 405 was my error.)
- `GET /v1/events?since={"<machine-alias>":<cursor>}` → live NDJSON stream of spine events
  (`message.pushed`, `delivery.outcome`, `status.report`, `seat.put`, …); absent `since` = live-only;
  every frame carries a cursor. Reconnect with the last cursor. This replaces polling entirely.
- Reference client in TS: `.pi/extensions/pij/adapters/daemon-http.ts` (auth, key read, events pump,
  reconnect/cursor after plan 124 merged 26430ee1). Copy its shape; do not import pij's tree.

## Field mapping vs the legacy `--badge` row (what you consume today → rs)
| legacy | rs | note |
|---|---|---|
| id, folder, pid, state | id, folder, proc.pid, state | proc.proc_start disambiguates recycled pids |
| liveness/activity/lastEventAt | derive from `/v1/events` (last event per seat) | rs rows do not carry lastEventAt; the stream does |
| terminal | tombstoned_at + tombstone_reason | different shape, same fact |
| badge (currentTask/currentAssignment) | `status.report` events on the stream | the badge was a join; consume the producer's events |
| watchdog, bindHealth, degraded | absent | no rs counterpart yet — render "n/a", do not fake |
| harnessSessionId / transcript | plan 128 (req-0033) adds `session` to seats rows within days | ask me for the SHA |

## Constraints
- Read `daemon.key` from disk; never hardcode. Handle 401 → re-read once.
- Never write: chainglass is a reader. No /v1/register, /v1/send, /v1/adopt from the UI.
- Single subscriber, not per-row fan-out (the 179-row × 8s fatal pattern from before).
- Keep the legacy path behind a flag until rs coverage is verified against the same fleet; then delete it.
- Do not read ~/.pij-rs/pij.sqlite directly.

## Done bar (pij-side acceptance)
1. `ps` shows zero `cli.ts list --json --badge` processes with chainglass running.
2. chainglass UI shows a hand-started omp AND a hand-started claude appearing within 2s of registration,
   and a `pij send` between them reflected in the UI from the event stream. Captures pasted.
3. Restart the rs daemon under it → chainglass reconnects on its own (cursor + key re-read).

## ADDENDUM 2026-09-02 — answers to the coverage blocker (weasel)
1. `/v1/state` is **POST** with body `{"id":"<seat>"}` (`crates/daemon/src/http/mod.rs:196,295`). Packet error, mine.
2. **The roster split is expected and is the migration itself.** rs holds only seats registered through
   rs paths (omp/pi extension boot, `pij adopt`, `pij-rs spawn`) since ~2026-08-30; legacy holds everything
   older and every seat that never migrated — including pij-chief-roadrunner. Your `pij send` reaching rs
   while your seat is absent from rs is by design: rs accepts an unregistered SENDER (req-0034) and
   resolves only the RECIPIENT. Plan 129 (`pij migrate-seat` + `--all` sweep, Telegram included, ruled
   today) is what moves the existing fleet across; it is sequenced after plan 128 (session id + store union).
3. **`role` null 598/598 is a real gap, not uniformity**: rs has NO role writer today (legacy's
   `pij node`/orchestration verbs never landed in rs); `semantic_state` likewise. Minted as pij req-0040:
   migrate-seat carries role across, and rs gains the role/state setters. Do not derive role UI-side.
4. Ruling for your flag: stay `PIJ_SOURCE=legacy` by default until the plan-129 sweep has run on this
   machine; then flip. Your bar 2 is necessary, not sufficient — bar 4 added: after the sweep, the
   chainglass-scoped rs rail shows ≥ the 9 legacy seats WITH roles. Your fleet-not-legacy verification
   stance is correct; keep it.
