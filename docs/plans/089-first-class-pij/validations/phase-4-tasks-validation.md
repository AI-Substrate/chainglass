# Validation Record — Phase 4 tasks dossier

**Target**: `docs/plans/089-first-class-pij/tasks/phase-4-global-tree-overlay-focus/tasks.md`
**Date**: 2026-07-26 · **Mode**: lead + 2 opus critics (standing order) · **Verdict**: ✅ **VALIDATED WITH FIXES**

## Contract
- **Purpose/Promise**: a coder following only this dossier + referenced files produces Phase 4 (plan 4.1–4.5, AC-05 global/AC-10/AC-12, C-02/C-03/C-06) without clarification, honoring the mid-phase Jordan spike checkpoint.
- **Proof target**: Contract. **Upstream**: plan v1.1.0 § Phase 4 + Coverage Map. **Consumers**: coder (nigel), cross-model reviewer (terra), and Jordan at the spike gate.

## Findings (verified by lead, fixed in-target)

| Sev | Finding | Evidence | Fix applied |
|---|---|---|---|
| CRITICAL | Focus containment specified against `detail.folder` — `node show` has NO `folder` key (working dir arrives as `cwd`); `PijNodeDetail` types none of `cwd`/`liveness`/`lastEventAt`, so the wrong read types as `unknown` with no TS error and a fake inventing `folder` green-tests it | live full key list (both critics independently); interface bare-casts | T004 + Gotcha C.1: containment on `cwd`; typed additive fields mandated; fixtures must mirror the REAL key set |
| HIGH | Liveness rung in undefined vocabulary + three 409s sharing one status with no wording — display-doctrine regression on the one mutating route | "daemon-tick-fresh" named no field/threshold anywhere | T004: `focusReason` union with machine `reason` + exact observation wording per state; `not-live` = `liveness !== 'active'`; absent liveness → its own wording, never inferred |
| HIGH | AC-12's "state survives route changes within the workspace" clause untested — completable-yet-unmet | plan:115 wording vs T003 Done When | T003: survives-navigation test; state pinned to the always-mounted provider |
| MEDIUM-HIGH | `--badge` targeted at the poller, which has no argv (`records.list()` bare — argv lives at `pij-records.ts:124`) | quoted source | Pre-Impl row + T002b retargeted with the contract note (every `list()` now requests badges, +0.2s accepted) |
| MEDIUM | Badge null-with-flag leg untestable — live: 181/181 string with flag, 0 null; absent/null collapse in `toFleetRow` anyway | live measurement | T002b reduced to the two observed states |
| MEDIUM | Sidebar-edit count self-contradiction + NO top-level nav slot exists for `/pij` | sidebar renders only WorkspaceNav + Dev group | Recon + T005: exactly two additive elements (T003 button, T005 entry in a new `SidebarGroup` above Dev, const in navigation-utils) |
| MEDIUM | AC-05's Jordan-ruled phase-position-chip clause silently dropped from the last phase | plan:108 second sentence; no flow source on the global page + join rung dormant | T005/T007/Goals: recorded deliberate absence (the clause's own "absent, not faked" wording sanctions it), closes honestly, lights up additively with dove's plan-id flag |
| MEDIUM-LOW | "All four F-14 siblings identical" false — question-popper lacks `isOpeningRef`/`zIndex:44`/anchor | quoted per-file | Recon: copy the pr-view trio line-by-line; question-popper flagged as the outlier |
| LOW | Key list missed `$mod+Shift+KeyU`; "~181 live seats" overstates (~50 active) | `041-file-browser/sdk/contribution.ts:225`; liveness histogram | List completed (`$mod+Shift+KeyF` still verified free); "rows" wording pinned |

## Verified clean (load-bearing subset)
`(dashboard)/pij/page.tsx` placement valid, genuinely outside the SSE provider (snapshot-only forced); `pij tree --global --json` works live; the C-02 carve-out claim CORRECT (`fence.test.ts:411` sweep would trip `select-window` in the focus route; `execFile` exempt via lookbehind; both exclusion precedents real); T001-gates-T005-only holds; ADR-0009 shapes + `registerAllDomains` exact; `nodeExecFileExecutor` seam as described.

**Thesis**: advanced — the validation caught a silent-wrong-answer containment check on the security-relevant route, an unverifiable AC clause, and a mistargeted adoption, before a line was written.
**Consumers**: 3/3 (coder actionable; reviewer has the focusReason contract to check verbatim; Jordan's gate protocol unambiguous).
**Open decisions**: none new (role-chip ack + restart-gated probes ride from P2/P3).
