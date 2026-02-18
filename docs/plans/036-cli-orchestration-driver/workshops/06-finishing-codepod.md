# Workshop: Finishing CodePod

**Type**: Integration Pattern
**Plan**: 036-cli-orchestration-driver
**Created**: 2026-02-18
**Status**: Draft

**Related Documents**:
- [05-real-integration-testing.md](./05-real-integration-testing.md) — integration test design (depends on this)
- `packages/positional-graph/src/features/030-orchestration/pod.code.ts` — current CodePod
- `packages/positional-graph/src/features/030-orchestration/script-runner.types.ts` — IScriptRunner interface

---

## Purpose

Document exactly what's missing from CodePod and what needs to change so that code work units can actually execute scripts. This unblocks the integration testing strategy where scripts "play the agent role" via CLI commands.

---

## Current State — What's Broken

CodePod has 4 problems:

### Problem 1: Empty script path

```typescript
// pod.code.ts line 27-28
const result = await this.scriptRunner.run({
  script: '',  // ← ALWAYS EMPTY
  cwd: ctx.worktreePath,
  env,
  timeout: 60,
});
```

CodePod doesn't know which script to run. The work unit's `code.script` field (e.g., `scripts/build.sh`) never reaches CodePod.

### Problem 2: No unitSlug on CodePod

AgentPod receives `unitSlug` in its constructor (for prompt template resolution). CodePod does not — it only gets `nodeId` and `scriptRunner`. Without `unitSlug`, CodePod can't resolve the script path from the work unit definition.

### Problem 3: No graph context in script environment

The script receives `INPUT_*` env vars from `buildScriptEnv()`, but NOT:
- `CG_GRAPH_SLUG` — which graph the script is operating on
- `CG_NODE_ID` — which node the script is executing for
- `CG_WORKSPACE_PATH` — the workspace root

Without these, scripts can't call `cg wf node accept $CG_GRAPH_SLUG $CG_NODE_ID`.

### Problem 4: No real IScriptRunner

Only `FakeScriptRunner` exists. No real implementation that spawns a subprocess. Comment on line 29 of `script-runner.types.ts`: "Real implementation deferred — only interface + fake for Phase 4."

---

## What Needs to Change

### Change 1: Pass script path to CodePod

The script path must flow from the work unit definition through ODS to CodePod.

**Current flow** (broken):
```
unit.yaml: code.script = "scripts/build.sh"
    ↓
WorkUnitService.load() → AgenticWorkUnitInstance / CodeUnitInstance
    ↓
ODS.buildPodParams() → { unitType: 'code', unitSlug, runner }  ← script path LOST
    ↓
PodManager.createPod() → new CodePod(nodeId, runner)  ← no script path
    ↓
CodePod.execute() → runner.run({ script: '' })  ← EMPTY
```

**Fixed flow**:
```
unit.yaml: code.script = "scripts/build.sh"
    ↓
ODS needs to resolve script path from work unit
    ↓
PodManager.createPod() → new CodePod(nodeId, runner, scriptPath)
    ↓
CodePod.execute() → runner.run({ script: scriptPath })
```

**Two approaches to get the script path to CodePod:**

#### Approach A: Add scriptPath to PodCreateParams

```typescript
// pod-manager.types.ts
export type PodCreateParams =
  | { readonly unitType: 'agent'; readonly unitSlug: string; readonly agentInstance: IAgentInstance }
  | { readonly unitType: 'code'; readonly unitSlug: string; readonly runner: IScriptRunner; readonly scriptPath: string };
```

Then CodePod stores it:
```typescript
constructor(
  readonly nodeId: string,
  private readonly scriptRunner: IScriptRunner,
  private readonly scriptPath: string
) {}
```

**How ODS gets scriptPath**: ODS already has access to `graphService` and `unitSlug`. It can load the work unit and read `code.script`. But ODS currently doesn't load work units — it only reads orchestration requests.

Actually, ODS doesn't need to load the full work unit. The script path can be resolved from the unit directory:

```typescript
// In ODS, when building code pod params:
const unitDir = path.join(ctx.worktreePath, '.chainglass', 'units', unitSlug);
const unitConfig = await workUnitService.load(ctx, unitSlug);
const scriptPath = path.join(unitDir, unitConfig.unit.code.script);
```

But ODS doesn't have `workUnitService` in its deps today. It would need adding.

#### Approach B: CodePod resolves script path itself

Give CodePod `unitSlug` and `ctx`, let it find the script:

```typescript
constructor(
  readonly nodeId: string,
  private readonly scriptRunner: IScriptRunner,
  private readonly unitSlug: string
) {}

async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
  const scriptPath = await this.resolveScriptPath(options.ctx);
  // ...
  const result = await this.scriptRunner.run({
    script: scriptPath,
    // ...
  });
}

private async resolveScriptPath(ctx: { worktreePath: string }): Promise<string> {
  // Read unit.yaml, get code.script, resolve path
}
```

**Problem**: CodePod would need filesystem access or a work unit service dependency. Pods are meant to be thin wrappers.

#### Recommendation: Approach A

Pass `scriptPath` through `PodCreateParams`. ODS resolves it when creating the pod. CodePod stays thin.

But wait — ODS doesn't have work unit loading capability. Let's look at what ODS already has...

ODS has `deps.graphService` which has `showNode()` → returns `unitSlug`. Then ODS needs `workUnitService.load()` to get the script path. ODS's `ODSDependencies` would need `workUnitService` added.

**Simpler alternative**: Don't load the work unit in ODS. Instead, have ODS pass the unit directory path and let the script runner resolve the script. OR: store the resolved script path in the graph node itself when `addNode()` is called.

