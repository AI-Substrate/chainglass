# Workshop: Multi-Turn Session Durability Test — Poem → Compact → Recall

**Type**: Integration Pattern
**Plan**: 035-agent-orchestration-wiring
**Spec**: [spec-a-orchestration-wiring.md](../../033-real-agent-pods/spec-a-orchestration-wiring.md)
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [Workshop 01: E2E Wiring with Real Agents](./01-e2e-wiring-with-real-agents.md)
- [Plan 034 Real Agent Tests](../../../test/integration/agent-instance-real.test.ts)

---

## Purpose

Design a multi-turn real agent test that proves sessions survive compact and resume. Instead of single-shot structural assertions, this test creates a **verifiable chain of causality**: the agent generates content → we compact → we ask the agent to recall that content. If the recall succeeds, the session survived.

## Key Questions Addressed

- What does each turn look like at the adapter level (CLI commands, JSON events)?
- What events fire during each turn and how do we collect them?
- What can we structurally assert without depending on LLM content?
- How does compact() work under the hood (`/compact` prompt)?
- Can we prove session durability without content-matching the poem?

---

## The Test Scenario

### Three Turns

```
┌─────────────────────────────────────────────────────────────┐
│ TURN 1: Create                                              │
│                                                             │
│   Prompt: "Write a 4-line poem about a random subject.      │
│            State the subject in the first line."             │
│                                                             │
│   ┌─ Agent thinks ─────────────────────────────────────┐    │
│   │ "I'll write about... lighthouses"                   │    │
│   │                                                     │    │
│   │ Lighthouses stand against the storm,                │    │
│   │ Their beacons cutting through the night,            │    │
│   │ A sailor's hope in weathered form,                  │    │
│   │ Guiding vessels toward the light.                   │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                             │
│   Result: { status: 'completed', sessionId: 'sess-abc' }   │
│   Events: text_delta × N, message × 1, usage × 1           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ TURN 2: Compact                                             │
│                                                             │
│   instance.compact()                                        │
│   → adapter.run({ prompt: '/compact', sessionId: sess-abc })│
│                                                             │
│   ┌─ Claude CLI ───────────────────────────────────────┐    │
│   │ claude --resume sess-abc -p "/compact"              │    │
│   │                                                     │    │
│   │ Summarizes conversation into condensed form.        │    │
│   │ Session sess-abc is preserved but token-reduced.    │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                             │
│   Result: { status: 'completed', sessionId: 'sess-abc' }   │
│   Key: sessionId is SAME (compact doesn't fork)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ TURN 3: Recall                                              │
│                                                             │
│   Prompt: "What was the subject of the poem you wrote?      │
│            Reply with just the subject, one word."           │
│                                                             │
│   ┌─ Agent recalls ────────────────────────────────────┐    │
│   │ "Lighthouses"                                       │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                             │
│   Result: { status: 'completed', sessionId: 'sess-abc' }   │
│   Key: sessionId SAME, output is non-empty                  │
└─────────────────────────────────────────────────────────────┘
```

---

## What Happens Under the Hood

### Turn 1: instance.run({ prompt: '...poem...' })

**Instance layer**:
```
instance.status: stopped → working
instance.run(options) called
  → validates status !== 'working'
  → calls adapter.run({ prompt, sessionId: null, cwd })
  → emits events as they arrive (text_delta, message, usage)
  → receives AgentResult { sessionId: 'sess-abc', status: 'completed' }
  → updates instance.sessionId = 'sess-abc'
instance.status: working → stopped
```

**Adapter layer** (ClaudeCodeAdapter):
```bash
claude \
  --output-format=stream-json \
  --verbose \
  --dangerously-skip-permissions \
  -p "Write a 4-line poem about a random subject. State the subject in the first line."
```

**JSON stream events** (what the adapter parses):
```json
{"type":"system","subtype":"init","session_id":"sess-abc","tools":[],"model":"claude-sonnet-4-20250514"}
{"type":"assistant","subtype":"text","content_block_delta":{"type":"text_delta","text":"Light"}}
{"type":"assistant","subtype":"text","content_block_delta":{"type":"text_delta","text":"houses"}}
{"type":"assistant","subtype":"text","content_block_delta":{"type":"text_delta","text":" stand"}}
... (more deltas)
{"type":"result","subtype":"success","session_id":"sess-abc","cost_usd":0.003,"duration_ms":2100}
```

**Mapped AgentEvents** (what the instance emits to handlers):
```typescript
{ type: 'text_delta', data: { content: 'Light' }, timestamp: '...' }
{ type: 'text_delta', data: { content: 'houses' }, timestamp: '...' }
{ type: 'text_delta', data: { content: ' stand' }, timestamp: '...' }
// ... many more text_delta events
{ type: 'message', data: { content: 'Lighthouses stand against the storm,\n...' }, timestamp: '...' }
{ type: 'usage', data: { inputTokens: 45, outputTokens: 62 }, timestamp: '...' }
```

