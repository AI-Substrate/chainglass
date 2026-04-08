# Workshop: Harness Test-Data CLI

**Type**: CLI Flow
**Plan**: 074-workflow-execution
**Spec**: (pre-spec — this workshop informs the spec)
**Created**: 2026-03-13
**Status**: Draft

**Related Documents**:
- [Workshop 001: Execution Wiring](001-execution-wiring-architecture.md)
- [Workshop 002: Central Orchestration Host](002-central-orchestration-host.md)
- [Research Dossier](../research-dossier.md)

**Domain Context**:
- **Primary Domain**: Harness (dev tooling, outside domain system)
- **Related Domains**: `_platform/positional-graph` (workflow engine, templates, units)

---

## Purpose

Design a comprehensive `harness test-data` CLI command group that creates, resets, and manages test workflow environments — work units, templates, and workflow instances — by dogfooding the `cg` CLI. This replaces the ad-hoc `scripts/dope-workflows.ts` with a proper, reusable, harness-integrated tool that agents and developers can rely on for deterministic test setups.

## Key Questions Addressed

- What commands does the harness need for complete test-data lifecycle?
- How do we dogfood `cg` CLI commands (and which ones)?
- How does local vs container execution work?
- How do we make every `cg` invocation visible to agents watching output?
- What are the hardcoded test data names and shapes?
- How does "create again = reset" work?

---

## The Core Idea

One command group — `harness test-data` — that manages everything needed to test workflows. Hardcoded names. Idempotent. Always uses the local `cg` CLI (never the global install). Can target local filesystem or the harness Docker container.

```
harness test-data create units          # Create/reset 3 test work units
harness test-data create template       # Create/reset test workflow template
harness test-data create workflow       # Instantiate workflow from template
harness test-data create env            # All of the above (single entry point)
harness test-data clean [scope]         # Delete test data
harness test-data status                # Show what exists
harness test-data run                   # Run the test workflow via cg wf run
harness test-data stop                  # Stop the running workflow
```

Every command that runs a `cg` subcommand prints it first:

```
$ harness test-data create env

  ▸ cg wf delete test-workflow --workspace-path /path/to/workspace
  ▸ cg unit create test-agent --type agent --workspace-path /path/to/workspace
  ▸ cg unit create test-code --type code --workspace-path /path/to/workspace
  ▸ cg unit create test-user-input --type user-input --workspace-path /path/to/workspace
  ▸ cg template save-from test-template-source --as test-workflow-tpl --workspace-path /path/to/workspace
  ▸ cg template instantiate test-workflow-tpl --id test-workflow --workspace-path /path/to/workspace

{"command":"test-data","status":"ok","timestamp":"...","data":{...}}
```

---

## Critical: Local CLI Invocation

**Never use the global `cg` command.** In a multi-worktree setup, the global `cg` binary may point to a completely different repo's build. All harness test-data commands invoke the CLI via the local Node.js artifact:

```typescript
// LOCAL execution
const CG_LOCAL = path.resolve(REPO_ROOT, 'apps/cli/dist/cli.cjs');
// → node /Users/me/substrate/worktree-a/apps/cli/dist/cli.cjs wf create test-workflow

// CONTAINER execution
const CG_CONTAINER = '/app/apps/cli/dist/cli.cjs';
// → docker exec chainglass-wt node /app/apps/cli/dist/cli.cjs wf create test-workflow
```

This is enforced in the `runCg()` helper (see below).

---

## Command Summary

| Command | Purpose | Idempotent? |
|---------|---------|-------------|
| `test-data create units` | Create 3 test work units (agent, code, user-input) | Yes — deletes first |
| `test-data create template` | Create test workflow template from a source graph | Yes — deletes first |
| `test-data create workflow` | Instantiate a workflow from the template | Yes — deletes first |
| `test-data create env` | All of the above in order | Yes |
| `test-data clean [units\|template\|workflow\|all]` | Delete test data by scope | Yes |
| `test-data status` | Show what test data exists | Read-only |
| `test-data run` | Run the test workflow (`cg wf run`) | No |
| `test-data stop` | Stop the running workflow | No |

