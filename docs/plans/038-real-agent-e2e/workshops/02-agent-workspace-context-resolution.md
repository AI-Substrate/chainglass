# Workshop: Agent Workspace Context Resolution

**Type**: Integration Pattern
**Plan**: 038-real-agent-e2e
**Spec**: [spec-c-real-agent-e2e-tests.md](../../033-real-agent-pods/spec-c-real-agent-e2e-tests.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [01-agent-prompt-flow-and-adapters.md](./01-agent-prompt-flow-and-adapters.md) — what agents see
- [08-spec-c-implementation-wiring.md](../../033-real-agent-pods/workshops/08-spec-c-implementation-wiring.md) — orchestration stack construction

---

## Purpose

Real agent tests fail because the spawned agent can't execute `cg wf node` commands against the test workspace. This workshop identifies three distinct issues found during live testing, proposes fixes, and recommends which to implement now vs. defer.

## Key Questions Addressed

- Why does the agent's `cg wf node get-input-data` fail with E157?
- Does the `--workspace-path` override actually work for unregistered paths?
- What's the minimum fix to get real agents completing graphs in test?

---

## Issue Map

Three distinct issues were discovered during the Copilot serial agent test. They compound but each has an independent fix.

```
Agent spawned by orchestrator
        │
        ▼
┌──────────────────────────────────────────────────┐
│ ISSUE 1: Stale CLI binary                        │
│                                                  │
│ `cg` → /030-positional-orchestrator/dist/cli.cjs │
│ Missing: agentType in GraphOrchestratorSettings   │
│ Error: E157 "Unrecognized key(s): 'agentType'"   │
│                                                  │
│ Fix: `just install` (relinks cg to 033 repo)     │
│ Scope: Cross-cutting (CLI binary)                │
│ Effort: 1 command                                │
└──────────────────────────────────────────────────┘
        │
        ▼ (after fix 1)
┌──────────────────────────────────────────────────┐
│ ISSUE 2: CopilotClient cwd                       │
│                                                  │
│ CopilotClient({ cwd }) must point at workspace   │
│ so the agent's bash tool runs from the right dir │
│                                                  │
│ Test script: pass cwd to CopilotClient           │
│ Production: ODS already passes worktreePath      │
│   to pod.execute → adapter.run({ cwd })          │
│   BUT SdkCopilotAdapter validates cwd, doesn't   │
│   pass it to CopilotClient (client-level cwd)    │
│                                                  │
│ Fix: Test scripts create CopilotClient per-graph │
│ Scope: Test infrastructure only (for now)        │
│ Effort: Small                                    │
└──────────────────────────────────────────────────┘
        │
        ▼ (after fix 2)
┌──────────────────────────────────────────────────┐
│ ISSUE 3: Workspace context for `cg` subprocess   │
│                                                  │
│ withTestGraph registers workspace to disk via     │
│ WorkspaceService.add() → workspaces.json          │
│ Agent's `cg` spawns fresh process, reads registry │
│ Registry HAS the entry. Context resolves.         │
│                                                  │
│ STATUS: NOT actually broken once Issue 1 is fixed │
│ The E157 masked the real problem — schema, not    │
│ workspace resolution.                             │
└──────────────────────────────────────────────────┘
```

---

## Issue 1: Stale CLI Binary (PRIMARY BLOCKER)

### Root Cause

The globally-linked `cg` command points at the wrong repository:

```bash
$ head -20 /home/jak/.local/share/pnpm/cg
# ...
exec node "$basedir/../../../substrate/030-positional-orchestrator/apps/cli/dist/cli.cjs" "$@"
#                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                                    OLD REPO — should be 033-real-agent-pods
```

The old repo's schema (`030-positional-orchestrator`) has an empty `GraphOrchestratorSettingsSchema`:

```typescript
// 030-positional-orchestrator (STALE)
export const GraphOrchestratorSettingsSchema = BaseOrchestratorSettingsSchema
  .extend({})     // ← no agentType
  .strict();      // ← rejects unknown keys
```

The current repo (`033-real-agent-pods`) added `agentType`:

```typescript
// 033-real-agent-pods (CURRENT)
export const GraphOrchestratorSettingsSchema = BaseOrchestratorSettingsSchema
  .extend({
    agentType: z.enum(['claude-code', 'copilot']).default('copilot'),
  })
  .strict();
```

When the in-process service writes `graph.yaml` with `orchestratorSettings.agentType: copilot`, the agent's `cg` reads it with the old schema and rejects `agentType` as unrecognized.

### Fix

```bash
# From 033-real-agent-pods root
just install
# This runs: cd apps/cli && pnpm link --global
# Which re-points the global `cg` shim to 033's dist/cli.cjs
```

After relinking, `cg` uses the current repo's compiled code with `agentType` in the schema. **All E157 errors go away.**

### Verification

```bash
cg wf show <slug> --workspace-path <temp-dir> --json 2>&1 | grep -c "agentType"
# Should return 0 errors (no E157)
```

### Note on Cross-Cutting Scope

The CLI binary is **cross-cutting infrastructure**, not plan-scoped. PlanPak rules don't apply. The `just install` command already handles global linking correctly — the issue was simply that it hadn't been run since switching repos.

---

## Issue 2: CopilotClient Working Directory

### Root Cause

`CopilotClient` is constructed with a `cwd` option that determines where the spawned Copilot CLI process runs. When an agent executes `cg wf node accept copilot-serial spec-writer-646` via its bash tool, that command runs from the CopilotClient's cwd.

In the test script, creating `CopilotClient()` without `cwd` defaults to `process.cwd()` (the project root). The agent's bash commands run from there, and `cg` uses the project root to resolve workspace context — which doesn't match the temp workspace.

### The Two Layers of cwd

```
Layer 1: CopilotClient({ cwd })
  → Where the Copilot CLI process itself runs
  → Determines where agent's bash tool executes commands
  → Must be the workspace root for `cg` to resolve context from CWD

Layer 2: AgentPod.execute({ ctx: { worktreePath } })
  → Passed to adapter.run({ cwd: worktreePath })
  → SdkCopilotAdapter validates but doesn't forward to CopilotClient
  → This is an adapter-level concern, not client-level
```

### Fix for Test Scripts (Option A — Recommended Now)

Create `CopilotClient` inside `withTestGraph` with workspace cwd:

```typescript
await withTestGraph('real-agent-serial', async (tgc) => {
  const client = new CopilotClient({ cwd: tgc.workspacePath });
  //                                 ^^^^^^^^^^^^^^^^^^^^^^^^
  // Agent's bash tool now runs from the temp workspace
  // `cg` resolves context from CWD → finds registered workspace
});
```

This is already proven — the first successful run (spec-writer completed at ~61s) used this approach.

### Fix for Production (Option B — Future)

In production, `AgentManagerService` creates adapters via factory. The factory should accept workspace path:

```typescript
// Future: Wire workspace through adapter factory
const agentManager = new AgentManagerService(
  (workspacePath) => new SdkCopilotAdapter(
    new CopilotClient({ cwd: workspacePath })
  )
);
```

This is a Plan 034 concern (Phase 3: DI container wiring). Not needed for test validation.

### Decision

**Option A for now.** Test scripts create CopilotClient per-graph with workspace cwd. Production wiring is a separate concern.

---

## Issue 3: Workspace Registry (NOT BROKEN)

### Analysis

Initial hypothesis: temp workspace isn't in the registry, so `cg` can't resolve context.

**Disproved.** `withTestGraph` already persists workspace registrations to `~/.config/chainglass/workspaces.json`:

```typescript
// graph-test-runner.ts line 187
await workspaceService.add(workspaceSlug, tmpDir);
// Persists to ~/.config/chainglass/workspaces.json
// Agent's `cg` reads the same file → finds the workspace
```

Verified empirically:
```bash
$ cg workspace list | grep tg-real-agent
tg-real-agent-serial-1771630552116  tg-real-agent-serial  /tmp/tg-real-agent-serial-jE5WOy
```

The E157 errors were caused by Issue 1 (stale schema rejecting `agentType`), not by missing workspace context. Once the CLI binary is relinked, workspace resolution works correctly.

### Stale Registry Entries

One minor issue: 34 workspace entries have accumulated because cleanup in `withTestGraph`'s `finally` block sometimes doesn't execute (process killed, test timeout). The temp dirs are deleted but registry entries remain as orphans pointing to non-existent paths.

This is cosmetic — `resolveContext` checks `isPathInWorkspace(path, ws.path)` which does a prefix match. Orphan entries for deleted dirs never match. But it clutters the registry.

**Future cleanup**: Add a `cg workspace prune` command that removes entries for non-existent paths. Not blocking.

---

## Option 2 Analysis: Synthetic WorkspaceContext (DEFERRED)

The user considered adding a `--workspace-path-override` mode that synthesizes a `WorkspaceContext` from a bare path without hitting the registry.

### How It Would Work

```typescript
// In command-helpers.ts
export async function resolveOrOverrideContext(
  overridePath?: string
): Promise<WorkspaceContext | null> {
  const container = createCliProductionContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const path = overridePath ?? process.cwd();
  
  // Try registry first
  const ctx = await workspaceService.resolveContext(path);
  if (ctx) return ctx;
  
  // NEW: If --workspace-path was explicit and registry miss, synthesize
  if (overridePath) {
    return {
      workspaceSlug: sanitizeSlug(basename(overridePath)),
      workspaceName: basename(overridePath),
      workspacePath: overridePath,
      worktreePath: overridePath,
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: await exists(join(overridePath, '.git')),
    };
  }
  
  return null;
}
```

### Why It's Not Needed Now

1. **`withTestGraph` already registers the workspace.** The CLI finds it.
2. **Issue 1 (stale binary) was the real blocker.** Once fixed, everything works.
3. **Synthetic context has risks**: no slug uniqueness guarantee, no workspace-level settings, could mask real configuration errors.

### When It Would Be Needed

- If tests move to isolated containers where the registry file isn't shared
- If agents need to operate on paths that genuinely aren't registered
- If we want `cg` to work without any workspace setup (zero-config mode)

**Decision: Defer.** Not needed for the current test scenario. Revisit if the workspace model changes.

---

## Recommended Fix Sequence

### Step 1: Relink CLI (Issue 1)

```bash
cd /home/jak/substrate/033-real-agent-pods
pnpm build && cd apps/cli && pnpm link --global
# Or: just install
```

Verify:
```bash
cg --version  # Should still work
head -20 $(which cg)  # Should reference 033-real-agent-pods
```

### Step 2: Update Test Script (Issue 2)

Create `CopilotClient` with workspace cwd inside `withTestGraph`:

```typescript
const client = new CopilotClient({ cwd: tgc.workspacePath });
```

Already implemented in `scripts/test-copilot-serial.ts`.

### Step 3: Rerun Test

```bash
npx tsx scripts/test-copilot-serial.ts
```

Expected: spec-writer completes (~60s), reviewer completes (~60s), all assertions pass.

### Step 4: Clean Up Stale Registry

```bash
# One-time cleanup of orphan entries
cat ~/.config/chainglass/workspaces.json | python3 -c "
import json, sys, os
d = json.load(sys.stdin)
before = len(d['workspaces'])
d['workspaces'] = [w for w in d['workspaces'] if os.path.isdir(w['path'])]
after = len(d['workspaces'])
json.dump(d, sys.stdout, indent=2)
print(f'\nRemoved {before - after} orphan entries', file=sys.stderr)
" > /tmp/ws-clean.json && mv /tmp/ws-clean.json ~/.config/chainglass/workspaces.json
```

---

## Open Questions

### Q1: Should SdkCopilotAdapter forward cwd to CopilotClient?

**OPEN**: Currently the adapter validates cwd but the CopilotClient is pre-constructed. In production, each agent node could need a different cwd. Options:
- A) One CopilotClient per agent run (current test approach)
- B) Adapter creates CopilotClient lazily with the provided cwd
- C) Leave as-is; `cg --workspace-path` handles it from within the agent's commands

Likely answer: C for now, B when we tackle Plan 034 Phase 3 (DI wiring).

### Q2: Should the starter prompt include `--workspace-path`?

**RESOLVED: No.** The agent's bash tool inherits cwd from CopilotClient. The `cg` CLI resolves context from CWD. No explicit `--workspace-path` flag needed in the prompt template — it would add noise and couple the protocol to the adapter implementation.

### Q3: Should ClaudeCodeAdapter also handle cwd?

**RESOLVED: Yes, and it already does.** `ClaudeCodeAdapter._buildArgs()` doesn't include `--workspace-path`, but `processManager.spawn({ cwd: validatedCwd })` sets the working directory for the `claude` subprocess. Claude Code's bash tool then inherits that cwd.
