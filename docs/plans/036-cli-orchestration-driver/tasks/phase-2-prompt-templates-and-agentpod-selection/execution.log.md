# Phase 2: Prompt Templates and AgentPod Selection — Execution Log

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 2: Prompt Templates and AgentPod Selection
**Started**: 2026-02-17T10:21Z
**Testing Approach**: Full TDD (fakes over mocks)

---

## Task T001+T002: RED tests for template resolution + prompt selection
**Started**: 2026-02-17T10:22Z
**Status**: ✅ Complete

### What I Did
Created `prompt-selection.test.ts` with 7 tests:
- 4 template resolution: graphSlug, nodeId, unitSlug resolved; no {{ remains
- 3 prompt selection: first→starter, second→resume, inherited session→starter

Used FakeAgentInstance from `@chainglass/shared` + direct import of AgentPod. `getRunHistory()` captures prompt.

### Evidence
```
Test Files  1 failed (1)
     Tests  6 failed | 1 passed (7)
```
6 RED (expected — no resolveTemplate/resume prompt yet), 1 pass (no {{ check — placeholder has none).

### Files Changed
- `test/unit/positional-graph/features/030-orchestration/prompt-selection.test.ts` — NEW

**Completed**: 2026-02-17T10:23Z
---

## Task T003: Replace node-starter-prompt.md
**Started**: 2026-02-17T10:23Z
**Status**: ✅ Complete

### What I Did
Replaced 24-line placeholder with full Workshop 04 template (~100 lines). Contains:
- Protocol contract comment (DYK#4 — versioned API surface)
- 3 placeholders: `{{graphSlug}}`, `{{nodeId}}`, `{{unitSlug}}`
- 5-step protocol: accept → read → work → save → complete
- Question protocol with `cg wf node ask`
- Error handling with `cg wf node error`
- 6 rules section

All 7 CLI commands verified to exist (DYK#1).

### Files Changed
- `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` — REPLACED

**Completed**: 2026-02-17T10:24Z
---

## Task T004: Create node-resume-prompt.md
**Started**: 2026-02-17T10:24Z
**Status**: ✅ Complete

### What I Did
Created resume prompt per Workshop 04 (~45 lines). Contains:
- Protocol contract comment
- 2 placeholders: `{{graphSlug}}`, `{{nodeId}}`
- Check-for-answers, continue-work, save-and-complete sections
- Same rules apply reminder

### Files Changed
- `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md` — NEW

**Completed**: 2026-02-17T10:24Z
---

## Task T005: Implement resolveTemplate() + _hasExecuted in AgentPod
**Started**: 2026-02-17T10:24Z
**Status**: ✅ Complete

### What I Did
Modified `pod.agent.ts`:
- Removed module-level `let cachedPrompt` and cache logic in `loadStarterPrompt()`
- `loadStarterPrompt()` now reads from disk each call (Finding 03)
- Added `loadResumePrompt()` function
- Added `private _hasExecuted = false` field to AgentPod
- Added `private resolveTemplate(template, options)` method — 3 replaceAll calls
- Updated `execute()`: select template via `_hasExecuted`, resolve, set flag

### Evidence
```
✓ prompt-selection.test.ts (7 tests) 2ms — all GREEN
✓ pod.test.ts (21 tests) 5ms — existing tests pass
✓ pod-agent-wiring.test.ts (6 tests) 4ms — existing tests pass
```

### Files Changed
- `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` — MODIFIED

**Completed**: 2026-02-17T10:25Z
---

## Task T006: Refactor + just fft
**Started**: 2026-02-17T10:25Z
**Status**: ✅ Complete

### Evidence
```
just fft → exit code 0
Test Files  267 passed | 6 skipped (273)
     Tests  3885 passed | 62 skipped (3947)
```
+1 test file, +7 tests vs Phase 1 baseline.

**Completed**: 2026-02-17T10:27Z
---

