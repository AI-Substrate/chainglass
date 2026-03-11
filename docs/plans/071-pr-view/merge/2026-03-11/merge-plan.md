# Merge Plan: Integrating Upstream Changes

**Generated**: 2026-03-11
**Your Branch**: 071-pr-view @ 818e64f3
**Merging From**: origin/main @ b166271f
**Common Ancestor**: cb35fd6f @ 2026-03-07

---

## Executive Summary

### What Happened While You Worked

You branched from main **4 days ago**. Since then, **6 plans** landed in main across **78 commits**:

| Plan | Purpose | Risk to You | Domains Affected |
|------|---------|-------------|------------------|
| 067-harness | Agent harness infrastructure | Low | None |
| 067-question-popper | Question/alert popper UI | Medium | _platform, question-popper (new) |
| 069-new-worktree | Worktree creation UI | Medium | workspace, layout.tsx |
| 069-tree-metafiles | Tree metafile display | Low | None |
| 070-harness-agent-runner | Harness agent runner | Low | agents |
| 072-sse-multiplexing | SSE channel multiplexing | Medium | _platform/events, file-browser |

### Conflict Summary

- **Direct Conflicts**: 9 files
- **Semantic Conflicts**: 0 (our domains are new — additive, not contradictory)
- **Regression Risks**: 2 (layout nesting, SSE provider placement)

### Key Insight

Agent-46 analysis overstated conflicts. Main did NOT remove file-notes or replace it — main simply **never had it**. Our 071 features are entirely **new domains** being added. The 9 conflicts are all **complementary/additive** — both branches added different things to the same files.

### Recommended Approach

Single merge of origin/main with manual resolution of 9 additive conflicts. Estimated effort: 30-60 minutes.

---

## Conflict Analysis

### Conflict 1: `apps/cli/src/bin/cg.ts`

**Type**: Complementary (both added imports + registrations)
**Your Change**: Added `registerNotesCommands` import + call
**Upstream Change**: Added `registerAlertCommands`, `registerQuestionCommands` imports + calls
**Resolution**: Keep all — add notes registration alongside question + alert registrations

### Conflict 2: `apps/cli/src/commands/index.ts`

**Type**: Complementary
**Your Change**: Added `registerNotesCommands` export
**Upstream Change**: Added `registerQuestionCommands`, `registerAlertCommands` exports
**Resolution**: Keep all exports

### Conflict 3: `apps/web/.../browser-client.tsx`

**Type**: Complementary (most complex)
**Your Change**: Added noteFilePaths state, refreshNoteFilesRef, showOnlyWithNotes filter, handleAddNote, useNotesOverlay, filesWithNotes/onAddNote props to FileTree, filter toggle UI
**Upstream Change**: Added `FileChangeProvider` wrapper (previously lifted to layout, now back in browser-client per Plan 072), `QuestionPopperIndicator`, `GlobalStateConnector` changes
**Resolution**: Take main's structure, re-apply our note-related additions:
- Re-add `useNotesOverlay` import
- Re-add `fetchFilesWithNotes` import
- Re-add `StickyNote` icon import
- Re-add noteFilePaths state + refreshNoteFilesRef + handleAddNote + filter logic
- Re-add `filesWithNotes`, `onAddNote` props to FileTree
- Re-add filter toggle UI in tree section

### Conflict 4: `apps/web/.../layout.tsx`

**Type**: Complementary (layout nesting)
**Your Change**: Added `NotesOverlayWrapper` + `PRViewOverlayWrapper` in nesting
**Upstream Change**: Added `MultiplexedSSEProvider` + `QuestionPopperOverlayWrapper`, restructured nesting
**Resolution**: Insert our wrappers into main's new nesting:
```
TerminalOverlayWrapper
  → MultiplexedSSEProvider
    → ActivityLogOverlayWrapper
      → NotesOverlayWrapper         ← INSERT
        → PRViewOverlayWrapper      ← INSERT
          → QuestionPopperOverlayWrapper
            → WorkspaceAgentChrome
              → {children}
```

### Conflict 5: `docs/domains/domain-map.md`

