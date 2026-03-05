# Merge Plan: Integrating Upstream Changes

**Generated**: 2026-03-04
**Your Branch**: 059-fix-agents @ f15107c
**Merging From**: origin/main @ 29b80fa
**Common Ancestor**: fb8395d (2026-03-01)

---

## Executive Summary

### What Happened While You Worked

You branched from main **3 days ago**. Since then, **2 plans** landed in main:

| Plan | Merged | Purpose | Risk to You | Domains Affected |
|------|--------|---------|-------------|------------------|
| 063-c4-models | ~2 days ago | C4 architecture diagrams (L1/L2/L3) + markdown preview improvements | Low | docs only + browser-client |
| 063-login | ~1 day ago | GitHub OAuth authentication — auth guards on all API routes + server actions | Medium | auth (NEW), all API routes, layout |

### Conflict Summary

- **Direct Conflicts**: 12 files (most are complementary — different regions of same files)
- **Semantic Conflicts**: 1 (auth guards on agent routes we also modified)
- **Regression Risks**: Low — auth is additive, our changes are additive

### Recommended Approach

Single `git merge origin/main` — conflicts are complementary (auth + agent features). Manual resolution needed for ~4 source files where both branches modified imports/headers.

---

## Upstream Plans Analysis

### Plan 063-c4-models

**Purpose**: Add C4 architecture diagram foundation with L1 context, L2 container, and L3 component diagrams. Add markdown preview link navigation.

**Risk to You**: Low — mostly docs/ files. One overlap in `browser-client.tsx` (markdown link handling).

**Key Changes**:
- C4 diagram docs under `docs/plans/063-c4-models/`
- L3 component diagrams with bidirectional domain links
- Markdown preview relative link navigation
- CLAUDE.md update for C4 sync instructions

### Plan 063-login

**Purpose**: GitHub OAuth authentication using next-auth. Auth guards on all API routes and server actions. Login page with ASCII art.

**Risk to You**: Medium — adds `auth()` import + session check to every API route we touched.

**Key Changes**:
- `apps/web/app/api/auth/[...nextauth]/route.ts` — NextAuth route
- `apps/web/app/login/` — login page + layout
- Auth guards (`const session = await auth(); if (!session) return 401`) on ALL API routes
- `requireAuth()` guard on ALL server actions
- `next.config.mjs` — added `next-auth`, `@auth/core`, `yaml` to serverExternalPackages + `ignoreBuildErrors: true`
- New domain: auth
- `.chainglass/auth.yaml` — auth config

---

## Conflict Analysis

### Conflict 1: `apps/web/app/api/agents/route.ts`

**Type**: Complementary — main added auth import + guards, we added bridge import + FX001 wiring

**Resolution**: Keep both changes. Main adds `import { auth }` + session checks at top of GET/POST. We add `POSITIONAL_GRAPH_DI_TOKENS`, `AgentWorkUnitBridge` imports + bridge.registerAgent() call. Non-overlapping regions.

### Conflict 2: `apps/web/app/api/agents/[id]/route.ts`

**Type**: Complementary — same pattern as above. Main adds auth, we add bridge.

**Resolution**: Keep both.

### Conflict 3: `apps/web/next.config.mjs`

**Type**: Complementary — main adds `next-auth`, `@auth/core`, `yaml` + `ignoreBuildErrors`. We add `@github/copilot-sdk`, `@github/copilot`.

**Resolution**: Keep both sets of additions to `serverExternalPackages`.

### Conflict 4: `apps/web/app/actions/workflow-actions.ts`

**Type**: Complementary — main adds `requireAuth()` import + calls. We add `WorkflowEventsService` imports + factory.

**Resolution**: Keep both.

### Conflicts 5-8: `docs/domains/*.md`

**Type**: Complementary — main updated domain docs for auth. We updated for agents + work-unit-state.

**Resolution**: Keep both.

### Conflicts 9-10: Test files

**Type**: Complementary — we added QueryClientProvider wrappers + fetch mocks. Main may have similar changes.

**Resolution**: Take ours (our changes are more complete).

---

## Merge Execution Plan

### Phase 1: Backup + Merge

```bash
git branch backup-20260304-before-merge
git merge origin/main
# Resolve conflicts (mostly import merges)
```

### Phase 2: Resolve Conflicts

For each conflicting file: merge imports from both branches, keep all function body additions.

### Phase 3: Validate

```bash
just fft  # lint + format + test
```

---

## Human Approval Required

Type "PROCEED" to begin merge execution.
