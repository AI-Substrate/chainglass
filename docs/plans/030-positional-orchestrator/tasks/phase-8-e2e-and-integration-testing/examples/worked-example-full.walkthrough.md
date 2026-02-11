# Worked Example Walkthrough: All Orchestration Patterns

**Script**: [worked-example-full.ts](./worked-example-full.ts)
**Simple version**: [worked-example.ts](./worked-example.ts) (2-node quick-start)

This walkthrough explains the comprehensive worked example that drives a 4-line, 8-node graph through every orchestration pattern.

---

## Graph Architecture

```mermaid
flowchart TD
    classDef userinput fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef agent fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef code fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Line0["Line 0 (auto)"]
        GS["get-spec<br/>(user-input)"]:::userinput
    end

    subgraph Line1["Line 1 (manual transition)"]
        R["researcher<br/>(agent)"]:::agent
        RV["reviewer<br/>(agent)"]:::agent
        R --> RV
    end

    subgraph Line2["Line 2 (auto)"]
        C["coder<br/>(agent)"]:::agent
        T["tester<br/>(code)"]:::code
        C --> T
    end

    subgraph Line3["Line 3 (auto)"]
        PA["par-a<br/>(agent, parallel)"]:::agent
        PB["par-b<br/>(agent, parallel)"]:::agent
        F["final<br/>(agent, serial)"]:::agent
        PA ~~~ PB
        PB --> F
    end

    Line0 -->|"manual gate"| Line1
    Line1 --> Line2
    Line2 --> Line3

    GS -.->|"spec"| R
    R -.->|"research"| RV
    R -.->|"research"| C
    C -.->|"code"| T
    C -.->|"code"| PA
```

**Legend**: Green = user-input | Blue = agent | Orange = code. Solid arrows = serial order. Dotted arrows = input wiring.

---

## Node Lifecycle State Machine

Every node follows this state machine. The question/answer/restart path (Section 6) exercises the full cycle including the restart loop.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> ready: gates pass (computed)
    ready --> starting: startNode() [ODS]
    starting --> agent_accepted: node:accepted [agent]
    agent_accepted --> waiting_question: question:ask [agent]
    agent_accepted --> complete: node:completed [agent]
    agent_accepted --> blocked_error: node:error [agent]
    waiting_question --> restart_pending: node:restart [human/orchestrator]
    blocked_error --> restart_pending: node:restart [human/orchestrator]
    restart_pending --> ready: reality builder maps
    ready --> starting: startNode() [ODS, restart path]
    complete --> [*]

    note right of waiting_question
        question:answer does NOT
        change status. It only
        stamps the event.
    end note

    note right of restart_pending
        Reality builder maps to ready.
        ONBAS sees ready, returns start-node.
        startNode accepts restart-pending.
    end note
```

---

## Question/Answer/Restart Sequence (Section 6)

This is the most complex pattern — the 8-step lifecycle demonstrated in Section 6.

```mermaid
sequenceDiagram
    participant S as Script
    participant Svc as service
    participant H as handle
    participant EHS as ehs

    Note over S: Step 1
    S->>Svc: raiseNodeEvent(coder, 'node:accepted')
    Note over Svc: starting → agent-accepted

    Note over S: Step 2
    S->>Svc: raiseNodeEvent(coder, 'question:ask', {q-001})
    Note over Svc: agent-accepted → waiting-question

    Note over S: Step 3
    S->>H: run()
    Note over H: Settle → Decide → no ready nodes
    H-->>S: no-action (all-waiting)

    Note over S: Step 4
    S->>Svc: loadGraphState()
    S->>EHS: processGraph(state, 'example-verifier', 'cli')
    Note over EHS: Stamps events for new subscriber
    S->>Svc: persistGraphState()
    S->>S: Print stamp table

    Note over S: Step 5
    S->>Svc: raiseNodeEvent(coder, 'question:answer', {answer})
    Note over Svc: Status STILL waiting-question

    Note over S: Step 6
    S->>Svc: raiseNodeEvent(coder, 'node:restart')
    Note over Svc: waiting-question → restart-pending

    Note over S: Step 7
    S->>H: run()
    Note over H: Reality maps restart-pending → ready
    Note over H: ONBAS sees ready → start-node
    H-->>S: 1 action (start-node coder)

    Note over S: Step 8
    S->>Svc: raiseNodeEvent(coder, 'node:accepted')
    S->>Svc: saveOutputData(coder, 'code', ...)
    S->>Svc: raiseNodeEvent(coder, 'node:completed')
