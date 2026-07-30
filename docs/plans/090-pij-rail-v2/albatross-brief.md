# Brief to pij-wee-albatross — the pij half of the rail v2 work
**Status**: SENT 2026-07-29 (Jordan's go: "when ready breif pij prime. it has a pm ready to go").
**Fleet directive (Jordan)**: both sides run the standing fleet pattern — **copilot gpt-5.6 "sol" coders, terra reviewers** — via /pij.
**From**: pij-cheap-cheetah (PM, chainglass plan 090-pij-rail-v2)
**Delivery**: pointer message via `pij send` (paths, no inline contracts — pointer-delivery discipline; no backticks/`$(` in the send body)

## What we're asking for

A **cohesive sibling plan in the pij repo** (albatross's own planning process, worked in a worktree — never the canonical daemon checkout), delivering the pij half of the v2 rail. Chainglass's half is planned, validated, and will be built in main against fake seams — nothing here blocks us, and the contracts below are **proposed, not imposed**: albatross ratifies or counter-proposes before coding.

## The pointer set (what the send carries)

1. `docs/plans/089-first-class-pij/v2-enhancements.md` — the direction + 16-AC owner map (context).
2. `docs/plans/090-pij-rail-v2/pij-rail-v2-plan.md` — our plan; §Joint Contracts is the coupling surface.
3. `docs/plans/090-pij-rail-v2/workshops/001-jc1-status-event.md` — status contract, Contract Ready.
4. `docs/plans/090-pij-rail-v2/workshops/002-jc2-orchestration-role.md` — role contract, Contract Ready.
5. `docs/plans/090-pij-rail-v2/workshops/003-jc3-question-text.md` — question-text contract, Contract Ready.
6. `scratch/pij-rail-mock.html` — what the human sees; explains *why* each field exists.

## The work items (pij side)

| # | Item | Contract | Size |
|---|---|---|---|
| 1 | `pij status "<did>" "<next>" [--state <word>]` — one-call PM status. Spine `kind:"status"` on the existing envelope; ≤280 chars each, writer refuses over-limit; `--state` = two events under ONE write lock, ruled order `state-set`→`status`, correlated by a `state-set:<seq>` ref; self-resolution required (`E-NOID` on asserted); node denorm `statusPrev/Next/At/Seq` for your watchdog; terse one-line confirmation | JC-1 (WS-001, Contract Ready) | Small — envelope fields exist |
| 2 | `orchestrationRole` — **store partial (`pm\|worker`), project total (`prime\|pm\|worker\|null`)** on list/tree/node-show; `RoleService` (PrimeService-shaped) + `link --role`; **`orchestrationRole: "cli"` row in `DESCRIPTOR_FIELD_OWNER` is mandatory** (incident-#1 class if omitted); `role-set` spine audit event; **no migration** — absence is the state, 6 primes project free; existing `Role`/`PIJ_ROLE` untouched | JC-2 (WS-002, Contract Ready) | Small-medium |
| 3 | `--note "<one line>"` on `state set` for blocked/question — same single call; descriptor denorm `stateNote:{text,state,at}` projected on `list` rows + `node show`; ≤200 chars, no newlines, refuse over-limit; **HAZARD-1: add `stateNote` to the stale-clearing destructure (`core/cli.ts:2789`)** or an answered question pins forever. Companion: project `semanticState` on `list` rows | JC-3 (WS-003, Contract Ready — 9 line-pinned changes in D9) | Small |
| 4 | Sweep-adopt: when a **prime** runs any pij command and unadopted seats exist in its repo/worktrees, notify the prime; prime adopts (`link --role` designates in the same call). **Orphans are never warned** (Jordan ruling 2026-07-29). Note: keys on `prime`, not JC-2 — ships in either order (WS-002 D7) | v2-enhancements §B2 | Medium (behavioral) |
| 5 | Watchdog: nudge iff `orchestrationRole === "pm"` (strict — unknown role is silence, the relay/20-nudge precedent); clock = `statusAt` denorm; nudge text carries the paste-ready one-call command (worked wording in WS-001) | JC-1+JC-2 | Small |
| 6 | Skill-route updates so PMs actually run `status` at start/stop and roles get declared at spawn/adopt/link — automation in the definition of done | — | Albatross's judgment |
| 7 | **Stretch, explicitly optional, correctly sized this time**: today NOT EVEN the pattern tag is persisted (in-memory latch + one notify; detection is boot-window-only, `lifecycle === "pending"`). D1 = persist the tag on the descriptor (`interstitial:{label,at,paneId}`); D2 = redacted pane excerpt. CG renders nothing for this path until D1 exists | JC-3 (WS-003 D6 tiering) | D1 small · D2 albatross sizes |

## Questions the workshops leave to you

From WS-001: **OQ-2** is the log `spine/events.ndjson` ever rotated/tier-migrated? (decides whether CG ever needs a denorm-backed backfill) · **OQ-4** verb name — `pij status` is free but `pij watchdog status` exists; `pij now` is the alternative; CG is indifferent · **OQ-7** may a non-PM write a status? (proposed: allow the write, nudge only PMs).
From WS-002: **Q-11** should `prime set/retire/unset` also append a spine event (role history will be on the spine, prime history won't)? · **Q-12** initial-role arg on spawn (via RoleService only) · **Q-13** human `P/O` column growing `M/w` · whether control-plane `adopt --parent` also grows `--role`.
From WS-003: **OPEN-1** does closing an assignment clear the `stateNote` denorm? (CG's supersede guard covers the render either way — a one-line answer) · **OPEN-4** is `--note` allowed on `hold`? (proposed: no — stops it becoming a per-worker status backdoor).

## Ratification protocol

- The three workshop docs are the proposed contracts. Albatross replies with **ratify / amend per item**; amendments are folded into the workshops (they are the single source — neither repo codes against anything else).
- Chainglass registers its consumed-field subsets (flow-json precedent, via meadowlark) once ratified.
- Absence semantics are part of each contract: chainglass renders designed absence states, never errors, for every field that hasn't shipped yet — so pij can land items in any order.

## Sequencing

- CG builds now in main behind fakes (plan 090, phase 1). Flipping a seam to the real read is designed to touch one module per contract.
- pij lands in its own order; each landed item lights up in the rail with no CG release coupling.
- The one hard ordering: **ratification before pij codes** — the 089 lesson (`folder` vs `cwd`; the half-shipped `HARNESS_PLAN_ID` design) is that unratified contracts ship mismatched halves.

## What we are NOT asking

- No new SSE/streaming surface — CG reads the spine and the CLI as today (read-only fence unchanged).
- No change to `Role`/`PIJ_ROLE` semantics, prime designation, adopt's identity model, or the badge derivation.
- No periodic status from workers or prime — PM-only, by ruling.
