# Workshop 02: Multi-Turn Session Durability Test — Full-Stack Analysis

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

Design a real agent test that goes through as much of the production stack as possible. This workshop honestly analyzes **what each layer can and cannot test today**, and designs a test that maximizes coverage while being transparent about gaps.

## The Honest Question

> "Will this truly test that our system supports work units running real pods with real agents?"

**Answer**: Yes for the **wiring chain**. Partially for the **complete experience**. Here's why.

---

## Layer-by-Layer Analysis

### What the Full Chain Looks Like

```
orchestrationService.run()
  → ONBAS.getNextAction(reality)         ← decides which node to start
    → returns { type: 'start-node', nodeId, inputs }
  → ODS.execute(request, ctx, reality)
    → handleAgentOrCode()
      → agentManager.getNew({ name, type, workspace })    ← creates IAgentInstance
      → podManager.createPod(nodeId, { agentInstance })    ← creates AgentPod
      → pod.execute({ inputs, ctx, graphSlug })            ← FIRE AND FORGET
        → loadStarterPrompt()                              ← reads node-starter-prompt.md
        → agentInstance.run({ prompt, cwd })               ← calls real adapter
          → adapter.run({ prompt, sessionId, cwd })        ← spawns real Claude/Copilot
```

### What Each Layer Proves

| Layer | What It Proves | Limitation |
|-------|---------------|------------|
| `orchestrationService.run()` | Settle-decide-act loop works | Exits after first dispatch (agent still running) |
| `ONBAS.getNextAction()` | Ready node detection correct | — |
| `ODS.handleAgentOrCode()` | agentManager called, pod created, execute fired | Fire-and-forget — no await |
| `podManager.createPod()` | Pod constructed with agentInstance | — |
| `pod.execute()` | Prompt loaded, instance.run() called | **Sends GENERIC starter prompt** (not work-unit-specific) |
| `agentInstance.run()` | Adapter called, session created, events emitted | — |
| `adapter.run()` | Real Claude/Copilot process spawned | — |

### The Prompt Gap

**`pod.execute()` always sends `node-starter-prompt.md`** — a generic 24-line WF protocol manual. It does NOT:
- Read the work unit's `prompt_template` field from YAML
- Inject node inputs into the prompt
- Construct a task-specific prompt

This means: through the full pod path, the real agent receives protocol instructions ("you are a work unit, use these CLI commands..."), not "write a poem."

**Spec B adds prompt construction** — the `PromptBuilder` that reads work unit definitions, injects inputs, and builds contextual prompts. Until then, pod.execute() is a protocol-level interaction.

### The Compact Gap

**`compact()` exists on `IAgentInstance` but NOT on `IWorkUnitPod`**. The pod interface exposes:
- `execute()` — one-shot run with starter prompt
- `resumeWithAnswer()` — resume after a question
- `terminate()` — stop the agent

To compact, you need **direct instance access** — either through `agentManager.getAgents()` or `agentManager.getWithSessionId(sessionId, params)`.

---

## Test Design: Two Complementary Tests

Given these realities, the workshop designs **two tests** that together prove the complete picture:

### Test 1: Full-Stack Wiring (ODS → Pod → Real Agent)

**What it proves**: The entire production chain creates and executes a real agent.

```
Graph: 1 line, 1 agent node ("spec-builder")
  → orchestrationService.run()
    → ONBAS returns start-node
    → ODS creates instance via agentManager.getNew()
    → podManager creates AgentPod
    → pod.execute() sends node-starter-prompt.md to real Claude
    → Claude spawns, processes prompt, returns
    → pod.sessionId populated
```

**What the agent sees**: The generic starter prompt. The agent acknowledges the protocol or attempts initial action. Doesn't matter — we assert structurally.

**Structural assertions**:
```typescript
// After orchestrationService.run():
const pod = podManager.getPod(nodeId);
expect(pod).toBeDefined();
expect(pod!.unitType).toBe('agent');

// Wait for agent to finish (fire-and-forget, must poll):
await waitForPodSession(pod!, 120_000);

expect(pod!.sessionId).toBeTruthy();

// Verify the manager created an instance:
const agents = agentManager.getAgents();
expect(agents.length).toBeGreaterThanOrEqual(1);
expect(agents[0].status).toBe('stopped');
expect(agents[0].sessionId).toBeTruthy();
```

**What this proves**:
- ✅ ODS → agentManager.getNew() wiring
- ✅ PodManager creates pod with real IAgentInstance
- ✅ Pod executes with real adapter
- ✅ Real Claude/Copilot spawns and completes
- ✅ SessionId flows from adapter → instance → pod