```

---

## Multi-Subscriber Event Stamps

Each event has per-subscriber stamps. Three subscribers appear in the example:

| Subscriber | Created By | When |
|------------|-----------|------|
| `'cli'` | `service.raiseNodeEvent()` (inline settlement) | Every event raise |
| `'orchestrator'` | `handle.run()` settle phase | Every orchestration loop |
| `'example-verifier'` | Explicit `ehs.processGraph()` in Section 6 | Manual inspection |

Events raised after the last `handle.run()` only have the `'cli'` stamp. The `'orchestrator'` stamp gets added by the next `run()` call. This asymmetry is instructive — it shows each subscriber processes events at its own pace.

---

## Section-to-Pattern Mapping

| Section | Title | Patterns | Workshop Source |
|---------|-------|----------|---------------|
| 1 | Wire the Full Stack | Stack wiring (7 real + 2 fakes) | Workshop 14 Part 1 |
| 2 | Create the Graph | 4 lines, 8 nodes, 5 input wirings | Workshop 14 Part 3 |
| 3 | User-Input Node | ONBAS skip, manual completion | Workshop 14 Part 4.3 |
| 4 | Serial Agents + Wiring | Input resolution (Gate 4), serial chain | Workshop 14 Part 4.4 |
| 5 | Manual Transition Gate | Line-level blocking, trigger | Workshop 14 Part 4.5 |
| 6 | Question/Answer/Restart | Full Q&A lifecycle, stamps, settlement | Workshop 14 Parts 4.6, 6, 7 |
| 7 | Code Node | CodePod, FakeScriptRunner | Workshop 14 Part 4.7 |
| 8 | Parallel + Serial Gate | 2 parallel starts, serial successor | Workshop 14 Part 4.8 |
| 9 | Graph Complete | Reality snapshot, 8/8 complete | Workshop 14 Part 4.9 |
| 10 | Idempotency Proof | Per-subscriber processGraph | Workshop 14 Part 4.10 |

---

## Comparison with Other Test Artifacts

| Artifact | Scope | Uses CLI? | Nodes | Purpose |
|----------|-------|-----------|-------|---------|
| `worked-example.ts` | Loop mechanics intro | No | 2 | 5-minute quick-start |
| **`worked-example-full.ts`** | **All patterns** | **No** | **8** | **30-minute deep dive** |
| `test/e2e/...orchestration-e2e.ts` | Full validation | Yes (hybrid) | 8 | CI validation |
| `test/e2e/...node-event-system-e2e.ts` | Event system | Yes (CLI) | 2 | Event system proof |

---

## Key Teaching Points

1. **ONBAS skips user-input nodes**: User-input nodes pass all gates (they're `ready`) but ONBAS returns `null` — the user must complete them manually.

2. **Input wiring feeds Gate 4**: A node cannot become `ready` until all its required inputs have saved output data from their source nodes.

3. **`question:answer` does NOT transition status**: The node stays in `waiting-question`. Only `node:restart` moves to `restart-pending`. This separation keeps "data events" (answer) distinct from "control events" (restart).

4. **Three-layer restart convention**: Handler writes `restart-pending` → reality builder maps to `ready` → `startNode()` accepts `restart-pending` as valid from-state. Each layer has a clear responsibility.

5. **Parallel nodes yield multiple actions per run()**: ONBAS iterates — one action per call, the loop starts a node, re-settles, and asks again. Two ready parallel nodes produce two iterations in one `run()`.

6. **Settlement is per-subscriber and idempotent**: Each subscriber sees every event exactly once. Calling `processGraph` twice with the same subscriber returns 0 events the second time.

7. **Code vs Agent distinction lives in ODS**: ONBAS treats all node types the same (ready → start-node). ODS checks `unitType` and picks CodePod (FakeScriptRunner) or AgentPod (FakeAgentAdapter).