All commands accept:
- `--target local|container` (default: `local`)
- Output: `HarnessEnvelope` JSON (same as all harness commands)

---

## The runCg() Helper

The central helper that every test-data command uses. It:
1. Prints the command being run (so agents can see it)
2. Routes to local or container execution
3. Returns structured result

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { computePorts } from '../../ports/allocator.js';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const CG_LOCAL = path.resolve(REPO_ROOT, 'apps/cli/dist/cli.cjs');
const CG_CONTAINER = '/app/apps/cli/dist/cli.cjs';

export interface CgExecOptions {
  target: 'local' | 'container';
  workspacePath: string;
}

export interface CgExecResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a cg CLI command, printing it for agent visibility.
 *
 * Always uses the local built CLI artifact — never the global `cg` binary.
 * In multi-worktree setups, the global `cg` may point to a different repo.
 */
export async function runCg(
  args: string[],
  options: CgExecOptions
): Promise<CgExecResult> {
  const fullArgs = [...args, '--workspace-path', options.workspacePath, '--json'];
  const displayCmd = `cg ${fullArgs.join(' ')}`;

  // Print for agent visibility
  process.stderr.write(`  ▸ ${displayCmd}\n`);

  try {
    if (options.target === 'container') {
      const ports = computePorts();
      const containerName = `chainglass-${ports.worktree}`;
      const { stdout, stderr } = await execFileAsync('docker', [
        'exec', containerName,
        'node', CG_CONTAINER, ...fullArgs,
      ], { timeout: 30_000 });
      return { command: displayCmd, stdout, stderr, exitCode: 0 };
    } else {
      const { stdout, stderr } = await execFileAsync('node', [
        CG_LOCAL, ...fullArgs,
      ], { timeout: 30_000 });
      return { command: displayCmd, stdout, stderr, exitCode: 0 };
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      command: displayCmd,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}
```

**Why `--json`?** All `cg` commands support `--json` output. The harness parses the JSON response to verify success and extract IDs (nodeId, lineId, etc.) for wiring.

**Why stderr for the `▸` prefix?** The harness envelope goes to stdout. Diagnostic/progress output goes to stderr so it doesn't corrupt the JSON envelope. Agents see both streams.

---

## Hardcoded Test Data

### Test Work Units

Three units covering all three types. Hardcoded names, hardcoded definitions.

| Slug | Type | Description | Inputs | Outputs |
|------|------|-------------|--------|---------|
| `test-agent` | agent | Test agent unit for harness validation | `spec` (text, required) | `result` (text), `summary` (text) |
| `test-code` | code | Test code unit — echoes input to output | `input_data` (text, required) | `output_data` (text) |
| `test-user-input` | user-input | Test user-input — asks for spec | — | `spec` (text) |

### Test Workflow Template

Created by:
1. Building a source graph imperatively via `cg wf` commands
2. Saving as template via `cg template save-from`
3. Deleting the source graph

**Template slug**: `test-workflow-tpl`

**Topology**:
```
Line 0: [test-user-input]              ← User provides spec
Line 1: [test-agent]                   ← Agent processes spec (serial)
Line 2: [test-code] [test-agent-2]     ← Code + agent in parallel
```

Line 0 → Line 1: `test-agent.spec` ← `test-user-input.spec`
Line 1 → Line 2: `test-code.input_data` ← `test-agent.result`

### Test Workflow Instance

**Instance slug**: `test-workflow`
Created from template `test-workflow-tpl` via `cg template instantiate`.

---

## Command Details

### `harness test-data create units`

```
$ harness test-data create units

  ▸ cg unit create test-agent --type agent --workspace-path /path
  ▸ cg unit create test-code --type code --workspace-path /path
  ▸ cg unit create test-user-input --type user-input --workspace-path /path

{"command":"test-data create units","status":"ok","timestamp":"...","data":{
  "units": ["test-agent", "test-code", "test-user-input"],
  "created": 3,
  "message": "Test work units created"
}}
```

**Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Clean existing test units                           │
│   • Delete .chainglass/units/test-agent/ if exists           │
│   • Delete .chainglass/units/test-code/ if exists            │
│   • Delete .chainglass/units/test-user-input/ if exists      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Create units via cg CLI                             │
│   • cg unit create test-agent --type agent                   │
│   • cg unit create test-code --type code                     │
│   • cg unit create test-user-input --type user-input         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Hydrate unit definitions                            │
│   • Write unit.yaml files with inputs/outputs/config         │
│   • Agent: add prompt template, supported_agents             │
│   • Code: add script, timeout                                │
│   • User-input: add question_type, prompt                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Verify                                              │
│   • cg unit validate test-agent                              │
│   • cg unit validate test-code                               │
│   • cg unit validate test-user-input                         │
└─────────────────────────────────────────────────────────────┘
```

**Hydration detail** — After `cg unit create` scaffolds the unit directory, the harness writes the full `unit.yaml` with hardcoded definitions. This is the one place where we write files directly (not via `cg`), because `cg unit create` only scaffolds — it doesn't set inputs/outputs.

Alternatively, if `cg unit` gains an `update` subcommand, use that instead to stay fully dogfooded.

### `harness test-data create template`

```
$ harness test-data create template

  ▸ cg wf create test-template-source --workspace-path /path
  ▸ cg wf line add test-template-source --workspace-path /path
  ▸ cg wf line add test-template-source --workspace-path /path
  ▸ cg wf node add test-template-source line-xxx test-user-input --workspace-path /path
  ▸ cg wf node add test-template-source line-yyy test-agent --workspace-path /path
  ▸ cg wf node set-input test-template-source node-bbb spec ... --workspace-path /path
  ▸ cg wf node add test-template-source line-zzz test-code --workspace-path /path
  ▸ cg wf node add test-template-source line-zzz test-agent --workspace-path /path
  ▸ cg template save-from test-template-source --as test-workflow-tpl --workspace-path /path
  ▸ cg wf delete test-template-source --workspace-path /path

{"command":"test-data create template","status":"ok","timestamp":"...","data":{
  "template": "test-workflow-tpl",
  "lines": 3,
  "nodes": 4,
  "message": "Test workflow template created"
}}
```

**Flow**:
```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Clean existing                                      │
│   • Delete template test-workflow-tpl if exists              │
│   • Delete source graph test-template-source if exists       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Build source graph imperatively                     │
│   • cg wf create test-template-source                        │
│   • cg wf line add (x2 for 3 total lines)                    │
│   • cg wf node add (4 nodes across 3 lines)                  │
│   • cg wf node set-input (wire node connections)             │
│   • Parse JSON responses to extract lineId, nodeId           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Save as template                                    │
│   • cg template save-from test-template-source               │
│       --as test-workflow-tpl                                  │
│   This snapshots the graph + units into                      │
│   .chainglass/templates/workflows/test-workflow-tpl/         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Clean up source graph                               │
│   • cg wf delete test-template-source                        │
│   Template is independent — source graph no longer needed    │
└─────────────────────────────────────────────────────────────┘
```

**Why dogfood templates?** This is explicitly what the user wants — every test run exercises the template save/instantiate path. Template bugs surface immediately.

### `harness test-data create workflow`

```
$ harness test-data create workflow

  ▸ cg wf delete test-workflow --workspace-path /path
  ▸ cg template instantiate test-workflow-tpl --id test-workflow --workspace-path /path

{"command":"test-data create workflow","status":"ok","timestamp":"...","data":{
  "workflow": "test-workflow",
  "template": "test-workflow-tpl",
  "message": "Test workflow instantiated from template"
}}
```

**Prerequisite**: Template must exist. If it doesn't, returns error envelope with message: "Run `harness test-data create template` first, or use `harness test-data create env` for full setup."

### `harness test-data create env` — The Aggregate

```
$ harness test-data create env

  ═══════════════════════════════════════════════════════
  Harness Test Environment Setup
  ═══════════════════════════════════════════════════════

  [1/3] Creating test work units...
  ▸ cg unit create test-agent --type agent --workspace-path /path
  ▸ cg unit create test-code --type code --workspace-path /path
  ▸ cg unit create test-user-input --type user-input --workspace-path /path
  ✓ 3 work units created

  [2/3] Creating test workflow template...
  ▸ cg wf create test-template-source --workspace-path /path
  ▸ cg wf line add test-template-source --workspace-path /path
  ▸ cg wf line add test-template-source --workspace-path /path
  ▸ cg wf node add test-template-source line-e74 test-user-input --workspace-path /path
  ▸ cg wf node add test-template-source line-0d8 test-agent --workspace-path /path
  ▸ cg wf node set-input test-template-source node-a1b spec ...
  ▸ cg wf node add test-template-source line-f32 test-code --workspace-path /path
  ▸ cg wf node add test-template-source line-f32 test-agent --workspace-path /path
  ▸ cg template save-from test-template-source --as test-workflow-tpl --workspace-path /path
  ▸ cg wf delete test-template-source --workspace-path /path
  ✓ Template test-workflow-tpl created (3 lines, 4 nodes)

  [3/3] Instantiating test workflow...
  ▸ cg template instantiate test-workflow-tpl --id test-workflow --workspace-path /path
  ✓ Workflow test-workflow instantiated

  ═══════════════════════════════════════════════════════
  ✓ Test environment ready
  ═══════════════════════════════════════════════════════

{"command":"test-data create env","status":"ok","timestamp":"...","data":{
  "units": ["test-agent","test-code","test-user-input"],
  "template": "test-workflow-tpl",
  "workflow": "test-workflow",
  "message": "Test environment fully set up"
}}
```

**This is the single entry point for agents.** Run it, get a fully deterministic workflow environment. Run it again, get a fresh reset.

### `harness test-data clean [scope]`

```
$ harness test-data clean all          # Everything
$ harness test-data clean units        # Just units
$ harness test-data clean template     # Just template
$ harness test-data clean workflow     # Just workflow instance
$ harness test-data clean              # Defaults to 'all'
```

**Clean strategy**: Delete via `cg` commands (dogfooding) where possible, fallback to filesystem deletion for items `cg` can't delete.

```
  ▸ cg wf delete test-workflow --workspace-path /path
  ▸ cg wf delete test-template-source --workspace-path /path
  (template: rm -rf .chainglass/templates/workflows/test-workflow-tpl/)
  (units: rm -rf .chainglass/units/test-agent/ test-code/ test-user-input/)
```

### `harness test-data status`

```
$ harness test-data status

{"command":"test-data status","status":"ok","timestamp":"...","data":{
  "units": {
    "test-agent": { "exists": true, "type": "agent", "valid": true },
    "test-code": { "exists": true, "type": "code", "valid": true },
    "test-user-input": { "exists": false }
  },
  "template": {
    "test-workflow-tpl": { "exists": true, "lines": 3, "nodes": 4 }
  },
  "workflow": {
    "test-workflow": { "exists": true, "status": "pending", "nodes": 4 }
  }
}}
```

Uses `cg unit info`, `cg template show`, `cg wf status` to query state.

### `harness test-data run`

```
$ harness test-data run

  ▸ cg wf run test-workflow --workspace-path /path --max-iterations 50

{"command":"test-data run","status":"ok","timestamp":"...","data":{
  "workflow": "test-workflow",
  "message": "Workflow execution started"
}}
```

Runs `cg wf run` which drives the orchestration loop. This is a long-running command — it blocks until the workflow completes, hits max iterations, or is stopped.

### `harness test-data stop`

```
$ harness test-data stop

  (sends SIGTERM to running cg wf run process)

{"command":"test-data stop","status":"ok","timestamp":"...","data":{
  "workflow": "test-workflow",
  "message": "Workflow execution stopped"
}}
```

**Note**: Once Plan 074 adds AbortSignal support to `drive()`, the `cg wf run` command will support graceful stop. For now, SIGTERM is the mechanism.

---

## Local vs Container Execution

All commands accept `--target local|container` (default: `local`).

```
$ harness test-data create env --target local       # Runs on host filesystem
$ harness test-data create env --target container    # Runs inside Docker container
```

### How it works

| Target | Workspace Path | CLI Invocation | File Access |
|--------|---------------|----------------|-------------|
| `local` | `scratch/harness-test-workspace/` (host) | `node apps/cli/dist/cli.cjs` | Direct filesystem |
| `container` | `/app/scratch/harness-test-workspace/` (container) | `docker exec chainglass-<wt> node /app/apps/cli/dist/cli.cjs` | Via `docker exec` |

### Workspace resolution

```typescript
function resolveWorkspacePath(target: 'local' | 'container'): string {
  if (target === 'container') {
    return '/app/scratch/harness-test-workspace';
  }
  return path.resolve(REPO_ROOT, 'scratch/harness-test-workspace');
}
```

**Prerequisite for container**: The workspace must be seeded first (`harness seed`). The `create env` command checks this and provides a helpful error:

```
{"command":"test-data","status":"error","timestamp":"...","error":{
  "code":"E108",
  "message":"Workspace not seeded. Run 'harness seed' first to create the test workspace."
}}
```

### Container name

Same as existing harness pattern: `chainglass-${ports.worktree}` (deterministic from worktree name).

---

## File Structure

```
harness/src/
├── cli/
│   ├── commands/
│   │   ├── test-data.ts          ← Command registration (Commander.js)
│   │   └── ... (existing commands)
│   └── index.ts                  ← Add registerTestDataCommand
├── test-data/
│   ├── cg-runner.ts              ← runCg() helper
│   ├── unit-definitions.ts       ← Hardcoded unit YAML definitions
│   ├── template-builder.ts       ← Build source graph + save as template
│   ├── environment.ts            ← Aggregate create/clean/status
│   └── constants.ts              ← Hardcoded slugs and names
└── ...
```

### constants.ts

```typescript
export const TEST_DATA = {
  units: {
    agent: 'test-agent',
    code: 'test-code',
    userInput: 'test-user-input',
  },
  template: 'test-workflow-tpl',
  templateSource: 'test-template-source',
  workflow: 'test-workflow',
} as const;

export type TestDataScope = 'units' | 'template' | 'workflow' | 'all';
```

---

## Unit Definitions (Hardcoded YAML)

### test-agent (unit.yaml)

```yaml
slug: test-agent
type: agent
version: 1.0.0
description: Test agent unit for harness workflow validation

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: Specification to implement

outputs:
  - name: result
    type: data
    data_type: text
    required: true
    description: Implementation result
  - name: summary
    type: data
    data_type: text
    required: false
    description: Brief summary of work done

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
```

### test-code (unit.yaml)

```yaml
slug: test-code
type: code
version: 1.0.0
description: Test code unit — echoes input to output for validation

inputs:
  - name: input_data
    type: data
    data_type: text
    required: true
    description: Data to process

outputs:
  - name: output_data
    type: data
    data_type: text
    required: true
    description: Processed output

code:
  script: scripts/echo.sh
  timeout: 30
```

With `scripts/echo.sh`:
```bash
#!/bin/bash
# Test code unit — reads input, writes to output
echo "Processed: $(cat "$INPUT_input_data")" > "$OUTPUT_output_data"
```

### test-user-input (unit.yaml)

```yaml
slug: test-user-input
type: user-input
version: 1.0.0
description: Test user-input unit — collects spec from user

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: User-provided specification

user_input:
  question_type: text
  prompt: "Describe what you want the test workflow to produce:"
```

---

## Template Graph Topology

```
Line 0 (Input):
  ┌──────────────────┐
  │ test-user-input   │  ← User provides spec
  └────────┬─────────┘
           │ spec
           ▼
Line 1 (Process):
  ┌──────────────────┐
  │ test-agent        │  ← Agent implements spec
  │ input: spec ← L0  │     (serial, inherits context)
  └────────┬─────────┘
           │ result
           ▼
Line 2 (Parallel):
  ┌──────────────────┐  ┌──────────────────┐
  │ test-code         │  │ test-agent (2nd)  │  ← Both run in parallel
  │ input: input_data │  │ input: spec       │     noContext: true
  │  ← L1.result      │  │  ← L0.spec       │
  └──────────────────┘  └──────────────────┘
```

**Why this topology?**
- **Line 0**: User-input entry point (tests user-input node type)
- **Line 1**: Serial agent with input wiring (tests input resolution + agent pods)
- **Line 2**: Parallel execution with two node types (tests parallel dispatch + code pods)
- **Cross-line wiring**: Tests the input resolution across lines

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| `E108` | Invalid arguments | Missing or invalid scope/target |
| `E108` | Workspace not seeded | `--target container` but workspace not seeded |
| `E108` | Template not found | `create workflow` before `create template` |
| `E101` | Container not running | `--target container` but Docker container is down |
| `E100` | CG command failed | A `cg` subcommand returned non-zero exit |

---

## Commander.js Registration

```typescript
// harness/src/cli/commands/test-data.ts

import type { Command } from 'commander';
import { exitWithEnvelope, formatError, formatSuccess, ErrorCodes } from '../output.js';
import {
  createUnits,
  createTemplate,
  createWorkflow,
  createEnvironment,
  cleanTestData,
  getTestDataStatus,
  runTestWorkflow,
  stopTestWorkflow,
} from '../../test-data/environment.js';
import type { TestDataScope } from '../../test-data/constants.js';

export function registerTestDataCommand(program: Command): void {
  const testData = program
    .command('test-data')
    .description(
      'Create, reset, and manage test workflow environments.\n\n' +
      'Provides deterministic test data for workflow validation by dogfooding\n' +
      'the cg CLI. All names are hardcoded. Running create again resets to scratch.\n\n' +
      'Examples:\n' +
      '  harness test-data create env           # Full environment setup\n' +
      '  harness test-data create units         # Just work units\n' +
      '  harness test-data status               # What exists?\n' +
      '  harness test-data clean                # Delete everything\n' +
      '  harness test-data run                  # Run the test workflow\n' +
      '  harness test-data create env --target container  # In Docker\n\n' +
      'Every cg command invoked is printed to stderr for agent visibility.'
    );

  const create = testData
    .command('create')
    .description('Create or reset test data (idempotent — deletes and recreates)');

  create
    .command('units')
    .description('Create/reset test work units: test-agent, test-code, test-user-input')
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await createUnits(options.target);
        exitWithEnvelope(formatSuccess('test-data create units', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data create units', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  create
    .command('template')
    .description('Create/reset test workflow template: test-workflow-tpl')
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await createTemplate(options.target);
        exitWithEnvelope(formatSuccess('test-data create template', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data create template', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  create
    .command('workflow')
    .description('Instantiate test workflow from template: test-workflow')
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await createWorkflow(options.target);
        exitWithEnvelope(formatSuccess('test-data create workflow', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data create workflow', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  create
    .command('env')
    .description(
      'Full environment setup — units + template + workflow instance.\n' +
      'This is the single entry point for agents. Run it to get a fully\n' +
      'deterministic workflow environment. Run it again to reset.'
    )
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await createEnvironment(options.target);
        exitWithEnvelope(formatSuccess('test-data create env', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data create env', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  testData
    .command('clean [scope]')
    .description('Delete test data. Scope: units, template, workflow, all (default: all)')
    .option('--target <target>', 'local or container', 'local')
    .action(async (scope: string | undefined, options) => {
      try {
        const result = await cleanTestData(
          (scope ?? 'all') as TestDataScope,
          options.target
        );
        exitWithEnvelope(formatSuccess('test-data clean', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data clean', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  testData
    .command('status')
    .description('Show what test data exists')
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await getTestDataStatus(options.target);
        exitWithEnvelope(formatSuccess('test-data status', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data status', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  testData
    .command('run')
    .description('Run the test workflow (cg wf run test-workflow)')
    .option('--target <target>', 'local or container', 'local')
    .option('--max-iterations <n>', 'Maximum drive iterations', '50')
    .action(async (options) => {
      try {
        const result = await runTestWorkflow(options.target, options.maxIterations);
        exitWithEnvelope(formatSuccess('test-data run', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data run', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });

  testData
    .command('stop')
    .description('Stop the running test workflow')
    .option('--target <target>', 'local or container', 'local')
    .action(async (options) => {
      try {
        const result = await stopTestWorkflow(options.target);
        exitWithEnvelope(formatSuccess('test-data stop', result));
      } catch (err: unknown) {
        exitWithEnvelope(
          formatError('test-data stop', ErrorCodes.UNKNOWN,
            (err as Error).message)
        );
      }
    });
}
```

---

## Justfile Integration

```makefile
# Test data management (via harness CLI)
test-data *ARGS:
    just harness test-data {{ARGS}}
```

Usage:
```bash
just test-data create env                    # Full setup (local)
just test-data create env --target container  # Full setup (container)
just test-data status                        # What exists?
just test-data clean                         # Delete all
just test-data run                           # Run the workflow
```

---

## Agent Retrospective Integration

Per harness philosophy — every harness command is an opportunity for agent feedback. The `create env` envelope includes a `feedback` field that agents can populate:

```json
{
  "command": "test-data create env",
  "status": "ok",
  "data": {
    "units": ["test-agent", "test-code", "test-user-input"],
    "template": "test-workflow-tpl",
    "workflow": "test-workflow",
    "message": "Test environment fully set up",
    "feedback_prompt": "Was this test environment useful? What would make it better? Report in your retrospective's magicWand field."
  }
}
```

The harness README and CLAUDE.md should reinforce: **"After using harness test-data, always comment in your retrospective on what worked, what didn't, and what your magic wand would be."**

---

## Open Questions

### Q1: Should `cg unit` get an `update` subcommand?

**OPEN — leaning toward direct file write for MVP**:
- Currently `cg unit create` only scaffolds — doesn't set inputs/outputs
- The harness writes `unit.yaml` directly after scaffold to hydrate definitions
- A `cg unit update` command would be more dogfoody but is a separate scope
- **MVP**: Direct file write for hydration. **Future**: Add `cg unit update` and switch to it.

### Q2: How does clean handle "cg can't delete templates"?

**RESOLVED**: The `cg` CLI doesn't have a `template delete` command. Clean deletes the template directory directly from the filesystem (`rm -rf .chainglass/templates/workflows/test-workflow-tpl/`). For container target, uses `docker exec ... rm -rf`. This is acceptable — the harness is dev tooling, not a production API consumer.

### Q3: Should there be a `harness test-data watch` command?

**DEFERRED**: A watch mode that recreates the environment on file changes would be useful for rapid iteration but is out of scope for Plan 074. Add it as a harness improvement if agents request it via retrospectives.

### Q4: Should agents be able to create multiple different environments?

**RESOLVED**: No. One environment, hardcoded names, deterministic. If we need different topologies later, add new commands like `create env-2`. But for Plan 074, one is enough. The point is reliability and repeatability, not flexibility.

---

## Quick Reference

```bash
# Full setup (the command agents should use)
just test-data create env

# Individual pieces
just test-data create units
just test-data create template
just test-data create workflow

# In container
just test-data create env --target container

# Check what exists
just test-data status

# Reset everything
just test-data clean
just test-data create env    # or just run create env — it cleans first

# Run the workflow
just test-data run
just test-data stop

# Detailed help
just harness test-data --help
just harness test-data create --help
just harness test-data create env --help
```
