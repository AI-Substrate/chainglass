# First-Class Agentic Development Harness — Complete Documentation Index

## 📄 Documentation Files

This directory contains comprehensive interface and contract documentation for building an agentic development harness for the Chainglass monorepo.

### **1. HARNESS_SUMMARY.md** (Quick Reference, 431 lines)
**Start here** for a rapid overview of all 14 core interfaces.
- IC-01 through IC-14: One-page summaries of each interface
- Implementation patterns with code examples
- DI token reference table
- Browser automation touchpoints matrix
- Design principles and architecture overview

### **2. HARNESS_INTERFACES.md** (Complete Reference, 560 lines)
**Detailed technical reference** with full interface signatures.
- IC-01: Workspace API routes
- IC-02: Agent management & execution API
- IC-03: File & sample operations API
- IC-04: Server-Sent Events (SSE) streams
- IC-05: Server actions (workspace mutations)
- IC-06: Server actions (workflow orchestration)
- IC-07: IWorkspaceService interface
- IC-08: IPositionalGraphService interface (775 lines)
- IC-09: IOrchestrationService & IGraphOrchestration
- IC-10: Agent service interfaces (manager, instance, session)
- IC-11: ITemplateService interface
- IC-12: CLI command structure
- IC-13: Health check endpoint
- IC-14: Terminal session management

---

## 🎯 Quick Start: Using the Harness

### Step 1: Bootstrap Workspace
```typescript
// Get DI container
const container = getContainer();
const wsService = container.resolve<IWorkspaceService>(
  WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
);

// Resolve workspace context
const ctx = await wsService.resolveContextFromParams('my-workspace');
```

### Step 2: Create Test Workflow
```typescript
const pgService = container.resolve<IPositionalGraphService>(
  POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
);

// Create graph with line and node
const { graphSlug } = (await pgService.create(ctx, 'test-flow')).data;
const { lineId } = (await pgService.addLine(ctx, graphSlug)).data;
const { nodeId } = (await pgService.addNode(
  ctx, graphSlug, lineId, 'code-unit'
)).data;
```

### Step 3: Run Orchestration Loop
```typescript
const orchService = container.resolve<IOrchestrationService>(
  POSITIONAL_GRAPH_DI_TOKENS.ORCHESTRATION_SERVICE
);
const handle = await orchService.get(ctx, graphSlug);

const result = await handle.drive({
  maxIterations: 50,
  actionDelayMs: 100,
  onEvent: (event) => console.log(`[${event.type}] ${event.message}`)
});
```

### Step 4: Provision & Run Agent
```typescript
const agentMgr = container.resolve<IAgentManagerService>(
  SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
);

const agent = agentMgr.createAgent({
  name: 'Test Agent',
  type: 'claude-code',
  workspace: 'my-workspace'
});

await agent.run({ prompt: 'Write a test suite' });
const events = agent.getEvents();
```

### Step 5: Monitor via SSE
```javascript
// Browser/Node client
const eventSource = new EventSource('/api/agents/events');
eventSource.addEventListener('agent_status', (e) => {
  const { agentId, status } = JSON.parse(e.data);
  console.log(`Agent ${agentId}: ${status}`);
});
```

---

## 🔄 Harness Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  AGENTIC DEVELOPMENT HARNESS                    │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼─────┐      ┌─────▼──────┐      ┌──────▼──────┐
    │  Workspace│      │  Workflow  │      │   Agents    │
    │  Service  │      │Orchestration│     │  Manager    │
    │           │      │            │      │             │
    └────┬─────┘      └─────┬──────┘      └──────┬──────┘
         │ IC-07           │ IC-08,09            │ IC-10
         │                 │                      │
    ┌────▼──────────────────▼──────────────────────▼─────┐
    │              CHAINGLASS DI CONTAINER              │
    │   (getContainer() → resolve<IService>(TOKEN))      │
    └────┬──────────────────┬──────────────────────┬─────┘
         │                  │                      │
    ┌────▼─────┐  ┌────────▼────────┐  ┌──────────▼──────┐
    │ REST API  │  │ Server Actions  │  │   CLI Commands  │
    │ Routes    │  │ (Form-based)    │  │   (cg <cmd>)    │
    │ IC-01–05  │  │  IC-05–06       │  │   IC-12         │
    └────┬─────┘  └────────┬────────┘  └──────────┬──────┘
         │                 │                      │
    ┌────▼─────────────────▼──────────────────────▼──────────┐
    │   Browser Automation / Test Harness / External CLI    │
    │  • HTTP requests (fetch/axios)                         │
    │  • EventSource for SSE streams                         │
    │  • Form submissions for mutations                      │
    │  • Child process spawning (cg commands)                │
    └────────────────────────────────────────────────────────┘
