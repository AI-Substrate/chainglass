# New Worktree Creation Flow

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and 4 workshop documents.

---

## Research Context

Research and workshops established the following feature context:

- The current product can discover, list, switch, and decorate existing worktrees, but it cannot create them.
- The requested user flow is workspace-first: from an active workspace, users should be able to start a new worktree from the left-hand Worktrees area, move into a full-page creation flow, and land inside the newly created worktree when done.
- The existing worktree-scoping contract is already built around a canonical workspace URL pattern, so new worktree creation should preserve that navigation model instead of inventing a new one.
- Detailed workshops have already settled the main design questions around naming/bootstrap policy, main-sync safety, UX/recovery states, and domain ownership.

---

## Summary

Users should be able to create a new worktree directly from Chainglass without leaving the workspace experience or dropping to the command line. The feature should let them start from a workspace, review the generated name and target location, create a new worktree from refreshed `main`, optionally run a repository-defined bootstrap step, and then continue their work in the new context immediately.

This closes a major gap in the current worktree experience: users can already see and switch worktrees, but they cannot bootstrap a new one from the product itself.

---

## Goals

- **Create worktrees from the product UI** — users can start a new worktree while already inside a workspace
- **Keep the action visible in the workspace navigation** — the Worktrees area exposes a clear “new worktree” affordance at all times
- **Use the existing repository naming convention** — users see the final worktree name that follows the current ordinal-based convention
- **Use a dedicated full-page flow** — creation happens on a page with room for preview, status, and recovery, not in a modal
- **Create from canonical main** — users get a fresh, predictable starting point rather than branching from a stale or ambiguous checkout
- **Support repository-defined setup** — a repository can optionally run a standard post-create setup step after the worktree is created
- **Land users directly in the new worktree context** — after creation, the new worktree becomes the active workspace context in the app
- **Make failure states understandable** — if creation is blocked or setup fails, users get a clear explanation and next step

---

## Non-Goals

- **Arbitrary base branch selection** — v1 creates from canonical `main`, not from user-selected branches
- **Modal or popover creation UI** — the flow is intentionally full-page
- **Manual tmux/session provisioning controls** — this feature is about worktree creation, not terminal/session orchestration
- **Deleting or pruning worktrees** — removal/cleanup is out of scope
- **Repository-agnostic branch naming systems** — v1 follows the existing ordinal naming convention instead of introducing multiple schemes
- **Interactive or long-running environment provisioning** — any optional setup step must remain lightweight and non-interactive
- **Bypassing main safety checks** — the app should not silently create worktrees from dirty, ahead, or diverged main state
- **Cross-workspace or shared worktree creation** — the flow creates a worktree for the currently selected workspace only
- **In-product retry orchestration for failed bootstrap** — v1 warns, preserves the created worktree, and lets the user open it anyway instead of managing setup retries
- **Additional workspace-detail entry points** — the initial release relies on the Worktrees navigation affordance and collapsed-sidebar fallback rather than adding extra create entry points elsewhere

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workspace | **NEW** | **create** | Establish ownership for workspace/worktree lifecycle creation, naming policy, canonical-main expectations, and post-create bootstrap behavior |
| file-browser | existing | **modify** | Extend the worktree-facing user experience so people can enter the new flow from workspace navigation and land inside the created worktree context |
| _platform/workspace-url | existing | **consume** | Use the canonical workspace/worktree deep-linking contract for entering and opening the created worktree |
| _platform/auth | existing | **consume** | Keep the full-page create flow and creation action inside the existing authenticated workspace experience |

### New Domain Sketches

#### workspace [NEW]
- **Purpose**: Own workspace and worktree lifecycle behavior that is currently implied by `packages/workflow` but not yet formalized as a named domain. This feature is the clearest current need for that boundary because it introduces new creation, preview, sync, and bootstrap policies that should not leak into UI or generic git helpers.
- **Domain Review Note**: Keep this as a distinct new domain for planning. If the boundary has not been formally extracted yet, that extraction should happen as part of the follow-on planning and architecture work.
- **Boundary Owns**:
  - workspace/worktree lifecycle semantics
  - previewing and creating new worktrees for an existing workspace
  - canonical naming expectations for new worktrees
  - user-facing policy for how “fresh main” is defined before creation
  - optional repository-defined post-create bootstrap behavior and outcome reporting
