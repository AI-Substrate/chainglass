# Validation Record — Phase 2 tasks dossier

**Target**: `docs/plans/089-first-class-pij/tasks/phase-2-workspace-fleet-repo-tree-page/tasks.md`
**Date**: 2026-07-26 · **Mode**: broad-ish (lead + 2 opus critics per Jordan's order) · **Verdict**: ✅ **VALIDATED WITH FIXES**

## Contract
- **Purpose/Promise**: a coder following only this dossier + referenced files produces Phase 2 (plan tasks 2.1–2.5, ACs 03/04/05-repo/08/09, C-02/03/05/08/10) without clarification.
- **Proof target**: Contract. **Upstream**: plan v1.1.0 § Phase 2 + Coverage Map. **Consumers**: implementing coder (nigel), cross-model reviewer (terra).

## Findings (all verified by lead against source, all fixed in-target)

| Sev | Finding | Evidence | Fix applied |
|---|---|---|---|
| CRITICAL | Deltas are global, snapshots scoped — verbatim T002 accretes ~178 foreign rows on first delta | `pij-poller.service.ts` emit sites broadcast global diff; `snapshot()` filters | T002: client-side containment filter on delta rows + foreign-row RED test; § B warning; F-13 line corrected |
| HIGH | Flow chips had no data path (`flow-delta` never fires in P2 — `refreshFlows` has zero production callers; `/api/pij/flow` unlisted, unowned) | grep + route header "Phase 3 adds the watcher"; POC source: chips were `mock:true`, "real join lands in P2" | T002 owns `/api/pij/flow` snapshot; T003 gains a server-side labelled seat→flow join (rung 1 = seat-side linkage field verified live, rung 2 = `via:'none'` → ratified "⛭ no flow" fallback); name-similarity joins forbidden |
| HIGH | `workspace` param is an absolute PATH, not the slug — slug returns silently plausible wrong data | `join.ts` `relative(resolve(...))`; tree route uses it as CLI `cwd` | § B warning; T001 Done When: path from `WorkspaceProvider`, never rebuilt from slug |
| HIGH | Fleet grouping's tree fetch had no owner; no placement rule for live rows absent from tree | T003 said tree-only grouping; only T006 fetched tree (for its own tab) | T002 owns tree acquisition + refetch cadence; T003: unknown rows render under "Outside any prime" until refetch |
| HIGH | "hot + idle < 2 days" undefined — unverifiable, and naive reading hides seats with absent `lastEventAt` | `FleetRow` has no tier field; no server idle filter | T003 Done When: `lastEventAt` within 48h; absent → SHOWN; hot-tier `pij list` assumption verified live + logged |
| HIGH | Trichotomy discriminator used `fleetSize`, which is the GLOBAL count — "no seats here" unreachable live | `status()` returns unscoped `this.fleet.size` | T004: `rows.length === 0 && running && !lastError`; test with `rows: []` + `fleetSize: 178` |
| MEDIUM | Role-chip narrowing (Prime/PM/Worker vs plan 2.1's five) flagged only in prose a reviewer won't read | plan:250 vs no `role` field in `FleetRow`/`PijTreeNode` | Encoded in T003 Done When as explicit flagged deviation pending Jordan's ack |
| MEDIUM | AC-01 (assigned to 2.1 by Coverage Map) absent from dossier | plan:292 | T007: headless half run + logged; browser half (≤10s, ≤3s, one EventSource) written as probe for PM/Jordan at review |
| MEDIUM | `useChannelEvents` API misdescribed — accumulating array, flat envelope type, no callback | `use-channel-events.ts:41-65` | T002 Notes: applied-index ref or `useChannelCallback`; envelope type stated |
| MEDIUM | `FleetRow` field list silently omitted 6 real fields; stale line refs | specialist source check | § B list completed; line refs corrected (layout L34, nav-utils L50) |

## Reverification
Fixes are in-target document edits uniquely determined by cited source; the specialist's independent source-quotes are the reverification basis (specialist also ran `npx tsc -p tsconfig.test.json --noEmit` → exit 0). Clean-verified claims: `types.ts` shapes exact, route auth/error order, fakes + test infra, sibling page pattern.

**Thesis**: advanced — the dossier now encodes the four traps (global deltas, path-not-slug, global `fleetSize`, phantom `flow-delta`) that would each have cost the coder their first hour or shipped a silently-wrong page.
**Consumers**: 2/2 named consumers satisfied (coder contract actionable; reviewer has verifiable Done When columns).
**Open decision (non-blocking)**: role chips ship as Prime/PM/Worker — deviation from plan 2.1's five-chip vocabulary awaiting Jordan's ack; upgrade is additive when pij exposes `role`. (Roadrunner ratified the three-chip call post-validation.)

## Addendum — roadrunner rulings (post-validation, applied to dossier)
1. The CRITICAL's client-side containment is a **designed consequence of the one-shared-channel ruling**, not a workaround — recorded in § B so nobody later "fixes" it by splitting channels.
2. A client-side filter creates a fourth empty state ("filter dropped everything"): T004 upgraded from trichotomy to four distinguishable states, with a `rows:[] + fleetSize:178` test and an elsewhere-count rendering so scope-key mismatches are human-diagnosable.
