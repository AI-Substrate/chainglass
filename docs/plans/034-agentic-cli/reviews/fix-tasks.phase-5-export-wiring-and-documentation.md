# Fix Tasks: Phase 5 — Export Wiring and Documentation

**Review**: [review.phase-5-export-wiring-and-documentation.md](./review.phase-5-export-wiring-and-documentation.md)
**Priority**: Fix in order listed (blocking → should-fix → optional)

---

## Blocking Fixes

### FIX-01: Fix FakeAgentInstance code example (SEM-01, HIGH)

**File**: `docs/how/agent-system/2-usage.md` lines 80-93
**Issue**: Code example passes non-existent `adapter` property to `FakeAgentInstance`. Will produce TypeScript error.

**Patch**:
```diff
-import { FakeAgentInstance, FakeAgentManagerService } from '@chainglass/shared';
-import { FakeAgentAdapter } from '@chainglass/shared'; // from fakes barrel
-
-// Direct fake instance
-const fakeAdapter = new FakeAgentAdapter();
-const instance = new FakeAgentInstance({
-  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp',
-  adapter: fakeAdapter,
-});
+import { FakeAgentInstance, FakeAgentManagerService } from '@chainglass/shared';
+
+// Direct fake instance
+const instance = new FakeAgentInstance({
+  id: 'test-1', name: 'test', type: 'claude-code', workspace: '/tmp',
+});
```

### FIX-02: Run plan-6a to restore graph integrity (V1-F1, V3-F1, V1-F2, all CRITICAL/HIGH)

**Issue**: `plan-6a-update-progress` was never run after Phase 5 implementation. This causes:
- No execution log at `tasks/phase-5-export-wiring-and-documentation/execution.log.md`
- Dossier tasks all show `[ ]` instead of `[x]`
- Plan Log column shows `-` instead of `[📋]` links
- Plan Notes column has no `[^N]` footnote tags
- No Phase 5 footnote in Change Footnotes Ledger

**Action**: Run `plan-6a-update-progress` targeting Phase 5. This should:
1. Create `execution.log.md` with entries for T001-T006
2. Update dossier task statuses to `[x]`
3. Add `[📋]` log links to plan task table
4. Add `[^8]` footnote to Change Footnotes Ledger with Phase 5 file references
5. Add `[^8]` tags to plan Notes column for 5.1-5.6
6. Add Phase Footnote Stubs section to dossier

---

## Should-Fix

### FIX-03: Fix AgentType vs AgentInstanceType in docs (SEM-02, MEDIUM)

**File**: `docs/how/agent-system/1-overview.md` line 46
**Issue**: Property table says `AgentType` but the public export is `AgentInstanceType`.

**Patch**:
```diff
-| `type` | `AgentType` | Adapter type (`claude-code` or `copilot`) |
+| `type` | `AgentInstanceType` | Adapter type (`claude-code` or `copilot`) |
```

### FIX-04: Fix factory examples to show type parameter (SEM-03, MEDIUM)

**Files**: `README.md` and `docs/how/agent-system/2-usage.md`
**Issue**: Factory examples use zero-arg lambda, hiding the `type` parameter.

**Patch** (apply to both files):
```diff
-const manager = new AgentManagerService(
-  () => new ClaudeCodeAdapter(new UnixProcessManager(new FakeLogger()))
-);
+const manager = new AgentManagerService(
+  (type) => new ClaudeCodeAdapter(new UnixProcessManager(new FakeLogger()))
+);
```

---

## Optional

### FIX-05: Add event types subset note (SEM-04, LOW)

**File**: `docs/how/agent-system/2-usage.md` line 31
**Patch**: Add note before event types table:
```diff
+> Common event types shown below. See `AgentEvent` union type for the complete list.
+
 | Type | Data | Description |
```

### FIX-06: Clarify state diagram retry path (SEM-05, LOW)

**File**: `docs/how/agent-system/1-overview.md` lines 24-28
**Issue**: The error→stopped arrow labeled "run() (retry)" skips the intermediate `working` state. Consider rewording to clarify the actual transition path is error → working → stopped|error.
