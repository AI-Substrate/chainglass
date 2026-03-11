# Code Review: Phase 2: File Notes Web UI

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 2: File Notes Web UI
**Date**: 2026-03-09
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (Phase 2 uses Lightweight UI validation)

## A) Verdict

**REQUEST_CHANGES**

The phase has three unmitigated HIGH issues: filtered note counts produce incorrect UI totals, `_platform/sdk` owns a `file-notes` command registration, and the lightweight UI phase shipped without phase-specific validation evidence.

**Key failure areas**:
- **Implementation**: The overlay header and delete-all dialog derive totals from filtered note state, so counts become wrong as soon as a filter is applied.
- **Domain compliance**: `notes.toggleOverlay` was wired inside `_platform/sdk` instead of domain-owned SDK composition, and the domain artifacts still do not accurately describe the shipped Phase 2 surface.
- **Testing**: No phase-specific UI tests or concrete manual verification outputs were captured for the overlay, modal, reply, completion, or YEES delete flows.
- **Doctrine**: The feature barrel mixes server-only exports with client-safe UI exports, and the scoped files are not Biome-clean.

## B) Summary

The implementation largely follows the existing overlay pattern and the anti-reinvention check found no genuine duplication; the new components mostly reuse proven terminal/activity-log overlay structure appropriately. However, `useNotes()` currently computes header/delete totals from the filtered dataset, so the overlay reports incorrect counts when users filter by status or addressee. Domain compliance is mixed: file placement and contract-only imports look acceptable, but `_platform/sdk` now owns a `file-notes` command directly and the plan/domain-map/domain.md artifacts lag behind the actual Phase 2 composition. Testing evidence is the weakest area: there are no scoped UI tests and no concrete manual outputs, leaving overall coverage confidence at 39%.

## C) Checklist

**Testing Approach: Lightweight**

