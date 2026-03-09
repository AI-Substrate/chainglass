# Flight Plan: Phase 3 — Build the Full-Page Create Flow

**Plan**: [new-worktree-plan.md](../../new-worktree-plan.md)
**Phase**: Phase 3: Build the Full-Page Create Flow
**Generated**: 2026-03-08
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1+2 delivered the complete domain layer — `WorkspaceService.createWorktree()` returns a discriminated union (`'created'` with bootstrap status, or `'blocked'` with errors). The DI container wires everything. No web UI exists yet.

**Where we're going**: A user navigates to `/workspaces/[slug]/new-worktree`, types a name, sees a live preview, clicks "Create Worktree", and either lands in the new worktree's browser view or sees a clear error they can act on.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| workspace | Add full-page route, form component, server actions for preview/create | `page.tsx`, `new-worktree-form.tsx`, `workspace-actions.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| workspace | `IWorkspaceService.previewCreateWorktree()` / `createWorktree()` | `PreviewCreateWorktreeResult`, `CreateWorktreeResult` |
| `_platform/workspace-url` | `workspaceHref()` | Derive redirect URL from slug + worktreePath |
| `_platform/auth` | `requireAuth()` | Protect server actions |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Page-state types +<br/>server actions" as S1
    state "2: Full-page route" as S2
    state "3: Form component" as S3
    state "4: Hard navigation" as S4
    state "5: Form state tests" as S5

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked | green = done

---

## Stages

- [ ] **Stage 1: Server action** — Define `CreateWorktreePageState` union (4 variants), add `createNewWorktree` server action with auth, Zod validation, domain call, URL derivation, and revalidation. No preview action. (`workspace-actions.ts`)
- [ ] **Stage 2: Page route** — Create Server Component that calls `IWorkspaceService` directly for initial preview, renders form with idle state (`page.tsx` — new file)
- [ ] **Stage 3: Form component** — Create `'use client'` form with `useActionState`, client-side live slug preview via pure functions, 4 page states, pending progress, `useEffect` hard navigation on success, "Open Worktree Anyway" button (`new-worktree-form.tsx` — new file)
- ~~**Stage 4: Navigation** — Merged into Stage 3 (navigation is integral to form)~~
- [ ] **Stage 4: Tests** — Render form with each of 4 page-state variants, assert visual output. Don't test navigation side effect. (`new-worktree-form.test.tsx` — new file)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        B_WS["WorkspaceService<br/>(domain only)"]:::existing
        B_Actions["workspace-actions.ts<br/>(add/remove only)"]:::existing
    end

    subgraph After["After Phase 3"]
        A_WS["WorkspaceService"]:::existing
        A_Actions["workspace-actions.ts<br/>(+preview/create)"]:::new
        A_Page["new-worktree/page.tsx"]:::new
        A_Form["NewWorktreeForm"]:::new

        A_Page --> A_Form
        A_Form -->|useActionState| A_Actions
        A_Actions -->|resolve DI| A_WS
        A_Form -->|success| Navigate["Hard navigate<br/>to browser"]:::new
    end
```

---

## Acceptance Criteria

- [ ] Selecting the new-worktree action opens a dedicated full-page route at `/workspaces/[slug]/new-worktree`.
- [ ] The page shows a best-effort preview before submission and preserves user input on blocking failures.
- [ ] A bootstrap warning state stays on the page and offers an explicit "Open Worktree Anyway" action.

## Goals & Non-Goals

**Goals**:
- ✅ Full-page create route with preview and 4 page states
- ✅ Thin server actions mapping domain results to UI state
- ✅ Hard navigation on success
- ✅ Bootstrap warning with explicit continue action

**Non-Goals**:
- ❌ Sidebar entrypoints (Phase 4)
- ❌ Documentation (Phase 4)
- ❌ Manual ordinal override, skip-bootstrap, alternate base branch

---

## Checklist

- [x] T001: Page-state types + createNewWorktree server action (no preview action)
- [x] T002: Full-page route (Server Component, direct service call for preview)
- [x] T003: Form component (Client Component, 4 states, live preview, useEffect navigation)
- ~~T004: Merged into T003~~
- [x] T005: Form state tests (4 visual states, no navigation testing)
