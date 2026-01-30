# Subtask 002: Browser/SSE Integration for File Watcher

**Parent Plan**: `../../workgraph-ui-plan.md`
**Parent Dossier**: `./tasks.md`
**Prerequisite**: Subtask 001 (WorkspaceChangeNotifierService) must be complete

---

## Overview

| Field | Value |
|-------|-------|
| **Subtask ID** | 002-subtask-browser-sse-integration |
| **Parent Phase** | Phase 4: Real-time Updates |
| **Parent Tasks** | T006, T012 |
| **Dependency** | 001-subtask-file-watching-for-cli-changes |
| **Complexity** | Medium (2) |
| **Created** | 2026-01-29 |

---

## Problem Statement

Subtask 001 created `WorkspaceChangeNotifierService` which emits `GraphChangedEvent` when CLI modifies `state.json`. This subtask wires those events to the browser via SSE so the UI updates automatically.

---

## Objectives & Scope

### Objective
Wire `WorkspaceChangeNotifierService` to the web application so that CLI-triggered file changes result in browser updates within <2s (AC-8).

### Goals

- [ ] Create web integration layer (`workspace-change-notifier-web.ts`)
- [ ] Wire service events to `broadcastGraphUpdated()` 
- [ ] Start service on app boot (not lazy init - decided in DYK session)
- [ ] Verify SSE event reaches client (curl test)
- [ ] Verify client hook receives event (MCP test)
- [ ] Full E2E: CLI command → Toast → Graph refresh (visual test)

### Non-Goals

- ❌ Service implementation (Subtask 001)
- ❌ Polling fallback (out of scope)
- ❌ WebSocket alternative (ADR-0007)

---

## Architecture

### Component Integration

```mermaid
flowchart TB
    subgraph Workflow["packages/workflow (Subtask 001)"]
        WCNS["WorkspaceChangeNotifierService"]
    end

    subgraph Web["apps/web (THIS SUBTASK)"]
        Instrumentation["instrumentation.ts"]
        WebInit["workspace-change-notifier-web.ts"]
        SSE["SSEManager"]
        Broadcast["broadcastGraphUpdated"]
        Route["SSE Route Handler"]
        
        Instrumentation -->|"init on app boot"| WebInit
        WebInit -->|onGraphChanged| Broadcast
        Broadcast -->|broadcast| SSE
    end

    subgraph Client["Browser"]
        Hook["useWorkGraphSSE"]
        Instance["WorkGraphUIInstance"]
        Toast["Toast notification"]
        
        Hook -->|refresh| Instance
        Hook -->|show| Toast
    end

    WCNS -->|GraphChangedEvent| WebInit
    SSE -.->|event stream| Hook
    Route -.->|"clients connect"| SSE
```

---

## Tasks

| Status | ID | Task | CS | Type | Validation | Notes |
|--------|------|------|----|------|------------|-------|
| [ ] | ST006 | Create web integration layer | 2 | Impl | Unit test passes | globalThis pattern for HMR |
| [ ] | ST007 | Verify SSE event on wire (curl) | 1 | Verify | JSON in terminal | Gate G3 |
| [ ] | ST008 | Verify client receives event (MCP) | 1 | Verify | Console.log via MCP | Gate G4 |
| [ ] | ST009 | Full E2E: CLI → Toast → Refresh | 1 | E2E | Visual confirmation | Gate G5 |

---

## Detailed Task Specifications

### ST006: Create Web Integration Layer

**Goal**: Connect WorkspaceChangeNotifierService to SSE broadcasts in the web app

**Implementation**:
```typescript
// apps/web/src/lib/workspace-change-notifier-web.ts

import { 
  WorkspaceChangeNotifierService,
  GitWorktreeResolver,
  type GraphChangedEvent,
} from '@chainglass/workflow';
import { workspaceRegistryAdapter } from './di-container';
import { broadcastGraphUpdated } from '@/features/022-workgraph-ui/sse-broadcast';

// Singleton using globalThis pattern (survives HMR)
const globalForNotifier = globalThis as typeof globalThis & { 
  workspaceChangeNotifier?: WorkspaceChangeNotifierService;
  notifierInitialized?: boolean;
};

function getOrCreateNotifier(): WorkspaceChangeNotifierService {
  if (!globalForNotifier.workspaceChangeNotifier) {
    globalForNotifier.workspaceChangeNotifier = new WorkspaceChangeNotifierService(
      workspaceRegistryAdapter,
      new GitWorktreeResolver(),
    );
  }
  return globalForNotifier.workspaceChangeNotifier;
}

/**
 * Initialize the workspace change notifier and wire it to SSE.
 * Call this on app startup (e.g., instrumentation.ts or root layout).
 * Idempotent - safe to call multiple times.
 */
export async function initWorkspaceChangeNotifier(): Promise<void> {
  if (globalForNotifier.notifierInitialized) {
    return;
  }

  const notifier = getOrCreateNotifier();

  // Wire graph change events to SSE broadcasts
  notifier.onGraphChanged((event: GraphChangedEvent) => {
    console.log(`[WorkspaceChangeNotifier] Graph changed: ${event.graphSlug} in ${event.workspaceSlug}`);
    broadcastGraphUpdated(event.graphSlug);
  });

  await notifier.start();
  globalForNotifier.notifierInitialized = true;
  
  console.log('[WorkspaceChangeNotifier] Started watching all workspaces');
}

/**
 * Stop the notifier (for cleanup/testing).
 */
export async function stopWorkspaceChangeNotifier(): Promise<void> {
  if (globalForNotifier.workspaceChangeNotifier) {
    await globalForNotifier.workspaceChangeNotifier.stop();
    globalForNotifier.notifierInitialized = false;
  }
}
```

