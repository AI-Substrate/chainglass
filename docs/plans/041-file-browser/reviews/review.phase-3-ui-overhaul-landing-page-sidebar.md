# Review: Phase 3 — UI Overhaul — Landing Page & Sidebar

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode resolved: **Full** (spec declares `Mode: Full`).
- Testing strategy resolved: **Full TDD**, mock policy **No mocks (fakes only)**.
- Diff range reviewed: `0f9dc82..40bf074` (Phase 3 implementation + plan completion marker).
- Graph integrity is **BROKEN** (critical plan↔dossier/footnote traceability gaps).
- Cross-phase regression check: `just fft` passes (no prior-phase test regressions observed).
- Multiple high-severity doctrine/task compliance issues remain (details below).

## C) Checklist
**Testing Approach: Full TDD**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence complete per task)
- [ ] Tests as docs (assertions + required Test Doc format consistently applied)
- [ ] Mock usage matches spec: Avoid/No mocks
- [ ] Negative/edge cases covered for all critical paths
- [ ] BridgeContext patterns followed (N/A to this phase’s Next.js UI scope)
- [ ] Only in-scope files changed (or explicitly justified neighbor edits)
- [x] Linters/type checks are clean (`just fft`)
- [x] Absolute paths used in review artifacts and commands

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | `docs/plans/041-file-browser/file-browser-plan.md:326-343` | Plan Phase 3 task table remains unchecked (`[ ]`) with `Log: -` while dossier marks tasks complete | Sync plan table statuses/log links with dossier via `plan-6a-update-progress` |
| V2 | CRITICAL | `.../tasks/phase-3-ui-overhaul-landing-page-sidebar/tasks.md:298-304` | Phase Footnote Stubs table is empty | Populate stubs and wire to plan ledger |
| V3 | CRITICAL | `docs/plans/041-file-browser/file-browser-plan.md:567-590` | Change Footnotes Ledger has no Phase 3 entries for diff-touched files | Add Phase 3 footnotes and node-ID provenance entries |
| V4 | HIGH | `.../tasks/phase-3.../tasks.md:199-214` | Completed tasks lack per-task log anchors/footnote refs in Notes | Add `log#...` + `[^N]` refs for all completed tasks |
| D1 | HIGH | `test/unit/web/components/dashboard-sidebar.test.tsx`, `test/unit/web/components/navigation/bottom-tab-bar.test.tsx`, `test/integration/web/dashboard-navigation.test.tsx` | Modified tests rely on `vi.mock(...)` despite phase policy “No mocks. Fakes only.” | Replace mocks with fake/test harness patterns or explicitly log policy deviation |
| D2 | HIGH | `.../tasks/phase-3.../execution.log.md` | RED/GREEN/REFACTOR evidence is inconsistent; no explicit refactor section per task | Add explicit cycle evidence per completed task |
| P1 | HIGH | `apps/web/src/components/dashboard-sidebar.tsx:55-58` | Sidebar header shows slug text, not workspace emoji + name as required by phase task objective | Render workspace identity (emoji + display name) from workspace data |
| P2 | HIGH | `apps/web/src/features/041-file-browser/hooks/use-attention-title.ts` + usage scan | Hook implemented but not wired into page(s); dynamic title deliverable incomplete | Integrate hook into workspace-scoped pages with real workspace identity |
| P3 | MEDIUM | `apps/web/src/features/041-file-browser/components/worktree-picker.tsx` | Keyboard nav/recently-used behavior from phase criteria not implemented | Add keyboard handlers + recent section, then test |
| P4 | MEDIUM | `apps/web/app/actions/workspace-actions.ts:415-432` | `toggleWorkspaceStar` swallows invalid slug/update failures (silent return/catch-only logging) | Return actionable form state or surface failure path consistently |

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis
- Prior phase execution evidence indicates regression gate should include full suite and key URL/state tests.
- Re-run result in current state: `just fft` **PASS**.
- Tests rerun: full suite (293 files), failures: 0.
- Contracts broken: 0 observed.
- Backward compatibility: no direct breakage detected for Phase 1/2 deliverables.

### E.1) Doctrine & Testing Compliance
**Graph integrity verdict: ❌ BROKEN**

Link validation summary:
- **Task↔Log**: incomplete (tasks table missing log anchors).
- **Task↔Footnote**: broken (no task footnotes, no phase stubs entries).
- **Footnote↔File**: broken (ledger missing Phase 3 file coverage).
- **Plan↔Dossier sync**: broken (plan status/log columns unsynced).
- **Parent↔Subtask**: no blocking issue found for this phase.

Authority conflicts (Plan §12 is primary):
- Plan ledger lacks Phase 3 entries while dossier implies completed implementation.
- Resolution: update plan ledger first, then sync dossier stubs/notes to match.

Testing doctrine observations:
- Full TDD policy declared; cycle documentation is partial.
- Mock policy mismatch in modified navigation tests (uses `vi.mock`).
- Test Doc consistency is uneven across newly added tests.

