# Code Review: Phase 1 — SDK Foundation

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 1: SDK Foundation
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (Full TDD for SDK core via contract test factory)

## A) Verdict

**APPROVE WITH NOTES**

One HIGH finding (missing unit test deliverables) is mitigated by contract tests providing equivalent functional coverage. Two MEDIUM findings should be addressed before Phase 3.

**Key failure areas**:
- **Implementation**: FakeCommandRegistry.isAvailable() parity gap — fake does presence check while real evaluates when-clauses; will cause false positives in Phase 3+ tests
- **Testing**: 3 unit test files listed as T006-T008 deliverables were not created; contract tests cover equivalent scenarios

## B) Summary

Phase 1 delivers a solid SDK foundation — 3 in-memory engines (CommandRegistry, SettingsStore, ContextKeyService) behind well-defined interfaces, with a comprehensive FakeUSDK and 46 passing contract tests (23 per implementation). Domain compliance is clean across all 9 checks: file placement, imports, dependency direction, domain docs, registry, map, and no orphans. No concept reinvention detected — the NodeEventRegistry pattern mirror is intentional and well-documented. The main gaps are deliverable (missing unit test files) and behavioral (isAvailable parity between fake and real), both addressable before Phase 2-3 without structural changes.

## C) Checklist

**Testing Approach: Hybrid (Full TDD for core)**

- [x] Contract test factory exists (`test/contracts/sdk.contract.ts`)
- [x] Contract tests run against both fake and real implementations (23 + 23 = 46)
- [x] DYK-01 duplicate-ID test present
- [x] DYK-02 referential stability test present
- [x] No vi.mock(), vi.fn(), vi.spyOn() calls in test files
- [ ] Dedicated unit test files for T006-T008 deliverables (empty directory exists)
- [x] Full test suite passes (4416 tests, 0 failures per execution log)
- [x] Only in-scope files changed
- [x] Domain compliance checks pass (9/9)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | test/unit/web/sdk/:* | scope | Missing unit test files — T006-T008 deliverables not created | Create files or update task table |
| F002 | MEDIUM | packages/shared/src/fakes/fake-usdk.ts:67-69 | correctness | FakeCommandRegistry.isAvailable() ignores when-clauses, diverging from real | Inject FakeContextKeyService, delegate to evaluate() |
| F003 | MEDIUM | apps/web/src/lib/sdk/context-key-service.ts:37-39 | correctness | evaluate() equality: String(undefined)==="undefined" matches unset keys | Guard with `if (!this.keys.has(key)) return false` |
| F004 | LOW | packages/shared/src/interfaces/sdk.interface.ts:16 | pattern | Unused SDKKeybinding import | Remove from import |
| F005 | LOW | test/contracts/sdk.contract.ts:16 | pattern | Unused `vi` import from vitest | Remove `vi` from import |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — Missing unit test deliverables (HIGH)**

Tasks T006-T008 each list dedicated unit test files in their Path(s) column:
- `test/unit/web/sdk/command-registry.test.ts`
- `test/unit/web/sdk/settings-store.test.ts`
- `test/unit/web/sdk/context-key-service.test.ts`

The directory `test/unit/web/sdk/` exists but is empty. The contract test factory (`test/contracts/sdk.contract.ts`) covers equivalent behaviors, but some task-specified scenarios may have gaps:
- "execute with throwing handler shows toast (doesn't propagate)" — DYK-05 behavior not tested in contracts
- "when-clause filtering" in isAvailable — only basic presence tested in contracts

**Mitigation**: Contract tests provide 46 passing tests covering all core behaviors. The functional gap is minimal. Creating the unit test files with additional edge-case coverage (DYK-05 toast behavior, when-clause filtering) would close the deliverable gap.

---

**F002 — FakeCommandRegistry.isAvailable() parity gap (MEDIUM)**

```typescript
// Fake (line 67-69): presence check only
isAvailable(id: string): boolean {
  return this.commands.has(id);
}

// Real (line 70-74): when-clause evaluation
isAvailable(id: string): boolean {
  const cmd = this.commands.get(id);
  if (!cmd) return false;
  return this.contextKeys.evaluate(cmd.when);
}
```

Tests using FakeCommandRegistry will never catch when-clause bugs. This will matter in Phase 3 (command palette) and Phase 4 (keyboard shortcuts) where commands use when-clauses like `workspace.active`.

**Suggestion**: Inject a FakeContextKeyService into FakeCommandRegistry and delegate isAvailable() to evaluate the when-clause. Add a contract test for isAvailable with a failing when-clause.

