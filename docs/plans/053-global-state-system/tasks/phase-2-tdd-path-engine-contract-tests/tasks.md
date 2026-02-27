# Phase 2: TDD — Path Engine & Contract Tests — Tasks & Brief

**Plan**: [global-state-system-plan.md](../../global-state-system-plan.md)
**Phase**: Phase 2: TDD — Path Engine & Contract Tests
**Generated**: 2026-02-26
**Status**: Ready

---

## Executive Briefing

**Purpose**: Write all tests for path parsing, pattern matching, and define the contract test suite for IStateService. This is the TDD RED phase — tests are written against the Phase 1 types/interface, and verified GREEN against the Phase 1 pure function implementations.

**What We're Building**: Test infrastructure that validates Phase 1's path engine AND defines behavioral expectations for the Phase 3 GlobalStateSystem implementation.

**Goals**:
- ✅ Path parser unit tests — 2/3 segments, validation, error cases, 4+ rejection
- ✅ Path matcher unit tests — all 5 pattern types with decision table from Workshop 001
- ✅ Contract test factory — `globalStateContractTests(name, factory)` defining behavioral expectations for IStateService
- ✅ RED→GREEN evidence for parsePath and createStateMatcher

**Non-Goals**:
- ❌ No GlobalStateSystem implementation (Phase 3)
- ❌ No FakeGlobalStateSystem (Phase 3)
- ❌ No React hooks (Phase 4)
- ❌ Contract test runner (Phase 3 — needs both real + fake implementations)

---

## Prior Phase Context

**Phase 1 delivered**:
- `packages/shared/src/state/types.ts` — 7 types (ParsedPath, StateChange, StateEntry, etc.)
- `packages/shared/src/interfaces/state.interface.ts` — IStateService with 11 methods + 2 properties
- `packages/shared/src/state/path-parser.ts` — parsePath() for 2/3 segment paths
- `packages/shared/src/state/path-matcher.ts` — createStateMatcher() with 5 pattern types
- `packages/shared/src/state/tokens.ts` — STATE_DI_TOKENS
- `packages/shared/src/state/index.ts` — barrel exports
- `packages/shared/package.json` — `./state` export entry added

**DYK findings applied**: DYK-01 (2/3 segments only), DYK-02 (segment count checks in matchers), DYK-03 (parser is syntax-only), DYK-04 (updatedAt is number), DYK-05 (types condition in export)

---

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `test/unit/web/state/path-parser.test.ts` | ❌ Create | `_platform/state` ✅ | New test directory needed |
| `test/unit/web/state/path-matcher.test.ts` | ❌ Create | `_platform/state` ✅ | |
| `test/contracts/state-system.contract.ts` | ❌ Create | `_platform/state` ✅ | 14 existing contract files in test/contracts/ |

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create path parser unit tests | `_platform/state` | `test/unit/web/state/path-parser.test.ts` | Tests cover: (1) 2-segment singleton parse, (2) 3-segment multi-instance parse, (3) rejects 1 segment, (4) rejects 4+ segments with descriptive error, (5) rejects empty segments, (6) validates domain format [a-z][a-z0-9-]*, (7) validates instance ID format [a-zA-Z0-9_-]+, (8) validates property format, (9) rejects non-string/empty input, (10) raw field preserves original path | AC-11, AC-12, AC-15 |
| [x] | T002 | Create path matcher unit tests | `_platform/state` | `test/unit/web/state/path-matcher.test.ts` | Tests cover: (1) exact match, (2) exact non-match, (3) domain wildcard matches any instance, (4) domain wildcard checks segment count per DYK-02, (5) instance wildcard matches all properties, (6) instance wildcard doesn't match different instance, (7) domain-all matches everything in domain, (8) domain-all doesn't match other domains, (9) global wildcard matches everything, (10) decision table from Workshop 001 | AC-16 through AC-20 |
| [x] | T003 | Create contract test factory for IStateService | `_platform/state` | `test/contracts/state-system.contract.ts` | Contract factory `globalStateContractTests(name, factory)` defines: C01 publish/get round-trip, C02 get returns undefined for unpublished, C03 subscribe notified on publish, C04 unsubscribe stops notifications, C05 error isolation (throwing subscriber doesn't block others), C06 store-first ordering (value readable in callback), C07 remove notifies with removed flag, C08 removeInstance removes all entries, C09 registerDomain + listDomains, C10 listInstances returns IDs, C11 publish to unregistered domain throws, C12 subscriberCount/entryCount diagnostics, C13 list returns matching entries, C14 stable get reference (Object.is) | AC-34 (partially — factory defined, runner in Phase 3) |

---

## Context Brief

### Key Patterns to Follow

| Source | Pattern | Usage |
|--------|---------|-------|
| `test/contracts/file-change-hub.contract.ts` | `export function contractTests(name, factory)` with `describe`/`it` and factory per test | Model for globalStateContractTests |
| `test/unit/web/features/045-live-file-events/file-change-hub.test.ts` | `makeChange()` helper, `describe` per pattern type, error isolation test | Model for path parser/matcher tests |

### DYK Items Affecting This Phase

| DYK | Impact |
|-----|--------|
| DYK-02 | Path matcher tests must include case where similar-prefix path does NOT match (segment count check) |
| DYK-03 | Path parser tests should NOT test domain registration — syntax only |

### Pattern Matching Decision Table (from Workshop 001)

| Pattern | `workflow:wf-1:status` | `workflow:wf-2:progress` | `worktree:active-file` |
|---------|----------------------|--------------------------|----------------------|
| `workflow:wf-1:status` | ✅ | ❌ | ❌ |
| `workflow:*:status` | ✅ | ❌ | ❌ |
| `workflow:wf-1:*` | ✅ | ❌ | ❌ |
| `workflow:**` | ✅ | ✅ | ❌ |
| `*` | ✅ | ✅ | ✅ |

---

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
