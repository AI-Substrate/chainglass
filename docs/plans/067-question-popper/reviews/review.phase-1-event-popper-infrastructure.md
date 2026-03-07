# Code Review: Phase 1: Event Popper Infrastructure

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 1: Event Popper Infrastructure
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD (phase dossier); overall plan strategy is Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 1 cannot be approved because the promised `@chainglass/shared/event-popper` public contract is not actually exported, the localhost-only guard is not trustworthy, the PID recycling contract is incomplete, and the phase evidence is not green.

**Key failure areas**:
- **Implementation**: The new shared subpath is broken, GUID ordering is not monotonic, and PID recycling is not checked against the live process start time.
- **Domain compliance**: `_platform/external-events` was created without corresponding registry/domain-map updates, and the touched domain docs are incomplete/stale.
- **Reinvention**: No blocking duplication found; the new utilities mostly follow nearby workflow-events and terminal patterns.
- **Testing**: The phase suite is red (21/22), misses localhost/X-Forwarded-For and PID-recycle coverage, and does not substantiate AC-01/AC-02.
- **Doctrine**: The new tests skip required Test Doc blocks and bypass the public package boundary with cross-package relative imports.

## B) Summary

The phase establishes most of the intended infrastructure scaffolding in sensible locations, and the anti-reinvention pass found no duplicate subsystem that should replace this work. However, the shared Event Popper contract is not consumable through the import path already used by `apps/web/instrumentation.ts`, the localhost guard can be spoofed via the client-controlled `Host` header, and port discovery does not implement the required PID start-time comparison. Domain artifacts also lag behind the code: `_platform/external-events` is missing from `docs/domains/registry.md` and `docs/domains/domain-map.md`, while `_platform/events` was not updated for the new `WorkspaceDomain.EventPopper` channel. Testing evidence is weak: the targeted phase suite currently fails, several critical branches are untested, and the phase's AC mapping remains only partially supported by concrete verification.

## C) Checklist

**Testing Approach: Full TDD (phase dossier)**

- [ ] RED evidence recorded before implementation
- [ ] GREEN evidence recorded after implementation
- [ ] Critical Phase 1 security and stale-state paths covered
- [ ] Phase test suite green (`pnpm vitest run test/unit/event-popper/infrastructure.test.ts`)
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/packages/shared/package.json:7-47 | correctness | `@chainglass/shared/event-popper` is not exported, so the public import path promised by T009 and already used by `instrumentation.ts` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. | Add a `./event-popper` package export, verify the runtime import, and align the shared barrels with the intended public surface. |
| F002 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts:23-39 | security | The localhost guard falls back to the client-controlled `Host` header, so the auth-bypassed route can be spoofed if no trusted peer address is available. | Remove the `Host` fallback and enforce loopback-only access using a trusted peer address from the runtime layer. |
| F003 | HIGH | /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts:12-18 | correctness | `generateEventId()` is not lexically monotonic for same-millisecond calls, and the current phase test file already fails on this contract. | Add a same-millisecond sequence/counter (or another monotonic suffix strategy) while keeping the filesystem-safe timestamp prefix. |
| F004 | HIGH | /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts:70-79 | correctness | The PID recycling guard compares `startedAt` to wall clock time, not the live process start time, so a recycled but alive PID can still be accepted as current. | Query the target PID's actual start time and reject mismatches; cover the branch with a dedicated recycled-PID test. |
| F005 | HIGH | /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts:1-232 | testing | Phase evidence is red and incomplete: the suite currently reports 21 passed / 1 failed, while localhost/X-Forwarded-For, PID recycling, tmux command-failure, and instrumentation/proxy behavior remain unverified. | Add the missing tests/manual evidence, rerun the phase checks to green, and update `execution.log.md` with the real command output. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md:1-25; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:1-151 | domain-compliance | The new `_platform/external-events` domain and its dependency on `_platform/events` are absent from the registry, map topology, and health summary. | Add the registry row, map node, labeled dependency edge, and health summary entries for `_platform/external-events`. |
| F007 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md:11-83; /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md:58-175 | domain-compliance | The new/stale domain docs do not fully document Boundary, Composition, Concepts, and Plan 067 history for the created domain and modified `WorkspaceDomain` contract. | Add the missing sections to `_platform/external-events/domain.md` and sync `_platform/events/domain.md` to the new channel. |
| F008 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-92 | domain-compliance | The Phase 1 Domain Manifest omits several changed files (`instrumentation.ts`, `proxy.ts`, `workspace-domain.ts`, and the infrastructure test), leaving orphaned review scope. | Add manifest rows for every touched file with the correct domain and classification. |
| F009 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts:1-232 | doctrine | The tests omit required 5-field Test Doc blocks and use cross-package relative imports instead of the supported public contract. | Add Test Doc comments to each test and switch to the public package alias once F001 is fixed. |
| F010 | LOW | /Users/jordanknight/substrate/067-question-popper/packages/shared/src/index.ts:1-311 | scope | T009 explicitly called for a root `packages/shared/src/index.ts` export section, but the root shared barrel is unchanged. | Add the root export block or revise the task dossier to make the public surface subpath-only. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/packages/shared/package.json:7-47`  
  The new Event Popper barrel exists, but the package export map does not expose `./event-popper`. After building `@chainglass/shared`, `node --input-type=module -e "import('@chainglass/shared/event-popper')"` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which breaks the import already used in `/Users/jordanknight/substrate/067-question-popper/apps/web/instrumentation.ts`.

- **F002 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts:23-39`  
  The guard rejects `X-Forwarded-For`, but if a trusted peer address is unavailable it falls back to `Host`, which is client-controlled. That makes the new auth bypass for `/api/event-popper/*` dependent on a spoofable header instead of a trustworthy loopback source.

