# Workshop: Faster Feedback Loops for E2E Agent Testing

**Type**: Integration Pattern
**Plan**: 039-advanced-e2e-pipeline
**Spec**: [advanced-e2e-pipeline-spec.md](../advanced-e2e-pipeline-spec.md)
**Created**: 2026-02-21
**Status**: Draft

**Related Documents**:
- [04-e2e-shakedown-findings.md](./04-e2e-shakedown-findings.md) — Session persistence timing bug
- [scratch/session-persistence-bug.md](../../../../scratch/session-persistence-bug.md) — Detailed investigation
- [scripts/test-advanced-pipeline.ts](../../../../scripts/test-advanced-pipeline.ts) — The E2E test script

---

## Purpose

Document strategies for dramatically shortening the change→observe→fix cycle when working with real-agent E2E tests. A single full run takes 3–5 minutes with real LLM agents. During Phase 4, we discovered bugs that required 8+ full iterations to diagnose — that's 30+ minutes of wall-clock just waiting. This workshop identifies concrete techniques to compress that feedback loop from minutes to seconds where possible, and from many minutes to one run where not.

## Key Questions Addressed

- How do we get signal from a 5-minute E2E test in under 30 seconds?
- What is the optimal progression from fast feedback to full-run confidence?
- How do we debug timing races (like the session persistence bug) without running the full pipeline every time?
- What structural changes to the test infrastructure would enable faster iteration?

---

## The Feedback Loop Problem

### Current State — What a Full Iteration Looks Like

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CHANGE CODE                                          ~30s   │
│    Edit ods.ts, agent-context.ts, prompts, etc.                │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. REBUILD                                              ~30s   │
│    pnpm turbo build --force --filter=@chainglass/positional-graph│
│    (dist/ must be fresh — E2E script imports from dist/)        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. RUN E2E                                           ~3-5 min  │
│    just test-advanced-pipeline                                  │
│    - Human input completed (instant)                            │
│    - Spec-writer runs (30-60s, includes Q&A restart)            │
│    - Programmers a+b run in parallel (30-60s)                   │
│    - Reviewer runs (30-60s)                                     │
│    - Summariser runs (30-60s)                                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CHECK OUTPUT                                         ~30s   │
│    Scroll back through verbose agent logs                      │
│    Find the 23 assertions at the bottom                        │
│    Identify which failed and WHY                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. DIAGNOSE                                          ~2-5 min  │
│    Read agent output: did it do what we expected?               │
│    Check debug logs ([ODS] lines)                              │
│    Inspect disk state (.chainglass/graphs/...)                  │
│    Form hypothesis about failure                                │
└─────────────────────────────────────────────────────────────────┘

TOTAL: ~5-8 minutes per iteration
PHASE 4 REQUIRED: 8+ iterations → ~45 minutes of wall-clock waiting
```

### What We Did in Practice — Time-Boxed Runs

During Phase 4 development, we used a manual time-boxing strategy:

```
Step 1: Run for 30 seconds, kill, check output
        → "Is the first agent dispatching correctly?"
        → "Is the prompt being sent?"
        → "Is the model responding?"

Step 2: Run for 1-2 minutes, kill, check output
        → "Does Q&A work?"
        → "Does the agent produce outputs?"
        → "Does it complete gracefully?"

Step 3: Run for 5 minutes (or to completion)
        → "Does the full pipeline complete?"
        → "Do assertions pass?"

Step 4: Full run with assertions
        → "22/23? Which failed? Why?"
