# Code Review: Phase 2 — Prompt Templates and AgentPod Selection

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 2: Prompt Templates and AgentPod Selection
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-17
**Diff Range**: `f27ea69..ca992e6` (Phase 2 files only)

---

## A) Verdict

### **APPROVE** (with advisory notes)

No CRITICAL or HIGH code findings. 3 HIGH link-validation findings (graph integrity). Implementation is correct, complete, and matches the approved plan. The HIGH findings are all documentation-tracking issues (footnotes and log links not populated by plan-6a), not code defects.

---

## B) Summary

Phase 2 replaces the placeholder starter prompt with a full Workshop 04 template, creates a resume prompt, and implements template resolution and prompt selection logic in AgentPod. All 8 acceptance criteria (AC-13 through AC-20) are satisfied. The diff touches exactly 4 files — all within scope. Tests use FakeAgentInstance (no mocks), follow TDD order (RED→GREEN→REFACTOR), and cover template resolution (4 tests) + prompt selection (3 tests) including the inherited-session edge case. All 34 pod-related tests pass. `just fft` clean (3885 tests, 267 files).

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior: "contains 'Accept Your Assignment'", "not contain '{{graphSlug}}'")
- [x] Mock usage matches spec: Avoid (FakeAgentInstance only, zero vi.mock/jest.mock)
- [x] Negative/edge cases covered (inherited session edge case)
- [x] BridgeContext patterns followed (N/A — no VS Code extension code)
- [x] Only in-scope files changed (4 files, all in task table)
- [x] Linters/type checks clean (`just fft` exit 0)
- [x] Absolute paths used (prompt loading uses `resolve(getModuleDir(), ...)`)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | HIGH | plan task table | Plan Log column shows `-` for all 6 tasks — no links to execution log | Run plan-6a to populate log links |
| LINK-002 | HIGH | plan footnotes ledger | [^1] and [^2] still placeholder text — not populated for cross-plan edits | Run plan-6a to populate footnotes |
| LINK-003 | HIGH | dossier footnotes | T003 and T005 (cross-plan edits) have no [^N] in Notes column | Run plan-6a to add footnote refs |
| QS-001 | MEDIUM | pod.agent.ts:55-58 | Template loading (readFileSync) outside try/catch — raw ENOENT if file missing | Wrap in try/catch returning structured error |
| LINK-004 | MEDIUM | dossier footnote stubs | Phase Footnote Stubs table empty despite 2 cross-plan edits | Run plan-6a |
| QS-002 | LOW | pod.agent.ts:58 | _hasExecuted set before run() — retry after first-call crash gets resume prompt | Move flag after successful run() if observed |
| QS-003 | LOW | pod.agent.ts:121-126 | Sequential replaceAll allows cross-variable injection (trusted input only) | Use single-pass replacement if concerned |
| QS-004 | LOW | pod.agent.ts:68-75 | Error message omits nodeId/graphSlug context | Include node context in error message |
| PLAN-001 | LOW | prompt-selection.test.ts | Test Doc at file level, not per-it() block (R-TEST-003 spirit met) | Minor format deviation, acceptable |
| SEM-001 | LOW | pod.agent.ts:58 | _hasExecuted timing — spec-compliant but edge-case risky | Monitor in practice |
| SEM-002 | LOW | Workshop 04 docs | Workshop 04 has stale caching sentence contradicting Finding 03 | Update workshop docs |
| LINK-005 | LOW | dossier | Discoveries table empty despite DYK#1 and DYK#4 references in exec log | Populate during plan-6a |
| LINK-006 | LOW | execution log | T001+T002 combined into single heading (acceptable, note for anchor format) | Ensure plan log links use combined anchor |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Phase 1 regression check**: Phase 2 does not modify any Phase 1 deliverables (types, interfaces, fake). Phase 2 files are independent. No regression risk.

Existing tests verified:
- `pod.test.ts`: 21 tests pass (unchanged)
- `pod-agent-wiring.test.ts`: 6 tests pass (unchanged)
- `prompt-selection.test.ts`: 7 tests pass (new)
- Full suite: 3885 tests, 267 files — all green

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

