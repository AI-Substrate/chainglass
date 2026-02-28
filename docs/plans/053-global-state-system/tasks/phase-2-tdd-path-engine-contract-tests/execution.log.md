# Phase 2: TDD — Path Engine & Contract Tests — Execution Log

**Plan**: 053-global-state-system
**Phase**: Phase 2
**Started**: 2026-02-27

---

## T001: Path Parser Unit Tests
**File**: `test/unit/web/state/path-parser.test.ts`
**Status**: ✅ Complete — 25 tests, all GREEN

**TDD Note**: Phase 1 created parsePath() implementation; Phase 2 writes tests and verifies GREEN. The plan separates interface/implementation (Phase 1) from test writing (Phase 2) — tests validated existing code rather than driving new code. RED step is implicit: tests were written against the interface contract, verified GREEN against implementation.

**Evidence**:
```
$ npx vitest run test/unit/web/state/path-parser.test.ts
✓ 25 tests passed (25)
Duration: 655ms
```

**AC Mapping**: AC-11 (colon segments), AC-12 (validation), AC-15 (2/3 only)

**Test categories**:
- 2-segment singleton parsing (3 tests)
- 3-segment multi-instance parsing (3 tests)
- raw field preservation (2 tests)
- Invalid segment counts: 1, 4, 5 segments (3 tests)
- Empty segments: leading, trailing, middle (3 tests)
- Invalid input: empty string, null, undefined (2 tests)
- Domain format: uppercase, dash-prefix, underscore, numeric (4 tests)
- Property format: uppercase, underscore (2 tests)
- Instance ID: space, empty, valid chars (3 tests)

**DYK-03 applied**: Tests are syntax-only — no domain registration semantics.
**DYK-10 applied**: Tests document asymmetry (strict kebab domains vs permissive instance IDs).

## T002: Path Matcher Unit Tests
**File**: `test/unit/web/state/path-matcher.test.ts`
**Status**: ✅ Complete — 22 tests, all GREEN

**Evidence**:
```
$ npx vitest run test/unit/web/state/path-matcher.test.ts
✓ 22 tests passed (22)
Duration: 399ms
```

**Test categories**:
- Exact match (3 tests)
- Domain wildcard (5 tests) — includes DYK-02 segment count check
- Instance wildcard (5 tests) — includes DYK-02 similar-prefix rejection
- Domain-all (3 tests) — includes 2-segment path matching
- Global wildcard (1 test)
- Workshop 001 decision table (5 tests — full matrix)

**DYK-02 applied**: Explicit tests for segment-count checking vs prefix matching.
**DYK-06 applied**: Domain wildcard on 2-segment singleton returns no match.

## T003: Contract Test Factory
**File**: `test/contracts/state-system.contract.ts`
**Status**: ✅ Complete — 19 contract cases defined

**Evidence**:
```
$ npx tsc --noEmit test/contracts/state-system.contract.ts → clean (only pre-existing node_modules type warnings)
```

**Contract cases** (C01–C19):
- C01: publish/get round-trip
- C02: get undefined for unpublished
- C03: subscribe notified on publish (verifies StateChange shape)
- C04: unsubscribe stops notifications
- C05: error isolation (throwing subscriber)
- C06: store-first ordering — get() inside callback (DYK-07)
- C07: remove with removed flag
- C08: removeInstance removes all entries
- C09/C09b: registerDomain + listDomains + duplicate throws
- C10: listInstances returns IDs
- C11: publish to unregistered domain throws
- C12/C12b: subscriberCount + entryCount diagnostics
- C13: list returns matching entries (3 patterns)
- C14: stable get reference (Object.is)
- C15: stable list array reference (DYK-09)
- C16/C16b: singleton domain path validation
- C17: multi-instance domain rejects 2-segment path
- C18: previousValue tracking
- C19: domain wildcard subscription

**DYK-08 applied**: registerTestDomain() helper called in every test that publishes.
**Runner**: Will be created in Phase 3 when real + fake implementations exist.

**AC Mapping**:
- AC-34: Contract suite defined (19 cases). Execution against real+fake deferred to Phase 3.
- AC-35: Parser tests (25) and matcher tests (22) executed and passing.

## Review Fixes Applied
- FT-002: C05 now asserts `throwerCalled === true` before checking non-throwing subscriber
- FT-004: All imports changed from relative paths to `@chainglass/shared/state`
- FT-005: Domain docs updated with P2 history entry
- FT-006: C11 now asserts error message matches `/unknown|unregistered/i`
- FT-007: AC mapping added to execution log