- **Boundary Excludes**:
  - file browsing, editing, diffing, and browser landing UX — belongs to `file-browser`
  - URL construction, query-param parsing, and deep-link mechanics — belongs to `_platform/workspace-url`
  - authentication and session enforcement — belongs to `_platform/auth`
  - generic process execution and raw git plumbing — belongs to infrastructure adapters consumed by the workspace domain
  - sidebar/layout presentation details — belong to web composition, not the domain

---

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=2, T=1
- **Confidence**: 0.86

| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 2 | The feature spans user entry points, a new full-page flow, worktree lifecycle behavior, safety handling, and post-create outcomes |
| Integration (I) | 2 | Creation depends on git state, remote freshness, filesystem paths, and an optional repository-defined bootstrap step |
| Data/State (D) | 1 | No persistent schema migration is expected, but the feature introduces new lifecycle results and multiple user-facing creation states |
| Novelty (N) | 1 | Research and workshops resolved most ambiguity, but this is still a new workspace lifecycle capability |
| Non-Functional (F) | 2 | Safety, correctness, and path/script handling are central to the feature’s value |
| Testing/Rollout (T) | 1 | The feature needs more than isolated unit validation because the user flow crosses creation, navigation, and recovery states |

**Assumptions**:
- Each supported repository has a canonical `main` branch and an `origin/main` baseline
- Each selected workspace can resolve to one authoritative main checkout
- The optional repository-defined bootstrap step is lightweight and non-interactive
- Users expect new worktrees to follow the same ordinal naming convention they already use outside the app

**Dependencies**:
- Completed research dossier and workshop set for `069-new-worktree`
- A git repository with worktree support enabled
- A workspace already registered in Chainglass
- Existing repository tests and manual verification paths will be used because this feature will proceed without a dedicated harness phase

**Risks**:
- Users may frequently encounter blocked creation if their local main checkout is not kept clean and canonical
- Naming collisions remain possible in concurrent environments and must be surfaced clearly
- Repository-defined bootstrap steps introduce a partial-success state where the worktree exists but setup did not complete cleanly
- The missing formal `workspace` domain boundary may slow architecture if it is not made explicit early

**Phases**:
1. Establish the workspace-domain lifecycle contract for previewing and creating worktrees safely
2. Add the full-page creation flow and primary workspace entry points
3. Wire post-create bootstrap handling and success/warning navigation into the new worktree context
4. Verify naming, safety blocking, sidebar visibility, and recovery behavior

---

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: This feature mixes high-risk lifecycle and safety logic with comparatively straightforward page wiring. The worktree preview/create behavior, canonical-main guardrails, and post-create outcome handling should receive stronger automated coverage, while UI composition and route wiring can use lighter verification.
- **Focus Areas**:
  - naming preview and final naming behavior
  - canonical-main safety and blocking outcomes
  - worktree creation result states, including bootstrap partial success
  - redirect/navigation behavior into the created worktree context
- **Excluded**:
  - exhaustive UI pixel-state testing for the full-page flow
  - heavy end-to-end simulation of every git failure path when equivalent service-level coverage exists
- **Mock Usage**: Allow targeted mocks for external systems and difficult-to-reproduce failure conditions, while preferring real data and fixtures for domain and UI behavior.

---

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **Rationale**: The feature introduces a new user workflow plus repository-level bootstrap expectations. A concise pointer in the main product documentation can advertise that worktree creation exists, while a dedicated how-to can explain the creation flow, safety guardrails, and optional `.chainglass/new-worktree.sh` behavior in enough depth for day-to-day use.

---

## Acceptance Criteria

1. While inside a workspace, the user can start a new worktree from the left-hand Worktrees area without leaving the current workspace context first.
2. Selecting the new-worktree action opens a dedicated full-page creation flow rather than a modal, popover, or inline drawer.
3. The creation page shows the current workspace context and a preview of the generated worktree name before creation starts.
4. When the user enters a plain feature name, the system generates a final worktree name that follows the existing ordinal-based repository naming convention.
5. When the user provides a valid full `NNN-name` input, the system preserves that naming intent rather than forcing a second naming scheme.
6. When canonical main is clean and current enough to use, the system creates the new worktree from that refreshed main state and moves the user into the new worktree context.
7. After a successful create, the user lands in the new worktree’s workspace-scoped browser experience and the new worktree is visible as the active context in the app.
8. If the system cannot safely create from canonical main because the main checkout is dirty, ahead, diverged, or otherwise unsafe, the flow stops before creation and explains why.
9. If the requested name or target location conflicts with an already-existing worktree, the flow preserves the user’s input, refreshes the naming result, and clearly explains the conflict.
10. If a repository-defined post-create script exists in the canonical main checkout, the system uses that script as the bootstrap source for the new worktree.
11. If no repository-defined post-create script exists, the worktree is still created and opened successfully without warning.
12. If the repository-defined bootstrap step fails after the worktree has been created, the user is told that creation succeeded but setup failed, sees enough detail to understand the problem, and can still choose to open the worktree anyway.
13. The initial release does not need to provide an in-product “Retry setup” action after bootstrap failure.
14. The complete flow is available inside the authenticated Chainglass workspace experience and does not require the user to switch to CLI or manual git commands to finish the happy path.

