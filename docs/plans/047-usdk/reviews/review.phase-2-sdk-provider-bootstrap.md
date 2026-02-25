# Code Review: Phase 2 — SDK Provider & Bootstrap

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 2: SDK Provider & Bootstrap
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (TDD for core, Lightweight for hooks/provider/UI)

## A) Verdict

**REQUEST_CHANGES**

One HIGH severity bug: `persistFn` stored in `useRef` is read at render-time into context, meaning settings persistence via hooks silently fails (the persist function is always `null` in consumer closures). Additionally, domain documentation artifacts need Phase 2 updates.

**Key failure areas** (one sentence each):
- **Implementation**: `persistFnRef.current` is snapshotted into context at render-time — ref mutations from SDKWorkspaceConnector don't trigger re-render, so `useSDKSetting` setValue never persists.
- **Domain compliance**: `_platform/settings` domain referenced in manifest but not registered; domain.md not updated for Phase 2 deliverables.
- **Testing**: Zero Phase 2 test files; AC-19 (hook re-render) has no coverage path; coverage confidence 42%.

## B) Summary

Phase 2 correctly implements the SDKProvider/bootstrap/hooks architecture with good attention to the DYK constraints (try/catch bootstrap, direct sonner import for toast, strict mode documentation). However, the `persistFn` bug means the core settings roundtrip (set → persist → server) silently fails — the most critical feature of this phase. Domain documentation is stale (History, Source Location, Composition not updated for Phase 2). No new tests were written; the "Lightweight" tier still expects basic smoke tests for hooks and provider rendering. The anti-reinvention check is clean — no concept duplication found.

## C) Checklist

**Testing Approach: Hybrid (Lightweight for Phase 2 layer)**

- [ ] Core validation tests present for provider/hooks
- [ ] Critical path covered (settings roundtrip: set → persist → reload → hydrate)
- [ ] Key verification points documented in execution log
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (test regression noted in execution log)
- [x] Domain compliance checks pass (documentation gaps only, no structural violations)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | sdk-provider.tsx:83-113 | correctness | `persistFn` stored in `useRef` reads stale `null` into context — settings never persist | Convert `useRef` to `useState` for persistFn, or read `.current` lazily in consumers |
| F002 | MEDIUM | (no test files) | testing | Zero Phase 2 tests; AC-19 hook re-render has no coverage | Add lightweight renderHook test for useSDKSetting |
| F003 | MEDIUM | docs/domains/registry.md | domain-compliance | `_platform/settings` domain in manifest but not registered | Register domain or reclassify sdk-settings-actions.ts |
| F004 | MEDIUM | sdk-workspace-connector.tsx:18 | architecture | lib/ imports from app/actions/ — inverts dependency direction | Pass persist callback as prop from layout |
| F005 | MEDIUM | docs/domains/_platform/sdk/domain.md | domain-compliance | § History missing Phase 2 entry | Add Phase 2 row to History table |
| F006 | MEDIUM | docs/domains/_platform/sdk/domain.md | domain-compliance | § Source Location missing Phase 2 files | Add 5 new Phase 2 files |
| F007 | LOW | sdk-workspace-connector.tsx:41 | performance | `sdkSettings` prop is fresh object ref on every render → unnecessary effect re-fires | Stabilize with JSON.stringify key or useMemo |
| F008 | LOW | sdk-settings-actions.ts:26 | security | Server action accepts unvalidated Record<string, unknown> | Add lightweight size/key-pattern guard |
| F009 | LOW | docs/domains/_platform/sdk/domain.md | domain-compliance | § Composition missing Phase 2 components | Add bootstrapSDK, hooks, connector |
| F010 | LOW | (no test) | testing | Execution log evidence is only "tests pass" — no manual verification | Document roundtrip verification in execution log |
| F011 | LOW | sdk-provider.tsx:58,68 | convention | Internal interfaces not I-prefixed (SDKContextValue, SDKProviderProps) | Rename to ISDKContextValue etc. or amend rule for React props |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 (HIGH) — Stale `persistFn` ref breaks settings persistence**

