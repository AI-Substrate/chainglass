# Positional Graph Execution — E2E Flow

This document walks through the 3-line, 7-node E2E test that validates the execution lifecycle infrastructure. Each section corresponds to a test phase in `test/e2e/positional-graph-execution-e2e.ts`.

## Pipeline Overview

```
Line 0: Spec Creation (serial, auto transition)
┌───────────────────┐     ┌───────────────────┐
│   spec-builder    │ ──▶ │   spec-reviewer   │
│                   │     │                   │
│ outputs: spec     │     │ inputs: spec      │
│                   │     │ outputs: reviewed │
└───────────────────┘     └───────────────────┘

        ↓ (auto transition)

Line 1: Implementation (serial, MANUAL transition)
┌───────────────────┐     ┌───────────────────┐
│      coder        │ ──▶ │      tester       │
│                   │     │                   │
│ inputs: spec      │     │ inputs: language, │
│ outputs: language,│     │         code      │
│          code     │     │ outputs: test_    │
│ (Q&A behavior)    │     │   passed, output  │
└───────────────────┘     └───────────────────┘

        ↓ (manual transition - must trigger)

Line 2: PR Preparation (parallel + serial)
┌─────────────────┐  ┌─────────────────┐
│alignment-tester │  │   pr-preparer   │     ┌───────────────────┐
│   (PARALLEL)    │  │   (PARALLEL)    │ ──▶ │    PR-creator     │
│                 │  │                 │     │     (serial)      │
│ inputs: spec,   │  │ inputs: spec,   │     │                   │
│   code, test_   │  │   test_output   │     │ inputs: pr_title, │
│   output        │  │ outputs: pr_    │     │         pr_body   │
│ outputs: align_ │  │   title, body   │     │ outputs: pr_url,  │
│   score, notes  │  │                 │     │          number   │
└─────────────────┘  └─────────────────┘     └───────────────────┘
```

---

## Section 1: Setup

Create the graph structure and wire all inputs.

```bash
# Create graph (Line 0 created automatically)
cg wf create e2e-execution-test

# Add Lines 1 and 2
cg wf line add e2e-execution-test
cg wf line add e2e-execution-test

# Set manual transition on Line 1
cg wf line set e2e-execution-test <line1-id> --orch transition=manual

# Add nodes to Line 0
cg wf node add e2e-execution-test <line0-id> sample-spec-builder
cg wf node add e2e-execution-test <line0-id> sample-spec-reviewer

# Add nodes to Line 1
cg wf node add e2e-execution-test <line1-id> sample-coder
cg wf node add e2e-execution-test <line1-id> sample-tester

# Add nodes to Line 2
cg wf node add e2e-execution-test <line2-id> sample-spec-alignment-tester
cg wf node add e2e-execution-test <line2-id> sample-pr-preparer
cg wf node add e2e-execution-test <line2-id> sample-PR-creator

# Set parallel execution on Line 2's first two nodes
cg wf node set e2e-execution-test <alignment-tester-id> --orch execution=parallel
cg wf node set e2e-execution-test <pr-preparer-id> --orch execution=parallel

# Wire inputs (abbreviated - see full test for complete wiring)
cg wf node set-input e2e-execution-test <spec-reviewer> spec --from-node <spec-builder> --output spec
cg wf node set-input e2e-execution-test <coder> spec --from-unit sample-spec-reviewer --output reviewed_spec
# ... more wiring
```

---

## Section 2: Readiness Detection

Verify the 4-gate algorithm correctly identifies which nodes can run.

```bash
# Check spec-builder (entry point - should be ready)
cg wf status e2e-execution-test --node <spec-builder>
# ready: true

# Check spec-reviewer (blocked by serial gate)
cg wf status e2e-execution-test --node <spec-reviewer>
# ready: false
# readyDetail.serialNeighborComplete: false

# Check coder (blocked by preceding lines)
cg wf status e2e-execution-test --node <coder>
# ready: false
# readyDetail.precedingLinesComplete: false
```

---

## Section 3: Error Code Tests

Verify error handling for invalid operations.

