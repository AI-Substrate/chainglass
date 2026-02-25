# Code Review: Phase 4 — Keyboard Shortcuts

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 4: Keyboard Shortcuts
**Date**: 2026-02-25
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (TDD for SDK core, lightweight for wraps)

## A) Verdict

**APPROVE WITH NOTES**

One HIGH finding (missing Test Doc comments) is documentation debt, not a functional defect. All tests pass and verify correct behavior. Two MEDIUM findings are worth addressing before Phase 5.

**Key failure areas** (one sentence each):
- **Doctrine**: Keybinding contract tests lack the mandatory 5-field Test Doc comment blocks that every other test in the same file includes (R-TEST-002).
- **Implementation**: KeyboardShortcutListener builds tinykeys map once at mount — dynamically registered bindings after mount are silently ignored.

## B) Summary

Phase 4 delivers a clean keybinding infrastructure: `KeybindingService` provides registration with when-clause filtering, `KeyboardShortcutListener` bridges it to tinykeys, default shortcuts are registered in bootstrap, and the hardcoded Ctrl+P handler is properly replaced. Domain compliance is solid with all files correctly placed and no dependency violations. No concept reinvention — the codebase had no existing keybinding framework. Testing coverage is 82% confident with 18 keybinding contract tests (9 tests × 2 implementations) all passing. The primary gaps are test documentation format and a minor stale-map design constraint.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Core validation tests present (18 keybinding contract tests)
- [x] Critical paths covered (register, dispose, when-clause, availability, execute, args)
- [ ] Key verification points documented (Test Doc comments missing from keybinding tests)
- [x] Only in-scope files changed
- [x] Linters/type checks clean (4450 tests passing, `just fft` clean)
- [x] Domain compliance checks pass (all 9 checks ✅ with minor doc gaps)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | test/contracts/sdk.contract.ts:510-612 | doctrine | Keybinding contract tests missing mandatory 5-field Test Doc comments (R-TEST-002/R-TEST-003) | Add Test Doc blocks to all 9 keybinding `it()` tests |
| F002 | MEDIUM | apps/web/src/lib/sdk/keyboard-shortcut-listener.tsx:23-35 | correctness | useEffect depends only on `[sdk]`; bindings registered after mount never appear in tinykeys map | Document constraint or add re-build mechanism. Currently safe (all bindings static in bootstrap). |
| F003 | MEDIUM | packages/shared/src/interfaces/index.ts:109-115 | pattern | IKeybindingService missing from interfaces barrel export — inconsistent with other SDK interfaces | Add `IKeybindingService` to the re-export block |
| F004 | MEDIUM | test/contracts/sdk.contract.ts:510-612 | doctrine | Keybinding test names use bare verb form instead of 'should' prefix per R-TEST-002 | Rename to 'should' format (e.g., 'should register a keybinding…') |
| F005 | LOW | apps/web/src/lib/sdk/keybinding-service.ts:53 | error-handling | execute() returns Promise but tinykeys handler is sync — unhandled rejection if command disposed between isAvailable and execute | Wrap: `execute(...).catch(() => {})` — race window is tiny but fix is trivial |
| F006 | LOW | docs/domains/domain-map.md | domain-docs | SDK node label missing IKeybindingService + SDKKeybinding added in Phase 4 | Update mermaid node label |
| F007 | LOW | docs/domains/domain-map.md | domain-docs | Health summary table missing IKeybindingService, SDKKeybinding, SDKContribution | Update contracts column in SDK row |

## E) Detailed Findings

### E.1) Implementation Quality

**3 findings (2 MEDIUM, 1 LOW)**

The implementation is solid. `KeybindingService` is a clean thin layer: it stores `SDKKeybinding` entries in a Map, checks for duplicates on register, and builds a tinykeys-compatible handler map with when-clause + availability checks. `KeyboardShortcutListener` is a minimal 40-line React component that delegates entirely to tinykeys.