### Test 2: Pod-Level Multi-Turn with Session Durability (Poem → Compact → Recall)

**What it proves**: Sessions survive compact AND the pod's `resumeWithAnswer()` works with real agents through the full pod → instance → adapter chain.

```
Step 1: ODS creates pod via full chain (same as Test 1)
Step 2: pod.execute() → agent runs with starter prompt → sessionId acquired
Step 3: Access instance via agentManager → instance.compact() (only bypass)
Step 4: pod.resumeWithAnswer('recall', 'What subject?') → full pod chain
```

**Three of four steps go through the pod**. Only `compact()` bypasses — it's not on the `IWorkUnitPod` interface (a ~3-line addition if ever needed, not Spec A scope).

```typescript
// After pod.execute() completes and sessionId is acquired:

// ── COMPACT (instance-level, only bypass) ──
const agents = agentManager.getAgents();
const instance = agents[0];
await instance.compact();

// ── RECALL (through the pod!) ──
const recallResult = await pod.resumeWithAnswer(
  'recall-subject',
  'What was the subject of the poem you wrote? Reply with just the subject, one word.',
  executeOptions
);
// recallResult goes through: pod.resumeWithAnswer → instance.run → adapter.run
```

---

## Coverage Matrix

```
                           Test 1          Test 2
                        (Full Stack)    (Multi-Turn)     Combined
                        ─────────────   ─────────────    ─────────
orchestrationService      ✅               ✅ (setup)     ✅
ONBAS decision            ✅               ✅ (setup)     ✅
ODS.handleAgentOrCode     ✅               ✅ (setup)     ✅
agentManager.getNew       ✅               ✅ (via ODS)   ✅
PodManager.createPod      ✅               ✅ (via ODS)   ✅
AgentPod.execute          ✅               ✅ (turn 1)    ✅
AgentPod.resumeWithAnswer  ─               ✅ (turn 3)    ✅
node-starter-prompt.md    ✅               ✅ (turn 1)    ✅
instance.run()            ✅ (via pod)     ✅ (via pod)   ✅
instance.compact()         ─               ✅ (direct)    ✅
session creation          ✅               ✅              ✅
session resume            ─                ✅              ✅
session survives compact   ─               ✅              ✅
real adapter spawns       ✅               ✅              ✅
events collected          ─                ✅              ✅
pod.resumeWithAnswer       ─               ✅              ✅
```

**Together**: These two tests cover the FULL wiring (Test 1), the FULL session lifecycle (Test 2), AND `pod.resumeWithAnswer()` with a real agent (Test 2 turn 3). The only bypass is `instance.compact()` — not on the pod interface.

---

## What Happens During the Run

### Test 1 Timeline

```
t=0s     orchestrationService.run() called
t=0.1s   ONBAS: node 'spec-builder' is ready → start-node
t=0.2s   ODS: agentManager.getNew() → IAgentInstance created
t=0.3s   ODS: podManager.createPod() → AgentPod constructed
t=0.4s   ODS: pod.execute() fired (NOT awaited) → returns immediately
t=0.5s   orchestrationService.run() returns { actions: [start-node] }
t=0.5s   Test begins polling pod.sessionId...
t=0.6s   AgentPod.execute(): loads node-starter-prompt.md
t=0.7s   instance.run(): calls adapter.run()
t=1.0s   Claude CLI spawns: claude --output-format=stream-json -p "..."
t=1.5s   Events start flowing: text_delta, text_delta, ...
t=5-15s  Claude completes response
t=5-15s  adapter.run() returns AgentResult
t=5-15s  instance updates sessionId
t=5-15s  pod.sessionId becomes truthy
t=5-15s  Polling succeeds! Test assertions run.
```

### Test 2 Timeline

```
t=0s     orchestrationService.run() → ODS creates pod with real agent
t=0.5s   Pod fire-and-forget: pod.execute() sends starter prompt
t=1-15s  Real Claude processes starter prompt → sessionId acquired
t=15s    Poll succeeds: pod.sessionId truthy
t=15.1s  COMPACT: access instance via agentManager → instance.compact()
t=15.5s  Claude compacts session (summarizes in place)
t=20-28s Compact complete. sessionId preserved.
t=28.1s  RECALL: pod.resumeWithAnswer('recall', 'What was the subject?')
         → pod → instance.run() → adapter.run() → Claude resumes
t=30-35s Claude responds from compacted context
t=35s    Assertions: all turns completed, same sessionId, output non-empty
```

---

## What Happens Under the Hood at Each Turn

### Turn 1: instance.run({ prompt: 'Write a poem...' })