```

**This was effective** — it compressed early discovery from 5 minutes to 30 seconds. But it was entirely manual: Ctrl+C at the right moment, eyeball the output, form a mental model.

### Why Agent E2E Is Fundamentally Slow

| Component | Time | Why It's Slow |
|-----------|------|---------------|
| Real LLM call | 30-60s | Network round-trips, model thinking, tool calls |
| Agent tool execution | 10-30s | Bash commands, file I/O, CLI invocations |
| Q&A restart | 5-10s | Agent asks question → watcher answers → agent resumes |
| Drive loop polling | 3s idle | `idleDelayMs: 3000` between no-action iterations |
| Sequential dependencies | serial | Line 2 waits for line 1, line 3 waits for line 2 |
| Build | ~30s | TypeScript compilation, dist/ output |

**Key insight**: The agents themselves are the bottleneck. Everything else is fast. Any strategy that removes or shortens agent execution wins big.

---

## Feedback Loop Tiers

We propose a **4-tier feedback system** — each tier is faster but tests less. Start at Tier 1 for every change, escalate to higher tiers as confidence builds.

### Tier 1: Unit Tests — Instant (< 5 seconds)

**What it tests**: Logic correctness (context engine rules, readiness gates, ODS dispatch decisions).

**Current state**: Already excellent. 21 agent-context tests, 4 gate tests, ODS unit tests.

```bash
# Run specific test file
pnpm vitest run test/unit/positional-graph/features/030-orchestration/agent-context.test.ts

# Run pattern
pnpm vitest run --reporter=dot agent-context

# Run all orchestration unit tests
pnpm vitest run --reporter=dot 030-orchestration
```

**Key principle**: Every bug found in E2E should produce a unit test. The session persistence timing bug (22/23) should have a unit test that exercises the race condition in isolation — without calling a real agent.

**Example — how to unit-test the session timing race**:

```typescript
// Simulates: ODS dispatches node A (fire-and-forget), then immediately
// dispatches node B which inherits from A. Does B get A's session?
it('inheriting node gets session even when source just completed', async () => {
  const podManager = new PodManager(fakeFs);

  // Simulate fire-and-forget: set session ID after a microtask delay
  const fireAndForget = Promise.resolve().then(() => {
    podManager.setSessionId('node-a', 'session-123');
  });

  // Simulate: ODS tries to read session BEFORE .then() settles
  const sessionBefore = podManager.getSessionId('node-a');
  expect(sessionBefore).toBeUndefined(); // race condition!

  // After settling:
  await fireAndForget;
  const sessionAfter = podManager.getSessionId('node-a');
  expect(sessionAfter).toBe('session-123');
});
```

---

### Tier 2: Plumbing Test with Echo Agent — Fast (< 15 seconds)

**What it tests**: The full orchestration pipeline (ONBAS → ODS → PodManager → drive loop) — without real LLM calls.

**Current gap**: We don't have this. Building it is the highest-ROI investment.

**Concept**: An `EchoAgentAdapter` that completes instantly with deterministic output. No network, no model, no waiting. Tests the plumbing, not the agent.

```typescript
class EchoAgentAdapter implements IAgentAdapter {
  private sessionCounter = 0;

  async run(options: AgentRunOptions): Promise<AgentResult> {
    this.sessionCounter++;
    const sessionId = options.sessionId ?? `echo-session-${this.sessionCounter}`;

    // Simulate: read prompt, "write" outputs by calling cg wf node end
    // Use a tiny delay to simulate async completion
    await new Promise(r => setTimeout(r, 50));

    return {
      output: `Echo: processed ${options.prompt.slice(0, 50)}`,
      sessionId,
      status: 'completed',
      exitCode: 0,
      tokens: null,
    };
  }

  async terminate(): Promise<void> {}
}
```

**What this enables**:

```
Full run time: ~15 seconds (vs 3-5 minutes)
  - 6 nodes × 50ms each = 300ms agent time
  - Drive loop overhead ~5s
  - Graph setup, assertions ~5s
