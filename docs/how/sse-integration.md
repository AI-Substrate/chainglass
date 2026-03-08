# SSE Integration Guide

Real-time server→client events in Chainglass use a **multiplexed SSE architecture** (Plan 072). One `EventSource` connection per browser tab carries all channels.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Server                                        │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐    │
│  │ Domain Code     │───▶│   SSEManager    │───▶│ Channel→Controller│   │
│  │ broadcast(ch,d) │    │   (singleton)   │    │ Map<ch, Set<ctrl>>│   │
│  └─────────────────┘    └─────────────────┘    └──────────────────┘    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ /api/events/mux?channels=event-popper,file-changes,...         │    │
│  │ Single SSE endpoint — registers controller across all channels │    │
│  │ 15s heartbeat — survives proxy idle timeouts                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                         SSE Stream (one per tab)
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           Client                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ MultiplexedSSEProvider (mounted in workspace layout)            │    │
│  │ Single EventSource → demux by `channel` field → subscribers    │    │
│  │ Exponential backoff + jitter on error (2s–15s, 15 attempts)    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│           │                              │                              │
│  ┌────────┴────────┐           ┌────────┴────────┐                     │
│  │ useChannelEvents│           │useChannelCallback│                     │
│  │ (accumulation)  │           │ (fire-and-forget)│                     │
│  └─────────────────┘           └──────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Quick Start: Adding a New Channel

### 1. Register the channel

Add your channel name to `WORKSPACE_SSE_CHANNELS` in `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`:

```typescript
const WORKSPACE_SSE_CHANNELS = [
  'event-popper', 'file-changes', 'work-unit-state',
  'workflows', 'unit-catalog',
  'my-new-channel',  // ← add here
] as const;
```

### 2. Broadcast from the server

```typescript
import { sseManager } from '@/lib/sse-manager';

// From any server-side code (API route, server action, watcher, etc.)
sseManager.broadcast('my-new-channel', { type: 'item-updated', itemId: '123' });
```

The mux endpoint automatically adds `channel: 'my-new-channel'` to the payload.

### 3. Consume on the client

Choose the right hook based on your pattern:

**Pattern A: Accumulation** (`useChannelEvents`) — when you need the message history or batch processing.

```tsx
'use client';
import { useChannelEvents } from '@/lib/sse';

function MyComponent() {
  const { messages, isConnected, clearMessages } = useChannelEvents<MyMessage>(
    'my-new-channel',
    { maxMessages: 100 }  // 0 = unlimited
  );

  // Process messages, then clear
  useEffect(() => {
    if (messages.length === 0) return;
    // ... process batch
    clearMessages();
  }, [messages, clearMessages]);
}
```

**Pattern B: Fire-and-forget** (`useChannelCallback`) — when each event triggers an action (e.g., refetch).

```tsx
'use client';
import { useChannelCallback } from '@/lib/sse';

function MyComponent() {
  const { isConnected } = useChannelCallback('my-new-channel', (event) => {
    // Called once per event — do something (e.g., refetch data)
    fetchLatestData();
  });
}
```

## Choosing the Right Hook

| Pattern | Hook | Use When | Examples |
|---------|------|----------|----------|
| Accumulation | `useChannelEvents` | Need message array, index cursors, batch filtering | ServerEventRoute, useWorkflowSSE |
| Fire-and-forget | `useChannelCallback` | Each event triggers a side-effect | QuestionPopper, FileChange |

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

// Broadcast to a channel — all connected mux clients subscribed to this channel receive it
sseManager.broadcast('file-changes', {
  type: 'file-changed',
  changes: [{ path: '/src/index.ts', kind: 'modify' }],
});
```

The `channel` field is added automatically by SSEManager — callers don't need to include it.

### Connection Management

```typescript
sseManager.addConnection(channelId, controller);
sseManager.removeConnection(channelId, controller);
sseManager.removeControllerFromAllChannels(controller); // mux cleanup
sseManager.getConnectionCount(channelId);
sseManager.hasChannel(channelId);
```

## Server-Side: Per-Channel Routes (Legacy)

Individual SSE routes at `/api/events/[channel]` still exist and work for:
- Direct curl/debug access: `curl -N http://localhost:3000/api/events/file-changes`
- External tool integration

These routes are NOT used by the browser — the browser uses `/api/events/mux` exclusively.

## Testing SSE

### Using FakeMultiplexedSSE

```typescript
import { createFakeMultiplexedSSEFactory } from '@test/fakes';

it('should handle channel events', async () => {
  const { factory, fakeMux } = createFakeMultiplexedSSEFactory();

  const wrapper = ({ children }) => (
    <MultiplexedSSEProvider channels={['my-channel']} eventSourceFactory={factory}>
      {children}
    </MultiplexedSSEProvider>
  );

  const { result } = renderHook(
    () => useChannelEvents('my-channel'),
    { wrapper }
  );

  // Simulate connection
  act(() => fakeMux.simulateOpen());

  // Simulate a message on the channel
  act(() => fakeMux.simulateChannelMessage('my-channel', {
    type: 'item-updated',
    itemId: '123',
  }));

  expect(result.current.messages).toHaveLength(1);
});
```

### Two-Layer Test Wrapper

When testing domain hooks that consume SSE through a provider:

```typescript
const wrapper = ({ children }) => (
  <MultiplexedSSEProvider channels={['my-channel']} eventSourceFactory={factory}>
    <MyDomainProvider>
      {children}
    </MyDomainProvider>
  </MultiplexedSSEProvider>
);
```

## Multiplexed Endpoint Details

**Route**: `/api/events/mux?channels=ch1,ch2,ch3`

- Validates channel names against `WorkspaceDomain` values
- Registers one controller across all requested channels
- 15s heartbeat (vs 30s on per-channel routes) — survives proxy idle timeouts
- Atomic cleanup via `removeControllerFromAllChannels()` on disconnect
- Auth-gated (same as other API routes)

## Troubleshooting

### Connection Drops Immediately

**Cause**: Next.js static optimization caching the route.
**Fix**: Ensure `export const dynamic = 'force-dynamic'` on the route file.

### Events Not Reaching Client

**Cause**: Channel not in `WORKSPACE_SSE_CHANNELS`.
**Fix**: Add the channel name to the array in `layout.tsx`.

### Multiple Connections per Tab

**Cause**: Using legacy `useSSE` hook or direct `EventSource`.
**Fix**: Migrate to `useChannelEvents` or `useChannelCallback` from `@/lib/sse`.

### Messages Accumulating

**Cause**: Default maxMessages is 1000.
**Fix**: Call `clearMessages()` after processing, or reduce `maxMessages`:
```typescript
useChannelEvents(channel, { maxMessages: 100 });
```

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Plan 072: SSE Multiplexing (`docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md`)