**Type**: Complementary (both added nodes/edges)
**Your Change**: Added file-notes + pr-view nodes and edges
**Upstream Change**: Added question-popper + external-events + workspace nodes, updated events domain
**Resolution**: Keep all nodes and edges from both sides

### Conflict 6: `docs/domains/file-browser/domain.md`

**Type**: Complementary
**Your Change**: Added file-notes dependency, Phase 7 history entry
**Upstream Change**: Added Plan 072 SSE migration history entry
**Resolution**: Keep both — add all history entries and dependencies

### Conflict 7: `docs/domains/registry.md`

**Type**: Complementary (both added rows)
**Your Change**: Added file-notes + pr-view rows
**Upstream Change**: Added external-events + question-popper + workspace rows
**Resolution**: Keep all rows

### Conflict 8: `packages/shared/package.json`

**Type**: Complementary (both added export paths)
**Your Change**: Added `./file-notes` export
**Upstream Change**: Added `./question-popper` export
**Resolution**: Keep both exports

### Conflict 9: `packages/shared/src/fakes/index.ts`

**Type**: Complementary
**Your Change**: Added `FakeNoteService` export
**Upstream Change**: Added `FakeQuestionPopperService` export
**Resolution**: Keep both exports

---

## Regression Risk Analysis

| Risk | Direction | Likelihood | Mitigation |
|------|-----------|------------|------------|
| Layout nesting order | Upstream→You | Medium | Insert Notes+PRView wrappers in correct position within MultiplexedSSEProvider |
| FileChangeProvider location | Upstream→You | Low | Main's browser-client still wraps in FileChangeProvider — our PRViewOverlayWrapper may need adjustment since we also used FileChangeProvider |
| SSE connection limits | Both | Low | MultiplexedSSEProvider reduces connections — verify our overlays get events |

---

## Merge Execution Plan

### Phase 1: Backup

```bash
git branch backup-20260311-before-merge
```

### Phase 2: Merge

```bash
git fetch origin main
git merge origin/main
# 9 conflicts expected — all complementary/additive
```

### Phase 3: Resolve Conflicts (per-file)

For each conflict: take main's version as base, re-apply our additions.

**Order of resolution:**
1. `packages/shared/package.json` — add `./file-notes` export alongside `./question-popper`
2. `packages/shared/src/fakes/index.ts` — add `FakeNoteService` alongside `FakeQuestionPopperService`
3. `apps/cli/src/bin/cg.ts` — add `registerNotesCommands` alongside question + alert
4. `apps/cli/src/commands/index.ts` — add `registerNotesCommands` export alongside others
5. `docs/domains/registry.md` — add file-notes + pr-view rows alongside new entries
6. `docs/domains/domain-map.md` — add file-notes + pr-view nodes alongside new entries
7. `docs/domains/file-browser/domain.md` — keep both history entries + both dependency sections
8. `apps/web/.../layout.tsx` — insert Notes + PRView wrappers in main's nesting
9. `apps/web/.../browser-client.tsx` — re-apply note additions on main's version

### Phase 4: Post-Merge Adjustments

- Check if `PRViewOverlayWrapper` still needs its own `FileChangeProvider` or if `MultiplexedSSEProvider` covers it
- Verify `useFileChanges` hook works within the new SSE multiplexing context
- Check import paths — main may have moved some files

### Phase 5: Validation

```bash
pnpm --filter @chainglass/shared build
just fft
```

### Phase 6: Commit

```bash
git add -A
git commit -m "Merge main: integrate Plans 067/069/070/072 with 071 PR View + File Notes"
```

---

## Human Approval Required

Before executing this merge plan, please review:

### Summary Review
- [ ] I understand 6 upstream plans landed (harness, question-popper, new-worktree, tree-metafiles, harness-agent-runner, sse-multiplexing)
- [ ] I understand all 9 conflicts are additive (both sides added to same files)
- [ ] I understand the layout nesting needs Notes + PRView wrappers inserted

### Risk Acknowledgment
- [ ] I will run `just fft` after merging
- [ ] I understand SSE multiplexing may require adjusting FileChangeProvider usage
- [ ] I have a backup branch for rollback

---

**Proceed with merge execution?**

Type "PROCEED" to begin, or "ABORT" to cancel.