- **F003 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts:12-18`  
  The implementation uses `{timestamp}_{random}`. When two IDs share the same millisecond, sort order is determined by randomness rather than call order, and the current targeted `vitest` run demonstrates the failure.

- **F004 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts:70-79`  
  The code comments describe a PID start-time comparison, but the implementation only checks whether `startedAt` is in the future relative to `Date.now()`. That does not detect a recycled PID whose new process started after the recorded timestamp.

- **F005 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts:1-232`  
  The current phase suite is not green and does not cover the most sensitive branches claimed by T008. The execution log's `22/22 tests pass` statement is therefore not reproducible from the current worktree.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source files are under the expected `_platform/external-events` trees (`packages/shared/src/event-popper/`, `packages/shared/src/utils/`, `apps/web/src/lib/`). |
| Contract-only imports | ✅ | No cross-domain internal-file import violations were observed in the changed source. |
| Dependency direction | ✅ | No infrastructure → business dependency was introduced; the only cross-domain touch is additive `_platform/events` channel registration. |
| Domain.md updated | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md` lacks Boundary/Composition, and `/Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md` was not updated for the new channel. |
| Registry current | ❌ | `_platform/external-events` is missing from `/Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md`. |
| No orphan files | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md` omits manifest rows for `apps/web/instrumentation.ts`, `apps/web/proxy.ts`, `packages/shared/src/features/027-central-notify-events/workspace-domain.ts`, and `test/unit/event-popper/infrastructure.test.ts`. |
| Map nodes current | ❌ | `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md` has no `_platform/external-events` node or health summary row. |
| Map edges current | ❌ | The map does not show the labeled `_platform/external-events` → `_platform/events` dependency for `WorkspaceDomain.EventPopper`. |
| No circular business deps | ✅ | No new business → business edges were added in this phase. |
| Concepts documented | ⚠️ | `_platform/external-events` has a Concepts table, but `_platform/events` still lacks one despite a public-contract change in `WorkspaceDomain`. |

Additional domain notes:
- **F006 (MEDIUM)** — Registry/map topology is stale for the newly created infrastructure domain.
- **F007 (MEDIUM)** — Domain docs are incomplete for `_platform/external-events` and stale for `_platform/events`.
- **F008 (MEDIUM)** — The plan's Domain Manifest does not cover all touched files.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Event envelope schemas | None | — | Proceed |
| Event ID generation | `WorkflowEventsService.generateQuestionId()` | `workflow-events` | Proceed — nearby prior art, but not a reusable cross-domain contract |
| Port discovery | None | — | Proceed |
| Localhost guard | None | — | Proceed |
| Tmux context utility | `TmuxSessionManager` | `terminal` | Proceed — justified extraction of tmux-related logic into shared utilities |
| Event-popper barrel | `packages/shared/src/workflow-events/index.ts` | `workflow-events` | Extend pattern |

No genuine cross-domain duplication was found that should block the phase. The nearest overlaps are implementation patterns rather than reusable contracts that were ignored.

### E.4) Testing & Evidence

**Coverage confidence**: 18%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 20% | Partial prerequisite evidence only: `schemas.ts`, `guid.ts`, `port-discovery.ts`, `localhost-guard.ts`, and `WorkspaceDomain.EventPopper` exist, but there is no verified `POST /api/event-popper/ask-question`, `GET /api/event-popper/question/{id}`, storage, SSE emission, or state publication evidence. |
| AC-02 | 12% | Only indirect prerequisites exist: response envelope support and channel registration. There is no verified `POST /api/event-popper/answer-question/{id}`, CLI polling retrieval, SSE emission, or state update evidence for this phase. |

Testing violations:
- **F005 (HIGH)** — `pnpm vitest run test/unit/event-popper/infrastructure.test.ts` currently reports **21 passed / 1 failed**; the failing assertion is the chronological-sort check for `generateEventId()`.
- **F005 (HIGH)** — `test/unit/event-popper/infrastructure.test.ts` does not cover localhost allow/deny cases, `X-Forwarded-For` rejection, instrumentation/proxy behavior, recycled PID handling, or tmux command-failure handling.
- **Testing evidence gap (MEDIUM)** — The execution log records tasks T001-T007 as completed before T008 and provides no RED → GREEN proof despite the phase being documented as TDD.
- **AC mapping gap (MEDIUM)** — The phase dossier points at AC-01/AC-02, but the implemented files are infrastructure prerequisites rather than verified end-to-end API behavior.

### E.5) Doctrine Compliance

- **F009 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts:1-232` lacks the required 5-field Test Doc blocks mandated by `docs/project-rules/rules.md` and `docs/project-rules/constitution.md`.
- **F009 (MEDIUM)** — The same test file imports from `../../../packages/shared/src/...` instead of a supported alias/public package contract, bypassing the package boundary the project rules expect.
- **F001 (HIGH, cross-cutting)** — The package export surface does not match the claimed public import path, which is also a doctrine/architecture contract problem.