```bash
# E176: Cannot save output on pending node
cg wf node save-output-data e2e-execution-test <spec-builder> spec '"test"'
# Error: E176 Node not in running state

# E172: Cannot end pending node
cg wf node end e2e-execution-test <spec-builder>
# Error: E172 Invalid state transition pending -> complete

# E176: Cannot ask question on pending node
cg wf node ask e2e-execution-test <spec-builder> --type text --text "Question?"
# Error: E176 Node not in running state
```

---

## Section 4: Execute Line 0 (Serial)

Execute the first line with serial nodes.

```bash
# 1. Start spec-builder
cg wf node start e2e-execution-test <spec-builder>

# 2. Verify spec-reviewer still blocked (builder is running, not complete)
cg wf status e2e-execution-test --node <spec-reviewer>
# ready: false

# 3. Save output and complete spec-builder
cg wf node save-output-data e2e-execution-test <spec-builder> spec '"Create isPrime function"'
cg wf node end e2e-execution-test <spec-builder>

# 4. Verify spec-reviewer now ready
cg wf status e2e-execution-test --node <spec-reviewer>
# ready: true

# 5. Execute spec-reviewer
cg wf node start e2e-execution-test <spec-reviewer>
cg wf node save-output-data e2e-execution-test <spec-reviewer> reviewed_spec '"APPROVED: Create isPrime with edge cases"'
cg wf node end e2e-execution-test <spec-reviewer>

# 6. Verify Line 0 complete
cg wf status e2e-execution-test --line <line0-id>
# complete: true
```

---

## Sections 5-8: Execute Line 1 with Q&A

Execute the coder node with Q&A protocol, then the tester.

### Start coder and ask question

```bash
# 1. Verify coder is ready (Line 0 complete, auto transition)
cg wf status e2e-execution-test --node <coder>
# ready: true (auto transition from Line 0 opened)

# 2. Start coder
cg wf node start e2e-execution-test <coder>

# 3. Coder asks "Which language?" (running → waiting-question)
cg wf node ask e2e-execution-test <coder> \
  --type single \
  --text "Which programming language should I use?" \
  --options "TypeScript" "Python" "Go" "Rust"
# Returns: questionId: "q-1706803200000", status: "waiting-question"
```

### Answer question and resume

```bash
# 4. Verify cannot save output while waiting
cg wf node save-output-data e2e-execution-test <coder> language '"TypeScript"'
# Error: E176 Node not in running state

# 5. Orchestrator answers (waiting-question → running)
cg wf node answer e2e-execution-test <coder> q-1706803200000 '"TypeScript"'

# 6. Verify coder back to running
cg wf status e2e-execution-test --node <coder>
# status: running

# 7. Agent retrieves answer after resume
cg wf node get-answer e2e-execution-test <coder> q-1706803200000
# answered: true, answer: "TypeScript"

# 8. E173 for invalid question ID
cg wf node get-answer e2e-execution-test <coder> fake-question-id
# Error: E173 Question not found
```

### Complete coder and tester

```bash
# 9. Coder gets spec input (from_unit resolution)
cg wf node get-input-data e2e-execution-test <coder> spec
# Returns reviewed spec from spec-reviewer

# 10. Complete coder
cg wf node save-output-data e2e-execution-test <coder> language '"TypeScript"'
cg wf node save-output-data e2e-execution-test <coder> code '"function isPrime(n) {...}"'
cg wf node end e2e-execution-test <coder>

# 11. Verify tester now ready
cg wf status e2e-execution-test --node <tester>
# ready: true

# 12. Execute tester
cg wf node start e2e-execution-test <tester>
cg wf node get-input-data e2e-execution-test <tester> language
cg wf node save-output-data e2e-execution-test <tester> test_passed 'true'
cg wf node save-output-data e2e-execution-test <tester> test_output '"All 5 tests passed"'
cg wf node end e2e-execution-test <tester>

# 13. Verify Line 1 complete
cg wf status e2e-execution-test --line <line1-id>
# complete: true
```

---

## Section 9: Manual Transition Test

Line 1 has `transition: manual`, so Line 2 is blocked until triggered.

