# Phase 5: Integration & Accessibility - Fix Tasks

**Review Date**: 2026-01-27
**Review Report**: [review.phase-5-integration-accessibility.md](./review.phase-5-integration-accessibility.md)
**Verdict**: REQUEST_CHANGES

---

## Critical Fixes (Must Complete Before Merge)

### FIX-001: Remove Thinking Event Consolidation [CRITICAL]

**Finding**: COR-001
**File**: `apps/web/src/lib/transformers/stored-event-to-log-entry.ts`
**Lines**: 140-215 (mergeToolEvents function)

**Problem**: The `mergeToolEvents()` function incorrectly consolidates consecutive thinking events into a single block. Tests expect each thinking event to be preserved separately.

**Impact**: 3 test failures:
- `integration/concurrent-tools.test.ts:187` - expects 4 entries, gets 3
- `integration/backward-compat.test.ts:190` - expects 3 entries, gets 2
- `performance/agent-perf.test.ts:180` - expects 500 entries, gets 1

**Fix**: Remove the thinking consolidation logic entirely. Replace with simple per-event transformation.

**Patch**:
```diff
 export function mergeToolEvents(events: StoredEvent[]): (LogEntryProps & { key: string })[] {
   // Build a map of toolCallId -> tool_result data
   const resultMap = new Map<string, { output: string; isError: boolean; timestamp: string }>();

   for (const event of events) {
     if (event.type === 'tool_result') {
       resultMap.set(event.data.toolCallId, {
         output: event.data.output,
         isError: event.data.isError,
         timestamp: event.timestamp,
       });
     }
   }

-  // Transform events, merging tool_result into tool_call and consolidating thinking
+  // Transform events, merging tool_result into tool_call
   const result: (LogEntryProps & { key: string })[] = [];
-  let currentThinking: { key: string; content: string; signature?: string } | null = null;

   for (const event of events) {
     // Skip tool_result - they're merged into tool_call
     if (event.type === 'tool_result') {
       continue;
     }

-    // Consolidate consecutive thinking events into a single block
-    if (event.type === 'thinking') {
-      if (currentThinking) {
-        // Append to existing thinking block
-        currentThinking.content += event.data.content;
-        // Keep the latest signature if present
-        if (event.data.signature) {
-          currentThinking.signature = event.data.signature;
-        }
-      } else {
-        // Start a new thinking block
-        currentThinking = {
-          key: event.id,
-          content: event.data.content,
-          signature: event.data.signature,
-        };
-      }
-      continue;
-    }
-
-    // Non-thinking event encountered - flush any pending thinking block
-    if (currentThinking) {
-      result.push({
-        key: currentThinking.key,
-        messageRole: 'assistant',
-        content: '',
-        contentType: 'thinking',
-        thinkingData: {
-          content: currentThinking.content,
-          signature: currentThinking.signature,
-        },
-      });
-      currentThinking = null;
-    }
-
     const props = storedEventToLogEntryProps(event);

     // If this is a tool_call, merge the result if available
     if (event.type === 'tool_call' && props.toolData) {
       const toolResult = resultMap.get(event.data.toolCallId);
       if (toolResult) {
         props.toolData = {
           ...props.toolData,
           output: toolResult.output,
           status: toolResult.isError ? 'error' : 'complete',
           isError: toolResult.isError,
         };
       }
     }

     result.push(props);
   }

-  // Flush any remaining thinking block at the end
-  if (currentThinking) {
-    result.push({
-      key: currentThinking.key,
-      messageRole: 'assistant',
-      content: '',
-      contentType: 'thinking',
-      thinkingData: {
-        content: currentThinking.content,
-        signature: currentThinking.signature,
-      },
-    });
-  }
-
   return result;
 }
```

**Validation**:
```bash
pnpm test test/integration/concurrent-tools.test.ts
pnpm test test/integration/backward-compat.test.ts
pnpm test test/performance/agent-perf.test.ts
# All 3 should pass after fix
```

---

### FIX-002: Update Plan↔Dossier Synchronization [CRITICAL]

**Finding**: SYNC-001
**File**: `docs/plans/015-better-agents/better-agents-plan.md`

**Problem**: Plan shows 12 tasks including accessibility work (5.5-5.7: Screen reader, keyboard nav, axe-core tests), but dossier shows 10 tasks (T001-T010) per DYK-P5-04 decision to skip accessibility.

Plan falsely claims accessibility tasks are complete when they were explicitly skipped.

**Fix**: Update plan Phase 5 section to:
1. Remove accessibility task references (5.5-5.7) OR mark them as "SKIPPED per DYK-P5-04"
2. Reconcile task numbering with dossier (T001-T010)
3. Add note about accessibility deferral

**Manual Action Required**: Edit plan markdown to align with dossier decisions.

