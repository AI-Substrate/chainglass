# WorkGraph E2E Test Harness

End-to-end validation harness for the WorkGraph system.

## Quick Start

```bash
# Run in mock mode (fast, no real agents)
npx tsx e2e-sample-flow.ts

# Run with real agents (requires API keys)
npx tsx e2e-sample-flow.ts --with-agent
```

## What It Tests

This harness creates a 3-node code generation pipeline:

```
[get-spec] -> [generate-code] -> [run-verify]
```

1. **get-spec** (sample-input): Provides the spec "Write a function add(a, b)"
   - Demonstrates "direct output pattern" (PENDING -> COMPLETE without start)

2. **generate-code** (sample-coder): Generates bash script
   - Demonstrates agent question/answer handover
   - Asks which language to use, auto-answered with "bash"

3. **run-verify** (sample-tester): Runs the generated script
   - Demonstrates cross-node data and file flow
   - Reads inputs from upstream, executes script, reports result

## Mock vs Real Mode

### Mock Mode (Default)

The script simulates agent behavior directly:
- Node 2: Uses real `ask`/`answer` CLI commands to test question flow
- Node 3: Executes the generated script and captures output
- Fast (~5 seconds), deterministic, no external dependencies

### Real Agent Mode (`--with-agent`)

The script invokes actual agents via `cg agent run`:
- Agents execute the command templates
- Slower, non-deterministic, requires API keys
- *Note: Not yet fully implemented*

## Prerequisites

Sample units must be installed in `.chainglass/units/`:
- `sample-input` - user-input unit providing spec
- `sample-coder` - agent unit generating code
- `sample-tester` - agent unit running tests

These are created as part of Plan 017 and should already exist.

## Files

```
workgraph-run/
├── e2e-sample-flow.ts     # Main test script
├── lib/
│   ├── cli-runner.ts      # CLI execution utilities
│   └── types.ts           # Type definitions
└── README.md

.chainglass/units/         # Unit definitions (standard location)
├── sample-input/
├── sample-coder/
└── sample-tester/
```

## Expected Output

```
=================================================================
           E2E Test: Sample Code Generation Flow
=================================================================
Mode: Mock (no real agents)

STEP 1: Create Graph
  ✓ Created graph: sample-e2e

STEP 2: Add Nodes
  ✓ Added node: get-spec (sample-input)
  ✓ Added node: generate-code (sample-coder) -> after get-spec
  ✓ Added node: run-verify (sample-tester) -> after generate-code

STEP 3: Execute get-spec (Direct Output)
  ✓ can-run: true (no upstream dependencies)
  ✓ Saved output: spec = "Write a function add(a, b)..."
  ✓ can-end: true (spec output present)
  ✓ Completed: get-spec -> complete (no start needed!)

STEP 4: Execute generate-code (Agent with Question)
  ✓ can-run: true (get-spec is complete)
  ✓ Started: generate-code -> running
  ✓ Asked question: "Which programming language should I use?"
  ✓ Auto-answered: "bash"
  ✓ Generated mock script: add.sh
  ✓ Saved output: language = "bash"
  ✓ Saved output: script = add.sh
  ✓ Completed: generate-code -> complete

STEP 5: Execute run-verify (Agent Runs Script)
  ✓ can-run: true (generate-code is complete)
  ✓ Started: run-verify -> running
  ✓ Got input: language = "bash"
  ✓ Got input: script = "..."
  ✓ Executed script, output: "5"
  ✓ Saved output: success = true
  ✓ Saved output: output = "5"
  ✓ Completed: run-verify -> complete

STEP 6: Read Pipeline Result
  ✓ success = true
  ✓ output = "5"

STEP 7: Validate Final State
  ✓ All nodes complete
  ✓   get-spec: complete
  ✓   generate-code: complete
  ✓   run-verify: complete

=================================================================
                    TEST PASSED
=================================================================
```