- [ ] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts:189-247` | correctness | `openCount` / `completeCount` are derived from filtered note results, so the overlay header and delete-all dialog show incorrect totals when a filter is active. | Keep filtered display state separate from unfiltered totals; fetch/store all-note counts independently and use those for header + bulk delete totals. |
| F002 | HIGH | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-bootstrap.ts:115-126` | dependency-direction | `_platform/sdk` directly registers `notes.toggleOverlay`, embedding business-domain behavior in infrastructure despite the existing `sdk-domain-registrations.ts` composition boundary. | Move notes registration into file-notes-owned SDK registration/composition and call it from app-level domain registration wiring. |
| F003 | HIGH | `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/execution.log.md:11-60` | testing | The lightweight UI phase has no phase-specific tests or concrete manual verification evidence for the overlay, modal, reply, completion, filter, or YEES delete flows. | Add targeted UI validation (Vitest/RTL or documented manual smoke checks) and capture actual outputs in `execution.log.md`. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts:24-67`<br/>`/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx:261-272` | scope | AC-25 calls for filtering by status, addressee, and link type, but the shipped filter surface only supports all/open/complete/to-human/to-agent. | Implement a link-type filter (file/workflow/agent-run) or explicitly defer/narrow the acceptance criteria and phase task text. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md:30-76` | domain-manifest | The plan's Domain Manifest does not account for `note-file-group.tsx` or the actual `_platform/sdk` touchpoint used by this phase. | Add authoritative file→domain rows for the shipped files or realign the implementation to the planned file set. |
| F006 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md:83-131` | domain-md | `file-notes/domain.md` records a Phase 2 SDK command in History but still marks `apps/web/src/features/071-file-notes/sdk/` as future and omits the actual integration point. | Update `file-notes/domain.md` so Source Location and History describe the real Phase 2 SDK composition. |
| F007 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md:42-156` | domain-map | `domain-map.md` and its health summary still describe a Phase 1-only `file-notes` surface and omit Phase 2 edges to panel-layout, workspace-url, events, and sdk. | Refresh the node label, health summary, and labeled dependency edges for the current Phase 2 surface. |
| F008 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/index.ts:20-43` | doctrine | The feature barrel exports Node-backed writer/reader functions alongside client hooks/components, blurring the server/client boundary for consumers. | Split server-only exports into a guarded server entrypoint (for example `index.server.ts`) and keep the main barrel client-safe. |
| F009 | MEDIUM | `/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts:88-120`<br/>`/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx:77-85` | doctrine | The scoped Phase 2 files are not Biome-clean: `use-notes.ts` uses forbidden non-null assertions and `bulk-delete-dialog.tsx` trips `noAutofocus`; multiple touched files also need import/format cleanup. | Remove the non-null assertions, replace `autoFocus` with explicit focus management, and rerun Biome on the phase file set. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 — Incorrect totals when filters are active**  
  `useNotes()` fetches filtered notes into `notes`, then computes `openCount`/`completeCount` from that filtered array. `NotesOverlayPanel` uses those derived values in the header and to size the delete-all confirmation, so filtering to `to-human` or `open` makes the totals lie about the full worktree state.  
  **Fix**: keep an unfiltered summary alongside filtered display data, or fetch aggregate counts separately.

- **F004 — Link-type filtering is missing from the shipped UI**  
  The hook only supports `all | open | complete | to-human | to-agent`, and the overlay select only renders those five options. That is materially narrower than AC-25 and the phase task text.  
  **Fix**: add `file/workflow/agent-run` filter support or explicitly defer the AC/task language.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New feature files live under `apps/web/src/features/071-file-notes/`; layout/sidebar/wrapper touches are expected cross-domain composition points. |
| Contract-only imports | ✅ | No cross-domain internal-file import violation was found in the scoped code review. |
| Dependency direction | ❌ | `_platform/sdk` now owns `notes.toggleOverlay` registration in `sdk-bootstrap.ts:115-126`, violating the documented app-level SDK composition boundary. |
| Domain.md updated | ❌ | `docs/domains/file-notes/domain.md` history mentions the Phase 2 SDK command, but Source Location still marks `sdk/` as future and omits the actual composition point. |
| Registry current | ✅ | `docs/domains/registry.md` already contains `file-notes`. |
| No orphan files | ❌ | `note-file-group.tsx` and the `_platform/sdk` touchpoint used by this phase are not represented in the plan's Domain Manifest. |
| Map nodes current | ❌ | The `file-notes` node label and health summary still describe a mostly Phase 1 surface. |
| Map edges current | ❌ | The map is missing labeled `file-notes` edges for panel-layout, workspace-url, events, and sdk. |
| No circular business deps | ✅ | No new circular business-domain dependency was identified. |
| Concepts documented | ✅ | `docs/domains/file-notes/domain.md` has a Concepts table and includes the Phase 2 user-facing concepts. |

Domain-compliance findings:
- **F002** — `_platform/sdk` owns `file-notes` command registration instead of app-level/domain-level composition.
- **F005** — Plan Domain Manifest is out of sync with the phase's actual file set.
- **F006** — `file-notes/domain.md` is internally inconsistent for the SDK integration.
- **F007** — `domain-map.md` is stale for the current Phase 2 `file-notes` surface.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Notes overlay provider/panel | Overlay provider/panel pattern already exists in terminal/activity-log (deliberate reuse, not duplication) | `terminal`, `activity-log` | Proceed |
| Note modal / note card / file grouping UI | None | — | Proceed |
| NoteIndicatorDot | None | — | Proceed |

No genuine cross-domain duplication was found.

### E.4) Testing & Evidence

**Coverage confidence**: 39%

Violations:
- **F003 (HIGH)** — No phase-specific UI validation or concrete outputs were recorded.
- **MEDIUM** — The execution log is narrative only; it contains no command output, screenshots, or observed browser results.
- **MEDIUM** — AC-25 only has partial implementation/evidence because link-type filtering is not present.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-15 | 25% | `sdk-bootstrap.ts` adds a toggle shortcut and `note-modal.tsx` enables modal-based note creation, but no direct add-note keyboard shortcut or verified keyboard-path outcome was captured. |
| AC-16 | 45% | `note-modal.tsx` shows an optional line number input and writes `targetMeta.line`, but there is no test or manual proof of saved line-targeted notes. |
| AC-17 | 45% | `note-modal.tsx` implements Anyone/Human/Agent selection and persists `to`, but no verification output shows the value round-tripping. |
| AC-18 | 50% | `note-card.tsx` renders author, relative time, addressee, and line reference, but only static implementation evidence exists. |
| AC-19 | 40% | `note-card.tsx` and `notes-overlay-panel.tsx` wire completion through `completeNote`, but there is no concrete flow verification. |
| AC-20 | 40% | `use-notes.ts` implements thread grouping and `note-file-group.tsx` renders replies, but no reply scenario is tested or documented. |
| AC-21 | 25% | `note-indicator-dot.tsx` exists, but FileTree wiring is explicitly deferred to Phase 7. |
| AC-23 | 45% | Sidebar button, provider listener, wrapper, and layout mount exist, but no browser evidence confirms the Notes button opens the overlay. |
| AC-24 | 40% | `note-card.tsx` closes the overlay and navigates with `workspaceHref`, but no observed navigation result is recorded. |
| AC-25 | 15% | Only status/addressee filters ship; link-type filtering is absent and unverified. |
| AC-26 | 55% | `bulk-delete-dialog.tsx` enforces `YEES` and disables deletion until confirmed, but there is no interaction test or manual result. |

### E.5) Doctrine Compliance

- **F008 — Mixed server/client barrel surface**  
  `apps/web/src/features/071-file-notes/index.ts` exports `appendNote`, `editNote`, `readNotes`, and `listFilesWithNotes` beside client hooks/components. That makes it too easy for client-side callers to reach server-only filesystem code through the default feature barrel.  
  **Fix**: separate server-only exports into a dedicated guarded entrypoint.

- **F009 — Phase file set is not Biome-clean**  
  `pnpm exec biome check ...` fails on the phase file set. The concrete violations include forbidden non-null assertions in `use-notes.ts`, `noAutofocus` in `bulk-delete-dialog.tsx`, and import/format cleanup in several touched files.  
  **Fix**: address the lint violations and rerun Biome/quality gates on the scoped files.

### E.6) Harness Live Validation

N/A — no harness configured. `docs/project-rules/harness.md` is absent, and the plan/execution log both state that harness validation is not applicable for this phase.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-15 | Users can add a markdown note to any file via keyboard shortcut | Modal creation exists and a toggle shortcut exists, but no verified add-note keyboard flow was recorded. | 25% |
| AC-16 | Notes can optionally target a specific line number | `note-modal.tsx` includes line input and persists `targetMeta.line`; no runtime proof captured. | 45% |
| AC-17 | Notes can optionally be addressed to human or agent | `note-modal.tsx` implements addressee pills and persists `to`; no proof of saved output. | 45% |
| AC-18 | Notes display author, time, addressee, and line reference | `note-card.tsx` renders these fields; no browser/test evidence captured. | 50% |
| AC-19 | Notes can be marked as complete | Completion action is wired through server action + refresh path; no observed end-to-end outcome recorded. | 40% |
| AC-20 | Notes support replies (flat threading) | Thread grouping exists in `use-notes.ts` and replies render in `note-file-group.tsx`; no verified reply scenario exists. | 40% |
| AC-21 | File tree shows indicator dot next to files with open notes | `NoteIndicatorDot` exists, but integration is deferred to Phase 7. | 25% |
| AC-23 | Notes button in sidebar opens notes overlay | Sidebar button, provider listener, wrapper, and layout mount exist; no browser/manual proof captured. | 45% |
| AC-24 | Notes have a Go to link that navigates to file/line | `note-card.tsx` closes overlay and navigates with `workspaceHref`; no observed navigation proof. | 40% |
| AC-25 | Notes overlay filters by status, addressee, and link type | Status/addressee filters ship, but link-type filter is missing and unverified. | 15% |
| AC-26 | Bulk deletion is guarded by `YEES` confirmation | Dialog enforces `YEES` before enabling delete; no interaction evidence beyond static code. | 55% |

**Overall coverage confidence**: 39%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---STATUS---\n' && git --no-pager status --short && printf '\n---LOG---\n' && git --no-pager log --oneline -10

python - <<'PY'
# Built /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/reviews/_computed.diff from the 13 Phase 2 paths using:
# - `git diff -- <path>` for tracked files
# - `git diff --no-index -- /dev/null <path>` for created files
PY

pnpm exec biome check apps/web/src/features/071-file-notes/hooks/use-notes.ts apps/web/src/features/071-file-notes/hooks/use-notes-overlay.tsx apps/web/src/features/071-file-notes/components/note-card.tsx apps/web/src/features/071-file-notes/components/note-file-group.tsx apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx apps/web/src/features/071-file-notes/components/note-modal.tsx apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx apps/web/src/features/071-file-notes/components/note-indicator-dot.tsx apps/web/app/'(dashboard)'/workspaces/'[slug]'/notes-overlay-wrapper.tsx apps/web/app/'(dashboard)'/workspaces/'[slug]'/layout.tsx apps/web/src/components/dashboard-sidebar.tsx apps/web/src/lib/sdk/sdk-bootstrap.ts apps/web/src/features/071-file-notes/index.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md
**Spec**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-spec.md
**Phase**: Phase 2: File Notes Web UI
**Tasks dossier**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/tasks.md
**Execution log**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/execution.log.md
**Review file**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/reviews/review.phase-2-file-notes-web-ui.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts | Created | file-notes | Fix filtered-count bug, add/clarify link-type filtering, remove non-null assertions |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes-overlay.tsx | Created | file-notes | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/note-card.tsx | Created | file-notes | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/note-file-group.tsx | Created | file-notes | Align plan Domain Manifest entry |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx | Created | file-notes | Add link-type filter support and consume corrected totals |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/note-modal.tsx | Created | file-notes | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx | Created | file-notes | Replace `autoFocus` and rerun Biome |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/note-indicator-dot.tsx | Created | file-notes | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/notes-overlay-wrapper.tsx | Created | cross-domain | Rerun Biome formatting |
| /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Modified | cross-domain | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/components/dashboard-sidebar.tsx | Modified | _platform/panel-layout | No blocking issue found |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-bootstrap.ts | Modified | _platform/sdk | Move notes command registration out of infrastructure bootstrap |
| /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/index.ts | Created | file-notes | Split client-safe exports from server-only exports |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts | Separate unfiltered totals from filtered display state | Header totals and delete-all count are wrong when filters are active |
| 2 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-bootstrap.ts | Move `notes.toggleOverlay` registration to domain/app-level SDK composition | `_platform/sdk` should not own business-domain registrations |
| 3 | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-2-file-notes-web-ui/execution.log.md | Record concrete test/manual evidence and add scoped UI validation | Current lightweight phase has no independently reviewable verification |
| 4 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts<br/>/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx | Implement link-type filtering or narrow the phase/spec text | AC-25 is only partially implemented |
| 5 | /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md<br/>/Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md<br/>/Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Align domain artifacts with the actual Phase 2 surface | Domain Manifest, domain.md, and domain-map are stale/inconsistent |
| 6 | /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/index.ts<br/>/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/hooks/use-notes.ts<br/>/Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx | Split server/client barrel surface and clear Biome violations | Current barrel blurs boundaries and the phase file set does not pass Biome |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md | Domain Manifest rows for `note-file-group.tsx` and the actual SDK integration touchpoint |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md | Accurate Source Location / SDK composition details for Phase 2 |
| /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md | Phase 2 `file-notes` node label, health summary, and labeled edges to panel-layout, workspace-url, events, and sdk |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase "Phase 2: File Notes Web UI"