```

**Critical: echo agent must still call CLI commands.** The ODS detects node completion via disk state (event system), not via promise resolution. The echo agent must run the actual `cg wf node start` and `cg wf node end` CLI commands, just without doing any real work between them.

```typescript
class EchoAgentAdapter implements IAgentAdapter {
  async run(options: AgentRunOptions): Promise<AgentResult> {
    const sessionId = options.sessionId ?? `echo-${Date.now()}`;

    // Must actually run the lifecycle commands so ONBAS sees state changes
    if (options.cwd) {
      execSync(`cg wf node start ...`, { cwd: options.cwd });
      // Write minimal outputs
      execSync(`cg wf node output set ... --value "echo"`, { cwd: options.cwd });
      execSync(`cg wf node end ...`, { cwd: options.cwd });
    }

    return { output: 'echo', sessionId, status: 'completed', exitCode: 0, tokens: null };
  }
}
```

**This tier catches**: Session inheritance bugs, readiness gate failures, Q&A flow issues, drive loop termination, node ordering. Basically everything except "does the LLM produce correct output".

---

### Tier 3: Single-Node Real Agent — Medium (30-60 seconds)

**What it tests**: Does a real LLM agent correctly interact with the workflow system? Does it call the right CLI commands? Does it produce outputs?

**Concept**: Run the full pipeline but swap all agents except the one you're debugging for echo agents.

```typescript
// Test just the spec-writer with a real agent, everything else echo
const agentFactory = (label: string) => {
  if (label === 'spec-writer') {
    return new VerboseCopilotAdapter(client, label, BLUE, Date.now());
  }
  return new EchoAgentAdapter();
};
```

**When to use**: You've changed a prompt (main.md), a node-starter template, or model config, and want to see if the agent behaves correctly in the real workflow context.

**What this enables**: Debugging agent-specific issues (wrong commands, yaml edits, verbose output) without waiting for 5 other agents.

---

### Tier 4: Full Pipeline Real Agents — Slow (3-5 minutes)

**What it tests**: Everything. Real agents, real sessions, real Q&A, real parallelism, real context inheritance.

**When to use**: Final validation before committing. Or when hunting a timing/race condition that only manifests with real async agents.

```bash
just test-advanced-pipeline
```

**Improvements to make Tier 4 more productive**:

1. **Live assertion checking** — don't wait until the end
2. **Structured summary** — one line per phase, not scrolling through logs
3. **Auto-timeout** — fail fast if any single agent exceeds 120s

---

## Concrete Improvements

### Improvement 1: `--fast` Mode (Echo Agent Pipeline)

Add a `--fast` flag to `test-advanced-pipeline.ts` that swaps real agents for echo agents.

```bash
just test-advanced-pipeline --fast     # Echo agents, ~15s
just test-advanced-pipeline            # Real agents, ~3-5 min
just test-advanced-pipeline --solo spec-writer  # One real, rest echo
```

**Implementation sketch**:

```typescript
const FAST = process.argv.includes('--fast');
const SOLO = process.argv.find(a => a.startsWith('--solo='))?.split('=')[1];

const agentManager = new AgentManagerService(() => {
  const label = nodeLabels[adapterIndex] ?? `node-${adapterIndex}`;
  adapterIndex++;

  if (FAST) return new EchoAgentAdapter(label);
  if (SOLO && label !== SOLO) return new EchoAgentAdapter(label);
  return new VerboseCopilotAdapter(client, label, colour, t0);
});
```

**Justfile entries**:

```makefile
test-pipeline-fast:
    npx tsx scripts/test-advanced-pipeline.ts --fast

test-pipeline-solo node:
    npx tsx scripts/test-advanced-pipeline.ts --solo={{node}}
```

---

### Improvement 2: Progressive Assertions (Fail Fast)

Currently, all 23 assertions run AFTER the pipeline completes. If the pipeline itself fails to complete (timeout, crash), we get zero assertion signal.

**Better**: Check assertions progressively as nodes complete.

```typescript
// In the drive loop's onEvent handler:
case 'iteration': {
  // After each iteration, check if any newly-completed nodes fail assertions
  const completed = getNewlyCompleted(event.data.finalReality);
  for (const nodeId of completed) {
    await checkNodeAssertions(nodeId); // fails early with clear signal
  }
  break;
}
```

**Example output during a run**:

```
[15.2] ▶ 1 action(s)
  ✓ human-input: complete
[45.8] ▶ 1 action(s)
  ✓ spec-writer: complete, has spec output, has language_1
  ✓ Q&A answered
[92.1] ▶ 2 action(s)
  ✓ programmer-a: complete, has code output
  ✓ programmer-b: complete, has code output
  ✓ isolation: a ≠ b ≠ spec-writer
[138.4] ▶ 1 action(s)
  ✓ reviewer: complete, has review_a, session = spec-writer ✓