```bash
# 1. Verify Line 2 blocked
cg wf status e2e-execution-test --line <line2-id>
# canRun: false

cg wf status e2e-execution-test --node <alignment-tester>
# readyDetail.transitionOpen: false

# 2. Trigger transition on Line 1
cg wf trigger e2e-execution-test <line1-id>

# 3. Verify Line 2 now runnable
cg wf status e2e-execution-test --line <line2-id>
# canRun: true
```

---

## Section 10: Parallel Execution (Line 2)

Two nodes execute in parallel, then a third waits for its serial neighbor.

```bash
# 1. Verify BOTH parallel nodes ready simultaneously
cg wf status e2e-execution-test --node <alignment-tester>
# ready: true

cg wf status e2e-execution-test --node <pr-preparer>
# ready: true

# 2. Verify PR-creator NOT ready (serial, waits for pr-preparer)
cg wf status e2e-execution-test --node <PR-creator>
# ready: false
# readyDetail.serialNeighborComplete: false

# 3. Start both parallel nodes
cg wf node start e2e-execution-test <alignment-tester>
cg wf node start e2e-execution-test <pr-preparer>

# 4. Get composite inputs (alignment-tester has 3 inputs from different sources)
cg wf node get-input-data e2e-execution-test <alignment-tester> spec
cg wf node get-input-data e2e-execution-test <alignment-tester> code
cg wf node get-input-data e2e-execution-test <alignment-tester> test_output

# 5. Complete alignment-tester
cg wf node save-output-data e2e-execution-test <alignment-tester> alignment_score '95'
cg wf node save-output-data e2e-execution-test <alignment-tester> alignment_notes '"Implementation matches spec"'
cg wf node end e2e-execution-test <alignment-tester>

# 6. Complete pr-preparer
cg wf node save-output-data e2e-execution-test <pr-preparer> pr_title '"Add isPrime function"'
cg wf node save-output-data e2e-execution-test <pr-preparer> pr_body '"Implements prime checking"'
cg wf node end e2e-execution-test <pr-preparer>

# 7. Verify PR-creator now ready
cg wf status e2e-execution-test --node <PR-creator>
# ready: true
```

---

## Section 11: Code-Unit Pattern (PR-creator)

Execute the final node with simple start → save → end pattern (no Q&A).

```bash
# 1. Start PR-creator
cg wf node start e2e-execution-test <PR-creator>

# 2. Get inputs (from_node wiring)
cg wf node get-input-data e2e-execution-test <PR-creator> pr_title
cg wf node get-input-data e2e-execution-test <PR-creator> pr_body

# 3. Save outputs and complete
cg wf node save-output-data e2e-execution-test <PR-creator> pr_url '"https://github.com/org/repo/pull/42"'
cg wf node save-output-data e2e-execution-test <PR-creator> pr_number '42'
cg wf node end e2e-execution-test <PR-creator>
```

---

## Section 12: Final Validation

Verify the entire graph is complete.

```bash
# Verify graph status
cg wf status e2e-execution-test
# status: complete
# totalNodes: 7
# completedNodes: 7

# Verify all lines complete
cg wf status e2e-execution-test --line <line0-id>  # complete: true
cg wf status e2e-execution-test --line <line1-id>  # complete: true
cg wf status e2e-execution-test --line <line2-id>  # complete: true
```

---

## Patterns Demonstrated

| Pattern | Where Tested |
|---------|--------------|
| Serial execution | Line 0, Line 1 |
| Parallel execution | Line 2 (alignment-tester, pr-preparer) |
| Manual transition gate | Line 1 → Line 2 |
| Q&A protocol | Coder node |
| Code-unit pattern | PR-creator node |
| `from_unit` input resolution | Coder (spec from spec-reviewer) |
| `from_node` input resolution | Tester (language, code from coder) |
| Composite inputs | Alignment-tester (3 inputs from different sources) |

---

## Running the E2E Test

```bash
npx tsx test/e2e/positional-graph-execution-e2e.ts
```

Exit code 0 = all tests passed, exit code 1 = failure.

---

## Related Documentation

- [Execution Overview](./1-overview.md) — State machine, readiness algorithm
- [CLI Reference](./2-cli-reference.md) — Complete command reference
