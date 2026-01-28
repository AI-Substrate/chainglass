# E2E WorkGraph Flow Diagram

This document visualizes the validated data flow through the 3-node code generation pipeline.

## Pipeline Overview

```mermaid
flowchart TB
    subgraph Pipeline["WorkGraph: sample-e2e"]
        direction TB

        subgraph N1["Node 1: sample-input"]
            N1_type["Type: user-input"]
            N1_out["Output: spec (data)"]
        end

        subgraph N2["Node 2: sample-coder"]
            N2_type["Type: agent"]
            N2_in["Input: spec"]
            N2_out1["Output: language (data)"]
            N2_out2["Output: script (file)"]
        end

        subgraph N3["Node 3: sample-tester"]
            N3_type["Type: agent"]
            N3_in1["Input: language"]
            N3_in2["Input: script"]
            N3_out1["Output: success (data)"]
            N3_out2["Output: output (data)"]
        end

        N1_out -->|"spec:node1.spec"| N2_in
        N2_out1 -->|"language:node2.language"| N3_in1
        N2_out2 -->|"script:node2.script"| N3_in2
    end

    Orchestrator["Orchestrator"] -->|"reads results"| N3_out1
    Orchestrator -->|"reads results"| N3_out2
```

## State Transitions

```mermaid
stateDiagram-v2
    direction LR

    [*] --> PENDING: Node Created

    PENDING --> COMPLETE: Direct Output Pattern<br/>(save outputs + end)
    PENDING --> RUNNING: start()

    RUNNING --> WAITING_QUESTION: ask()
    WAITING_QUESTION --> RUNNING: answer()

    RUNNING --> COMPLETE: end()<br/>(all outputs saved)
    RUNNING --> FAILED: error

    COMPLETE --> [*]
    FAILED --> [*]

    note right of PENDING
        Node 1 used Direct Output:
        PENDING → COMPLETE
        (no start needed)
    end note

    note right of RUNNING
        Nodes 2 & 3 used:
        PENDING → RUNNING → COMPLETE
    end note
```

## Detailed Execution Flow

```mermaid
sequenceDiagram
    autonumber
    participant O as Orchestrator
    participant CLI as CLI Commands
    participant N1 as Node 1<br/>(sample-input)
    participant N2 as Node 2<br/>(sample-coder)
    participant N3 as Node 3<br/>(sample-tester)

    Note over O,N3: STEP 1-2: Setup
    O->>CLI: wg create sample-e2e
    CLI-->>O: Graph created
    O->>CLI: wg node add-after ... sample-input
    CLI-->>O: Node 1 created (PENDING)
    O->>CLI: wg node add-after ... sample-coder -i spec:node1.spec
    CLI-->>O: Node 2 created (PENDING)
    O->>CLI: wg node add-after ... sample-tester -i language:node2.language -i script:node2.script
    CLI-->>O: Node 3 created (PENDING)

    Note over O,N3: STEP 3: Node 1 - Direct Output Pattern
    O->>CLI: wg node can-run ... node1
    CLI-->>O: canRun: true
    O->>CLI: wg node save-output-data ... spec "Write a function..."
    CLI->>N1: Store output
    N1-->>CLI: saved: true
    O->>CLI: wg node can-end ... node1
    CLI-->>O: canEnd: true
    O->>CLI: wg node end ... node1
    CLI->>N1: PENDING → COMPLETE
    N1-->>CLI: status: complete

    Note over O,N3: STEP 4: Node 2 - Agent with Question
    O->>CLI: wg node can-run ... node2
    CLI-->>O: canRun: true (node1 complete)
    O->>CLI: wg node start ... node2
    CLI->>N2: PENDING → RUNNING
    O->>CLI: wg node ask ... "Which language?"
    CLI->>N2: RUNNING → WAITING_QUESTION
    N2-->>CLI: questionId: q-xxx
    O->>CLI: wg node answer ... "bash"
    CLI->>N2: WAITING_QUESTION → RUNNING
    O->>CLI: wg node save-output-data ... language "bash"
    CLI->>N2: Store data output
    O->>CLI: wg node save-output-file ... script add.sh
    CLI->>N2: Store file output (copied to node storage)
    O->>CLI: wg node end ... node2
    CLI->>N2: RUNNING → COMPLETE

    Note over O,N3: STEP 5: Node 3 - Cross-Node Data Flow
    O->>CLI: wg node can-run ... node3
    CLI-->>O: canRun: true (node2 complete)
    O->>CLI: wg node start ... node3
    CLI->>N3: PENDING → RUNNING
    O->>CLI: wg node get-input-data ... language
    CLI->>N2: Read output "language"
    N2-->>CLI: "bash"
    CLI-->>O: value: "bash", fromNode: node2
    O->>CLI: wg node get-input-file ... script
    CLI->>N2: Read output "script" path
    N2-->>CLI: /path/to/script.sh
    CLI-->>O: filePath: "...", fromNode: node2
    Note over O: Execute script → output "5"
    O->>CLI: wg node save-output-data ... success true
    CLI->>N3: Store output
    O->>CLI: wg node save-output-data ... output "5"
    CLI->>N3: Store output
    O->>CLI: wg node end ... node3
    CLI->>N3: RUNNING → COMPLETE

    Note over O,N3: STEP 6-7: Read Results & Validate
    O->>CLI: wg node get-output-data ... success
    CLI->>N3: Read own output
    N3-->>CLI: true
    CLI-->>O: value: true
    O->>CLI: wg node get-output-data ... output
    CLI->>N3: Read own output
    N3-->>CLI: "5"
    CLI-->>O: value: "5"
    O->>CLI: wg status sample-e2e
    CLI-->>O: All nodes: COMPLETE

    Note over O,N3: TEST PASSED
```