[175.0] ▶ 1 action(s)
  ✗ summariser: session = undefined (expected reviewer's)  ← FAIL FAST HERE
```

**Benefit**: You know the failure point 60 seconds earlier AND you know exactly when it happened relative to the drive loop state.

---

### Improvement 3: Build Bypass for Prompt-Only Changes

Many iterations only change prompt files (`dev/test-graphs/advanced-pipeline/units/*/prompts/main.md`) or the test script itself. These don't require a full rebuild.

```bash
# Prompt changes: no build needed (prompts read from disk at runtime)
vim dev/test-graphs/advanced-pipeline/units/spec-writer/prompts/main.md
just test-advanced-pipeline  # direct — skip build

# Source changes: build required
vim packages/positional-graph/src/features/030-orchestration/ods.ts
pnpm turbo build --force --filter=@chainglass/positional-graph && just test-advanced-pipeline
```

**Implementation**: Add a `--skip-build` flag or detect file timestamps. Or just document the rule clearly:

```
RULE: If you only changed files under dev/ or scripts/, skip rebuild.
      If you changed files under packages/ or apps/, rebuild first.
```

---

### Improvement 4: Structured Debug Output

Current debug logging (`[ODS] Context for ...` console.log lines) is mixed into the verbose agent output. It's hard to grep and easy to miss.

**Better**: A structured debug log file.

```typescript
// debug-log.ts
const DEBUG_LOG: DebugEntry[] = [];

export function debugLog(component: string, event: string, data: Record<string, unknown>) {
  DEBUG_LOG.push({
    ts: Date.now(),
    component,
    event,
    data,
  });
}

export function dumpDebugLog(path: string) {
  writeFileSync(path, JSON.stringify(DEBUG_LOG, null, 2));
}
```

```typescript
// In ODS:
debugLog('ods', 'session-lookup', {
  nodeId: node.nodeId,
  source: contextResult.source,
  fromNodeId: contextResult.fromNodeId,
  sessionId: sessionId ?? null,
});
```

**Output** (debug-log.json):
```json
[
  { "ts": 1708512345678, "component": "ods", "event": "dispatch",
    "data": { "nodeId": "spec-writer-7f7", "source": "new" }},
  { "ts": 1708512395000, "component": "ods", "event": "session-captured",
    "data": { "nodeId": "spec-writer-7f7", "sessionId": "68119c00" }},
  { "ts": 1708512396000, "component": "ods", "event": "dispatch",
    "data": { "nodeId": "reviewer-111", "source": "inherit",
             "fromNodeId": "spec-writer-7f7", "sessionId": "68119c00" }},
  { "ts": 1708512456000, "component": "ods", "event": "session-captured",
    "data": { "nodeId": "reviewer-111", "sessionId": "68119c00" }},
  { "ts": 1708512457000, "component": "ods", "event": "dispatch",
    "data": { "nodeId": "summariser-0c7", "source": "inherit",
             "fromNodeId": "reviewer-111", "sessionId": null }},
]
```

**Benefit**: Post-mortem analysis without re-running. Timestamp tells you exactly when things happened. You can diff two runs.

---

### Improvement 5: `--timeout` Per Node

A stuck agent (model timeout, infinite loop) holds up the entire pipeline. Currently the only safeguard is `maxIterations: 200` on the drive loop.

```typescript
// In AgentPod.execute():
const timeoutMs = options.timeoutMs ?? 120_000; // 2 min default
const result = await Promise.race([
  this.agentInstance.run({ prompt, sessionId, cwd }),
  sleep(timeoutMs).then(() => {
    throw new Error(`Agent timed out after ${timeoutMs}ms`);
  }),
]);
```

**Benefit**: A stuck agent fails in 2 minutes instead of silently holding the pipeline for 10+. Combined with progressive assertions, you get clear signal about which node timed out.

---

## Applying to the Current Bug

### The Session Persistence Timing Race

**Current diagnosis flow** (slow, ~45 min total):

```
1. Hypothesis: "maybe sessions aren't persisting"
   → Change persistSessions call location
   → Rebuild (30s) → Run (5min) → Check → Still 22/23
   → 6 min wasted, hypothesis rejected

2. Hypothesis: "maybe loadSessions is overwriting"
   → Remove loadSessions per-iteration
   → Rebuild → Run → Check → Still 22/23
   → 6 min wasted, hypothesis rejected

3. Hypothesis: "maybe .then() hasn't fired"
   → Add debug logging
   → Rebuild → Run → Check → "AHA: sessionId=undefined at dispatch time"
   → 6 min, but got signal

4+ iterations to explore fixes...
```

**With faster feedback (proposed flow)**:

```
1. Write unit test for the race condition (Tier 1)
   → 5 seconds → confirms: getSessionId returns undefined before .then() settles

2. Test fix in unit test (Tier 1)
   → 5 seconds → retry loop works in unit test

3. Wire fix into ODS, run --fast (Tier 2)
   → 15 seconds → echo agent pipeline: session chain passes

4. Run full pipeline (Tier 4)
   → 5 min → 23/23 ✓

TOTAL: ~6 minutes instead of ~45 minutes
```

**The key difference**: Steps 1-3 give you confidence BEFORE you spend 5 minutes on a full run.

---

## Immediate Action Items

Ranked by ROI (highest first):

### 1. Fix the Current Bug (Option C — Retry with Delay)

This is the immediate priority. ~5 lines in ODS:

```typescript
// In buildPodParams, when source === 'inherit' and sessionId is undefined:
if (contextResult.source === 'inherit') {
  let sessionId: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    sessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
    if (sessionId) break;
    await new Promise(r => setTimeout(r, 200));
  }
  // ... use sessionId
}
```

**Why first**: This unblocks 23/23 and proves the fix. Everything else improves velocity for FUTURE iterations.

### 2. Build EchoAgentAdapter + `--fast` Flag

Highest-ROI infrastructure investment. Enables Tier 2 testing for ALL future changes.

**Estimated effort**: ~50 lines for the adapter, ~20 lines to wire the flag.

### 3. Add Unit Test for Session Timing Race

Captures the current bug as a reproducible test case. Prevents regression.

### 4. Add Progressive Assertions to Drive Loop

Medium effort, high visibility. Makes every Tier 4 run more informative.

### 5. Structured Debug Log

Low effort, compounds over time. Replace `[ODS]` console.logs with structured entries.

---

## Open Questions

### Q1: Should EchoAgentAdapter actually call CLI commands?

**OPEN**: Two options:

- **Option A**: Echo agent calls real `cg wf node start/end` commands. Tests the full stack including event system and state persistence. More realistic but slower (~2s per node for CLI overhead).

- **Option B**: Echo agent uses a `FakeNodeEventRegistry` to simulate state changes without CLI. Tests plumbing only. Faster (~50ms per node) but doesn't test CLI integration.

Recommendation: Start with Option A. If 2s×6 nodes = 12s is too slow, build Option B.

### Q2: Should `--fast` mode skip Q&A?

**OPEN**: The echo agent won't ask questions. But Q&A is a critical part of the flow. Options:

- **Skip it**: Echo agents don't ask questions, Q&A watcher never fires. Simpler but doesn't test Q&A flow.
- **Simulate it**: Echo agent asks a scripted question via CLI, watcher answers it. Tests Q&A plumbing with echo speed.

Recommendation: Start simple (skip Q&A in fast mode). Add simulated Q&A later if needed.

### Q3: Should we record and replay agent outputs?

**DEFERRED**: A "cassette" system (record real agent outputs, replay them without API calls) would give Tier 2 speed with Tier 4 realism. But it's a significant investment and agent outputs are non-deterministic. Consider for a future plan if E2E iteration velocity remains a bottleneck.

---

## Quick Reference

```bash
# Tier 1: Unit tests (< 5s)
pnpm vitest run --reporter=dot agent-context
pnpm vitest run --reporter=dot can-run
pnpm vitest run --reporter=dot 030-orchestration

# Tier 2: Echo pipeline (< 15s) [PROPOSED]
just test-advanced-pipeline --fast

# Tier 3: Single real agent (30-60s) [PROPOSED]
just test-advanced-pipeline --solo=spec-writer

# Tier 4: Full pipeline (3-5 min)
just test-advanced-pipeline

# Remember: prompt-only changes don't need rebuild
# Source changes need: pnpm turbo build --force --filter=@chainglass/positional-graph
```
