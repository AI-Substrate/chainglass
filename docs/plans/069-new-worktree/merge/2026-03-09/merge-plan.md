# Merge Plan: Integrating Upstream Changes

**Generated**: 2026-03-09T10:14Z
**Your Branch**: 069-new-worktree @ 4a02f43a
**Merging From**: origin/main @ 3f611417
**Common Ancestor**: 7d6c78fe (2026-03-09)

---

## Executive Summary

### What Happened While You Worked

You last merged main **earlier today**. Since then, **1 PR** landed in main:

| Plan | Merged | Purpose | Risk to You | Domains Affected |
|------|--------|---------|-------------|------------------|
| PR #41 (066-wf-real-agents) | Today | Agent runner infra, harness CLI, SSE multiplexing, Zod compat fixes | 🟢 Low | agents, _platform/events, _platform/state, workspace |

PR #41 bundles work from Plans 066, 067, 070, and 072:
- **Plan 067**: Agentic development harness (Docker, Playwright CDP, CLI SDK, seeds/tests)
- **Plan 070**: Harness agent runner infrastructure (SdkCopilotAdapter, agent definitions, smoke tests)
- **Plan 072**: SSE multiplexing (agent hooks migration to multiplexed SSE provider)
- Various fixes: Zod v3/v4 compat, sidebar z-index, auth bypass, terminal improvements

### Conflict Summary

- **Direct Conflicts**: 0 contradictory
- **Overlapping Files**: 3 (all auto-resolvable or complementary)
- **Semantic Conflicts**: 0
- **Regression Risks**: Low

### Recommended Approach

```
Single merge — all changes are compatible. Run `git merge origin/main`, verify build + tests.
```

---

## Conflict Map

| File | Our Change | Their Change | Type | Risk |
|------|-----------|-------------|------|------|
| `dashboard-sidebar.tsx` | Added Plus button for worktree creation | Refactored header layout, section reordering | Complementary | 🟢 Low |
| `di-container.ts` | Added IGitWorktreeManager + bootstrap runner DI | Added ICopilotClient type casts | Auto-resolvable | 🟢 Low |
| `README.md` | Added worktree creation docs pointer | Added harness feedback loop section | Auto-resolvable | 🟢 Low |

---

## Upstream Plans Analysis

### Plan 067-harness
**Purpose**: Agentic development harness — Docker container, dev server, Playwright CDP, CLI SDK, seed data, tests.
**Files Changed**: 30 plan artifacts + harness source
**Domains Affected**: agents, workspace (harness consumes workspace context)
**Conflicts with Us**: None — harness is a new capability, no overlap with worktree creation.

### Plan 070-harness-agent-runner
**Purpose**: Agent runner infrastructure — SdkCopilotAdapter improvements, agent definitions, smoke tests.
**Files Changed**: 34 plan artifacts + adapter/runner source
**Domains Affected**: agents, _platform/sdk
**Conflicts with Us**: None — agent infrastructure is orthogonal to workspace domain.

### Plan 072-sse-multiplexing
**Purpose**: SSE multiplexing — migrate agent hooks to multiplexed SSE provider.
**Files Changed**: 5 plan artifacts + SSE migration
**Domains Affected**: _platform/events, _platform/state
**Conflicts with Us**: None — our SSE hook additions were already merged.

---

## Merge Execution Plan

### Phase 1: Merge (Expected Clean)

```bash
git merge origin/main
```

### Phase 2: Rebuild

```bash
pnpm install
pnpm --filter @chainglass/shared build
pnpm --filter @chainglass/workflow build
```

### Phase 3: Validate

```bash
just lint
just typecheck
pnpm test
just build
```

---

## Post-Merge Validation Checklist

- [ ] `git merge origin/main` completes without conflicts
- [ ] `pnpm install` succeeds
- [ ] `just lint` passes
- [ ] `just typecheck` passes
- [ ] `pnpm test` passes
- [ ] `just build` passes
- [ ] Our worktree creation features still work (sidebar button, form, server action)
- [ ] Committed and pushed