## Data Flow Summary

```mermaid
flowchart LR
    subgraph Node1["Node 1: sample-input"]
        spec["spec: 'Write a function add(a,b)...'"]
    end

    subgraph Node2["Node 2: sample-coder"]
        in_spec["input: spec"]
        lang["language: 'bash'"]
        script["script: add.sh"]
    end

    subgraph Node3["Node 3: sample-tester"]
        in_lang["input: language"]
        in_script["input: script"]
        success["success: true"]
        output["output: '5'"]
    end

    subgraph Result["Pipeline Result"]
        final["success=true, output='5'"]
    end

    spec -->|"get-input-data"| in_spec
    lang -->|"get-input-data"| in_lang
    script -->|"get-input-file"| in_script
    success --> final
    output --> final
```

## CLI Commands Used

| Command | Purpose | Tested |
|---------|---------|--------|
| `wg create <slug>` | Create new graph | ✅ |
| `wg node add-after <graph> <after> <unit> [-i mapping]` | Add node with input mappings | ✅ |
| `wg node can-run <graph> <node>` | Check if node can start | ✅ |
| `wg node start <graph> <node>` | Transition PENDING → RUNNING | ✅ |
| `wg node ask <graph> <node> --type --text --options` | Agent asks question | ✅ |
| `wg node answer <graph> <node> <qid> <value>` | Answer pending question | ✅ |
| `wg node save-output-data <graph> <node> <name> <value>` | Save data output | ✅ |
| `wg node save-output-file <graph> <node> <name> <path>` | Save file output | ✅ |
| `wg node get-input-data <graph> <node> <name>` | Read upstream data via mapping | ✅ |
| `wg node get-input-file <graph> <node> <name>` | Read upstream file via mapping | ✅ |
| `wg node get-output-data <graph> <node> <name>` | Read node's own output | ✅ |
| `wg node can-end <graph> <node>` | Check if outputs complete | ✅ |
| `wg node end <graph> <node>` | Transition to COMPLETE | ✅ |
| `wg status <graph>` | Get graph and node status | ✅ |
| `wg delete <slug> --force` | Delete graph | ✅ |

## Key Patterns Validated

### 1. Direct Output Pattern
Node 1 demonstrates that orchestrators can save outputs to a PENDING node and call `end()` directly, skipping the `start()` step entirely:

```
PENDING → save-output-data → can-end → end → COMPLETE
```

### 2. Agent Question/Answer Handover
Node 2 demonstrates the full agent lifecycle including questions:

```
PENDING → start → RUNNING → ask → WAITING_QUESTION → answer → RUNNING → save outputs → end → COMPLETE
```

### 3. Cross-Node Data Flow
Node 3 demonstrates reading data from upstream nodes via input mappings:

```
get-input-data(language) → reads node2.language → "bash"
get-input-file(script) → reads node2.script → file path
```

### 4. Orchestrator Output Reading
The orchestrator can read a node's outputs after completion using `get-output-data`:

```
get-output-data(node3, success) → true
get-output-data(node3, output) → "5"
```
