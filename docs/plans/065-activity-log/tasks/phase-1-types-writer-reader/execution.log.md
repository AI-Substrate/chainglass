# Execution Log — Phase 1: Activity Log Domain — Types, Writer, Reader

## T001: Create ActivityLogEntry type
- Created `apps/web/src/features/065-activity-log/types.ts`
- Exports: `ActivityLogEntry`, `ACTIVITY_LOG_FILE`, `ACTIVITY_LOG_DIR`

## T002-T004: Writer, Reader, Ignore Patterns (TDD)
- GREEN: `pnpm vitest run test/unit/web/features/065-activity-log/`
  - activity-log-writer.test.ts: 8 tests passed
  - activity-log-reader.test.ts: 10 tests passed (9 original + 1 default-200 regression)
  - ignore-patterns.test.ts: 9 tests passed (8 original + 1 hostname)

## T005: Contract/Roundtrip Tests
- GREEN: `pnpm vitest run test/contracts/activity-log.contract.test.ts`
  - 5 roundtrip tests passed (write-read, dedup, limit, malformed, multi-source)

## T006: Domain Registration
- Created `docs/domains/activity-log/domain.md` with Purpose, Concepts, Contracts, Composition, Dependencies, Consumers, History
- Updated `docs/domains/registry.md` — added `| Activity Log | activity-log | business | — | Plan 065 | active |`
- Updated `docs/domains/domain-map.md` — added `activityLog` node + edges (panel-layout consume, terminal consumer)

## T007: Gitignore
- Added `**/activity-log.jsonl` to `.gitignore`
- Verified: `git check-ignore .chainglass/data/activity-log.jsonl` → match confirmed

## Review Fixes Applied
- FT-001: Reader returns newest-first (AC-11 alignment). Added default-200 regression test.
- FT-003: `since` filtering uses `Date.parse()` instead of lexical comparison.
- FT-004: Added `os.hostname()` variants to ignore list + test.
- FT-005: Fixed domain-map edge direction (terminal → activityLog). Added Composition + Consumers tables to domain.md.