```

---

## 📋 Interface Reference Quick Links

| Interface | File | Key Purpose | DI Token |
|-----------|------|-------------|----------|
| IWorkspaceService | IC-07 | Workspace CRUD, context resolution | `WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE` |
| IPositionalGraphService | IC-08 | Graph/node/line operations | `POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE` |
| IOrchestrationService | IC-09 | Workflow execution orchestration | (Via container) |
| IGraphOrchestration | IC-09 | Per-graph execution handle | (Via get()) |
| IAgentManagerService | IC-10 | Agent registry & lifecycle | `SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE` |
| IAgentInstance | IC-10 | Single agent runner | (Via manager.createAgent()) |
| ITemplateService | IC-11 | Template creation & instantiation | `POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE` |

---

## 🚀 Harness Implementation Checklist

### Core Components
- [ ] **Workspace Bootstrapper**: Load/create workspace via IWorkspaceService
- [ ] **Graph Builder**: Construct workflows via IPositionalGraphService
- [ ] **Orchestration Driver**: Execute via IOrchestrationService.drive()
- [ ] **Agent Provisioner**: Create agents via IAgentManagerService
- [ ] **Event Monitor**: Listen to SSE streams for real-time feedback
- [ ] **CLI Wrapper**: Shell out to `cg` commands for e2e testing

### Integration Points
- [ ] **Authentication**: Inject session cookie/token for API calls
- [ ] **DI Container**: Initialize & resolve services from getContainer()
- [ ] **Context Resolution**: Build WorkspaceContext from workspace slug
- [ ] **Event Loop**: Implement polling/backoff strategies
- [ ] **Error Handling**: Respect Result<T> types with errors[] pattern
- [ ] **State Persistence**: Use persistGraphState/loadGraphState for snapshots

### Validation
- [ ] **Path Security**: Validate all filesystem paths (no `..`, absolute only)
- [ ] **Input Validation**: Use Zod schemas for form submissions
- [ ] **Status Checks**: Poll orchestration status, agent status
- [ ] **Event Tracking**: Capture node events, agent events, SSE events
- [ ] **Cleanup**: Delete agents (DELETE /api/agents/[id]), remove workspaces

---

## 🔐 Authentication & Authorization

All API routes require NextAuth session:
```typescript
const session = await auth();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

Server actions automatically check auth via `requireAuth()`.

CLI commands use DI container with environment-based credentials.

---

## 📊 Result Type Pattern

All services follow consistent Result type pattern:
```typescript
interface BaseResult {
  success: boolean
  errors: ResultError[]
}

interface OperationResult extends BaseResult {
  data?: T  // Present on success
}

// Usage:
const result = await service.operation(params);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.errors[0].message);
}
```

**Never throws for expected errors** — always returns errors[] array.

---

## 🎬 Real-Time Event Handling

### SSE Connection Pattern
```javascript
// Generic channel
const events = new EventSource('/api/events/my-channel');

// Agent-specific
const agentEvents = new EventSource('/api/agents/events');

events.addEventListener('event_type', (e) => {
  const payload = JSON.parse(e.data);
  // Handle event
});

// Cleanup
window.addEventListener('unload', () => {
  events.close();
});
```

