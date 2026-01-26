# External Research: SSE vs WebSocket for Real-Time AI Agent Streaming

**Research Date**: 2026-01-26
**Source**: Perplexity Deep Research
**Query**: SSE vs WebSocket for real-time AI agent streaming in Next.js 16 (2025-2026)

---

## Executive Summary

**Recommendation: Use SSE with HTTP POST for command signaling** rather than WebSocket for multi-agent AI streaming in Next.js 16.

**Key Reasons**:
- SSE integrates seamlessly with Next.js route handlers and Edge runtime
- Automatic browser reconnection with message resumption
- 8x better scaling (fewer servers for equivalent traffic)
- HTTP/2 multiplexing eliminates the 6-connection limit
- WebSocket requires external infrastructure on Vercel

---

## Protocol Comparison

### Communication Model

| Aspect | SSE | WebSocket |
|--------|-----|-----------|
| Direction | Server → Client only | Full duplex (bidirectional) |
| Protocol | HTTP/1.1 or HTTP/2 | WebSocket protocol (ws/wss) |
| Connection | Standard HTTP, kept open | Persistent TCP after upgrade |
| Reconnection | Automatic (EventSource API) | Manual implementation required |
| Infrastructure | Pure HTTP, any proxy works | Requires WebSocket support |

### For AI Agent Token Streaming

**SSE Advantages**:
- Tokens stream immediately without batching
- HTTP compression applies to token stream
- EventSource API parses data efficiently
- Time-to-first-token (TTFT) competitive with WebSocket

**WebSocket Considerations**:
- Initial handshake adds latency vs SSE's immediate stream start
- Each token as separate message = framing overhead
- Batching tokens = delays TTFT

**Research Finding**: Teams at major organizations have chosen SSE over WebSocket specifically for LLM streaming because user-perceived token arrival latency proves superior.

---

## Browser Connection Limits

### Historical Limitation (HTTP/1.1)
- 6 concurrent connections per domain per browser
- This "six connection limit" stopped many from considering SSE

### Modern Reality (HTTP/2+)
- **HTTP/2 multiplexes multiple streams over single TCP connection**
- 10 SSE subscriptions = 10 streams within 1 connection
- The browser connection limit no longer applies
- HTTP/3 adds connection migration (WiFi ↔ cellular seamless)

**Conclusion**: The 6-connection limit is irrelevant in 2026 production deployments.

---

## Next.js 16 Platform Considerations

### Runtime Constraints

| Runtime | Node.js | Edge |
|---------|---------|------|
| **Timeout** | 300-800s (configurable) | 25s to start, 300s total |
| **WebSocket** | Supported | NOT supported |
| **SSE** | Supported | Supported |
| **Node.js APIs** | Full access | Limited |

**Critical Insight**: For edge-based deployment with low latency to global users, you must use SSE or abandon Edge runtime entirely.

### Route Handler Implementation

#### SSE Route Handler (Works on Edge)

```typescript
// app/api/agent/stream/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Anthropic } from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const client = new Anthropic();

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const prompt = searchParams.get('prompt');

  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const abortSignal = request.signal;
  let clientDisconnected = false;
  abortSignal.addEventListener('abort', () => { clientDisconnected = true; });

  const stream = await client.messages.create({
    model: 'claude-opus-4-1',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  const encoder = new TextEncoder();
  const customReadable = new ReadableStream({
    async start(controller) {
      let eventId = 0;

      try {
        for await (const event of stream) {
          if (clientDisconnected) {
            controller.close();
            break;
          }

          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const data = {
              type: 'token',
              content: event.delta.text,
              eventId: eventId++
            };

            const sseMessage =
              `id: ${data.eventId}\n` +
              `data: ${JSON.stringify(data)}\n\n`;

            controller.enqueue(encoder.encode(sseMessage));
          }

          if (event.type === 'message_stop') {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'complete' })}\n\n`
            ));
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`
          ));
        }
        controller.close();
      }
    },
  });

  return new NextResponse(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
```

#### WebSocket (Requires External Infrastructure)

```typescript
// instrumentation.ts - for Node.js runtime only
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { BootstrapWS } = await import('./server/websocketServer');
    BootstrapWS();
  }
}

// server/websocketServer.ts - separate process required
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

export function BootstrapWS() {
  const server = createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      const data = JSON.parse(message.toString());
      if (data.type === 'stream_agent') {
        // Handle agent streaming
      }
    });
  });

  server.listen(3001);
}
```

**Comparison**:
- SSE: Integrates with existing route handlers, works on Edge
- WebSocket: Requires separate process, Node.js only, additional deployment infrastructure

---

## Bidirectional Communication Pattern

### The Misconception
"SSE cannot handle bidirectional communication"

### The Reality
SSE + HTTP POST achieves true bidirectional capability:
- **SSE**: Server → Client streaming
- **HTTP POST**: Client → Server commands (stop, cancel, etc.)

### Why This Works for AI Agents

