# SSE Integration Guide

This guide explains how to use Server-Sent Events (SSE) in the Chainglass dashboard for real-time updates.

## Overview

The SSE infrastructure provides:
- **Real-time updates** from server to clients
- **Channel-based broadcasting** for multi-tenant support
- **Type-safe events** with Zod validation
- **Automatic reconnection** on connection loss
- **Heartbeat keep-alive** (30-second intervals)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Server                                         │
│                                                                          │
│  ┌─────────────┐    ┌─────────────────┐    ┌───────────────────────┐   │
│  │ SSE Route   │───▶│   SSEManager    │───▶│ Channel Connections   │   │
│  │ /api/events │    │   (singleton)   │    │ Map<channelId, Set>   │   │
│  └─────────────┘    └─────────────────┘    └───────────────────────┘   │
│                              │                                          │
│                     broadcast(channel, type, data)                      │
│                              │                                          │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                         SSE Stream
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client                                         │
│                                                                          │
│  ┌─────────────┐    ┌─────────────────┐    ┌───────────────────────┐   │
│  │   useSSE    │───▶│   EventSource   │───▶│ Message Handlers      │   │
│  │    Hook     │    │   (browser)     │    │ onmessage callbacks   │   │
│  └─────────────┘    └─────────────────┘    └───────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Event Types

### Zod Schemas

Events are defined with Zod discriminated unions in `apps/web/src/lib/schemas/sse-events.schema.ts`:

```typescript
import { z } from 'zod';

// Base event structure
const baseEventSchema = z.object({
  id: z.string().optional(),       // Event ID for deduplication
  timestamp: z.string().datetime(), // ISO 8601 timestamp
});

// Workflow status update
const workflowStatusEventSchema = baseEventSchema.extend({
  type: z.literal('workflow_status'),
  data: z.object({
    workflowId: z.string(),
    phase: z.enum(['pending', 'running', 'completed', 'failed']),
    progress: z.number().min(0).max(100).optional(),
  }),
});

// Task update (Kanban)
const taskUpdateEventSchema = baseEventSchema.extend({
  type: z.literal('task_update'),
  data: z.object({
    taskId: z.string(),
    columnId: z.string(),
    position: z.number(),
  }),
});

// Heartbeat keep-alive
const heartbeatEventSchema = baseEventSchema.extend({
  type: z.literal('heartbeat'),
  data: z.object({}),
});

// Discriminated union
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
]);

export type SSEEvent = z.infer<typeof sseEventSchema>;
```

### Using Types

```typescript
import type { SSEEvent, WorkflowStatusEvent } from '@/lib/schemas/sse-events.schema';

// Type narrowing with discriminated union
function handleEvent(event: SSEEvent) {
  switch (event.type) {
    case 'workflow_status':
      // TypeScript knows event.data.workflowId exists
      console.log(`Workflow ${event.data.workflowId}: ${event.data.phase}`);
      break;
    case 'task_update':
      // TypeScript knows event.data.taskId exists
      console.log(`Task ${event.data.taskId} moved to ${event.data.columnId}`);
      break;
    case 'heartbeat':
      // Keep-alive, ignore
      break;
  }
}
```

## Server-Side: SSEManager

### Singleton Pattern

The SSEManager uses `globalThis` to survive Next.js hot-module reload:

```typescript
// apps/web/src/lib/sse-manager.ts

const globalForSSE = globalThis as typeof globalThis & { sseManager?: SSEManager };
if (!globalForSSE.sseManager) {
  globalForSSE.sseManager = new SSEManager();
}
export const sseManager = globalForSSE.sseManager;
```

### Broadcasting Events

```typescript
import { sseManager } from '@/lib/sse-manager';

// From any server-side code (API route, server action, etc.)
sseManager.broadcast('workflow-123', 'workflow_status', {
  workflowId: 'workflow-123',
  phase: 'running',
  progress: 45,
});
```

### Connection Management

```typescript
// Add connection (done automatically by SSE route)
sseManager.addConnection(channelId, controller);

// Remove connection
sseManager.removeConnection(channelId, controller);

// Check connection count
const count = sseManager.getConnectionCount('workflow-123');

// Check if channel exists
if (sseManager.hasChannel('workflow-123')) {
  // At least one client connected
}

// Send heartbeat manually
sseManager.sendHeartbeat('workflow-123');
```

## Server-Side: Route Handler

### Creating an SSE Endpoint

```typescript
// apps/web/app/api/events/[channel]/route.ts
import type { NextRequest } from 'next/server';
import { sseManager } from '@/lib/sse-manager';

// REQUIRED: Prevent static optimization
export const dynamic = 'force-dynamic';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
): Promise<Response> {
  const { channel } = await params;

  // Validate channel (prevent SSE injection)
  if (!channel || !/^[a-zA-Z0-9_-]+$/.test(channel)) {
    return new Response('Invalid channel name', { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      // Register with SSEManager
      sseManager.addConnection(channel, controller);

      // Send initial heartbeat
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': heartbeat\n\n'));

      // Setup heartbeat interval
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeatInterval);
          sseManager.removeConnection(channel, controller);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        sseManager.removeConnection(channel, controller);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### SSE Message Format

```
event: workflow_status
data: {"workflowId":"123","phase":"running","progress":45}

: heartbeat

event: task_update
data: {"taskId":"task-1","columnId":"done","position":0}

```

- **Event line**: `event: <type>\n` (optional, defaults to 'message')
- **Data line**: `data: <json>\n` (can span multiple lines)
- **Comment**: `: <text>\n` (ignored by client, used for heartbeat)
- **Separator**: Empty line `\n` marks end of event

## Client-Side: useSSE Hook

### Basic Usage

```tsx
'use client';

import { useSSE } from '@/hooks/useSSE';

