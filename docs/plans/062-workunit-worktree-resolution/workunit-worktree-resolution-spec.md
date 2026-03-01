# Work Unit Worktree Resolution

**Mode**: Simple
**Plan**: 062-workunit-worktree-resolution
**Created**: 2026-03-01

📚 This specification incorporates findings from `research-dossier.md` and Workshop `058/006-workunit-worktree-resolution.md`.

---

## Research Context

Research dossier (23 findings) and Workshop 006 provide the complete design. Key findings:

- `workunit-actions.ts` hardcodes `worktreePath: info.path` — always resolves to the main workspace, ignoring git worktrees
- Every other worktree-aware feature (workflows, file browser, samples) correctly threads `?worktree=` through URLs
- The navigation sidebar already preserves `?worktree=` via `workspaceHref()` — no nav changes needed
- The "Edit Template" round-trip from workflows already passes `?worktree=` in the URL — the editor page just doesn't use it for data loading
- Zero server action tests exist for worktree resolution across the codebase

---

## Summary

Work unit pages read from and write to the main workspace path regardless of which git worktree the user is working in. When a developer is on a worktree branch (e.g., `058-workunit-editor`), their work units are invisible in the web UI and any edits are saved to the wrong directory. This plan threads worktree context through the work unit feature, following the established pattern used by workflows, file browser, and samples.

---

## Goals

- **Worktree-correct data operations**: Work unit list, load, create, update, delete, rename, and save operations all target the active worktree's `.chainglass/units/` directory
- **Worktree required**: URLs without `?worktree=` must not silently fall back to the main workspace. Work unit pages should redirect to the worktree selection or show an error — silent fallback is how this bug went unnoticed. This is a deliberate divergence from the workflow pattern which falls back silently.
- **Pattern consistency**: Work units follow the same three-layer worktree resolution pattern (page → action → component) used by workflows and other features, except for the fallback behavior above
- **Edit Template round-trip preserved**: Navigating from a workflow to the unit editor and back maintains the correct worktree context throughout
- **Doping script visibility**: After the fix, `just dope` (run from a worktree) creates units visible in the web UI when `?worktree=` points to that worktree

---

## Non-Goals

- **Consolidating resolver functions**: There are 2 duplicated `resolveWorkspaceContext` helpers across action files. Consolidation is deferred (tracked as ARCH-001) — this plan only fixes the broken one.
- **Fixing other worktree-unaware features**: Agents pages (PRE-003), file-actions validation (PRE-001), API route validation (PRE-002) are pre-existing issues on separate tracks.
- **Adding worktree picker UI to work-unit pages**: The sidebar nav already handles worktree selection. No new picker needed.
- **Modifying `IWorkUnitService`**: The service layer already accepts `WorkspaceContext` with `worktreePath`. No service changes needed.
- **Modifying the file watcher or SSE notifications**: Already worktree-scoped. No changes needed.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `058-workunit-editor` | existing | **modify** | Fix server action resolver; thread worktree through pages and components |
| `_platform/positional-graph` | existing | **consume** | `IWorkUnitService` already accepts worktree-aware `WorkspaceContext` (no changes) |
| `_platform/workspace-url` | existing | **consume** | `workspaceHref()` already preserves `?worktree=` in nav links (no changes) |

No new domains needed.

---

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=1
  - **S=1** (Surface Area): ~9 files across actions, pages, and components — all within one domain
  - **I=0** (Integration): Internal only, no external dependencies
  - **D=0** (Data/State): No schema changes; `WorkspaceContext` already has `worktreePath` field
  - **N=0** (Novelty): Well-specified — Workshop 006 provides exact code patterns to follow
  - **F=0** (Non-Functional): Standard security (worktree validated against known worktrees list)
  - **T=1** (Testing): Lightweight unit tests for resolver + manual Playwright verification
- **Confidence**: 0.95
- **Assumptions**:
  - The workflow-actions.ts pattern (inline `info.worktrees.find()`) is the correct approach for validation
  - Navigation sidebar `workspaceHref()` already appends `?worktree=` to work-unit links, so missing param means a direct/stale URL
  - Silent fallback to main workspace is a bug, not a feature — if `?worktree=` is missing, the page should not proceed with data operations
