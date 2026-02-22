# Workshop: What the Agent Actually Sees — Prompt Flow and Adapter Differences

**Type**: Integration Pattern
**Plan**: 038-real-agent-e2e
**Spec**: [spec-c-real-agent-e2e-tests.md](../../033-real-agent-pods/spec-c-real-agent-e2e-tests.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [Workshop 08: Implementation Wiring](../../033-real-agent-pods/workshops/08-spec-c-implementation-wiring.md)
- `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md`
- `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md`
- `packages/positional-graph/src/features/030-orchestration/pod.agent.ts`

---

## Purpose

Before writing real agent test fixtures, we need to understand exactly what the agent receives: the prompt, the workspace, the available commands. This workshop traces the complete prompt experience for both Copilot (first-class, default) and Claude Code, identifies critical differences, and resolves what our agent `prompts/main.md` files should contain.

## Key Questions Addressed

- What prompt does the agent actually receive?
- How does the agent get its task-specific instructions?
- What's different between Copilot and Claude Code adapters?
- Do agent prompts need `--workspace-path` explicitly?
- What should our test `prompts/main.md` files contain?
- Is Copilot or Claude Code the default — and does it matter?

---

## Part 1: The Agent Prompt Pipeline

### What AgentPod Does

AgentPod does **3 things** — no more:

1. **Picks template**: First run → `node-starter-prompt.md`. Subsequent runs (after restart) → `node-resume-prompt.md`.
2. **Resolves 3 placeholders** via simple `replaceAll`:
   - `{{graphSlug}}` → the graph's slug
   - `{{nodeId}}` → the node's ID
   - `{{unitSlug}}` → the work unit's slug
3. **Calls** `agentInstance.run({ prompt, cwd: worktreePath })`

That's the entire prompt contract. No env vars injected. No input data injected. No `prompts/main.md` loading by AgentPod.

### The Critical Insight: `main-prompt` Is a CLI Command, Not a File Load

The agent's task-specific prompt (`prompts/main.md`) is **NOT injected by AgentPod**. The system prompt tells the agent to fetch it via CLI:

```bash
cg wf node get-input-data <graphSlug> <nodeId> main-prompt
```

This CLI command:
1. Reads `prompt_template` from the unit's YAML config
2. Resolves path: `{worktreePath}/.chainglass/units/{unitSlug}/prompts/main.md`
3. Returns the file contents

**The agent must call this command to discover what its task is.** If the agent doesn't follow instructions, it won't know what to do.

---

## Part 2: Copilot vs Claude Code — Critical Differences

### Adapter Comparison

| Aspect | Copilot (SdkCopilotAdapter) | Claude Code (ClaudeCodeAdapter) |
|--------|---------------------------|-------------------------------|
| **Default?** | **YES** — `agentType ?? 'copilot'` | Must set explicitly |
| **Interface** | In-process SDK (`@github/copilot-sdk`) | Spawns `claude` CLI as child process |
| **Session create** | `client.createSession()` | New CLI invocation |
| **Session resume** | `client.resumeSession(sessionId)` | `--fork-session --resume <sessionId>` |
| **Prompt delivery** | `session.sendAndWait({ prompt })` | `-p <prompt>` flag |
| **Event streaming** | `session.on(event)` callback | Parse `--output-format=stream-json` stdout |
| **Compact** | `session.sendAndWait({ prompt: '/compact' })` | New process with `/compact` prompt |
| **Terminate** | `session.abort()` + `session.destroy()` | `process.kill(pid)` |
| **Auth** | `@github/copilot` CLI authenticated | `claude` CLI authenticated |

### What This Means for Tests

1. **Copilot is first-class** — the default `agentType`. Our tests should primarily target Copilot.
2. **Claude Code is opt-in** — requires `updateGraphOrchestratorSettings(ctx, slug, { agentType: 'claude-code' })`.
3. **Session inheritance works differently**:
   - Copilot: `client.resumeSession(sessionId)` — native SDK continuation
   - Claude Code: `--fork-session --resume` — creates a forked conversation branch
4. **Both need authentication** — different skip guards per adapter.

---

## Part 3: Agent vs Code Unit — Environment Differences

| What | Code Units (scripts) | Agent Units (LLMs) |
|------|---------------------|-------------------|
| Graph slug | `CG_GRAPH_SLUG` env var | Embedded in prompt text |
| Node ID | `CG_NODE_ID` env var | Embedded in prompt text |
| Workspace | `CG_WORKSPACE_PATH` env var | Agent's `cwd` set by pod |
| Inputs | `INPUT_*` env vars | Agent calls `cg wf node get-input-data` CLI |
| Task prompt | `code.script` executed directly | Agent calls `cg wf node get-input-data ... main-prompt` |
| `--workspace-path` | Scripts pass explicitly | **Not needed** — agent cwd IS the workspace |

### Why `--workspace-path` Isn't Needed for Agents

AgentPod passes `cwd: options.ctx.worktreePath` to `agentInstance.run()`. The adapter sets the process/session `cwd` to the workspace path. When the agent calls `cg wf node accept <graph> <node>`, the CLI resolves workspace from CWD (which is the registered temp workspace via `withTestGraph`).

**Validate empirically**: If CWD resolution fails, update the starter prompt to include workspace path in CLI commands.

---

## Part 4: What Our Test `prompts/main.md` Should Contain

### Principle: The System Prompt Already Teaches Protocol

The `node-starter-prompt.md` already tells the agent:
- How to accept (`cg wf node accept`)
- How to read inputs (`cg wf node get-input-data`)
- How to save outputs (`cg wf node save-output-data`)
- How to complete (`cg wf node end`)

**Our task prompt just needs to say WHAT to do, not HOW.**

### spec-writer/prompts/main.md

```markdown
Read the spec input provided to this node and write a brief 1-2 sentence summary.
Save your summary as the "summary" output.
```

### reviewer/prompts/main.md

```markdown
Review the summary provided to this node. Output the word "approved" as the "decision" output.
```

### worker-a and worker-b (parallel)/prompts/main.md

```markdown
Read the spec input and output a one-word topic summary as the "result" output.
```

### Why Keep Prompts Minimal?

1. **Deterministic tasks minimize LLM variance** — "output the word approved" is nearly deterministic
2. **Fast execution** — simple tasks complete in 10-30s, not 60-120s
3. **Structural assertions** — we assert output EXISTS, not what it contains
4. **The test proves the PIPELINE, not the LLM**

---

## Part 5: Test Structure — Copilot First, Claude Code Second

### 3 Tests Total

```typescript
describe.skip('Real Agent Orchestration', { timeout: 300_000 }, () => {

  describe('Copilot — serial pipeline with session inheritance', () => {
    it('drives get-spec → spec-writer → reviewer to completion', async () => {
      // Default agentType is 'copilot' — no settings change needed
    }, 180_000);
  });

  describe('Copilot — parallel execution', () => {
    it('drives worker-a + worker-b with independent sessions', async () => {
      // Default agentType is 'copilot'
    }, 180_000);
  });

  describe('Claude Code — serial pipeline', () => {
    it('drives get-spec → spec-writer → reviewer with claude-code', async () => {
      // updateGraphOrchestratorSettings(ctx, slug, { agentType: 'claude-code' })
    }, 180_000);
  });
});
```

### Adapter Factory Construction

```typescript
// Copilot factory (dynamic import)
async function createCopilotFactory() {
  const { SdkCopilotAdapter } = await import('@chainglass/shared');
  const { CopilotClient } = await import('@github/copilot-sdk');
  const client = new CopilotClient();
  return () => new SdkCopilotAdapter(client);
}

// Claude Code factory (dynamic import)
async function createClaudeFactory() {
  const { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } = await import('@chainglass/shared');
  const logger = new FakeLogger();
  const processManager = new UnixProcessManager(logger);
  return () => new ClaudeCodeAdapter(processManager, { logger });
}
```

---

## Part 6: Drive Parameters for Real Agents

```typescript
const REAL_AGENT_DRIVE_OPTIONS = {
  maxIterations: 50,
  actionDelayMs: 1000,     // 1s between action iterations
  idleDelayMs: 5000,       // 5s idle polls (agent needs 10-60s per node)
  onEvent: (event: DriveEvent) => {
    console.log(`  [drive] ${event.type}: ${event.message ?? ''}`);
  },
};
```

**Time budget**: 50 × 5s = 250s max. Simple agent tasks: ~10-30s. Well within 180s test timeout.

---

## Part 7: Impact on Plan 038

### Changes to Apply

1. **3 tests not 2** — Copilot serial, Copilot parallel, Claude Code serial
2. **Copilot tests don't set agentType** — default is already `'copilot'`
3. **Claude Code test sets agentType** — `updateGraphOrchestratorSettings(ctx, slug, { agentType: 'claude-code' })`
4. **Prompts are minimal** — task description only, protocol from system prompt
5. **No `--workspace-path` in agent prompts** — CWD handles it
6. **Rename test file** — `real-agent-orchestration.test.ts` (already done in plan validation)

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary adapter | **Copilot** (default) | First-class, `agentType` defaults to `'copilot'` |
| Secondary adapter | Claude Code (opt-in) | Set via `updateGraphOrchestratorSettings` |
| Prompt content | Minimal task description only | System prompt already teaches protocol |
| `--workspace-path` | Not in prompts | Agent cwd = workspace; CLI resolves from CWD |
| Test count | 3: Copilot serial + parallel, Claude serial | Copilot first-class, Claude validates cross-adapter |
| Drive parameters | 1s action, 5s idle, 50 max | Real agents need 10-60s per node |

---

## Open Questions

### Q1: Does CWD-based workspace resolution work from agent subprocess?

**OPEN (validate empirically)**: Test with Copilot first (in-process SDK). If fails, add `--workspace-path` to starter prompt.

### Q2: Does `@github/copilot-sdk` work in the test environment?

**OPEN (validate empirically)**: Check `@github/copilot --version`.

### Q3: How long does Copilot take for a simple "output the word approved" task?

**OPEN (validate empirically)**: Expect 5-15s. Adjust drive parameters if needed.