**Instance layer**:
```
instance.status: stopped → working
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

**JSON stream from Claude**:
```json
{"type":"system","subtype":"init","session_id":"sess-abc","tools":[],"model":"claude-sonnet-4-20250514"}
{"type":"assistant","subtype":"text","content_block_delta":{"type":"text_delta","text":"Light"}}
{"type":"assistant","subtype":"text","content_block_delta":{"type":"text_delta","text":"houses"}}
... (more deltas)
{"type":"result","subtype":"success","session_id":"sess-abc","cost_usd":0.003,"duration_ms":2100}
```

**Mapped AgentEvents** (emitted to handlers):
```typescript
{ type: 'text_delta', data: { content: 'Light' }, timestamp: '...' }
{ type: 'text_delta', data: { content: 'houses' }, timestamp: '...' }
{ type: 'message', data: { content: 'Lighthouses stand against the storm,...' }, timestamp: '...' }
{ type: 'usage', data: { inputTokens: 45, outputTokens: 62 }, timestamp: '...' }
```

### Turn 2: instance.compact()

**Instance layer**:
```
instance.status: stopped → working
  → validates sessionId !== null ✓ (it's 'sess-abc')
  → delegates to adapter.compact('sess-abc')
    → adapter.run({ prompt: '/compact', sessionId: 'sess-abc' })
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

Claude summarizes the conversation in place. Session file on disk shrinks. Session ID stays the same.

### Turn 3: instance.run({ prompt: 'What was the subject?' })

**Adapter layer**:
```bash
claude \
  --output-format=stream-json \
  --verbose \
  --dangerously-skip-permissions \
  --resume sess-abc \
  -p "What was the subject of the poem you wrote? Reply with just the subject, one word."
```

**What proves session survived**: The agent produces a coherent answer referencing the poem subject. It can ONLY know this if the compacted session context was preserved.

---

## Structural Assertions (No Content Matching)

```typescript
// ── TEST 1: Full-stack ──
const pod = podManager.getPod(nodeId);
await waitForPodSession(pod!, 120_000);
expect(pod!.sessionId).toBeTruthy();

const sessionId = pod!.sessionId;

// ── COMPACT (only instance-level bypass) ──
const agents = agentManager.getAgents();
const instance = agents[0];
const compactResult = await instance.compact();
expect(compactResult.status).toBe('completed');
expect(compactResult.sessionId).toBe(sessionId);  // ← SAME session

// ── RECALL (through the pod!) ──
const recallResult = await pod!.resumeWithAnswer(
  'recall-subject',
  'What was the subject of the poem you wrote? Reply with just the subject, one word.',
  { inputs: { ok: true, inputs: {} }, ctx: { worktreePath }, graphSlug }
);
expect(recallResult.outcome).toBe('completed');
expect(recallResult.sessionId).toBe(sessionId);     // ← STILL same session
```

### Why We Don't Assert on Content

The agent might return "Lighthouses", "lighthouse", "The poem was about lighthouses", or something else entirely. All are valid. The **structural chain** proves durability:

1. Turn 1 completed → session created
2. Compact completed → session preserved (same ID)
3. Turn 3 completed → session still functional after compact

If the session had been destroyed, turn 3 would fail with a session error or get a different sessionId.

---

## The Copilot Variant

Copilot SDK has no `/compact` command. The Copilot version is a **2-turn test**:

```
TURN 1: instance.run({ prompt: "Write a poem..." })  → conversationId acquired
TURN 2: instance.run({ prompt: "What was the subject?" })  → resumes conversation
```

This proves session resume works without the compact step.

---

## Gaps Honestly Acknowledged

| Gap | Why | When Fixed |
|-----|-----|------------|
| `compact()` not on pod interface | Only on `IAgentInstance` — ~3 line addition if needed | Spec B (if needed) |
| Node doesn't auto-complete after agent finishes | No event bridge pod→graph yet | Spec B (execution tracking) |
| Only Claude tested for compact | Copilot has no `/compact` | Design decision |

---

## How This Fits in Phase 4

Add as **T010** alongside existing T001-T009. The file is `orchestration-wiring-real.test.ts`:

- T001-T008: Existing Phase 4 tests (single-turn structural assertions)
- T010: Multi-turn session durability (`describe.skip`)
  - Full-stack setup: ODS → pod → real agent (generic prompt, sessionId acquired)
  - Compact: instance-level (only bypass — not on pod interface)
  - Recall: `pod.resumeWithAnswer()` → full pod → instance → adapter chain
  - 3 of 4 steps go through the pod. Only compact bypasses.
