# New Worktree Creation Flow Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-07
**Spec**: [docs/plans/069-new-worktree/new-worktree-spec.md](./new-worktree-spec.md)
**Status**: DRAFT

> **Quick Nav**
> [Phase 1: Establish Workspace Contracts](#phase-1-establish-workspace-contracts)
> · [Phase 2: Implement Workspace Orchestration](#phase-2-implement-workspace-orchestration)
> · [Phase 3: Build the Full-Page Create Flow](#phase-3-build-the-full-page-create-flow)
> · [Phase 4: Compose Navigation and Landing](#phase-4-compose-navigation-and-landing)

## Summary

This feature adds a workspace-scoped flow for creating a new git worktree from canonical `main` without leaving Chainglass. The implementation keeps lifecycle policy in the `workspace` domain, adds a dedicated git mutation boundary for sync/create operations, and reuses existing server-action and browser-routing patterns in the web app. The user-facing flow is a full page at `/workspaces/[slug]/new-worktree`, with preview, blocking safety errors, and a non-blocking bootstrap warning state. Successful creation ends with a hard navigation into the existing browser route so the sidebar remounts and shows the new worktree immediately.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| workspace | existing | modify | Own preview/create lifecycle, naming allocation, canonical-main policy, bootstrap execution, and workspace-scoped web entrypoints |
| file-browser | existing | modify | Remain the post-create landing surface and absorb any browser-context adjustments needed for the new worktree handoff |
| _platform/workspace-url | existing | consume | Provide canonical route building and `?worktree=` selection for preview/back links and success navigation |
| _platform/auth | existing | consume | Protect the full-page flow and server actions with the existing authenticated workspace experience |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts` | workspace | contract | Extend the public workspace lifecycle contract with preview/create worktree request and result shapes |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/git-worktree-manager.interface.ts` | workspace | contract | Introduce the dedicated git mutation contract for fetch, compare, fast-forward, and worktree creation |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/index.ts` | workspace | contract | Re-export new workspace contracts for consumers |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts` | workspace | internal | Orchestrate preview/create lifecycle, structured errors, and bootstrap outcome handling |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-name.ts` | workspace | internal | Port ordinal naming allocation and slug normalization policy into the workspace domain |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-bootstrap-runner.ts` | workspace | internal | Detect, validate, execute, and summarize the main-sourced `.chainglass/new-worktree.sh` hook |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts` | workspace | internal | Implement mutating git commands through `IProcessManager` without extending the read-only resolver |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/fake-git-worktree-manager.ts` | workspace | internal | Provide a fake mutator for TDD and deterministic failure-path coverage |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/fakes/index.ts` | workspace | internal | Export the fake mutator for tests and container setup |
| `/Users/jordanknight/substrate/069-new-worktree/packages/shared/src/di-tokens.ts` | workspace | cross-domain | Add a resolution token for the new git mutator boundary |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts` | workspace | cross-domain | Register the new workspace-domain dependencies in the web runtime |
| `/Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts` | workspace | cross-domain | Keep CLI resolution aligned with the expanded `WorkspaceService` dependency graph |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/actions/workspace-actions.ts` | workspace | cross-domain | Add preview/create action adapters, structured page-state mapping, and revalidation |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx` | workspace | internal | Add the full-page create-worktree route |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx` | workspace | internal | Render the full-page form, preview, pending state, blocking errors, and bootstrap warning state |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx` | workspace | cross-domain | Add the always-available plus affordance in expanded and collapsed sidebar states |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/workspace-nav.tsx` | workspace | cross-domain | Add route-aware create affordances and preserve the existing hard-refresh success path assumptions |
| `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | file-browser | cross-domain | Verify the browser route remains the canonical landing surface for newly created worktrees |
| `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts` | workspace | internal | Cover preview/create orchestration, blocking sync errors, and bootstrap warning outcomes |
| `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts` | workspace | internal | Cover git mutation edge cases and structured failure parsing |
| `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts` | workspace | contract | Define the fake/real parity contract for git mutation behavior |
| `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts` | workspace | contract | Run the shared contract suite against fake and real manager implementations |
| `/Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx` | workspace | internal | Cover preview, blocking error, and bootstrap warning UI states |
| `/Users/jordanknight/substrate/069-new-worktree/docs/how/workspaces/3-web-ui.md` | workspace | cross-domain | Document the new page flow and sidebar entrypoints |
| `/Users/jordanknight/substrate/069-new-worktree/README.md` | workspace | cross-domain | Add a discoverability-level pointer to the new in-product worktree flow |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` | workspace | contract | Keep the workspace domain contracts and concepts in sync with the implementation |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md` | workspace | cross-domain | Reflect any new workspace contracts and dependency edges |
| `/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md` | workspace | cross-domain | Keep the workspace component diagram aligned with the implemented internal structure |
| `/Users/jordanknight/substrate/069-new-worktree/docs/c4/README.md` | workspace | cross-domain | Keep the C4 navigation hub linked to the new workspace component diagram |
| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` | workspace | cross-domain | Register the newly extracted workspace domain |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/container.ts` | workspace | cross-domain | Keep package-level DI aligned with the workspace create-worktree surface |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/index.ts` | workspace | internal | Export the new git worktree manager adapter |
| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts` | workspace | cross-domain | Re-export Phase 2 workspace surface for package consumers |
| `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-name.test.ts` | workspace | internal | Verify naming allocator behavior |
| `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-bootstrap-runner.test.ts` | workspace | internal | Verify bootstrap runner behavior |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | The workspace-domain write boundary is already settled by the extracted `workspace` domain and workshop 004. | Put preview/create orchestration in `IWorkspaceService` and keep web code as an adapter layer only. |
| 02 | Critical | Git mutation support must stay separate from the existing read-only `IGitWorktreeResolver`. | Add `IGitWorktreeManager` and finish its fake/contract/test story before wiring any server actions to it. |
| 03 | Critical | The in-repo allocator cannot reuse `Workspace.generateSlug()` because ordinal allocation must mirror `plan-ordinal.py` across local branches, remote branches, and plan folders. | Deliver a dedicated naming allocator early and return structured naming conflict responses instead of suffix-based fallbacks. |
| 04 | High | The web app already has a strong `useActionState` + Zod + DI + `revalidatePath()` mutation pattern, but this flow needs richer result unions than the current generic `ActionState`. | Reuse the existing action/form pattern while introducing page-state shapes for preview, blocking errors, success, and bootstrap warning outcomes. |
| 05 | High | `WorkspaceNav` fetches `/api/workspaces?include=worktrees` once on mount, so soft navigation risks landing in a stale sidebar. | Finish the flow with a hard navigation to `/workspaces/[slug]/browser?worktree=...` using `_platform/workspace-url`. |

## Constitution Review

This plan aligns with clean dependency direction, CS-only sizing, phased delivery, and domain-oriented boundaries. It preserves thin web adapters, keeps git and hook policy behind interfaces, and plans explicit tests for the highest-risk behaviors.

### Documented Deviations

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Interfaces in `@chainglass/shared` by default | Nine existing workspace contracts (`IWorkspaceService`, `IGitWorktreeResolver`, `IWorkspaceRepository`, etc.) already live in `packages/workflow/src/interfaces/` and are consumed by both web and CLI through that surface. Moving them to `@chainglass/shared` requires updating every import site across both apps and all test suites — a mechanical but high-churn refactor orthogonal to worktree creation. Mixing that migration into this feature increases review surface and merge-conflict risk without delivering user value. | Relocating all workspace contracts into `@chainglass/shared` as part of this feature | Keep new contracts (`IGitWorktreeManager`, preview/create types) narrow and co-located with the existing workspace interfaces in `@chainglass/workflow`. Export through the same barrel. Track a follow-up task to consolidate workspace interfaces into `@chainglass/shared` once this feature ships and the contract surface stabilizes. Update workspace domain docs and C4 artifacts in the same plan to maintain traceability. |

## Architecture Review

No new layer-boundary exceptions are planned. The web layer owns route/form/redirect composition, the `workspace` domain owns lifecycle policy and outcome interpretation, `_platform/workspace-url` remains the only source of browser URLs, and git/process execution stays behind interfaces.

## Harness Strategy

- **Harness**: Not applicable (user override — Continue without a dedicated harness phase.)
- **Validation Model**: Existing tests plus manual verification of the authenticated web flow
- **Evidence Capture**: Vitest output, server-action state assertions, and browser/manual verification notes

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| [1](#phase-1-establish-workspace-contracts) | Establish Workspace Contracts | workspace | Add the typed write-side workspace and git mutation boundaries that the rest of the plan builds on | None |
| [2](#phase-2-implement-workspace-orchestration) | Implement Workspace Orchestration | workspace | Deliver naming, sync, create, bootstrap, and lock orchestration inside the workspace domain | Phase 1 |
| [3](#phase-3-build-the-full-page-create-flow) | Build the Full-Page Create Flow | workspace | Add the `/workspaces/[slug]/new-worktree` page, form, and server-action adapters | Phase 2 |
| [4](#phase-4-compose-navigation-and-landing) | Compose Navigation and Landing | workspace | Expose always-available entrypoints, land in the browser route, and synchronize docs plus final verification | Phase 3 |

---

#### Phase 1: Establish Workspace Contracts

**Objective**: Add the write-side contracts, DI wiring, and documentation hooks that let worktree creation stay inside the workspace domain.
**Domain**: workspace
**Delivers**:
- Extended `IWorkspaceService` contracts for preview/create worktree
- New `IGitWorktreeManager` interface and DI token wiring
- Fake and export scaffolding for interface-first TDD
**Depends on**: None
**Key risks**: If write-side contracts leak web concepts such as redirect URLs, later phases will invert dependency direction. If the mutating git interface is not introduced before implementation, git logic will sprawl into server actions.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Extend `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts` with preview/create request and result types | workspace | `IWorkspaceService` exposes preview/create methods with structured domain data, no web URL fields, and workspace-style error arrays | Per findings 01 and 04 |
| 1.2 | Add `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/git-worktree-manager.interface.ts`, `/Users/jordanknight/substrate/069-new-worktree/packages/shared/src/di-tokens.ts`, and container registrations | workspace | Web and CLI containers can resolve a dedicated mutating git boundary without changing the existing read-only resolver contract | Per finding 02 |
| 1.3 | Add fake/export/doc sync for the new workspace contracts | workspace | A fake manager exists for TDD, exports compile, and `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` is ready to describe the new contracts once they are implemented | Satisfies constitution interface-first expectations within the existing package layout |

##### Acceptance Criteria

- [ ] The workspace domain exposes typed preview/create contracts without embedding `_platform/workspace-url` concerns.
- [ ] A dedicated git mutation interface exists alongside the read-only worktree resolver and is resolvable from the existing containers.
- [ ] The plan has a stable fake/contract path for git mutation testing before real command execution lands.

##### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Redirect data leaks into domain results | Medium | High | Keep `redirectTo` derivation in `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/actions/workspace-actions.ts` only |
| New manager token is wired in web but not CLI | Medium | Medium | Update both `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts` and `/Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts` in the same phase |

#### Phase 2: Implement Workspace Orchestration

**Objective**: Implement the workspace-domain logic for naming, canonical-main safety, git mutation, bootstrap execution, and structured results.
**Domain**: workspace
**Delivers**:
- In-repo ordinal naming allocator
- Real git mutation adapter with preflight, fetch, compare, fast-forward, create, and lock behavior
- Workspace service preview/create orchestration with bootstrap summary handling
- High-value unit and contract coverage for the domain layer
**Depends on**: Phase 1
**Key risks**: Naming and git mutation are the two highest-risk behaviors in the feature. If either lands with incomplete error modeling, the web layer will be forced to guess about blocking versus warning states.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Implement `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-name.ts` for normalization, ordinal allocation, and refreshed conflict handling | workspace | Plain slug input and pasted `NNN-slug` input both produce canonical preview/create outputs, and collision outcomes return refreshed suggestions instead of ad-hoc suffixes | Per finding 03 and workshop 001 |
| 2.2 | Implement `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts` with lock-aware preflight and create operations | workspace | The manager can detect dirty/ahead/diverged `main`, fetch/compare/fast-forward safely, and create the worktree from refreshed local `main` with structured result objects | Per finding 02 and workshop 002 |
| 2.3 | Extend `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts` with preview/create orchestration and hook execution | workspace | `previewCreateWorktree()` and `createWorktree()` return structured success, blocking error, and bootstrap warning outcomes using the authoritative main-sourced hook contract | Per finding 01 and workshop 004 |
| 2.4 | Add domain-layer tests for service, manager, and hook outcomes | workspace | `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts`, and contract coverage prove naming, safety checks, bootstrap warnings, and fake/real parity | Use fakes and fixtures first; no broad mocking libraries |

##### Acceptance Criteria

- [ ] The workspace domain can preview and create new worktrees from refreshed local `main` using the agreed ordinal naming convention.
- [ ] Blocking git safety failures stop creation before any branch or worktree is created.
- [ ] Hook execution is sourced from `<mainRepoPath>/.chainglass/new-worktree.sh`, runs with structured environment variables, and reports `skipped`, `succeeded`, or `failed` without rolling back a created worktree.

##### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ordinal allocation misses one of the required scan sources | Medium | High | Mirror the workshop’s three-source scan and lock final allocation inside the create path |
| Git parsing behaves differently across edge-case repo states | Medium | High | Build the manager behind fake/contract coverage and test each blocked state explicitly |
| Hook execution introduces unsafe path or shell behavior | Low | High | Validate hook realpath under `.chainglass/`, run via `bash` without interpolation, and capture bounded log tails |

#### Phase 3: Build the Full-Page Create Flow

**Objective**: Add the full-page route, form, preview, and server-action mapping that expose workspace-domain preview/create behavior to the user.
**Domain**: workspace
**Delivers**:
- `/workspaces/[slug]/new-worktree` page
- `useActionState`-driven form with preview, pending, blocking error, and bootstrap warning states
- Web-layer result mapping that keeps URL building and cache revalidation in `apps/web`
**Depends on**: Phase 2
**Key risks**: The web layer already has the right form/action pattern, but this page needs richer state transitions than the current generic workspace add flow. If page state is underspecified, bootstrap warnings and naming conflicts will degrade into generic toasts.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Add `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx` and `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx` | workspace | The page loads workspace context, shows preview data, explains advanced details, and renders blocking/pending/warning states without modal or drawer behavior | Per workshop 003 |
| 3.2 | Extend `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/actions/workspace-actions.ts` with preview/create action adapters | workspace | Actions call `requireAuth()`, validate `requestedName`, resolve `IWorkspaceService`, revalidate workspace routes, and map domain outcomes into a page-state union that preserves form fields | Per findings 01 and 04 |
| 3.3 | Add targeted web tests for the new route and form state behavior | workspace | `/Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx` proves preview rendering, blocking error preservation, and bootstrap warning “Open Worktree Anyway” behavior | Reuse existing form/action testing patterns |

##### Acceptance Criteria

- [ ] Selecting the new-worktree action opens a dedicated full-page route at `/workspaces/[slug]/new-worktree`.
- [ ] The page shows a best-effort preview before submission and preserves user input on blocking failures.
- [ ] A bootstrap warning state stays on the page and offers an explicit “Open Worktree Anyway” action.

##### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Preview and submit flows drift apart | Medium | Medium | Recompute and refresh preview data inside the create action response |
| Generic `ActionState` cannot express bootstrap warnings cleanly | High | Medium | Introduce a dedicated page-state union instead of overloading message strings |

#### Phase 4: Compose Navigation and Landing

**Objective**: Expose always-available create entrypoints, finish the browser handoff, and synchronize documentation plus final verification.
**Domain**: workspace
**Delivers**:
- Sidebar plus affordance in expanded and collapsed states
- Hard navigation into the existing browser route after success
- Updated README and workspace web-ui docs
- Final validation across workspace and file-browser surfaces
**Depends on**: Phase 3
**Key risks**: The final UX depends on composition, not just creation. If navigation stays soft or entrypoints are inconsistent, users will create worktrees successfully but land in stale or undiscoverable UI states.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Update `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx` and `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/workspace-nav.tsx` with create entrypoints | workspace | The plus affordance is visible next to Worktrees in the expanded sidebar and remains reachable through the collapsed workspace header action cluster | Per workshop 003 |
| 4.2 | Finalize the browser handoff in `/Users/jordanknight/substrate/069-new-worktree/apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` and the new form flow | file-browser | Successful creation ends with a hard navigation built via `_platform/workspace-url`, the deprecated `/worktree` shim stays unused, and the browser route remains the canonical landing surface | Per finding 05 |
| 4.3 | Update `/Users/jordanknight/substrate/069-new-worktree/docs/how/workspaces/3-web-ui.md`, `/Users/jordanknight/substrate/069-new-worktree/README.md`, and workspace domain artifacts | workspace | Discoverability docs explain the new route, sidebar entrypoints, `main`-only behavior, and optional `.chainglass/new-worktree.sh` bootstrap contract | Required by the hybrid documentation decision |
| 4.4 | Run final verification across domain, web, and navigation surfaces | workspace | The implemented feature passes relevant workspace/domain tests plus repository quality checks, and manual verification confirms success, blocking error, and bootstrap warning flows | Validate with existing repo commands and browser/manual evidence |

##### Acceptance Criteria

- [ ] The Worktrees plus action is available in both expanded and collapsed sidebar states while inside a workspace.
- [ ] Successful creation hard-navigates to `/workspaces/[slug]/browser?worktree=<new-path>` and the sidebar remounts with the new worktree visible.
- [ ] The shipped docs explain both the in-product flow and the repo-owned bootstrap hook.

##### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sidebar still shows stale worktree data after creation | High | High | Use hard navigation and avoid relying on implicit refetch behavior |
| Browser landing needs a small compatibility adjustment that is missed until the end | Medium | Medium | Reserve a file-browser verification task in this phase instead of assuming the current route is sufficient |
| Documentation drifts from the implemented hook contract | Medium | Medium | Update README, `docs/how/workspaces/3-web-ui.md`, and workspace domain docs in the same phase |