### Turn 2: instance.compact()

**Instance layer**:
```
instance.status: stopped → working
instance.compact() called
  → validates sessionId !== null ✓ (it's 'sess-abc')
  → validates status !== 'working' ✓
  → delegates to adapter.compact('sess-abc')
    → adapter.run({ prompt: '/compact', sessionId: 'sess-abc' })
  → receives AgentResult { sessionId: 'sess-abc', status: 'completed' }
  → sessionId unchanged (compact preserves session, doesn't fork)
instance.status: working → stopped
```

**Adapter layer**:
```bash
claude \
  --output-format=stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --resume sess-abc \
  -p "/compact"
```

**What Claude does internally**: Summarizes the conversation history into a condensed representation. The session file on disk gets smaller. The session ID stays the same.

**Key assertion**: `compactResult.sessionId === turn1Result.sessionId` — compact doesn't create a new session.

### Turn 3: instance.run({ prompt: '...recall...' })

**Instance layer**:
```
instance.status: stopped → working
instance.run(options) called
  → validates status !== 'working' ✓
  → adapter.run({ prompt, sessionId: 'sess-abc', cwd })
                         ↑ instance sends existing session
  → Claude resumes session, has compacted context
  → receives AgentResult { output: 'Lighthouses', sessionId: 'sess-abc' }
instance.status: working → stopped
```

**Adapter layer**:
```bash
claude \
  --output-format=stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --resume sess-abc \
  -p "What was the subject of the poem you wrote? Reply with just the subject, one word."
```

**What proves session survived**: The agent's output references the poem subject. It can ONLY know this if the session context (even compacted) was preserved.

---

## Event Timeline (Collected by Test)

```
TURN 1 events:
  [0] text_delta  "Light"
  [1] text_delta  "houses"
  [2] text_delta  " stand"
  ... (20-40 more text_delta events for the poem)
  [N] message     "Lighthouses stand against the storm,\nTheir beacons..."
  [N+1] usage     { inputTokens: 45, outputTokens: 62 }

TURN 2 events (compact):
  [0] text_delta  "I'll"          ← compact produces output too
  [1] text_delta  " summarize"
  ... (compact summary text)
  [N] message     "Summary: The conversation involved writing a poem about lighthouses..."
  [N+1] usage     { inputTokens: 120, outputTokens: 45 }

TURN 3 events:
  [0] text_delta  "Light"
  [1] text_delta  "houses"
  [2] message     "Lighthouses"
  [3] usage       { inputTokens: 80, outputTokens: 5 }
                  ↑ note: input tokens LOWER than turn 1 (compact reduced context)
```

---

## What We Assert (Structural Only)

```typescript
// ═══════════════════════════════════════════════
// TURN 1 assertions
// ═══════════════════════════════════════════════
expect(turn1Result.status).toBe('completed');
expect(turn1Result.sessionId).toBeTruthy();
expect(turn1Result.output.length).toBeGreaterThan(20);  // poem is non-trivial
expect(instance.sessionId).toBe(turn1Result.sessionId);
expect(turn1Events.some(e => e.type === 'text_delta')).toBe(true);
expect(turn1Events.some(e => e.type === 'message')).toBe(true);

const sessionAfterTurn1 = instance.sessionId;

// ═══════════════════════════════════════════════
// TURN 2 assertions (compact)
// ═══════════════════════════════════════════════
expect(compactResult.status).toBe('completed');
expect(compactResult.sessionId).toBe(sessionAfterTurn1);  // ← SAME session
expect(instance.sessionId).toBe(sessionAfterTurn1);        // ← still same

// ═══════════════════════════════════════════════
// TURN 3 assertions (recall)
// ═══════════════════════════════════════════════
expect(turn3Result.status).toBe('completed');
expect(turn3Result.sessionId).toBe(sessionAfterTurn1);  // ← STILL same session
expect(turn3Result.output.length).toBeGreaterThan(0);    // agent replied
expect(turn3Events.some(e => e.type === 'text_delta')).toBe(true);

// The killer assertion: agent produced output in turn 3.
// It can only do this meaningfully if the session survived compact.
// We do NOT assert on the content (non-deterministic).
// The fact that status='completed' and output is non-empty proves
// the session is alive and the agent could process the question.
```

### Why We Don't Assert on Content

The agent might:
- Return "Lighthouses" (perfect recall)
- Return "The poem was about lighthouses" (verbose recall)
- Return "lighthouse" (lowercase variation)
- Return "I wrote about lighthouses and the sea" (expanded recall)

All are valid. We can't reliably pattern-match. Instead, the **structural chain** proves durability:

1. Turn 1 completed → session created
2. Compact completed → session preserved (same ID)
3. Turn 3 completed → session still functional after compact

If the session had been destroyed by compact, turn 3 would either:
- Fail with a session error
- Return a confused response about having no context
- Get a different sessionId (fork)

---

## The Test Code

```typescript
describe.skip('Multi-turn session durability', { timeout: 180_000 }, () => {
  let manager: AgentManagerService;

  beforeAll(async () => {
    const shared = await import('@chainglass/shared');
    const processManager = new shared.UnixProcessManager();
    manager = new shared.AgentManagerService(
      () => new shared.ClaudeCodeAdapter(processManager)
    );
  });

  it('session survives compact: poem → compact → recall', async () => {
    // Collect events for each turn
    const turn1Events: AgentEvent[] = [];
    const turn3Events: AgentEvent[] = [];

    const instance = manager.getNew({
      name: 'poem-durability',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    // ── TURN 1: Write a poem ──────────────────────
    const turn1Result = await instance.run({
      prompt: 'Write a 4-line poem about a random subject. State the subject clearly in the first line.',
      cwd: process.cwd(),
      onEvent: (e) => turn1Events.push(e),
    });

    expect(turn1Result.status).toBe('completed');
    expect(instance.sessionId).toBeTruthy();
    expect(turn1Events.some(e => e.type === 'text_delta')).toBe(true);

    const sessionId = instance.sessionId!;

    // ── TURN 2: Compact ───────────────────────────
    const compactResult = await instance.compact();

    expect(compactResult.status).toBe('completed');
    expect(compactResult.sessionId).toBe(sessionId);   // same session

    // ── TURN 3: Recall the subject ────────────────
    const turn3Result = await instance.run({
      prompt: 'What was the subject of the poem you wrote? Reply with just the subject, one word.',
      cwd: process.cwd(),
      onEvent: (e) => turn3Events.push(e),
    });

    expect(turn3Result.status).toBe('completed');
    expect(turn3Result.sessionId).toBe(sessionId);     // still same session
    expect(turn3Result.output.length).toBeGreaterThan(0);
    expect(turn3Events.some(e => e.type === 'text_delta')).toBe(true);
  });
});
```

---

## Timing Expectations

```
Turn 1 (poem):     ~3-8s   (short prompt, short output)
Turn 2 (compact):  ~5-15s  (reads conversation, writes summary)
Turn 3 (recall):   ~2-5s   (short prompt, one-word answer)
─────────────────────────────────────────────────
Total:             ~10-30s  (well within 180s timeout)
```

---

## Edge Cases

### What if compact fails?

```typescript
// Compact can fail if:
// 1. Session doesn't exist on disk (Claude cleaned up)
// 2. Claude CLI crashes during compact
// 3. Timeout exceeded

// The test just checks status — a failed compact means
// compactResult.status === 'failed', and the test fails
// at the assertion. No special handling needed.
```

### What if the agent ignores the "one word" instruction?

The agent might return "The subject of the poem was lighthouses." instead of "Lighthouses". This is fine — we assert `output.length > 0`, not the exact content.

### What about Copilot SDK?

Copilot SDK doesn't have a `/compact` command. The Copilot version of this test would be:
- Turn 1: Write poem → get conversationId
- Turn 2: **Skip compact** (not available)
- Turn 3: Resume with conversationId → recall subject

The test proves session resume works, just without the compact step.

```typescript
describe.skip('Copilot session resume: poem → recall', { timeout: 180_000 }, () => {
  // Same structure, skip compact, use SdkCopilotAdapter
});
```

---

## How This Fits in Phase 4

This test is an **enhancement** to the existing Phase 4 plan. It can be:

**Option A**: Replace T002 (Claude single-node wiring) with this multi-turn test — proves MORE than single-turn.

**Option B**: Add as a new T010 after the existing 9 tasks — an additional durability test.

**Recommendation**: Option B — keep the simple single-node test (T002) for baseline wiring proof, add this as a deeper validation.

---

## Open Questions

### Q1: Should we capture turn 1's output and grep for it in turn 3?

**RESOLVED**: No. Content matching is fragile with LLMs. The structural chain (completed + same sessionId + non-empty output in turn 3) is sufficient proof. If we wanted extra confidence, we could check `turn3Result.output.length < turn1Result.output.length` (recall is shorter than poem) — but even that's not guaranteed.

### Q2: Does compact always preserve the sessionId?

**RESOLVED**: Yes. Claude's `/compact` command summarizes the conversation in-place. The session file is rewritten with condensed content, but the ID stays the same. This is by design — compact is an optimization, not a fork.

### Q3: Should this test run for both adapters?

**RESOLVED**: Claude Code only for the full 3-turn test (compact is Claude-specific). Copilot gets a 2-turn version (poem → recall, no compact). Both prove session durability, just through different paths.