### Orchestration Event Pattern
```typescript
await handle.drive({
  onEvent: async (event) => {
    switch (event.type) {
      case 'iteration':
        console.log(`Actions taken: ${event.data.actions.length}`);
        break;
      case 'idle':
        console.log('No actions available, waiting...');
        break;
      case 'error':
        console.error('Orchestration error:', event.error);
        break;
    }
  }
});
```

---

## 🔧 Development Tips

### Debug DI Resolution
```typescript
const container = getContainer();
const token = WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE;
try {
  const service = container.resolve(token);
  console.log('✓ Service resolved:', service.constructor.name);
} catch (e) {
  console.error('✗ DI resolution failed:', e.message);
}
```

### Trace Orchestration Steps
```typescript
const result = await handle.drive({
  maxIterations: 5,
  onEvent: (e) => {
    if (e.type === 'iteration') {
      console.log(`Iteration ${e.data.iterations}:`);
      console.log(`  - Actions: ${e.data.actions.length}`);
      console.log(`  - Stop reason: ${e.data.stopReason}`);
    }
  }
});
console.log(`Final: ${result.exitReason} in ${result.iterations} iterations`);
```

### Monitor Agent Events
```typescript
const agent = agentMgr.createAgent({ ... });
await agent.run({ prompt: '...' });

// Poll events periodically
const checkEvents = setInterval(() => {
  const events = agent.getEvents();
  const latestEvent = events[events.length - 1];
  if (latestEvent?.type === 'agent_complete') {
    clearInterval(checkEvents);
    console.log('✓ Agent finished:', latestEvent.output);
  }
}, 100);
```

---

## 📚 Related Files in Monorepo

**Interface Definitions**:
- `/packages/workflow/src/interfaces/` — Workspace, Template, Agent Session
- `/packages/positional-graph/src/interfaces/` — Graph, Orchestration
- `/packages/shared/src/features/019-agent-manager-refactor/` — Agent Manager, Instance

**API Route Implementations**:
- `/apps/web/app/api/` — REST endpoints
- `/apps/web/app/actions/` — Server actions (mutations)

**CLI Implementation**:
- `/apps/cli/src/commands/` — CLI command handlers
- `/apps/cli/src/features/034-agentic-cli/` — Agent CLI features

**DI Container**:
- `/apps/web/src/lib/bootstrap-singleton.ts` — Web DI initialization
- `/apps/cli/src/lib/container.ts` — CLI DI initialization

**Testing Fixtures**:
- `/test/fixtures/` — Test helper factories
- `/test/unit/` — Unit test examples

---

## 🎓 Learning Path

1. **Read**: HARNESS_SUMMARY.md (IC-01 to IC-14)
2. **Reference**: HARNESS_INTERFACES.md (full signatures)
3. **Implement**: Start with IC-07 (IWorkspaceService)
4. **Extend**: Build to IC-08 (IPositionalGraphService)
5. **Integrate**: Add IC-09 (IOrchestrationService)
6. **Automate**: Wire up IC-10 (IAgentManagerService)
7. **Polish**: Add IC-04 (SSE monitoring) & IC-12 (CLI wrapper)

---

## 📞 Questions & Support

**What if my interface returns errors instead of throwing?**
→ All services return Result<T> types with errors[] array per the pattern. Check `result.success` before accessing `result.data`.

**How do I know which DI token to use?**
→ See the DI Token Reference table above. Each service has a specific token in its respective `_DI_TOKENS` enum.

**Can agents timeout?**
→ No. Per IC-09 and IC-10, there is **no timeout enforcement**. Agents can run for hours.

**How do I monitor workflow progress?**
→ Use orchestration events (`drive(..., onEvent)`) or orchestration status queries (`getStatus()`).

**What's the difference between run() and drive()?**
→ `run()` executes one orchestration iteration. `drive()` repeatedly calls `run()` until the graph reaches a terminal state (success/failure/max-iterations).

---

**Last Updated**: 2026-03-07
**Harness Version**: 1.0 (IC-01 through IC-14)
**Status**: Production-ready interfaces documented
