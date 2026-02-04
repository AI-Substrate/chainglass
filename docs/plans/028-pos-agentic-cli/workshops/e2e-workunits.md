# Workshop: E2E Test WorkUnits

**Type**: Data Model
**Plan**: 028-pos-agentic-cli
**Spec**: [pos-agentic-cli-spec.md](../pos-agentic-cli-spec.md)
**Created**: 2026-02-04
**Status**: Draft

**Related Documents**:
- [Comprehensive E2E Test Design](./e2e-test-comprehensive.md) — test structure and state diagram
- [CLI and E2E Flow Workshop](./cli-and-e2e-flow.md) — original E2E flow (OUTDATED re: start requirement)

---

## Purpose

Define the real WorkUnits for the comprehensive E2E test. These are **actual units** that will exist in the codebase, not mocks. The E2E test will "be the agent" — executing CLI commands on behalf of each unit.

---

## Final Graph Structure

**3 Lines, 7 Nodes** — Tests serial, parallel, manual gate, and mixed parallel/serial on same line.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LINE 0: Spec Creation (serial, auto transition)                             │
│                                                                             │
│ ┌──────────────────────────┐      ┌──────────────────────────┐              │
│ │ sample-spec-builder      │      │ sample-spec-reviewer     │              │
│ │ pos 0, serial            │ ───► │ pos 1, serial            │              │
│ │ out: spec                │      │ in: spec                 │              │
│ │                          │      │ out: reviewed_spec       │              │
│ └──────────────────────────┘      └──────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ auto transition (default)
┌─────────────────────────────────────────────────────────────────────────────┐
│ LINE 1: Implementation (serial, MANUAL transition to Line 2)                │
│                                                                             │
│ ┌──────────────────────────┐      ┌──────────────────────────┐              │
│ │ sample-coder             │      │ sample-tester            │              │
│ │ pos 0, serial            │ ───► │ pos 1, serial            │              │
│ │ in: spec (from reviewer) │      │ in: language, code       │              │
│ │ out: language, code      │      │ out: test_passed, output │              │
│ │ Q&A: "Which language?"   │      │                          │              │
│ └──────────────────────────┘      └──────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ MANUAL TRANSITION (human gate - cg wf trigger)
┌─────────────────────────────────────────────────────────────────────────────┐
│ LINE 2: PR Preparation (mixed PARALLEL + serial, manual transition)         │
│                                                                             │
│ ┌────────────────────────────┐  ┌────────────────────────────┐              │
│ │ sample-spec-alignment-     │  │ sample-pr-preparer         │              │
│ │ tester                     │  │ pos 1, PARALLEL            │              │
│ │ pos 0, PARALLEL            │  │ in: spec, test_output      │              │
│ │ in: spec, code, test_output│  │ out: pr_title, pr_body     │──┐           │
│ │ out: alignment_score/notes │  │ (NO dep on alignment!)     │  │           │
│ └────────────────────────────┘  └────────────────────────────┘  │           │
│        ▲                              ▲                         │           │
│        │ BOTH READY SIMULTANEOUSLY    │                         │           │
│        └──────────────────────────────┘                         ▼           │
│                                                   ┌────────────────────────┐│
│                                                   │ sample-PR-creator      ││
│                                                   │ pos 2, SERIAL          ││
│                                                   │ (waits for pr-preparer)││
│                                                   │ in: pr_title, pr_body  ││
│                                                   │ out: pr_url, pr_number ││
│                                                   │ TYPE: code-unit        ││
│                                                   └────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### What This Structure Tests

| Aspect | Coverage |
|--------|----------|
| **Serial execution** | Line 0: reviewer waits for builder. Line 1: tester waits for coder |
| **Parallel execution** | Line 2: alignment-tester AND pr-preparer both ready when gate opens |
| **Mixed parallel/serial** | Line 2: PR-creator (serial) waits for pr-preparer (parallel) |
| **Manual transition gate** | Line 2 requires `cg wf trigger` before any node can start |
| **Code-unit type** | PR-creator: simple start→save→end, no agent behavior |
| **Composite inputs** | alignment-tester gets inputs from spec-reviewer, coder, AND tester |
| **Cross-line inputs** | Multiple nodes pulling from different upstream lines |