---

**F003 — ContextKeyService equality with unset keys (MEDIUM)**

```typescript
// Line 37-39: equality evaluation
if (expr.includes('==')) {
  const [key, val] = expr.split('==').map((s) => s.trim());
  return String(this.keys.get(key)) === val;
}
```

When a key is not set, `this.keys.get(key)` returns `undefined`, and `String(undefined)` is `"undefined"`. This means `evaluate('panel == undefined')` matches any unset key — likely unintended. The same issue exists in FakeContextKeyService.

**Suggestion**: Add a guard before the String comparison:
```diff
  if (expr.includes('==')) {
    const [key, val] = expr.split('==').map((s) => s.trim());
+   if (!this.keys.has(key)) return false;
    return String(this.keys.get(key)) === val;
  }
```

---

**F004 — Unused SDKKeybinding import (LOW)**

`packages/shared/src/interfaces/sdk.interface.ts` line 16 imports `SDKKeybinding` but it's not used in any interface definition. Will be caught by biome lint.

---

**F005 — Unused `vi` import (LOW)**

`test/contracts/sdk.contract.ts` line 16 imports `vi` from vitest but never uses it. While no R-TEST-007 violation (vi.mock/fn/spyOn never called), the import signals intent to mock and invites future violations.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All 11 new files under correct domain source trees per Domain Manifest |
| Contract-only imports | ✅ | All imports use `@chainglass/shared/sdk` (public barrel) or intra-package relative paths |
| Dependency direction | ✅ | SDK depends on nothing (self-contained infrastructure); workspace.ts adds primitive-typed fields only |
| Domain.md updated | ✅ | History shows "047-usdk Phase 1", Composition has 5 components, Contracts lists 9 entries |
| Registry current | ✅ | `_platform/sdk` row exists with status "active" |
| No orphan files | ✅ | All 17 changed files map to `_platform/sdk` or `cross-domain` per manifest |
| Map nodes current | ✅ | SDK node defined with contracts in label |
| Map edges current | ✅ | 3 dashed edges (future phases) with contract labels |
| No circular business deps | ✅ | No business→business cycles; SDK is infrastructure consumed by all |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| CommandRegistry | NodeEventRegistry (acknowledged pattern reference, different domain/different types) | positional-graph | ✅ proceed |
| SettingsStore | ChainglassConfigService (server-side config, completely different lifecycle) | shared/config | ✅ proceed |
| ContextKeyService | None | N/A | ✅ proceed |
| FakeUSDK | None (follows established Fake* pattern) | N/A | ✅ proceed |
| SDK Interfaces | None | N/A | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 88%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1: SDK interfaces defined | 95% | IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService in sdk.interface.ts. Re-exported from interfaces/index.ts. Imported and used in contract tests and implementations. |
| AC2: CommandRegistry register/execute/list | 95% | 8 contract tests pass: register+list, duplicate throws, execute valid, execute invalid, unregistered throws, domain filter, dispose, isAvailable. Zod validation at line 52. |
| AC3: SettingsStore contribute/get/set/reset/onChange | 95% | 9 contract tests pass: contribute→default, hydrate+contribute→persisted, set→onChange, set invalid→throws, reset→default, referential stability (Object.is), toPersistedRecord, list, dispose. |
| AC4: ContextKeyService set/get/evaluate | 95% | 6 contract tests pass: set/get roundtrip, evaluate truthy, negation, equality, empty/undefined→true, onChange. |
| AC5: FakeUSDK + contract parity | 85% | FakeUSDK exists with inspection methods. 23 tests pass against fake, 23 against real. Parity gap in isAvailable() (F002). |
| AC6: @chainglass/shared/sdk subpath export | 95% | package.json has ./sdk export. Barrel exists. Contract tests successfully import via subpath. |
| AC7: WorkspacePreferences extended | 95% | 3 new fields in workspace.ts: sdkSettings, sdkShortcuts, sdkMru. DEFAULT_PREFERENCES updated. 4416 tests pass. |
| AC8: _platform/sdk domain registered | 95% | registry.md has row. domain.md exists with full documentation. |

### E.5) Doctrine Compliance

