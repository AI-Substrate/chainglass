# Central Domain Event Notification System — Usage Guide

How to work with the central event system during development: triggering events, verifying delivery, debugging when events don't flow, and understanding the SSE protocol.

## Verifying the System Is Running

When the dev server starts, look for this log line:

```
[central-notifications] instrumentation.register() called
```

If you don't see it, the system didn't start. Check that:
- You're running `just dev` (or `pnpm dev` from `apps/web`)
- `apps/web/instrumentation.ts` exists and exports `register()`
- No errors appear before the log line

## Triggering Events Manually

### From the Terminal

Append a JSON line to a workgraph's `state.json`:

```bash
echo '{"ts":"'$(date +%s)'"}' >> /home/jak/substrate/chainglass/.chainglass/data/work-graphs/demo-graph/state.json
```

This triggers the full chain:
1. chokidar detects the file change
2. `CentralWatcherService` dispatches to registered adapters
3. `WorkGraphWatcherAdapter` matches the `state.json` path regex
4. `WorkgraphDomainEventAdapter` extracts `graphSlug` and calls `notifier.emit()`
5. `CentralEventNotifierService` broadcasts via SSE
6. Browser receives the event and shows a toast

Expected latency: ~2 seconds (chokidar stabilization ~1s + SSE delivery).

### From an API Route

If you need to emit a domain event from server-side code (e.g., after a mutation):

```typescript
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared/di-tokens';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { getContainer } from '@/lib/bootstrap-singleton';

// In a route handler or server action:
const container = getContainer();
const notifier = container.resolve<ICentralEventNotifier>(
  WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER
);
notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'my-graph' });
```

Note: For workgraphs, the filesystem watcher handles this automatically when `state.json` is written. Direct `emit()` calls are useful for domains without filesystem watchers or for programmatic events.

## Monitoring SSE in the Browser

### Browser DevTools — EventStream Tab

1. Open DevTools → Network tab
2. Filter by "EventStream" or look for requests to `/api/events/workgraphs`
3. Click the request → "EventStream" tab shows received messages:

```
data: {"type":"graph-updated","graphSlug":"demo-graph"}
```

### Browser DevTools — Console

The `useSSE` hook logs warnings for invalid messages:

```
useSSE: Failed to parse message as JSON: ...
useSSE: Invalid message format: ...
```

### Curl

Test SSE delivery from a terminal:

```bash
curl -N -H "Accept: text/event-stream" http://localhost:3000/api/events/workgraphs
```

You'll see heartbeat comments every 30 seconds:

```
: heartbeat

: heartbeat
```

Then trigger a filesystem change in another terminal — the event appears:

```
data: {"type":"graph-updated","graphSlug":"demo-graph"}
```

Press Ctrl+C to disconnect.

## SSE Protocol Details

### Message Format

All messages are unnamed SSE events (no `event:` line):

```
data: {"type":"<eventType>","<key>":"<value>"}\n\n
```

The `type` field is the event type string (e.g., `graph-updated`). Additional fields come from the adapter's `extractData()` return value.

### Heartbeats

The SSE route sends a comment heartbeat every 30 seconds to keep the connection alive:

```
: heartbeat\n\n
```

SSE comments (lines starting with `:`) are ignored by `EventSource` but prevent proxy/load balancer timeouts.

### Channel Validation

The route handler validates channel names against `/^[a-zA-Z0-9_-]+$/`. Invalid channel names return HTTP 400. This prevents SSE injection attacks.

### Event Type Validation

`SSEManager.broadcast()` validates event type strings against the same regex. Invalid event types throw an error server-side.

## Debugging: Events Not Flowing

### Step 1: Check the Server Log

Look for `[central-notifications]` log lines at startup. If missing, the bootstrap didn't run.

### Step 2: Verify the Watcher Is Watching

The `CentralWatcherService` watches `<worktree>/.chainglass/data/` directories. Verify the path exists:

```bash
ls /home/jak/substrate/chainglass/.chainglass/data/work-graphs/
```

### Step 3: Verify the SSE Connection

In the browser, check DevTools → Network for an active EventStream connection to `/api/events/workgraphs`. If it shows as "pending" with a 200 status, the connection is live.

If the connection keeps reconnecting (visible as repeated requests), check:
- Server isn't restarting (HMR loop)
- No proxy cutting the connection

### Step 4: Verify the Channel Name

The domain value must exactly match the SSE subscription path:
- `WorkspaceDomain.Workgraphs === 'workgraphs'` → `/api/events/workgraphs`
- A mismatch means events broadcast to one channel but the client listens on another

### Step 5: Check the Path Regex

`WorkGraphWatcherAdapter` matches paths against:

```
/work-graphs\/([^/]+)\/state\.json$/
```

If your file doesn't match this pattern, the watcher adapter ignores it. Only `state.json` files under `work-graphs/<slug>/` trigger events.

## Client-Side Event Handling

### Using useSSE

```typescript
import { useSSE } from '@/hooks/useSSE';

function WorkgraphPage({ graphSlug }: { graphSlug: string }) {
  const { messages, isConnected } = useSSE<{ type: string; graphSlug: string }>(
    '/api/events/workgraphs'
  );

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest?.type === 'graph-updated' && latest.graphSlug === graphSlug) {
      // Refresh workgraph state via REST
      refetchGraph();
    }
  }, [messages, graphSlug]);
}
```

### Deduplication: UI Save vs External Change

When the UI saves a workgraph, the filesystem watcher detects the write and sends an SSE event. To prevent duplicate refreshes, the client uses an `isRefreshing` guard:

1. User clicks Save → API route writes `state.json`
2. Client sets `isRefreshing = true` for ~3 seconds
3. Filesystem watcher detects the write → SSE event arrives
4. Client checks `isRefreshing` → true → ignores the event
5. After 3 seconds, `isRefreshing = false` → external events are processed again

No server-side suppression is needed.

## Next Steps

- [Overview](./1-overview.md) — Architecture and components
- [Adapters Guide](./3-adapters.md) — How to add a new domain adapter
- [Testing Guide](./4-testing.md) — Testing with FakeCentralEventNotifier