### Manual Transition Gate

**Setting**: `orchestratorSettings.transition = 'manual'` on Line 1 (the LINE, not nodes)

**CLI to set**:
```bash
cg wf line set <slug> <line1Id> --orch transition=manual
```

**CLI to trigger** (E2E "orchestrator" clicks the human gate):
```bash
cg wf trigger <slug> <line1Id>
```

**Gate behavior**:
- After Line 1 completes, Line 2 nodes are NOT ready
- `status --line line2` shows `canRun: false`, `transitionOpen: false`
- After `trigger`, Line 2 parallel nodes become ready simultaneously
- PR-creator still pending (waiting for serial left neighbor)

---

## WorkUnit Definitions

### 1. sample-spec-builder

**Type**: Agentic
**Purpose**: Creates initial specification from requirements

```yaml
slug: sample-spec-builder
type: agentic
description: Creates a specification document from high-level requirements

inputs: []  # Entry point - no inputs

outputs:
  - name: spec
    type: string
    required: true
    description: The generated specification document
```

**E2E Behavior**:
- Entry point — no inputs needed
- Simulates agent "writing" a spec
- Outputs a spec string

---

### 2. sample-spec-reviewer

**Type**: Agentic
**Purpose**: Reviews and refines the specification

```yaml
slug: sample-spec-reviewer
type: agentic
description: Reviews a specification and provides feedback/refinements

inputs:
  - name: spec
    type: string
    required: true
    description: The specification to review

outputs:
  - name: reviewed_spec
    type: string
    required: true
    description: The reviewed/refined specification
  - name: review_notes
    type: string
    required: false
    description: Review notes and feedback
```

**E2E Behavior**:
- Gets `spec` from sample-spec-builder
- May ask question: "Should I focus on security, performance, or clarity?"
- Outputs reviewed spec

---

### 3. sample-coder

**Type**: Agentic
**Purpose**: Writes code based on specification

```yaml
slug: sample-coder
type: agentic
description: Writes implementation code based on a specification

inputs:
  - name: spec
    type: string
    required: true
    description: The specification to implement

outputs:
  - name: language
    type: string
    required: true
    description: Programming language used
  - name: code
    type: file
    required: true
    description: The generated code file
```

**E2E Behavior**:
- Gets `spec` from sample-spec-reviewer (via `from_unit: sample-spec-reviewer`)
- Asks question: "Which language should I use?" with options
- Saves language choice and code file

---

### 4. sample-tester

**Type**: Agentic
**Purpose**: Tests the generated code

```yaml
slug: sample-tester
type: agentic
description: Tests the implementation code

inputs:
  - name: language
    type: string
    required: true
    description: Programming language of the code
  - name: code
    type: file
    required: true
    description: The code file to test

outputs:
  - name: test_passed
    type: boolean
    required: true
    description: Whether tests passed
  - name: test_output
    type: string
    required: true
    description: Test execution output
```

**E2E Behavior**:
- Gets `language` and `code` from sample-coder
- Simulates running tests
- Outputs pass/fail and output

---

### 5. sample-spec-alignment-tester

**Type**: Agentic
**Purpose**: Verifies implementation aligns with specification

```yaml
slug: sample-spec-alignment-tester
type: agentic
description: Verifies the implementation matches the specification

inputs:
  - name: spec
    type: string
    required: true
    description: The original specification
  - name: code
    type: file
    required: true
    description: The implementation code
  - name: test_output
    type: string
    required: true
    description: Test results

outputs:
  - name: alignment_score
    type: number
    required: true
    description: How well implementation matches spec (0-100)
  - name: alignment_notes
    type: string
    required: true
    description: Detailed alignment analysis
```

**E2E Behavior**:
- Gets spec from reviewer, code from coder, test_output from tester
- Composite input pack from multiple upstream nodes
- Outputs alignment score and notes

---

### 6. sample-pr-preparer

**Type**: Agentic
**Purpose**: Prepares PR metadata (title, body, labels)