In `sdk-provider.tsx`, `persistFnRef` is a `useRef`. The context value object reads `persistFnRef.current` at render time (line 111). When `SDKWorkspaceConnector` mounts and calls `setPersistFn(fn)`, it mutates the ref — but refs don't trigger re-renders. Therefore, all context consumers (including `useSDKSetting`) see `persistFn: null` forever, and `setValue` silently skips persistence.

```typescript
// Current (broken):
const persistFnRef = useRef<...>(null);
const contextValue = {
  persistFn: persistFnRef.current,  // ← always null until unrelated re-render
};

// Fix option A: useState (triggers re-render):
const [persistFn, setPersistFnState] = useState<...>(null);
const contextValue = {
  persistFn,  // ← updated immediately on setPersistFnState
};

// Fix option B: expose ref, read lazily in consumers:
// In useSDKSetting's setValue: if (persistFnRef.current) { ... }
```

**F007 (LOW) — sdkSettings prop reference instability**

The workspace layout creates `const sdkSettings = prefs?.sdkSettings ?? {}` — a fresh object on every render. `SDKWorkspaceConnector`'s `useEffect` has `sdkSettings` in its dependency array, so the effect fires on every layout re-render (navigating between pages under the workspace). This causes unnecessary `hydrate()` → `clearWorkspaceContext()` → `setWorkspaceContext()` cycles.

**F008 (LOW) — Server action unvalidated input**

`updateSDKSettings` accepts `Record<string, unknown>` with no validation. While Next.js handles CSRF and this is local-user data, an oversized or malformed payload could bloat the workspace JSON file.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files under correct domain source trees |
| Contract-only imports | ⚠️ | F004: sdk-workspace-connector.tsx imports from _platform/settings internal (app/actions/) |
| Dependency direction | ⚠️ | F004: lib/ → app/ is an inverted dependency |
| Domain.md updated | ❌ | F005: § History missing Phase 2; F006: § Source Location missing Phase 2 files; F009: § Composition incomplete |
| Registry current | ⚠️ | F003: _platform/settings in manifest but not in registry.md |
| No orphan files | ⚠️ | providers.tsx and layout.tsx modified but not in Phase 2 manifest (minor — both are cross-domain) |
| Map nodes current | ✅ | sdk node added with correct contracts |
| Map edges current | ✅ | Dashed edges show future consumption relationships |
| No circular business deps | ✅ | No circular dependencies |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| SDKProvider | ContainerContext, WorkspaceProvider (different purpose) | DI, workspace-UI | ✅ proceed |
| useSDKSetting | useResponsive (same pattern, different store) | hooks | ✅ proceed |
| useSDKContext | None | N/A | ✅ proceed |
| bootstrapSDK | None | N/A | ✅ proceed |
| SDKWorkspaceConnector | None | N/A | ✅ proceed |
| updateSDKSettings | updateWorkspacePreferences (overlapping persist target) | workspace | ⚠️ extend — acknowledged in DYK-P2-04 |

### E.4) Testing & Evidence

**Coverage confidence**: 42%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-16 | 70% | Phase 1 contract tests verify contribute()+list(). Provider is thin passthrough. |
| AC-17 | 75% | Phase 1 contract tests verify get() returns default/hydrated override. |
| AC-18 | 55% | Phase 1 tests cover set()+validate+onChange. Persistence path (server action) untested. |
| AC-19 | 15% | NO coverage. useSyncExternalStore+onChange integration untested — React-specific concern. |
| AC-20 | 70% | Phase 1 contract tests verify reset(). |
| AC-33 | 100% | Phase 1 complete. FakeUSDK exists. |
| AC-34 | 100% | Phase 1 complete. 46 contract tests pass. |

### E.5) Doctrine Compliance

**F004 (MEDIUM) — lib/ → app/ layer inversion**

`sdk-workspace-connector.tsx` (in `src/lib/sdk/`) imports `updateSDKSettings` from `app/actions/sdk-settings-actions.ts`. Per architecture conventions, `src/lib/` is a utility layer that should not depend on `app/` (the framework/routing layer). Fix: pass the persist callback as a prop from the workspace layout.