### E.6) Harness Live Validation

N/A — no harness configured (`/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` does not exist).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | CLI `ask-question` flow stores the question, returns `{ questionId }`, emits SSE, publishes global state, and supports retrieval via `GET /api/event-popper/question/{id}`. | Only infrastructure prerequisites are present (`schemas.ts`, `guid.ts`, `port-discovery.ts`, `localhost-guard.ts`, `WorkspaceDomain.EventPopper`). No route/service/UI verification exists in this phase, and the phase suite is not green. | 20% |
| AC-02 | Web UI `answer-question/{id}` flow stores the answer, makes it retrievable to the CLI, emits SSE, and updates global state. | Response schema and SSE channel prerequisites exist, but no answer route/service/polling evidence exists for this phase. | 12% |

**Overall coverage confidence**: 18%

## G) Commands Executed

```bash
git --no-pager diff --stat && printf '\n---STAGED---\n' && git --no-pager diff --staged --stat && printf '\n---LOG---\n' && git --no-pager log --oneline -10
git --no-pager status --short --untracked-files=all && printf '\n---TRACKED-NAMES---\n' && git --no-pager diff --name-status && printf '\n---UNTRACKED---\n' && git ls-files --others --exclude-standard
python - <<'PY'
# Parsed Phase 1 task-table paths and wrote /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/reviews/_computed.diff
PY
pnpm vitest run test/unit/event-popper/infrastructure.test.ts
pnpm typecheck
pnpm --filter @chainglass/shared build && node --input-type=module -e "import('@chainglass/shared/event-popper').then(() => console.log('IMPORT_OK')).catch((err) => { console.error(err.code || 'ERR', err.message); process.exit(1); })"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 1: Event Popper Infrastructure
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-1-event-popper-infrastructure/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-1-event-popper-infrastructure/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/reviews/review.phase-1-event-popper-infrastructure.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/schemas.ts | created | _platform/external-events | Keep; no blocking issue found in envelope shape. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts | created | _platform/external-events | Make IDs lexically monotonic for same-millisecond generation. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts | created | _platform/external-events | Implement real PID start-time comparison and cover it with tests. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/instrumentation.ts | modified | _platform/external-events | Keep behavior, but only after the shared public import path actually resolves. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts | created | _platform/external-events | Replace the spoofable `Host` fallback with a trusted loopback check. |
| /Users/jordanknight/substrate/067-question-popper/apps/web/proxy.ts | modified | _platform/external-events | Revalidate the auth bypass together with the hardened localhost guard. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/utils/tmux-context.ts | created | _platform/external-events | Add missing command-failure test coverage. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/features/027-central-notify-events/workspace-domain.ts | modified | _platform/events | Keep additive channel change; sync docs/domain map/history. |
| /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts | created | _platform/external-events | Make suite green, add missing security/stale-state tests, add Test Docs, and switch to public alias imports. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/index.ts | created | _platform/external-events | Keep barrel; pair it with package exports and root barrel alignment. |
| /Users/jordanknight/substrate/067-question-popper/packages/shared/src/index.ts | expected-clean | _platform/external-events | Add the T009 root export block or revise the dossier to subpath-only exports. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md | created | _platform/external-events | Add Boundary/Composition and keep docs in sync with the final public contract. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md | context | registry | Add `_platform/external-events` row. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | context | architecture | Add the new domain node, labeled dependency edge, and health summary row. |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | context | _platform/events | Add Plan 067 history/contract/concepts updates for `WorkspaceDomain.EventPopper`. |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/packages/shared/package.json | Export `./event-popper` (and align shared barrels as needed). | The current import path throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. |
| 2 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts | Remove the spoofable `Host` fallback and use a trusted loopback source. | The current guard can be bypassed once auth is excluded. |
| 3 | /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts | Make same-millisecond IDs sort in call order. | The phase's own test currently fails this contract. |
| 4 | /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts | Implement actual PID start-time validation. | The documented PID recycling guarantee is not present. |
| 5 | /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts | Add missing localhost/X-Forwarded-For, PID recycle, tmux failure, and evidence-alignment coverage. | The suite is red and does not verify critical Phase 1 behavior. |
| 6 | /Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Register/map `_platform/external-events` and its dependency on `_platform/events`. | The domain topology is currently stale. |
| 7 | /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Complete Boundary/Composition/Concepts/History updates and manifest rows. | Domain docs and the plan manifest do not fully reflect the work reviewed. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md | `_platform/external-events` registry row |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | `_platform/external-events` node, `_platform/external-events` → `_platform/events` edge label, health summary row |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md | Boundary section and Composition table |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md | Plan 067 history entry, WorkspaceDomain contract update, Concepts section |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Domain Manifest rows for instrumentation/proxy/workspace-domain/test files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md --phase 'Phase 1: Event Popper Infrastructure'