**Simplest alternative**: Add `scriptPath` directly to `PodCreateParams` and have ODS resolve it from a new ODS dependency (`IWorkUnitLoader`).

For now, the simplest path that works:

```typescript
// PodCreateParams gains scriptPath
| { readonly unitType: 'code'; readonly unitSlug: string; readonly runner: IScriptRunner; readonly scriptPath: string }

// ODS gains workUnitLoader dep
interface ODSDependencies {
  // ... existing deps ...
  readonly workUnitLoader: IWorkUnitLoader;
}

// ODS.buildPodParams() resolves script path
case 'code': {
  const unit = await this.deps.workUnitLoader.load(ctx, unitSlug);
  const scriptPath = resolve(ctx.worktreePath, '.chainglass', 'units', unitSlug, unit.code.script);
  return { unitType: 'code', unitSlug, runner: this.deps.scriptRunner, scriptPath };
}
```

### Change 2: Add graph context env vars

In `CodePod.execute()`, add orchestration context to the script environment:

```typescript
async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
  const env = {
    ...buildScriptEnv(options.inputs.inputs),
    CG_GRAPH_SLUG: options.graphSlug,
    CG_NODE_ID: this.nodeId,
    CG_WORKSPACE_PATH: options.ctx.worktreePath,
  };

  const result = await this.scriptRunner.run({
    script: this.scriptPath,
    cwd: options.ctx.worktreePath,
    env,
    timeout: 60,
  });
  // ...
}
```

Scripts can then use these:
```bash
#!/bin/bash
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '{"done":true}'
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --message "Script complete"
```

### Change 3: Build real ScriptRunner

A real `IScriptRunner` that spawns a subprocess:

```typescript
// script-runner.ts (new file)
import { spawn } from 'node:child_process';

export class ScriptRunner implements IScriptRunner {
  private childProcess?: ChildProcess;

  async run(options: ScriptRunOptions): Promise<ScriptRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', [options.script], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        timeout: options.timeout * 1000,
      });

      this.childProcess = child;
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data;
        options.onOutput?.(data.toString());
      });

      child.stderr?.on('data', (data) => {
        stderr += data;
      });

      child.on('close', (exitCode) => {
        this.childProcess = undefined;
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr,
          outputs: {},  // Scripts save outputs via CLI, not stdout
        });
      });

      child.on('error', (err) => {
        this.childProcess = undefined;
        reject(err);
      });
    });
  }

  kill(): void {
    this.childProcess?.kill();
  }
}
```

**Key design note**: Scripts save their outputs via `cg wf node save-output-data` (CLI → graphService → disk), NOT via stdout. The `outputs` field in `ScriptRunResult` stays empty — the orchestration settle phase discovers the saved outputs on the next iteration.

### Change 4: Store unitSlug on CodePod (parity with AgentPod)

```typescript
export class CodePod implements IWorkUnitPod {
  readonly unitType = 'code' as const;
  readonly sessionId = undefined;

  constructor(
    readonly nodeId: string,
    private readonly scriptRunner: IScriptRunner,
    private readonly scriptPath: string,
    private readonly unitSlug: string
  ) {}
```

PodManager already receives `unitSlug` in `PodCreateParams` — just needs to pass it through.

---

## Summary of Changes

| # | File | Change | Lines |
|---|------|--------|-------|
| 1 | `pod.code.ts` | Add `scriptPath` + `unitSlug` to constructor. Add `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` to env. Use `this.scriptPath` instead of `''`. | ~10 lines |
| 2 | `pod-manager.types.ts` | Add `scriptPath: string` to code variant of `PodCreateParams` | 1 line |
| 3 | `pod-manager.ts` | Pass `scriptPath` + `unitSlug` to `new CodePod()` | 1 line |
| 4 | `script-runner.types.ts` | No change (interface already correct) | 0 lines |
| 5 | `script-runner.ts` | NEW — real `ScriptRunner` using `child_process.spawn` | ~50 lines |
| 6 | `ods.ts` or `ods.types.ts` | Add `workUnitLoader` dep. Resolve `scriptPath` in `buildPodParams()` for code type. | ~10 lines |
| 7 | `container.ts` | Pass `workUnitLoader` to ODS. Register real `ScriptRunner`. | ~5 lines |
| 8 | `fake-pod-manager.ts` | Update `FakePod` to accept `scriptPath` (or ignore it) | ~2 lines |

**Total**: ~80 lines of real changes + 50-line new ScriptRunner file.

---

## What This Enables

Once these changes land:

```bash
# Create a graph with code work units whose scripts simulate agents
cg wf create test-pipeline

# Add nodes with code units that have agent-simulation scripts
# ...

# Drive it — real loop, real scripts, real CLI commands, real progression
cg wf run test-pipeline
```

The scripts call `cg wf node accept/save-output-data/end` using env vars. The orchestration loop settles the events, builds reality, and progresses the graph. No fakes in the hot path.

---

## Open Questions

### Q1: Should ScriptRunner support Node.js scripts directly?

**OPEN**: The current design uses `bash` as the shell. For `.ts` or `.js` scripts, we'd need `node` or `tsx`. Options:
- A: Always use `bash` — scripts must be bash (or have a shebang)
- B: Detect extension — `.sh` → bash, `.ts` → tsx, `.js` → node
- C: Use shebang detection — `#!/usr/bin/env node`, `#!/bin/bash`

**Recommendation**: Option A for now. Bash scripts can call `npx tsx` or `node` internally. Keep ScriptRunner simple.

### Q2: Should the timeout be configurable per work unit?

**OPEN**: Currently hardcoded to 60 seconds. The work unit's `code` config could have a `timeout` field.

**Recommendation**: Read from work unit config if available, fall back to 60s. But this can be a follow-up — hardcode 60s for now.