**F011 (LOW) — Interface naming convention**

Internal interfaces `SDKContextValue` and `SDKProviderProps` lack the `I` prefix per R-CODE-002. This is debatable — React community convention avoids `I` prefix for props interfaces. Flagging for awareness, not blocking.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-16 | Domain can contribute settings → appears in list | Phase 1 contract tests (indirect) | 70% |
| AC-17 | get(key) returns persisted override or default | Phase 1 contract tests (indirect) | 75% |
| AC-18 | set() validates, updates, fires onChange, persists | Phase 1 for store; persistence path untested | 55% |
| AC-19 | useSDKSetting(key) re-renders on change | No coverage | 15% |
| AC-20 | reset() returns to default | Phase 1 contract tests (indirect) | 70% |
| AC-33 | FakeUSDK exists | Phase 1 complete ✅ | 100% |
| AC-34 | Contract tests verify fake/real parity | Phase 1 complete ✅ | 100% |

**Overall coverage confidence**: 42%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager diff -- apps/web/app/\(dashboard\)/workspaces/\[slug\]/layout.tsx apps/web/src/components/providers.tsx packages/workflow/src/entities/workspace.ts packages/shared/package.json packages/shared/src/fakes/index.ts packages/shared/src/interfaces/index.ts docs/domains/domain-map.md docs/domains/registry.md
find apps/web/src/lib/sdk/ apps/web/app/actions/sdk-settings-actions.ts -type f
# All Phase 2 files read via view tool
# 5 parallel review subagents launched
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 2: SDK Provider & Bootstrap
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-2-sdk-provider-bootstrap/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-2-sdk-provider-bootstrap/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/review.phase-2-sdk-provider-bootstrap.md
**Fix tasks**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/fix-tasks.phase-2-sdk-provider-bootstrap.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-bootstrap.ts | created | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-provider.tsx | created | _platform/sdk | Fix F001 (persistFn ref→state) |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/use-sdk-setting.ts | created | _platform/sdk | May need update after F001 fix |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/use-sdk-context.ts | created | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-workspace-connector.tsx | created | _platform/sdk | Fix F004 (layer inversion) |
| /home/jak/substrate/041-file-browser/apps/web/app/actions/sdk-settings-actions.ts | created | _platform/settings | None (F003 is doc-only) |
| /home/jak/substrate/041-file-browser/apps/web/src/components/providers.tsx | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | modified | cross-domain | May need update after F004 |
| /home/jak/substrate/041-file-browser/packages/workflow/src/entities/workspace.ts | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | existing | _platform/sdk | Fix F005, F006, F009 |
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | modified | cross-domain | Fix F003 (if settings domain formalized) |

### Required Fixes (REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-provider.tsx | Convert `persistFnRef` (useRef) to `useState` so context consumers get updated persist function | F001: Settings persistence silently fails — useSDKSetting setValue always sees null |
| 2 | /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-workspace-connector.tsx | Remove direct import of server action; accept persist callback as prop | F004: lib/ → app/ layer inversion |
| 3 | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Pass persist callback prop to SDKWorkspaceConnector | F004: Support connector refactor |
| 4 | /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | Add Phase 2 to § History, § Source Location, § Composition | F005, F006, F009: Domain doc currency |
| 5 | test/unit/web/lib/sdk/use-sdk-setting.test.tsx | Add lightweight renderHook test for useSDKSetting | F002: AC-19 has zero coverage |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | § History: Phase 2 row. § Source Location: 5 new files. § Composition: bootstrapSDK, useSDKSetting, useSDKContext, SDKWorkspaceConnector |

### Next Step

Apply fixes from fix-tasks file, then re-run review:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md --phase "Phase 2: SDK Provider & Bootstrap"
```
Then re-run:
```
/plan-7-v2-code-review --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md --phase "Phase 2: SDK Provider & Bootstrap"
```