**Start on App Boot** (not lazy init):
```typescript
// Option A: apps/web/instrumentation.ts (Next.js instrumentation hook)
export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initWorkspaceChangeNotifier } = await import('@/lib/workspace-change-notifier-web');
    await initWorkspaceChangeNotifier();
  }
}

// Option B: apps/web/src/app/layout.tsx (root layout - server component)
// Call in top-level await or via a server initialization module
```

**Test**:
```typescript
// test/unit/web/lib/workspace-change-notifier-web.test.ts

describe('initWorkspaceChangeNotifier', () => {
  it('starts the notifier on first call');
  it('is idempotent (second call does nothing)');
  it('wires onGraphChanged to broadcastGraphUpdated');
});
```

**Validation**: Unit tests pass

**Files to Create/Modify**:
| File | Action |
|------|--------|
| `apps/web/src/lib/workspace-change-notifier-web.ts` | Create |
| `apps/web/instrumentation.ts` | Create (or modify if exists) |
| `test/unit/web/lib/workspace-change-notifier-web.test.ts` | Create |

---

### ST007: Verify SSE Event on Wire (curl)

**Goal**: Confirm event actually appears on SSE stream without browser

**Manual Test Procedure**:
```bash
# Terminal 1: Start dev server
cd /home/jak/substrate/022-workgraph-ui
pnpm dev

# Terminal 2: Subscribe to SSE (will hang, waiting for events)
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3000/api/events/workgraphs"

# Terminal 3: Trigger file change (use actual workspace path)
echo '{"test": true}' > /home/jak/substrate/chainglass/.chainglass/data/work-graphs/demo-graph/state.json

# Expected in Terminal 2:
# event: graph-updated
# data: {"type":"graph-updated","graphSlug":"demo-graph"}
```

**Validation**: JSON event appears in curl output within 2s (Gate G3)

---

### ST008: Verify Client Hook via MCP Console

**Goal**: Confirm client-side JavaScript receives event, visible in browser console via MCP

**Preparation**: Add explicit console.log to hook (may already exist):
```typescript
// In use-workgraph-sse.ts, inside message handler:
console.log('[useWorkGraphSSE] Received event:', event.type, event.graphSlug);
```

**Test Procedure**:
1. Open browser to workgraph page
2. Use Next.js MCP to check console:
   ```
   nextjs_call port=3000 toolName="get_errors"
   ```
3. Trigger file change (CLI or direct write)
4. Check MCP output for console.log

**Validation**: Console log visible via MCP (Gate G4)

---

### ST009: Full E2E Visual Verification

**Goal**: Complete flow - CLI command triggers visible UI update

**Test Procedure**:
```bash
# Terminal 1: Browser at http://localhost:3000/workspaces/chainglass-main/workgraphs/demo-graph

# Terminal 2: Run CLI command
node apps/cli/dist/cli.cjs wg node add-after demo-graph start test-node \
  --workspace-path /home/jak/substrate/chainglass

# Expected in browser (within 2s):
# 1. Toast: "Graph updated externally"
# 2. New node "test-node" appears in graph
```

**Validation**: Visual confirmation (Gate G5)

---

## Test Plan

### Unit Tests (ST006)

| # | Test | Expected |
|---|------|----------|
| 1 | `ensureWorkspaceChangeNotifier` starts notifier | `service.start()` called |
| 2 | Second call is idempotent | `service.start()` NOT called again |
| 3 | `onGraphChanged` calls `broadcastGraphUpdated` | Spy confirms call with correct graphSlug |
| 4 | `stopWorkspaceChangeNotifier` cleans up | `service.stop()` called |

### Manual Verification (ST007-ST009)

| Gate | Test | Method | Pass Criteria |
|------|------|--------|---------------|
| G3 | SSE wire | curl + file touch | JSON event in terminal |
| G4 | Client hook | Browser + MCP | Console.log visible |
| G5 | Full E2E | CLI + Browser | Toast + node appears |

---

## Commands

```bash
# Run web integration tests
pnpm test test/unit/web/lib/workspace-change-notifier-web.test.ts

# Start dev server (for manual testing)
pnpm dev

# curl verification
curl -N -H "Accept: text/event-stream" "http://localhost:3000/api/events/workgraphs"

# Trigger file change
echo '{"updated": true}' > /home/jak/substrate/chainglass/.chainglass/data/work-graphs/demo-graph/state.json

# CLI command for E2E
node apps/cli/dist/cli.cjs wg node add-after demo-graph start test-node \
  --workspace-path /home/jak/substrate/chainglass

# Quality checks
just fft
just typecheck
```

---

## Verification Gates

| Gate | Prerequisite | Verification | Pass Criteria |
|------|-------------|--------------|---------------|
| G3 | ST006 complete | curl + file touch | JSON event in terminal within 2s |
| G4 | G3 passed | Browser + MCP | Console.log shows event |
| G5 | G4 passed | CLI + Browser | Toast appears, graph refreshes |

---

## After Subtask Completion

**This subtask completes:**
- Parent Task: T006 (File polling → file watching)
- Parent Task: T012 (Final UI verification)
- AC-8: External changes detected <2s ✅

**When all ST### tasks complete:**

1. **Record completion** in parent execution log
2. **Update parent tasks** T006, T012 as complete
3. **Resume parent phase work** if needed

**Quick Links:**
- 📋 [Subtask 001 (Service)](./001-subtask-file-watching-for-cli-changes.md)
- 📋 [Parent Dossier](./tasks.md)
- 📄 [Parent Plan](../../workgraph-ui-plan.md)