**Graph Integrity Verdict: ⚠️ MINOR_ISSUES** (3 HIGH — all documentation tracking, not code)

All 3 HIGH findings trace to plan-6a not being run after implementation. The code itself is correct; the plan/dossier tracking artifacts are incomplete.

| ID | Severity | Link Type | Issue | Fix |
|----|----------|-----------|-------|-----|
| LINK-001 | HIGH | Plan↔Log | Plan task table Log column shows `-` for all tasks | Run plan-6a |
| LINK-002 | HIGH | Task↔Footnote | Plan [^1]/[^2] still placeholder text | Run plan-6a |
| LINK-003 | HIGH | Task↔Footnote | Dossier T003/T005 Notes lack [^N] refs | Run plan-6a |
| LINK-004 | MEDIUM | Task↔Footnote | Dossier Phase Footnote Stubs empty | Run plan-6a |
| LINK-005 | LOW | Dossier | Discoveries table empty | Run plan-6a |
| LINK-006 | LOW | Task↔Log | T001+T002 combined heading (acceptable) | Note anchor format |

**Root cause**: plan-6a (update-progress) was not run after Phase 2 completed.

#### TDD Compliance

**TDD Verdict: ✅ PASS**

- RED phase: T001+T002 produced 6 failing tests (expected — no resolveTemplate/resume prompt yet)
- GREEN phase: T003-T005 made all tests pass
- REFACTOR phase: T006 ran `just fft` clean
- All 5 Test Doc fields present (file-level JSDoc)
- Zero mocks — FakeAgentInstance with getRunHistory() captures prompt
- Edge case covered: inherited session first execute → starter prompt

### E.2) Semantic Analysis

**Semantic Verdict: ✅ PASS**

- All 8 CLI commands verified real (registered in positional-graph.command.ts): accept, collate, get-input-data, save-output-data, end, ask, get-answer, error
- Starter prompt matches Workshop 04 template verbatim (5-step protocol, question protocol, error handling, 6 rules)
- Resume prompt matches Workshop 04 resume template (get-answer, continue, save+complete)
- Domain boundary compliance (ADR-0012): prompts reference CLI commands only — no event handler internals
- Template resolution: 3 placeholders (starter), 2 placeholders (resume) — correct per spec
- _hasExecuted flag: pod-level per Workshop 04 Option B — handles inherited sessions correctly

Minor semantic notes:
- SEM-002: Workshop 04 has a stale sentence about caching (line 695) that contradicts the "no caching" decision (Finding 03). Docs-only fix.

### E.3) Quality & Safety Analysis

**Safety Score: 86/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 3)
**Quality Verdict: ✅ APPROVE**

#### pod.agent.ts

**[MEDIUM]** Lines 55-58: Uncaught file-read error
- **Issue**: `loadStarterPrompt()`/`loadResumePrompt()` use `readFileSync` outside the try/catch block. If the .md file is missing, a raw ENOENT propagates — no structured `PodExecuteResult`.
- **Impact**: Caller receives unhandled exception instead of structured error with node/graph context.
- **Fix**: Move template loading inside the try block, or add a separate try/catch returning `{ outcome: 'error', error: { code: 'POD_PROMPT_LOAD_ERROR', message: ... } }`.

**[LOW]** Line 58: Optimistic `_hasExecuted` flag
- **Issue**: Flag set before `agentInstance.run()`. If run() throws on first call, retry gets resume prompt despite agent never executing the starter protocol.
- **Impact**: Low — agent crash on first call is rare, and the resume prompt is still functional.
- **Fix**: Move after successful `await this.agentInstance.run()` if this edge case is observed.

**[LOW]** Lines 121-126: Sequential replaceAll
- **Issue**: If `graphSlug` contains `{{nodeId}}`, the second `replaceAll` would resolve it. Input is from trusted graph config, not user-facing.
- **Impact**: Negligible — graph slugs are developer-defined identifiers.
- **Fix**: Single-pass replacement with regex capture groups if stricter isolation needed.