```yaml
slug: sample-pr-preparer
type: agentic
description: Prepares pull request metadata

inputs:
  - name: spec
    type: string
    required: true
    description: The specification
  - name: test_output
    type: string
    required: true
    description: Test results from tester

outputs:
  - name: pr_title
    type: string
    required: true
    description: PR title
  - name: pr_body
    type: string
    required: true
    description: PR description/body
  - name: pr_labels
    type: string
    required: false
    description: Comma-separated labels
```

**E2E Behavior**:
- Gets spec (from reviewer) and test_output (from tester)
- Creates PR metadata based on what was built and tested
- Outputs title, body, labels

**IMPORTANT**: Does NOT depend on alignment-tester! Both are truly parallel.

---

### 7. sample-PR-creator

**Type**: Code-Unit (NOT agentic)
**Purpose**: Creates the actual PR via CLI/API

```yaml
slug: sample-PR-creator
type: code-unit  # Different from agentic!
description: Creates a pull request using the prepared metadata

inputs:
  - name: pr_title
    type: string
    required: true
    description: PR title
  - name: pr_body
    type: string
    required: true
    description: PR description

outputs:
  - name: pr_url
    type: string
    required: true
    description: URL of the created PR
  - name: pr_number
    type: number
    required: true
    description: PR number
```

**E2E Behavior**:
- Gets title and body from pr-preparer
- **Code-unit behavior**: Executes programmatically, no agent interaction
- Just runs: `start` → `save-output-data` → `end`
- No questions, no complex agent behavior

---

## Code-Unit vs Agentic Unit

| Aspect | Agentic Unit | Code-Unit |
|--------|--------------|-----------|
| **Execution** | Agent runs, makes decisions | Programmatic execution |
| **Questions** | May ask questions | Never asks questions |
| **Duration** | Variable (agent thinking) | Fast (just code) |
| **State machine** | Full: start → (ask/answer)* → end | Simple: start → end |
| **E2E simulation** | Simulate agent behavior | Just call start/save/end |

---

## Input Wiring Map

```
LINE 0:
═══════
sample-spec-builder (pos 0)
    └──► spec ─────────────────────────────────────────────────────────────┐
                                                                           │
sample-spec-reviewer (pos 1) ◄── spec (from_node: spec-builder)            │
    └──► reviewed_spec ────────────────────────────────────────────────────┤
                                                                           │
LINE 1:                                                                    │
═══════                                                                    │
sample-coder (pos 0) ◄── spec (from_unit: sample-spec-reviewer) ───────────┤
    ├──► language ─────────────────────────────────────────────────────────┤
    └──► code ─────────────────────────────────────────────────────────────┤
                                                                           │
sample-tester (pos 1) ◄── language (from_node: coder)                      │
                      ◄── code (from_node: coder)                          │
    └──► test_passed                                                       │
    └──► test_output ──────────────────────────────────────────────────────┤
                                                                           │
LINE 2 (MANUAL GATE):                                                      │
════════════════════                                                       │
sample-spec-alignment-tester (pos 0, PARALLEL)                             │
    ◄── spec (from_unit: sample-spec-reviewer) ────────────────────────────┤
    ◄── code (from_node: coder) ───────────────────────────────────────────┤
    ◄── test_output (from_node: tester) ───────────────────────────────────┤
    └──► alignment_score                                                   │
    └──► alignment_notes ──────────────────────────────────────────────────┤
                                                                           │
sample-pr-preparer (pos 1, PARALLEL)                                       │
    ◄── spec (from_unit: sample-spec-reviewer) ────────────────────────────┤
    ◄── test_output (from_node: tester) ───────────────────────────────────┘
    └──► pr_title ─────────────────────────────────────────────────────────┐
    └──► pr_body ──────────────────────────────────────────────────────────┤
                                                                           │
sample-PR-creator (pos 2, SERIAL - waits for pr-preparer)                  │
    ◄── pr_title (from_node: pr-preparer) ─────────────────────────────────┤
    ◄── pr_body (from_node: pr-preparer) ──────────────────────────────────┘
    └──► pr_url
    └──► pr_number
```

### Wiring CLI Commands

