# Fix Tasks: Phase 3 — CLI Command Update with TDD

**Review**: [review.phase-3-cli-command-update-with-tdd.md](./review.phase-3-cli-command-update-with-tdd.md)
**Priority**: Fix blocking items first, then recommended.

---

## Blocking Fixes

### FIX-1: Sync dossier task statuses (V4.1 — CRITICAL)

**File**: `docs/plans/034-agentic-cli/tasks/phase-3-cli-command-update-with-tdd/tasks.md`
**Lines**: 232–241

Update all 9 task statuses from `[ ]` to `[x]`:

```diff
-| [ ] | T001 | Write terminal event handler tests (RED)...
+| [x] | T001 | Write terminal event handler tests (RED)...
```

Repeat for T002–T009.

**Command**: Run `plan-6a --update-progress` or manually edit.

---

### FIX-2: Populate footnotes and log links (V2.1–V2.3, V3.1, V4.2 — HIGH)

**Files**:
- `docs/plans/034-agentic-cli/tasks/phase-3-cli-command-update-with-tdd/tasks.md` (Phase Footnote Stubs + Notes column)
- `docs/plans/034-agentic-cli/agentic-cli-plan.md` (§ 12 Change Footnotes Ledger + Log column)

**Steps**:
1. Add `[^N]` footnote references to task table Notes columns (both plan § 8 and dossier)
2. Populate Phase Footnote Stubs table with entries for each modified file
3. Populate plan § 12 Change Footnotes Ledger with FlowSpace node IDs
4. Add `[📋]` log links in plan § 8 Log column pointing to execution.log.md anchors

**Command**: Run `plan-6a` to sync.

---

### FIX-3: Add FakeAgentManagerService to test container (F-01 — MEDIUM)

**File**: `apps/cli/src/lib/container.ts`
**Location**: `createCliTestContainer()`, after line ~435

```diff
+ // Plan 034: Register FakeAgentManagerService for test container
+ const { FakeAgentManagerService } = await import('@chainglass/shared');
+ childContainer.register(CLI_DI_TOKENS.AGENT_MANAGER, {
+   useFactory: () => new FakeAgentManagerService(),
+ });
```

Or using the existing static import pattern:

```typescript
// In createCliTestContainer(), add:
childContainer.register(CLI_DI_TOKENS.AGENT_MANAGER, {
  useFactory: () => new FakeAgentManagerService(),
});
```

Requires importing `FakeAgentManagerService` from `@chainglass/shared` at the top of the file.

**Validation**: `just fft` passes.

---

## Recommended Fixes

### FIX-4: Add positive --stream test (F-07 — LOW)

**File**: `test/unit/features/034-agentic-cli/cli-agent-handlers.test.ts`

Add after the `--quiet` test:

```typescript
it('attaches NDJSON handler when --stream (AC-32)', async () => {
  const mgr = new FakeAgentManagerService({
    defaultInstanceOptions: {
      events: [
        { type: 'text_delta', timestamp: new Date().toISOString(), data: { content: 'hi' } },
      ],
    },
  });
  const streamOutput: string[] = [];
  // Capture console.log output
  const origLog = console.log;
  console.log = (s: string) => streamOutput.push(s);
  try {
    await handleAgentRun(
      { type: 'claude-code', prompt: 'hello', stream: true },
      { agentManager: mgr, write }
    );
  } finally {
    console.log = origLog;
  }
  expect(streamOutput.length).toBeGreaterThan(0);
  expect(() => JSON.parse(streamOutput[0] ?? '')).not.toThrow();
});
```

### FIX-5: Add behavioral ndjsonEventHandler test (F-06 — LOW)

**File**: `test/unit/features/034-agentic-cli/terminal-event-handler.test.ts`

Replace structural test with behavioral test:

```typescript
it('outputs raw JSON per event', () => {
  const event = makeEvent('text_delta', { content: 'hello' });
  const logged: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => logged.push(String(args[0]));
  try {
    ndjsonEventHandler(event);
  } finally {
    console.log = origLog;
  }
  expect(logged).toHaveLength(1);
  expect(JSON.parse(logged[0] ?? '{}')).toMatchObject({ type: 'text_delta' });
});
```

### FIX-6: Document index.ts barrel export pull-forward (F-03 — LOW)

**File**: `docs/plans/034-agentic-cli/agentic-cli-plan.md` (Deviation Ledger)

Add entry noting that barrel exports were pulled from Phase 5 to Phase 3 because `container.ts` requires `import { AgentManagerService } from '@chainglass/shared'`.