**[LOW]** Lines 68-75: Missing node context in error message
- **Issue**: `POD_AGENT_EXECUTION_ERROR` message doesn't include nodeId or graphSlug.
- **Impact**: In multi-node graph, harder to identify which node failed.
- **Fix**: Include `Node '${this.nodeId}' (${options.graphSlug}):` prefix.

### E.4) Doctrine Evolution Recommendations (Advisory)

No new ADR, rules, or idioms candidates identified. Phase 2 follows existing patterns:
- Template resolution pattern is simple and purpose-built (no abstraction needed)
- Prompt loading follows the existing `getModuleDir()` pattern from Plan 030
- Test pattern (FakeAgentInstance + getRunHistory) matches established fake usage

**Positive alignment**:
- ADR-0012 (domain boundaries) correctly enforced — prompts reference CLI only
- ADR-0006 (CLI-based orchestration) pattern followed for all 8 CLI commands
- R-TEST-007 (fakes over mocks) fully compliant

---

## F) Coverage Map

| AC | Criterion | Test | Confidence |
|----|-----------|------|------------|
| AC-13 | Starter has {{placeholders}} | `resolves all {{graphSlug}} placeholders` + nodeId + unitSlug | 100% |
| AC-14 | Full protocol (5 steps) | `first execute uses starter prompt` (contains "Accept Your Assignment") | 75% — behavioral match, no explicit AC-14 ID in test |
| AC-15 | Question protocol | Covered by starter prompt content (verified in SEM analysis) | 50% — no dedicated test assertion |
| AC-16 | Error handling | Covered by starter prompt content (verified in SEM analysis) | 50% — no dedicated test assertion |
| AC-17 | Template resolved before agent | `no unresolved {{...}} remain` + 3 individual placeholder tests | 100% |
| AC-18 | Resume prompt exists | `second execute uses resume prompt` (loads and resolves it) | 75% — behavioral match |
| AC-19 | Resume has get-answer/continue/complete | Covered by resume prompt content (verified in SEM analysis) | 50% — no dedicated test assertion |
| AC-20 | Selection logic | 3 dedicated tests (first→starter, second→resume, inherited→starter) | 100% |

**Overall coverage confidence: 75%** (6/8 = tests verify behavior; 2/8 = content verified by semantic analysis but no explicit test assertion)

**Recommendation**: AC-15, AC-16, AC-19 could have explicit test assertions (e.g., `expect(prompt).toContain('cg wf node ask')`) for 100% confidence. Current coverage is adequate — the prompt content is verified statically.

---

## G) Commands Executed

```bash
# Test verification
cd /home/jak/substrate/033-real-agent-pods
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/prompt-selection.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts
# Result: 3 files, 34 tests, all pass

# Diff generation
git diff f27ea69..ca992e6 -- <phase-2-files>
```

---

## H) Decision & Next Steps

### Verdict: **APPROVE**

The implementation is correct, complete, and matches all 8 acceptance criteria. TDD discipline was followed. No code-level CRITICAL or HIGH findings.

### Required Before Merge

1. **Run plan-6a** to populate:
   - Plan task table Log column links (LINK-001)
   - Change Footnotes Ledger [^1] and [^2] with real content (LINK-002)
   - Dossier T003/T005 Notes with [^N] references (LINK-003)
   - Dossier Phase Footnote Stubs table (LINK-004)

### Recommended (Non-blocking)

- **QS-001**: Wrap template loading in try/catch for structured error handling (MEDIUM)
- **QS-004**: Add nodeId/graphSlug to error messages (LOW)
- **SEM-002**: Fix stale caching sentence in Workshop 04 docs (LOW)

### Next Phase

Proceed to Phase 3 (Graph Status View) via `/plan-5-phase-tasks-and-brief --phase "Phase 3: Graph Status View"`.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Entry |
|--------------------|----------------|-------------------|
| `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` | (none — missing) | [^1] placeholder |
| `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md` | (none — new file, plan-scoped) | N/A |
| `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` | (none — missing) | [^2] placeholder |
| `test/unit/positional-graph/features/030-orchestration/prompt-selection.test.ts` | (none — new file, plan-scoped) | N/A |

**Note**: Cross-plan edits (starter prompt, pod.agent.ts) require footnotes. New plan-scoped files do not.