```bash
# Line 0 wiring (internal)
cg wf node set-input <slug> spec-reviewer spec --from-node spec-builder --output spec

# Line 1 wiring
cg wf node set-input <slug> coder spec --from-unit sample-spec-reviewer --output reviewed_spec
cg wf node set-input <slug> tester language --from-node coder --output language
cg wf node set-input <slug> tester code --from-node coder --output code

# Line 2 wiring (alignment-tester - 3 inputs!)
cg wf node set-input <slug> alignment-tester spec --from-unit sample-spec-reviewer --output reviewed_spec
cg wf node set-input <slug> alignment-tester code --from-node coder --output code
cg wf node set-input <slug> alignment-tester test_output --from-node tester --output test_output

# Line 2 wiring (pr-preparer - NO dependency on alignment-tester!)
cg wf node set-input <slug> pr-preparer spec --from-unit sample-spec-reviewer --output reviewed_spec
cg wf node set-input <slug> pr-preparer test_output --from-node tester --output test_output

# Line 2 wiring (PR-creator)
cg wf node set-input <slug> PR-creator pr_title --from-node pr-preparer --output pr_title
cg wf node set-input <slug> PR-creator pr_body --from-node pr-preparer --output pr_body
```

### Key Wiring Patterns Tested

| Pattern | Example |
|---------|---------|
| **from_node (same line)** | spec-reviewer ← spec-builder |
| **from_unit (cross-line)** | coder ← sample-spec-reviewer |
| **from_node (cross-line)** | tester ← coder |
| **Multiple inputs** | alignment-tester gets 3 inputs from 3 different nodes |
| **Parallel → Serial** | PR-creator ← pr-preparer (serial waits for parallel) |
| **True parallel** | alignment-tester and pr-preparer have NO dependency on each other |

### Why Parallel Nodes Must Not Depend on Each Other

**Gate 4 (inputs available)** blocks a node until all its input sources are complete.

If `pr-preparer` depended on `alignment-tester.alignment_notes`:
- Gate 4 would block pr-preparer until alignment-tester completes
- They would be **effectively serial**, despite `execution: parallel`
- The parallel setting only bypasses Gate 3 (serial neighbor), not Gate 4

**Solution**: Parallel nodes on the same line should pull inputs from **upstream lines only**, not from each other.

---

## Resolved Questions

### Q1: Where does parallel execution fit?

**RESOLVED**: `sample-spec-alignment-tester` (pos 0) and `sample-pr-preparer` (pos 1) are both **PARALLEL** on Line 2. `sample-PR-creator` (pos 2) is **SERIAL** and waits for pr-preparer.

This creates a great test case: serial node waiting for a parallel node to complete.

### Q2: Line numbering

**RESOLVED**: 3 lines total:
- Line 0: spec-builder, spec-reviewer (serial)
- Line 1: coder, tester (serial)
- Line 2: alignment-tester (parallel), pr-preparer (parallel), PR-creator (serial)

### Q3: Manual transition gates

**RESOLVED**: Line 2 has manual transition. Human must approve (trigger) before alignment/PR work begins.

Setting: `orchestratorSettings.transition = 'manual'` on **Line 1** (so transition TO Line 2 is gated).

Trigger: `cg wf trigger <slug> <line1Id>`

---

## E2E Test Flow for Line 2 (Key Test)

This is the critical test sequence for the mixed parallel/serial line:

```
1. Line 1 completes (tester done)
2. Check Line 2 status:
   - canRun: false (transition gate closed)
   - alignment-tester: pending (gate)
   - pr-preparer: pending (gate)
   - PR-creator: pending (gate + serial)

3. Trigger transition: cg wf trigger <slug> <line1Id>

4. Check Line 2 status:
   - canRun: true (gate open)
   - alignment-tester: READY (parallel, gate open)
   - pr-preparer: READY (parallel, gate open)
   - PR-creator: pending (serial, waiting for pr-preparer)

5. Start BOTH parallel nodes simultaneously

6. Complete pr-preparer first:
   - PR-creator becomes READY (left neighbor complete)
   - alignment-tester still running (independent)

7. Start PR-creator (even though alignment-tester not done)

8. Complete all three, verify Line 2 complete
```