Coverage confidence (AC mapping for this phase): **44% (HIGH risk)**
- Strong: card/fleet basic rendering, mobile nav baseline.
- Weak/missing: AC-4 inline add flow, AC-6 amber attention border behavior, AC-11 persistence evidence, full AC-14 integration, AC-9 full picker behavior.

### E.2) Semantic Analysis
- **HIGH**: Phase objective for workspace-scoped visual identity in sidebar is not fully met (slug text shown, identity rendering incomplete).
- **HIGH**: Dynamic tab-title behavior was implemented as hook but not wired to user-facing flows.
- **MEDIUM**: Worktree picker implementation omits parts of promised behavior (keyboard + recent section).

### E.3) Quality & Safety Analysis
Safety score: **-120/100** (CRITICAL: 3, HIGH: 5, MEDIUM: 2, LOW: 0)  
Verdict: **REQUEST_CHANGES**

- Correctness: missing objective wiring (sidebar identity, title integration).
- Security: no new critical vulnerability identified in reviewed diff.
- Performance: no major regression observed; current picker remains bounded/scrollable.
- Observability: mutation action hides failure context from UI path.

### E.4) Doctrine Evolution Recommendations (Advisory)
- **Rules update candidate (MEDIUM)**: clarify allowed exceptions to “no mocks” for Next.js navigation hooks in UI unit tests.
- **Rule/process update candidate (HIGH)**: require plan↔dossier↔ledger sync as merge gate artifact.
- **Idiom candidate (LOW)**: standardize workspace identity rendering helper shared by card/sidebar/title.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-1 | `workspace-card.test.tsx`, landing page implementation | 75% |
| AC-2 | Workspace card link assertion | 75% |
| AC-3 | `fleet-status-bar.test.tsx` | 100% |
| AC-4 | No inline add form; link-only “Add workspace” | 0% |
| AC-5 | Star toggle exists; sort behavior minimally inferred | 50% |
| AC-6 | Attention indicator partial; amber border behavior not proven | 25% |
| AC-7 | Sidebar restructure present; emoji+name header incomplete | 50% |
| AC-8 | Dev section present in sidebar tests | 75% |
| AC-9 | Filter/starred implemented; keyboard+recent incomplete | 50% |
| AC-10 | OnSelect callback tested; URL deep-link integration not directly proven | 50% |
| AC-11 | Persistence in cookie not evidenced in phase tests/log | 0% |
| AC-14 | Hook unit-tested; integration not demonstrated | 50% |
| AC-35..39 | Partial mobile/tab tests; full breakpoint verification not fully evidenced | 50% |

Overall coverage confidence: **44%**

## G) Commands Executed
```bash
git --no-pager status --short
git --no-pager log --oneline --decorate -n 25
git --no-pager diff --name-status 0f9dc82..40bf074
git --no-pager diff --unified=3 --no-color 0f9dc82..40bf074 > /tmp/phase3.diff
grep '^diff --git ' /tmp/phase3.diff
git --no-pager diff --unified=2 --no-color 0f9dc82..40bf074 -- apps/web/src/components/dashboard-sidebar.tsx
git --no-pager diff --unified=2 --no-color 0f9dc82..40bf074 -- apps/web/src/components/navigation/bottom-tab-bar.tsx
git --no-pager diff --unified=2 --no-color 0f9dc82..40bf074 -- apps/web/app/actions/workspace-actions.ts
just fft
```

## H) Decision & Next Steps
- Decision: **REQUEST_CHANGES**.
- Approval authority after fixes: reviewer rerun of `plan-7-code-review` for Phase 3.
- Next action: apply `fix-tasks.phase-3-ui-overhaul-landing-page-sidebar.md`, then rerun review.

## I) Footnotes Audit
| Diff-touched path | Task footnote tag(s) in dossier | Plan ledger node-ID entry |
|---|---|---|
| `apps/web/app/(dashboard)/page.tsx` | Missing | Missing |
| `apps/web/app/actions/workspace-actions.ts` | Missing | Missing |
| `apps/web/src/components/dashboard-sidebar.tsx` | Missing | Missing |
| `apps/web/src/components/navigation/bottom-tab-bar.tsx` | Missing | Missing |
| `apps/web/src/lib/navigation-utils.ts` | Missing | Missing |
| `apps/web/src/features/041-file-browser/components/workspace-card.tsx` | Missing | Missing |
| `apps/web/src/features/041-file-browser/components/fleet-status-bar.tsx` | Missing | Missing |
| `apps/web/src/features/041-file-browser/components/worktree-picker.tsx` | Missing | Missing |
| `apps/web/src/features/041-file-browser/hooks/use-attention-title.ts` | Missing | Missing |
| `apps/web/src/features/041-file-browser/index.ts` | Missing | Missing |
| Phase 3 test files (all touched) | Missing | Missing |