function WorkflowStatus({ workflowId }: { workflowId: string }) {
  const { isConnected, messages, error } = useSSE<SSEEvent>(
    `/api/events/workflow-${workflowId}`
  );

  if (error) return <div>Error: {error.message}</div>;
  if (!isConnected) return <div>Connecting...</div>;

  const latestStatus = messages
    .filter(m => m.type === 'workflow_status')
    .at(-1);

  return (
    <div>
      Status: {latestStatus?.data.phase ?? 'unknown'}
      Progress: {latestStatus?.data.progress ?? 0}%
    </div>
  );
}
```

### With Schema Validation

```tsx
import { sseEventSchema } from '@/lib/schemas/sse-events.schema';

const { messages, error } = useSSE<SSEEvent>('/api/events/workflow-123', undefined, {
  messageSchema: sseEventSchema,  // Validates incoming messages
});
```

### Options

```typescript
interface UseSSEOptions {
  autoConnect?: boolean;        // Connect on mount (default: true)
  reconnectDelay?: number;      // Delay between retries (default: 5000ms)
  maxReconnectAttempts?: number; // Max retries (default: 5, 0 = unlimited)
  maxMessages?: number;         // Message buffer size (default: 1000)
  messageSchema?: z.ZodType;    // Optional Zod validation
}
```

### Control Functions

```tsx
const { connect, disconnect, clearMessages, isConnected } = useSSE(url);

// Manual connection control
<button onClick={disconnect}>Pause</button>
<button onClick={connect}>Resume</button>
<button onClick={clearMessages}>Clear History</button>
```

## Adding a New Event Type

### 1. Define Schema

```typescript
// apps/web/src/lib/schemas/sse-events.schema.ts

// Add new event schema
const alertEventSchema = baseEventSchema.extend({
  type: z.literal('alert'),
  data: z.object({
    severity: z.enum(['info', 'warning', 'error']),
    message: z.string(),
    source: z.string().optional(),
  }),
});

// Add to discriminated union
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
  alertEventSchema,  // NEW
]);

// Export type
export type AlertEvent = z.infer<typeof alertEventSchema>;
```

### 2. Broadcast From Server

```typescript
// In API route or server action
sseManager.broadcast('system-alerts', 'alert', {
  severity: 'warning',
  message: 'High memory usage detected',
  source: 'monitoring',
});
```

### 3. Handle on Client

```tsx
function AlertDisplay() {
  const { messages } = useSSE<SSEEvent>('/api/events/system-alerts');

  const alerts = messages.filter(m => m.type === 'alert');

  return (
    <ul>
      {alerts.map((alert, i) => (
        <li key={i} className={`alert-${alert.data.severity}`}>
          {alert.data.message}
        </li>
      ))}
    </ul>
  );
}
```

## Creating a New Channel

### Dynamic Channels

Channels can be any valid string matching `/^[a-zA-Z0-9_-]+$/`:

```tsx
// Per-workflow channel
useSSE(`/api/events/workflow-${workflowId}`);

// Per-user channel
useSSE(`/api/events/user-${userId}`);

// Global channel
useSSE('/api/events/global');
```

### Channel Namespacing

```typescript
// Recommended pattern for channel names
const CHANNELS = {
  workflow: (id: string) => `workflow-${id}`,
  kanban: (boardId: string) => `kanban-${boardId}`,
  user: (userId: string) => `user-${userId}`,
  system: 'system-alerts',
} as const;

// Usage
sseManager.broadcast(CHANNELS.workflow('123'), 'workflow_status', data);
```

## Testing SSE

### Using FakeEventSource

```typescript
import { createFakeEventSourceFactory, FakeEventSource } from '@test/fakes';

describe('useSSE', () => {
  it('should handle messages', async () => {
    const factory = createFakeEventSourceFactory();
    
    const { result } = renderHook(() => 
      useSSE('/api/events/test', factory.create)
    );

    // Get the created instance
    const instance = factory.instances[0] as FakeEventSource;
    instance.simulateOpen();
    
    // Simulate message
    instance.simulateMessage(JSON.stringify({
      type: 'workflow_status',
      timestamp: new Date().toISOString(),
      data: { workflowId: '123', phase: 'running' },
    }));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });
  });
});
```

### Testing SSEManager

```typescript
import { SSEManager } from '@/lib/sse-manager';
import { FakeController } from '@test/fakes';

describe('SSEManager', () => {
  it('should broadcast to all connections', () => {
    const manager = new SSEManager();
    const controller1 = new FakeController();
    const controller2 = new FakeController();
    
    manager.addConnection('channel-1', controller1);
    manager.addConnection('channel-1', controller2);
    
    manager.broadcast('channel-1', 'test', { foo: 'bar' });
    
    expect(controller1.chunks).toHaveLength(1);
    expect(controller2.chunks).toHaveLength(1);
  });
});
```

## Troubleshooting

### Connection Drops Immediately

**Cause**: Next.js static optimization caching the route.

**Fix**: Add `export const dynamic = 'force-dynamic'` to route file.

### Events Not Reaching Client

**Cause**: Channel mismatch between broadcast and subscription.

**Fix**: Verify channel names match exactly:
```typescript
// Server
sseManager.broadcast('workflow-123', ...);

// Client (must match)
useSSE('/api/events/workflow-123');
```

### Memory Leak in Development

**Cause**: Multiple SSEManager instances from HMR.

**Fix**: Use globalThis singleton pattern (already implemented).

### Messages Accumulating

**Cause**: Default maxMessages is 1000.

**Fix**: Call `clearMessages()` or reduce `maxMessages`:
```typescript
useSSE(url, undefined, { maxMessages: 100 });
```

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Zod Documentation](https://zod.dev/)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