**F002 (MEDIUM) — Stale tinykeys map**: The listener's `useEffect` depends on `[sdk]`, which is a stable reference. `buildTinykeysMap()` is called once at mount. Any bindings registered after mount (e.g., from lazy-loaded domains) will be invisible. Currently safe because all Phase 4 bindings are registered in `bootstrapSDK()` before the listener mounts, but the `IKeybindingService.register()` API implies dynamic registration is supported.

**F005 (LOW) — Fire-and-forget promise**: The tinykeys handler calls `execute(binding.command, binding.args)` but doesn't `.catch()` the returned promise. If a command is disposed between the `isAvailable()` check and the `execute()` call, the "not registered" error becomes an unhandled rejection. The `CommandRegistry.execute()` wraps handler errors in try/catch (DYK-05), but the "command not found" throw happens before that guard. The race window is extremely narrow.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | `keybinding-service.ts` and `keyboard-shortcut-listener.tsx` under `apps/web/src/lib/sdk/` = `_platform/sdk` |
| Contract-only imports | ✅ | All imports use `@chainglass/shared/sdk` subpath — no internal cross-domain imports |
| Dependency direction | ✅ | `file-browser` → `_platform/sdk` (business→infrastructure) is correct direction |
| Domain.md updated | ✅ | Phase 4 entry added to § History; IKeybindingService + KeybindingService in § Composition/Contracts |
| Registry current | ✅ | `_platform/sdk` present in registry.md with correct status |
| No orphan files | ✅ | All changed files map to domains in the manifest |
| Map nodes current | ⚠️ | SDK node label missing IKeybindingService + SDKKeybinding (F006) |
| Map edges current | ⚠️ | Health summary table missing new types (F007) |
| No circular business deps | ✅ | No business→business cycles — only file-browser→sdk (business→infra) |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| KeybindingService | None | _platform/sdk | ✅ Proceed — no existing keybinding framework |
| KeyboardShortcutListener | None | _platform/sdk | ✅ Proceed — no existing global shortcut listener |

The sidebar.tsx `Ctrl+B` toggle is a shadcn/ui inline shortcut, not a keybinding framework — no overlap. All other keydown handlers in the codebase are component-scoped (chat input, explorer panel, file viewer) — no global shortcut management existed.

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-11 | 92% | Contract test verifies buildTinykeysMap handler executes command + calls preventDefault. Both Fake and Real pass. |
| AC-12 | 70% | Contract test verifies chord format stored. Timeout behavior delegated to tinykeys (DYK-P4-01) — not unit-testable without runtime. |
| AC-13 | 65% | Execution log confirms hardcoded addEventListener deleted, $mod+KeyP → file-browser.goToFile registered. No automated regression test. |
| AC-14 | 92% | Contract test directly verifies when-clause blocking. Paired with context key evaluate() tests. Both Fake and Real pass. |
| AC-15 | 55% | Execution log confirms sdk.listShortcuts registered. No automated test — consistent with hybrid strategy (lightweight for thin wraps). |

**Overall coverage confidence**: 82%

### E.5) Doctrine Compliance

**F001 (HIGH) — Missing Test Doc comments**: All 9 keybinding contract tests (lines 510–612 of `sdk.contract.ts`) lack the mandatory 5-field Test Doc block (Why, Contract, Usage Notes, Quality Contribution, Worked Example) required by R-TEST-002 and R-TEST-003. Every other `it()` block in the same file includes this documentation. This is a consistency gap, not a functional defect.

**F004 (MEDIUM) — Test naming**: Keybinding tests use bare verb form ("registers a keybinding…", "throws on duplicate…") instead of the "should" prefix pattern used by all other tests in the file ("should register a command and list it", "should throw on duplicate command ID").

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-11 | Shortcuts trigger bound commands | 18 contract tests (9×2 impl) covering register + buildTinykeysMap + execute | 92% |
| AC-12 | Chord sequences with ~1000ms timeout | Contract test for chord format; timeout delegated to tinykeys runtime | 70% |
| AC-13 | Hardcoded Ctrl+P replaced by SDK shortcut | Execution log: addEventListener deleted, SDK shortcut registered | 65% |
| AC-14 | Shortcuts respect when-clauses | Contract test: handler skips when when-clause false | 92% |
| AC-15 | View registered shortcuts via command | Execution log: sdk.listShortcuts registered, logs + toasts | 55% |

