# Validation Record — first-class-pij-plan.md

**Validated**: 2026-07-26 · **Validator**: validate-v2 (adaptive: lead + deterministic + 1 critic) · **Plan version validated**: 1.0.0 → fixes applied → **1.1.0**
**Verdict**: ✅ VALIDATED WITH FIXES

## Contract
Purpose: build contract for a read-only pij/flow observatory. Promise: an implementor builds v1 without re-deriving ruled constraints; nothing violates read-only/fences. Proof target: Contract. Upstream: research-dossier.md + two ruled consumer contracts (pij, flow). Consumers: tasks/implement stages; stream prime verification.

## Deterministic proof (fresh, lead-read)
- Symbol refs real: `MAX_CHANNELS` (mux route), `broadcast` (sse-manager), instrumentation global-flag idiom (13 refs), workspace types, ADRs 0009/0010/0011/0015, domains registry + map. 
- Counts match claims: 25 tasks, 12 ACs, coverage map task ids all exist.
- Flow coverage figures (3/85, states of 085/086/088) verified live earlier this session.
- G1–G7 consumed from the plan's own matrix, not re-derived.

## Findings (all survived disprove; all fixed in 1.1.0)

| Sev | Finding | Fix applied |
|---|---|---|
| HIGH | 4.4 window-focus needs a server mutating route absent from the Domain Manifest; "provably reachable only from click" untestable as written | `/api/pij/focus` added to manifest as **the one mutating route**; 4.4 criteria restated as testable (route-level workspace/liveness validation + call-site audits) |
| HIGH | `pij` channel vocabulary claimed as owned contract but no task delivers/types/tests it — P2 unbuildable against P1 without inventing the event contract | 1.7 now delivers `PijChannelEvent` union first (fleet-delta full rows, flow-delta, poller-status) with serialization tests; type-check criterion on every broadcast |
| MED | Workspace/global acquisition model unspecified; 1.4's 179± smoke contradicted repo-scoping assumption | 1.7 states the model: ONE global `pij list` per slow tick, server-side `folder` filter (F-13); `cwd` only for repo-scoped `tree` |
| MED | Snapshot-vs-delta race unhandled (silent stale-or-overwrite — the plan's own "confident lie" class) | seq stamped on snapshots (1.8) and deltas (1.7); 2.1 mandates subscribe-before-fetch + buffer + drop ≤ snapshot seq, with a race test |
| MED | Phase 1 not startable from the folder alone: field-level schemas in external scratch docs; 1.2 blocked on an out-of-band fixture handoff | Required-inputs list added to Phase 1; external contract docs snapshotted into `references/`; 1.2 fallback: kitchen-sink sufficient, lab flow additive |

## Reverification
Each fix re-read against its finding; all five claims no longer hold against 1.1.0. Gate Matrix unchanged (7 PASS — findings were validator-level, not gate failures).

**Thesis**: advanced — contract-level plan, proof obligations now include the channel contract, consistency seq, and the single-mutating-route fence.
**Consumers**: tasks/implement can start Phase 1 from the plan folder + named inputs. 
**Open decision**: none (tree-viz + panel density are scheduled Jordan checkpoints inside P4, by design).