Traffic is asymmetric:
- Server sends: hundreds/thousands of tokens
- Client sends: occasional stop signals

WebSocket's bidirectional symmetry overprovisions unused upstream capacity.

### Session-Based Pattern

```typescript
// 1. Create session
// POST /api/agent/session → { sessionId }

// 2. Stream via SSE
// GET /api/agent/stream/[sessionId]

// 3. Cancel via HTTP POST
// POST /api/agent/cancel/[sessionId]
```

#### Session Route Handler

```typescript
// app/api/agent/session/route.ts
import { v4 as uuidv4 } from 'uuid';

const sessions = new Map<string, AgentSession>();

export async function POST(request: NextRequest) {
  const sessionId = uuidv4();
  const session: AgentSession = {
    id: sessionId,
    abortController: new AbortController(),
    status: 'idle',
  };

  sessions.set(sessionId, session);
  return NextResponse.json({ sessionId });
}
```

#### Cancel Route Handler

```typescript
// app/api/agent/cancel/[sessionId]/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const session = sessions.get(sessionId);

  if (session) {
    session.status = 'cancelled';
    session.abortController.abort();
  }

  return NextResponse.json({ cancelled: true });
}
```

#### Client Usage

```typescript
// Start session
const { sessionId } = await fetch('/api/agent/session', { method: 'POST' }).then(r => r.json());

// Connect to stream
const eventSource = new EventSource(`/api/agent/stream/${sessionId}?prompt=${encodeURIComponent(prompt)}`);

eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'token') {
    appendToken(data.content);
  }
});

// Cancel (HTTP POST)
function cancelAgent() {
  fetch(`/api/agent/cancel/${sessionId}`, { method: 'POST' });
  eventSource.close();
}
```

---

## Connection Management and Memory Leaks

### Your Current SSE Issues

1. **Heartbeat cleanup doesn't remove dead connections** (memory leak)
2. **Event type not sanitized** (injection vulnerability)

### Corrected Pattern

```typescript
class SessionManager {
  private sessions = new Map<string, StreamSession>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  registerSession(id: string, onClientDisconnect: (id: string) => void) {
    const session: StreamSession = {
      id,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      controller: new AbortController(),
    };

    this.sessions.set(id, session);

    // Handle client disconnect
    session.controller.signal.addEventListener('abort', () => {
      this.unregisterSession(id);
      onClientDisconnect(id);
    });

    // Heartbeat with cleanup check
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const session = this.sessions.get(id);

      if (!session) {
        clearInterval(heartbeatInterval);
        this.heartbeatIntervals.delete(id);
        return;
      }

      // Check for idle timeout
      if (now - session.lastActivity > 30000) {
        session.controller.abort();
        return;
      }

      // Send heartbeat...
    }, 5000);

    this.heartbeatIntervals.set(id, heartbeatInterval);
  }

  unregisterSession(id: string) {
    const interval = this.heartbeatIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(id);
    }
    this.sessions.delete(id);
  }

  async shutdown(gracePeriod = 10000) {
    for (const [id, session] of this.sessions.entries()) {
      session.controller.abort();
    }

    for (const interval of this.heartbeatIntervals.values()) {
      clearInterval(interval);
    }

    this.sessions.clear();
    this.heartbeatIntervals.clear();
  }
}
```

### Event Type Sanitization

```typescript
// VULNERABLE
const eventType = searchParams.get('type'); // "message\n\ndata: injected"
const sseMessage = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

// CORRECTED
function sanitizeSSEField(value: string): string {
  return value
    .split('\n').join('\\n')
    .split('\r').join('\\r')
    .substring(0, 100);
}

const eventType = sanitizeSSEField(searchParams.get('type') || 'message');
```

---

## Reconnection and Error Recovery

### SSE: Automatic

- Browser EventSource reconnects automatically after delay
- Server sends `id` field with each event
- Browser sends `Last-Event-ID` header on reconnect
- Stream resumes without data loss

```typescript
// Server maintains message buffer
class MessageBuffer {
  private buffer: Array<{ id: string; data: string }> = [];
  private maxSize = 1000;

  add(id: string, data: string) {
    this.buffer.push({ id, data });
    if (this.buffer.length > this.maxSize) this.buffer.shift();
  }

  getSince(lastEventId: string): Array<{ id: string; data: string }> {
    const lastIndex = this.buffer.findIndex(e => e.id === lastEventId);
    if (lastIndex === -1) return [];
    return this.buffer.slice(lastIndex + 1);
  }
}

// In route handler
export async function GET(request: NextRequest) {
  const lastEventId = request.headers.get('last-event-id');

  if (lastEventId) {
    const missedMessages = messageBuffer.getSince(lastEventId);
    for (const msg of missedMessages) {
      // Stream missed events immediately
    }
  }

  // Continue with new events...
}
```

### WebSocket: Manual

Must implement:
- Detect disconnection (timeout, error event)
- Exponential backoff with jitter
- Track which messages were sent
- Replay messages on reconnection
- Per-connection reconnection logic