**Overall coverage confidence**: 82%

## G) Commands Executed

```bash
git --no-pager log --oneline -20
git --no-pager diff --stat
git --no-pager diff --stat -- ':(exclude)docs/plans/043-*' ':(exclude)docs/plans/045-*'
git --no-pager diff -- apps/web/app ':(exclude)docs/plans/043-*' ':(exclude)docs/plans/045-*' apps/web/src apps/web/package.json packages/shared packages/workflow pnpm-lock.yaml docs/domains
git --no-pager status --short -- apps/web/src/lib/sdk/ test/contracts/ packages/shared/src/interfaces/sdk.interface.ts packages/shared/src/sdk/
# Files read: keybinding-service.ts, keyboard-shortcut-listener.tsx, sdk-bootstrap.ts, sdk-provider.tsx, browser-client.tsx, sdk.interface.ts, fake-usdk.ts, sdk.contract.ts, sdk.contract.test.ts, types.ts, domain.md, domain-map.md, registry.md, execution.log.md, tasks.md, usdk-spec.md, usdk-plan.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-spec.md
**Phase**: Phase 4: Keyboard Shortcuts
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-4-keyboard-shortcuts/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-4-keyboard-shortcuts/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/reviews/review.phase-4-keyboard-shortcuts.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/keybinding-service.ts | Created | _platform/sdk | F005: Add .catch() to execute call |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/keyboard-shortcut-listener.tsx | Created | _platform/sdk | F002: Document static-binding constraint |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-bootstrap.ts | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-provider.tsx | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/sdk.interface.ts | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/index.ts | Modified | cross-domain | F003: Add IKeybindingService to barrel |
| /home/jak/substrate/041-file-browser/packages/shared/src/fakes/fake-usdk.ts | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/src/fakes/index.ts | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/packages/shared/package.json | Modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/packages/workflow/src/entities/workspace.ts | Modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/apps/web/package.json | Modified | _platform/sdk | None |
| /home/jak/substrate/041-file-browser/apps/web/src/components/providers.tsx | Modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/pnpm-lock.yaml | Modified | cross-domain | None |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md | Modified | domain-doc | None |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Modified | domain-doc | F006, F007: Update node label + table |
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | Modified | domain-doc | None |
| /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.ts | Modified | _platform/sdk test | F001: Add Test Doc comments; F004: Rename to 'should' format |
| /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.test.ts | Modified | _platform/sdk test | None |

### Required Fixes (APPROVE WITH NOTES — recommended, not blocking)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| F001 | /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.ts | Add 5-field Test Doc comment blocks to all 9 keybinding `it()` tests | R-TEST-002/R-TEST-003 compliance — every other test in file has them |
| F003 | /home/jak/substrate/041-file-browser/packages/shared/src/interfaces/index.ts | Add `IKeybindingService` to the SDK interfaces re-export block | Pattern consistency with other SDK interfaces |
| F004 | /home/jak/substrate/041-file-browser/test/contracts/sdk.contract.ts | Rename keybinding test descriptions to use 'should' prefix | R-TEST-002 naming convention consistency |

### Domain Artifacts to Update (optional)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | SDK node label needs IKeybindingService + SDKKeybinding; health table needs same |

### Next Step

Apply the recommended fixes (F001, F003, F004 — all non-functional), then commit Phase 4:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md --phase "Phase 4: Keyboard Shortcuts"
```
Or apply fixes directly and run `just fft` to verify, then proceed to Phase 5:
```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 5" --plan /home/jak/substrate/041-file-browser/docs/plans/047-usdk/usdk-plan.md
```