- **Dependencies**: None (all infrastructure in place)
- **Risks**: Low — mechanical prop-threading following a proven pattern
- **Phases**: Single implementation phase

---

## Acceptance Criteria

1. **AC-01**: Navigating to `/workspaces/{slug}/work-units?worktree={path}` lists units from the specified worktree's `.chainglass/units/` directory
2. **AC-02**: Navigating to `/workspaces/{slug}/work-units/{unitSlug}?worktree={path}` loads unit content from the specified worktree
3. **AC-03**: Editing a unit (content, metadata, inputs, outputs) saves to the specified worktree, not the main workspace
4. **AC-04**: Creating a new unit via the creation modal scaffolds in the specified worktree
5. **AC-05**: Deleting or renaming a unit operates on the specified worktree
6. **AC-06**: Links within the work-unit list and editor sidebar preserve `?worktree=` when navigating between units
7. **AC-07**: Missing `?worktree=` parameter redirects or shows an error — does NOT silently fall back to main workspace
8. **AC-08**: The "Edit Template" round-trip from workflow → editor → workflow preserves worktree context for data operations (not just the return link)
9. **AC-09**: `just fft` passes after all changes
10. **AC-10**: Unit tests verify the fixed `resolveWorkspaceContext` function validates worktree against `info.worktrees[]`

---

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Save callback `useCallback` deps arrays miss `worktreePath` | Low | Medium | Code review checklist item; include in all deps arrays |
| UnitCreationModal redirect after create doesn't include `?worktree=` | Low | Medium | Verify redirect URL includes param in test |
| Worktree path URL encoding issues | Low | Low | Always use `encodeURIComponent()`; `searchParams` auto-decodes |

**Assumptions**:
- `info.worktrees[]` always includes the active worktree (guaranteed by `git worktree list --porcelain`)
- The `?worktree=` parameter is always an absolute filesystem path
- No CORS or security changes needed — worktree paths are validated against a trusted list from `getInfo()`

---

## Open Questions

None — all questions were resolved in Workshop 006 and the research dossier.

---

## Workshop Opportunities

None — Workshop 006 (`058/workshops/006-workunit-worktree-resolution.md`) already provides the complete design with exact code patterns for all 9 file changes. No further workshops needed.

---

## Testing Strategy

- **Approach**: Hybrid — TDD for resolver function, lightweight for prop-threading
- **Rationale**: The `resolveWorkspaceContext` function has real branching logic (validate worktree, fallback). The rest is mechanical prop-threading that's verified by `just fft` and manual Playwright check.
- **Focus Areas**:
  - Unit tests for `resolveWorkspaceContext(slug, worktreePath?)` — valid worktree, invalid worktree, missing worktree, missing workspace
  - Manual Playwright verification that `?worktree=` produces correct data
- **Mock Usage**: Fakes only (no mocks). Use `FakeWorkspaceService` or equivalent fake that controls `getInfo()` return values including `worktrees[]` array.
- **Excluded**: E2E browser tests for prop-threading (covered by `just fft` typecheck + manual spot-check)

---

## Documentation Strategy

- **Approach**: No new documentation
- **Rationale**: Workshop 006 already fully documents the worktree threading pattern with exact code snippets. Domain history will be updated as part of implementation.

---

## Clarifications

### Session 2026-03-01

| # | Question | Answer | Updated |
|---|----------|--------|---------|
| Q1 | Workflow Mode | **Simple** — single phase, inline tasks | Header confirmed |
| Q2 | Testing Strategy | **Hybrid** — TDD for resolver, lightweight for prop-threading | Added § Testing Strategy |
| Q3 | Mock Usage | **Fakes only** — no mocks, use FakeWorkspaceService | Added to § Testing Strategy |
| Q4 | Documentation Strategy | **No new docs** — Workshop 006 covers it | Added § Documentation Strategy |
| Q5 | Domain Review | **Confirmed** — 1 modified domain, 2 consumed, no boundary issues | § Target Domains unchanged |
| Q6 | Fallback Behavior | **No silent fallback** — missing `?worktree=` must redirect/error, not silently use main workspace. Diverges from workflow pattern intentionally. | § Goals + AC-07 updated |
