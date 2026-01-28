# Agent E2E Test Run - 2026-01-28

**Test:** `docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent`
**Result:** PASSED (after 8 bug fixes)
**Date:** 2026-01-28 05:47-05:48 UTC
**Plan:** 017 - Manual Validation of Agent Graph Execution

## Issues Encountered & Resolved

This test run required fixing 8 issues before achieving a successful pass:

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | `--with-agent` mode stubbed | Not implemented | Implemented real agent execution with streaming |
| 2 | Can't clean up graphs | `wg delete` missing | Manual directory removal in cleanup |
| 3 | `questionId` not in status | Missing from interface | Added to `NodeStatusEntry` |
| 4 | Agent doesn't resume | No session tracking | Implemented `runAgentWithQuestionLoop()` |
| 5 | `cg` command not found | Not globally installed | Use `node apps/cli/dist/cli.cjs` |
| 6 | Agent doesn't stop after ask | No instruction | Added `[AGENT INSTRUCTION] STOP HERE` |
| 7 | `get-answer` command missing | Never implemented | Full implementation added |
| 8 | Answer not in output | Wrong formatter | Output raw value directly |

See full details in: `docs/plans/016-agent-units/tasks/phase-3-workgraph-core/execution.log.md`

## Test Configuration

- Mode: Real agents (Claude Code CLI with `--stream` flag)
- Graph: `sample-e2e`
- Nodes: sample-input → sample-coder → sample-tester

## Execution Log

### Node: sample-coder-721 (Code Generator)

#### First Invocation
| Step | Action | Result |
|------|--------|--------|
| 1 | `wg node get-input-data sample-e2e sample-coder-721 spec` | `"Write a function add(a, b) that returns the sum of two numbers"` |
| 2 | `wg node ask ... --options "typescript" "javascript" "python" "bash"` | Question ID: `q-1769579264244-aq9gyc` |
| 3 | Agent saw `[AGENT INSTRUCTION] STOP HERE` | Exited cleanly with code 0 |

**Session ID:** `ffb158c9-ae29-4495-995f-05fd08899558`

#### Orchestrator Answer
- Question: `q-1769579264244-aq9gyc`
- Answer: `bash`

#### Second Invocation (Resumed)
| Step | Action | Result |
|------|--------|--------|
| 1 | `wg node get-answer sample-e2e sample-coder-721 q-1769579264244-aq9gyc` | `bash` |
| 2 | Write `script.sh` | Created bash script with `add()` function |
| 3 | `wg node save-output-data ... language "bash"` | ✓ Saved |
| 4 | `wg node save-output-file ... script ./script.sh` | ✓ Saved to outputs/ |
| 5 | `wg node end sample-e2e sample-coder-721` | Status: complete |

**Session ID:** `a87f5150-3463-4e5c-8017-a728bea48891`

**Generated Script:**
```bash
#!/bin/bash

# Function that returns the sum of two numbers
add() {
    local a=$1
    local b=$2
    echo $((a + b))
}

# Example usage
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    result=$(add 3 5)
    echo "add(3, 5) = $result"
fi
```

### Node: sample-tester-97d (Script Tester)

#### Single Invocation
| Step | Action | Result |
|------|--------|--------|
| 1 | `wg node get-input-data ... language` | `"bash"` (from sample-coder-721) |
| 2 | `wg node get-input-file ... script` | Path to script.sh |
| 3 | `bash <script-path>` | `add(3, 5) = 8`, exit code 0 |
| 4 | `wg node save-output-data ... success true` | ✓ Saved |
| 5 | `wg node save-output-data ... output "add(3, 5) = 8"` | ✓ Saved |
| 6 | `wg node end sample-e2e sample-tester-97d` | Status: complete |

**Session ID:** `afe9191b-2df0-49a9-b921-c2b3a5b7f7fc`

## Final State

| Node | Status | Outputs |
|------|--------|---------|
| sample-input-a0d | complete | spec: "Write a function add(a, b)..." |
| sample-coder-721 | complete | language: "bash", script: script.sh |
| sample-tester-97d | complete | success: true, output: "add(3, 5) = 8" |

## Token Usage

| Node | Session | Tokens Used |
|------|---------|-------------|
| sample-coder (1st) | ffb158c9... | 93,647 |
| sample-coder (2nd) | a87f5150... | 160,389 |
| sample-tester | afe9191b... | 157,643 |

## Key Fixes Validated

1. **`get-answer` CLI command** - Agent successfully retrieved answer value (`bash`)
2. **Raw output format** - Agent received just the value, not wrapped in success message
3. **`[AGENT INSTRUCTION] STOP HERE`** - Agent correctly stopped after asking question
4. **Session resumption** - Continuation prompt worked correctly
5. **Question/answer handover** - Full flow working end-to-end

## Conclusion

The WorkGraph agent execution system is now functional for the sample code generation pipeline. Real Claude Code agents can:
- Execute node commands following prompt templates
- Ask questions and pause for orchestrator answers
- Resume with continuation prompts
- Pass data between nodes via inputs/outputs
- Complete nodes and trigger downstream execution