---

## Scaling Characteristics

### Resource Consumption

| Metric | SSE | WebSocket |
|--------|-----|-----------|
| Memory per connection | 2-5 KB | 2-5 KB + overhead |
| Implementation overhead | Minimal | 50-100% for reconnection/heartbeat |
| Connections per server | 50,000+ | 5,000-10,000 |

### Example: 100,000 Users × 4 Sessions Each = 400,000 Connections

**SSE Deployment**:
- 50,000 connections/server → 8 servers
- Memory: ~800 MB/server = 6.4 GB total

**WebSocket Deployment**:
- 10,000 connections/server → 40 servers
- Memory: ~1.2 GB/server = 48 GB total

**Result**: 7x difference in server count

---

## Infrastructure Compatibility

### SSE Advantages

- Pure HTTP - traverses any proxy/firewall that supports HTTP
- CDN compatible
- HTTP/2 multiplexing works seamlessly
- Vercel Edge runtime compatible

### WebSocket Challenges

- Some corporate firewalls/proxies block WebSocket upgrades
- Enterprise networks, hotel networks, ISP proxies problematic
- CDNs struggle with WebSocket passthrough
- **Vercel requires specialized tooling (Rivet) or separate infrastructure**

---

## Deployment on Vercel

### SSE

- Works with standard route handlers
- Configurable timeout (300-800s)
- Works on Edge runtime
- Use Redis for distributed session storage

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

export async function POST(request: NextRequest) {
  const sessionId = crypto.randomUUID();

  await redis.setex(
    `session:${sessionId}`,
    3600,
    JSON.stringify({ createdAt: Date.now(), status: 'idle' })
  );

  return NextResponse.json({ sessionId });
}
```

### WebSocket

- Requires Rivet or separate server
- Cannot use Edge runtime
- Adds significant architectural complexity and cost

---

## Recommended Architecture

### Hybrid Approach

```
┌─────────────────────────────────────────────────────────┐
│                     Client Browser                       │
├─────────────────────────────────────────────────────────┤
│  EventSource (SSE)              HTTP POST               │
│  - Token streaming              - Cancel signal          │
│  - Status updates               - Control commands       │
│  - Automatic reconnect                                   │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐  ┌───────────────────────────┐
│ GET /api/agent/stream/   │  │ POST /api/agent/cancel/   │
│ [sessionId]              │  │ [sessionId]               │
├──────────────────────────┤  ├───────────────────────────┤
│ SSE Response             │  │ JSON Response             │
│ - text/event-stream      │  │ - { cancelled: true }     │
│ - Streaming tokens       │  │                           │
└──────────────┬───────────┘  └───────────────┬───────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                   Redis Session Store                    │
│  - Session metadata                                      │
│  - Message buffer for reconnection                       │
│  - Status flags (cancelled, etc.)                        │
└─────────────────────────────────────────────────────────┘
```

---

## Action Items for Plan 012

### SSE Infrastructure Status: PRODUCTION-READY

The existing SSE implementation already addresses the concerns raised in this research:

| Concern | Status | Implementation |
|---------|--------|----------------|
| Memory leak | **FIXED** | Interval cleared in abort handler, dead controllers removed on error |
| Event type injection | **FIXED** | Regex validation `/^[a-zA-Z0-9_]+$/` in `broadcast()` |
| Channel validation | **FIXED** | Regex `/^[a-zA-Z0-9_-]+$/` prevents path traversal |
| Message pruning | **FIXED** | `useSSE` maxMessages limit (default 1000) |
| Reconnect cleanup | **FIXED** | Pending timeout cleared on new connect() |

### Implementation Tasks

1. **Extend SSE schemas** - Add agent event types to existing Zod discriminated union
2. **Use session-based channels** - `agent-${sessionId}` pattern
3. **Add HTTP POST endpoints** for cancel/stop commands
4. **Implement message buffer** for Last-Event-ID reconnection resume (optional enhancement)
5. **Add Redis** for distributed session storage (if multi-region needed)

### Future Optimization

1. Implement HTTP/3 support as infrastructure allows
2. Consider geographic distribution with edge-based session routing

---

## Conclusion

**Choose SSE + HTTP POST over WebSocket** for multi-agent AI streaming in Next.js 16:

| Factor | SSE Winner? | Reason |
|--------|-------------|--------|
| Simplicity | ✅ | Native route handler integration |
| Reconnection | ✅ | Automatic with message resume |
| Scaling | ✅ | 8x fewer servers |
| Edge Runtime | ✅ | Full support vs none |
| Vercel Deploy | ✅ | No external infrastructure |
| Token Streaming | ✅ | Superior TTFT |
| Bidirectional | ✅ | HTTP POST pattern works perfectly |

Your existing SSE implementation is **already production-ready** with proper security validation and memory management. Extend it with agent event types for multi-agent streaming.

---

**Research Complete**