---

### FIX-003: Update Subtask Registry Status [HIGH]

**Finding**: SYNC-002
**File**: `docs/plans/015-better-agents/better-agents-plan.md`
**Section**: § Subtasks Registry (line ~1133)

**Problem**: Registry shows `[ ] Pending` for `001-subtask-real-agent-multi-turn-tests`, but the subtask is complete with discoveries logged.

**Patch**:
```diff
 | ID | Created | Phase | Parent Task | Reason | Status | Dossier |
 |----|---------|-------|-------------|--------|--------|---------|
-| 001-subtask-real-agent-multi-turn-tests | 2026-01-27 | Phase 5: Integration & Verification | T003, T004 | Deep-dive into real agent integration tests with multi-turn sessions | [ ] Pending | [Link](tasks/phase-5-integration-accessibility/001-subtask-real-agent-multi-turn-tests.md) |
+| 001-subtask-real-agent-multi-turn-tests | 2026-01-27 | Phase 5: Integration & Verification | T003, T004 | Deep-dive into real agent integration tests with multi-turn sessions | [x] Complete | [Link](tasks/phase-5-integration-accessibility/001-subtask-real-agent-multi-turn-tests.md) |
```

---

### FIX-004: Fix Lint Errors [LOW]

**Finding**: LINT-001
**File**: `apps/web/src/hooks/useServerSession.ts`
**Line**: 76

**Problem**: Object type cast formatting doesn't match Biome style.

**Fix**: Run auto-formatter
```bash
just format
```

---

## Recommended Fixes (Post-Merge)

### FIX-005: Add Error Message Sanitization [MEDIUM]

**Finding**: SEC-002, SEC-003
**File**: `apps/web/app/(dashboard)/agents/page.tsx`
**Lines**: 293-294, 340-346

**Problem**: Error messages from API propagated without sanitization.

**Patch** (line ~340):
```typescript
// OLD
setSessionError(activeSessionId, error instanceof Error ? error.message : 'Unknown error');

// NEW
const rawMessage = error instanceof Error ? error.message : 'Unknown error';
const safeMessage = rawMessage.length > 200 || rawMessage.includes('stack')
  ? 'An error occurred. Please try again.'
  : rawMessage;
setSessionError(activeSessionId, safeMessage);
```

---

### FIX-006: Add Null Guards for toolCallId [MEDIUM]

**Finding**: COR-002, COR-003
**File**: `apps/web/src/lib/transformers/stored-event-to-log-entry.ts`

**Lines 131-137** (resultMap building):
```typescript
// Add guard
if (event.type === 'tool_result' && event.data?.toolCallId) {
  resultMap.set(event.data.toolCallId, { ... });
}
```

**Lines 188-198** (merge lookup):
```typescript
// Add guard
if (event.type === 'tool_call' && props.toolData && event.data?.toolCallId) {
  const toolResult = resultMap.get(event.data.toolCallId);
  // ...
}
```

---

### FIX-007: Update Execution Log with TDD Evidence [HIGH]

**Finding**: TDD-001
**File**: `docs/plans/015-better-agents/tasks/phase-5-integration-accessibility/execution.log.md`

**Problem**: Log narrative doesn't document RED phase (failing tests first).

**Manual Action**: For each task, restructure as:
```markdown
### What I Did
1. **RED**: Wrote test `test_xyz`, verified it fails [timestamp]
2. **GREEN**: Implemented code to pass test [timestamp]
3. **REFACTOR**: Improved code quality while tests stay green [timestamp]

### Evidence
✓ All tests passing (N tests)
```

---

### FIX-008: Update Log Anchor References [MEDIUM]

**Finding**: LINK-002
**File**: `docs/plans/015-better-agents/tasks/phase-5-integration-accessibility/tasks.md`

**Problem**: T003/T004 Notes column anchors don't match actual log headings.

**Current**:
```
log#task-t003-real-agent-multi-turn-tests
log#task-t004-real-copilot-multi-turn-tests
```

**Should be** (matching actual headings):
```
log#task-t003-claude-real-multi-turn-test
log#task-t004-copilot-real-multi-turn-test
```

Or rename log headings to match expected anchors.

---

## Verification Commands

After applying fixes:

```bash
# 1. Run all tests (expect 2157 passing, 0 failing)
pnpm test

# 2. Type check
just typecheck

# 3. Lint
just lint

# 4. Full quality check
just fft
```

---

## Approval Workflow

1. Apply FIX-001 (critical code fix)
2. Apply FIX-002, FIX-003 (plan sync)
3. Apply FIX-004 (lint)
4. Verify tests pass: `pnpm test`
5. Re-run code review: `/plan-7-code-review --phase "Phase 5: Integration & Accessibility" --plan ...`
6. Expect: **APPROVE**