| Rule | Status | Notes |
|------|--------|-------|
| R-ARCH-002: Interfaces in interfaces/ with .interface.ts suffix | ✅ | `packages/shared/src/interfaces/sdk.interface.ts` |
| R-CODE-002: I-prefix for interfaces, Fake-prefix for fakes | ✅ | IUSDK, ICommandRegistry, FakeCommandRegistry, FakeUSDK |
| R-ARCH-004: Types in shared, impls in apps/web | ✅ | Types/interfaces in packages/shared, implementations in apps/web/src/lib/sdk/ |
| R-TEST-006: Tests in test/ hierarchy | ✅ | Contracts in test/contracts/, unit dir at test/unit/web/sdk/ |
| R-TEST-007: No vi.mock/fn/spyOn | ✅ | No mock usage (unused vi import is F005, not a violation) |
| Constitution P2: interface → fake → test → real | ✅ | Execution log confirms order: T002→T004→T005→T006-T008 |
| PL-01/PL-06: Subpath exports | ✅ | SDK types via `@chainglass/shared/sdk`, not root barrel |

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | SDK interfaces defined | sdk.interface.ts exports IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService. Compile check passes. | 95% |
| AC2 | CommandRegistry register/execute/list/isAvailable | 8 contract tests pass. Zod validation, DYK-01 duplicate throw, DYK-05 try/catch all implemented. | 95% |
| AC3 | SettingsStore contribute/get/set/reset/onChange | 9 contract tests pass. DYK-02 referential stability verified via Object.is. hydrate/contribute ordering works. | 95% |
| AC4 | ContextKeyService set/get/evaluate | 6 contract tests pass. 3 expression patterns (truthy, negation, equality). Edge case F003 noted. | 95% |
| AC5 | FakeUSDK + contract parity | 46 tests (23 fake + 23 real). Inspection methods present. isAvailable parity gap (F002). | 85% |
| AC6 | @chainglass/shared/sdk subpath export | package.json exports configured. Barrel re-exports work. Import verified in tests. | 95% |
| AC7 | WorkspacePreferences extended | 3 fields added with defaults. Spread merge handles gracefully. 4416 tests pass. | 95% |
| AC8 | _platform/sdk domain registered | Registry row active. domain.md comprehensive. domain-map updated. | 95% |

**Overall coverage confidence**: 93%

## G) Commands Executed

```bash
# Git status for change detection
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --staged --stat

# Diff computation (saved to reviews/_computed.diff)
git --no-pager diff -- docs/domains/domain-map.md docs/domains/registry.md packages/shared/package.json packages/shared/src/fakes/index.ts packages/shared/src/interfaces/index.ts packages/workflow/src/entities/workspace.ts
# + concatenated new file diffs for all untracked phase-1 files

# Git history scan
git log --oneline -20

# Test verification (via subagent)
pnpm test -- test/contracts/sdk.contract.test.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 1: SDK Foundation
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-1-sdk-foundation/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-1-sdk-foundation/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/review.phase-1-sdk-foundation.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/sdk.interface.ts | new | _platform/sdk | Remove unused SDKKeybinding import (F004) |
| /home/jak/substrate/041-file-browser/packages/shared/src/sdk/types.ts | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/sdk/index.ts | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/sdk/tokens.ts | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/fakes/fake-usdk.ts | new | _platform/sdk | Fix isAvailable() parity (F002) |
| /home/jak/substrate/041-file-browser/packages/shared/src/fakes/index.ts | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/index.ts | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/packages/shared/package.json | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/command-registry.ts | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/settings-store.ts | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/context-key-service.ts | new | _platform/sdk | Fix evaluate() unset key equality (F003) |
| /home/jak/substrate/041-file-browser/packages/workflow/src/entities/workspace.ts | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | new | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.ts | new | _platform/sdk | Remove unused `vi` import (F005) |
| /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.test.ts | new | _platform/sdk | None |

### Recommended Fixes (APPROVE WITH NOTES — not blocking, but should be addressed)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/packages/shared/src/fakes/fake-usdk.ts | FakeCommandRegistry.isAvailable() should evaluate when-clauses like real impl | Parity gap will cause false positives in Phase 3+ tests |
| 2 | /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/context-key-service.ts + fake | Guard equality eval with `if (!this.keys.has(key)) return false` | String(undefined)==="undefined" is surprising behavior |
| 3 | /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/sdk.interface.ts | Remove unused SDKKeybinding import | Dead import, biome will flag |
| 4 | /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.ts | Remove unused `vi` import | Dead import, signals mock intent |
| 5 | test/unit/web/sdk/*.test.ts | Create unit test files or update task table | T006-T008 deliverables not produced |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| None | All domain artifacts are current |

### Next Step

Address the 5 recommended fixes (especially F002 isAvailable parity and F003 evaluate guard before Phase 3), then proceed to Phase 2 tasks:

```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 2: React Provider & Hooks" --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
```