---

## Risks & Assumptions

| Item | Type | Notes |
|------|------|-------|
| Canonical main availability | Assumption | The product can identify one authoritative main checkout for each workspace |
| Canonical branch naming | Assumption | `main` is the supported base branch for v1 |
| Local git state drift | Risk | Dirty, ahead, or diverged main state may block creation and surprise users if the UX is not explicit |
| Bootstrap partial success | Risk | The worktree may exist even when repo-defined setup fails, so the UI must distinguish “created” from “fully prepared” |
| Naming collisions | Risk | Concurrent branch creation can invalidate a preview between page load and submit |
| Domain boundary clarity | Risk | If the new `workspace` domain is not made explicit, creation logic may spread across UI, action, and git layers |

**Additional assumptions**:
- The app should optimize for predictable, conservative behavior over permissive creation when git state is ambiguous
- Users value staying in the product to create a worktree more than they value bypassing guardrails

---

## Open Questions

No critical open questions remain for planning.

For initial scope:
- v1 supports `main` as the canonical base branch.
- After bootstrap failure, “Open Worktree Anyway” is sufficient; a dedicated retry action is out of scope.
- The initial release relies on the left-hand Worktrees entry point and the collapsed-sidebar fallback rather than adding a separate workspace-detail entry point.

---

## Clarifications

### Session 2026-03-07

- **Q: Which workflow mode should plan 069 use?**
  - **A:** Full mode.
- **Q: What testing strategy should this feature use?**
  - **A:** Hybrid.
- **Q: What mock policy should this feature use?**
  - **A:** Allow targeted mocks for external systems only.
- **Q: What documentation strategy should this feature follow?**
  - **A:** Hybrid documentation, using README and docs/how/.
- **Q: Does the proposed domain boundary look right?**
  - **A:** Yes. Keep `workspace` as a distinct new domain; if it has not been formally extracted yet, do that as follow-on planning work.
- **Q: How should harness readiness be handled for this feature?**
  - **A:** Continue without a dedicated harness phase.
- **Q: What should count as the canonical base branch in v1?**
  - **A:** `main` only.

This feature will follow the full planning workflow with multi-phase architecture and execution gates.
Testing should use TDD where the logic is safety-critical or stateful, with lighter verification for simpler page composition and navigation wiring.
Tests should prefer real fixtures by default and only use targeted mocks when controlling external-system behavior is necessary.
Documentation should include both discoverability-level guidance and a deeper how-to for the new worktree flow and bootstrap policy.
Domain planning should proceed with a distinct `workspace` boundary rather than folding this behavior into an existing domain.
Implementation planning should assume validation via existing tests and manual verification rather than a new harness phase.
Initial scope will create from `main` only, rely on “Open Worktree Anyway” after bootstrap failure, and avoid extra workspace-detail entry points.

---

## Workshop Opportunities

All major pre-architecture workshop topics for this feature have already been covered. No additional workshop is required before moving to clarification, but the completed workshops remain authoritative inputs for the next planning steps.

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| New worktree naming and bootstrap policy | Integration Pattern | Completed in workshop 001 to settle the repository naming convention and optional post-create setup behavior | How is the final `NNN-name` derived? Which bootstrap script is authoritative? |
| Main sync strategy and git safety | State Machine | Completed in workshop 002 to define what “fully pulled main” means and when creation must block | What counts as safe canonical main state? When should creation refuse to proceed? |
| Create flow UX and recovery states | State Machine | Completed in workshop 003 to settle page-level flow, pending states, and partial-success recovery | What should users see before submit, on success, on blocking failure, and on bootstrap warning? |
| Workspace domain and service boundary | Integration Pattern | Completed in workshop 004 to prevent business logic from leaking into UI or generic git helpers | Which layer owns preview, create, sync, bootstrap, and redirect behavior? |
