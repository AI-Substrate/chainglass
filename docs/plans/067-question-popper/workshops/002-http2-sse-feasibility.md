# Workshop: HTTP/2 Feasibility for SSE Connection Consolidation

**Type**: Integration Pattern
**Plan**: 067-question-popper
**Spec**: [067 spec](../067-question-popper-spec.md)
**Created**: 2026-03-08
**Status**: Draft

**Related Documents**:
- [ADR-0007: SSE Single-Channel Routing](../../../adr/adr-0007-sse-single-channel-routing.md)
- [Workshop 001: External Event Schema](./001-external-event-schema.md)
- [state-connector.tsx](../../../../apps/web/src/lib/state/state-connector.tsx) — documents connection limit + future multiplexed fix

**Domain Context**:
- **Primary Domain**: `_platform/events` — owns SSE infrastructure, central event notifier
- **Related Domains**: `question-popper`, `_platform/external-events`, `045-live-file-events`

---

## Purpose

Evaluate whether HTTP/2 can solve the browser SSE connection limit (6 per origin on HTTP/1.1) that causes tab lockups when question-popper's SSE runs alongside file-changes SSE. Determine if HTTP/2 is viable for this project, and compare it against alternatives.

## Key Questions Addressed

1. Does HTTP/2 solve the SSE connection limit problem?
2. Can HTTP/2 work over plain HTTP (no TLS)?
3. How hard is HTTP/2 integration with Next.js 16 + App Router + Turbopack?
4. What are the pros, cons, and gotchas?
5. What alternatives exist, and which is the best path forward?

---

## TL;DR Verdict

**HTTP/2 is NOT a viable near-term solution for this project.** It would solve the SSE limit in theory (100+ streams per connection vs 6), but the integration cost with Next.js App Router is prohibitive: custom HTTP/2 servers break middleware and server components with pseudo-header errors, browsers require TLS (no plain HTTP), and the dev experience degrades significantly. The recommended fix is a **single multiplexed SSE endpoint** — one EventSource carrying all channels — which works on HTTP/1.1, requires no infrastructure changes, and the codebase already documents this as the intended solution.

---

## Q1: Does HTTP/2 Solve the SSE Connection Limit?

**Yes, in theory.** HTTP/2 multiplexes up to 100-128 concurrent streams over a single TCP connection (configurable via `SETTINGS_MAX_CONCURRENT_STREAMS`). The browser's `EventSource` API automatically uses HTTP/2 multiplexing when available — no code changes needed on the client side. Multiple SSE connections share one underlying connection transparently.

**Practical impact**: With HTTP/2, our 3-4 SSE channels per tab would consume 3-4 streams out of ~100, leaving ~96 streams for REST fetches, asset loads, etc. Even with 10 tabs, we'd use ~40 streams — well within budget.

**Sources**: [MDN SSE docs](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [DZone: SSE + HTTP/2 + Envoy](https://dzone.com/articles/thoughts-on-server-sent-events-http2-and-envoy-1)

---

## Q2: Can HTTP/2 Work Over Plain HTTP?

**No, not in browsers.** This is the critical blocker for local development.

| Scenario | Protocol Support | Notes |
|----------|-----------------|-------|
| Browsers → plain `http://localhost` | HTTP/1.1 only | Browsers refuse h2c |
| Browsers → `https://localhost` with trusted cert | HTTP/2 (h2) | TLS + ALPN negotiation required |
| Browsers → `https://localhost` with untrusted cert | May fall back to HTTP/1.1 | Browser-dependent |
| Node.js → Node.js (no browser) | h2c works | `http2.createServer()` — but useless for our case |
| `curl --http2` → plain server | h2c works | Not representative of browser behavior |

**h2c (HTTP/2 cleartext)** exists in the spec but **no major browser implements it**: Chrome, Firefox, Safari all require TLS for HTTP/2. This is a hard browser requirement, not a server configuration issue.

**Verified in our repo**: `performance.getEntriesByType('navigation')[0].nextHopProtocol` reports `http/1.1` on our dev server. `curl` confirms the same. `just dev-https` failed to generate certs and fell back to HTTP.

---

## Q3: How Hard Is HTTP/2 Integration with Next.js 16?

### Difficulty: 🔴 HIGH — Architectural Incompatibility

**Next.js has no native HTTP/2 support.** The dev server uses `http.createServer()` (HTTP/1.1). The `--experimental-https` flag adds TLS but still uses HTTP/1.1 — it does NOT upgrade to HTTP/2.

### Three Possible Approaches (All Problematic)

#### Approach A: Custom `http2.createSecureServer()` — BROKEN

```js
// server.js — THIS BREAKS NEXT.JS APP ROUTER
const http2 = require('http2');
const next = require('next');
const fs = require('fs');

const app = next({ dev: true });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http2.createSecureServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem'),
  }, (req, res) => {
    handle(req, res);  // FAILS: pseudo-header errors
  }).listen(3000);
});
```

**Known failures** (tracked in [vercel/next.js#10842](https://github.com/vercel/next.js/discussions/10842), open since 2020, still unresolved in 2026):
- `TypeError: Headers.set: ':method' is an invalid header name` — HTTP/2 pseudo-headers clash with Next.js's `undici` fetch
- Middleware.ts breaks (auth, i18n, any header manipulation)
- Server Components and Server Actions fail during internal fetches
- SSR rendering breaks during `invokeRequest` processing

**Verdict**: Custom HTTP/2 server is incompatible with Next.js App Router. This is a known, unresolved upstream issue.

#### Approach B: Reverse Proxy (Nginx/Caddy) — WORKS BUT HEAVY

```
Browser ──h2/TLS──▶ Nginx/Caddy ──http/1.1──▶ Next.js dev server
```

**What's needed**:
1. Install and configure Nginx or Caddy
2. Generate locally-trusted TLS certificates (mkcert)
3. Configure proxy to terminate TLS + serve HTTP/2
4. Forward to `localhost:3000` over HTTP/1.1
5. Update all URL references, CORS config, auth redirects
6. Every developer must set this up

**Pros**: Actually works. HTTP/2 is real.
**Cons**: Significant dev environment complexity. Every team member needs proxy + certs. `just dev` becomes multi-process. Debugging network issues adds a layer. CI needs different config. Hot reload may need WebSocket proxy config.

#### Approach C: `next dev --experimental-https` — INSUFFICIENT

```bash
next dev --experimental-https
# Result: HTTPS but still HTTP/1.1 over TLS
# Does NOT give HTTP/2
```

Even when `--experimental-https` works (it currently fails in our repo — cert generation crashes, terminal sidecar can't find `certificates/localhost.pem`), it only adds TLS encryption. The underlying server is still `https.createServer()` which defaults to HTTP/1.1. You'd still need a separate HTTP/2-capable server or proxy.

---

## Q4: Pros and Cons

### HTTP/2 Pros
| Pro | Detail |
|-----|--------|
| Transparent multiplexing | 100+ streams per connection, no client code changes |
| EventSource "just works" | Browser auto-negotiates h2, existing `new EventSource()` code unchanged |
| Production-ready | Vercel auto-enables h2; Nginx/Caddy trivial in prod |
| Future-proof | Industry standard, eliminates connection concerns permanently |

### HTTP/2 Cons
| Con | Detail | Severity |
|-----|--------|----------|
| Requires TLS | Browsers won't do h2c — need certs even for localhost | 🔴 High |
| Next.js App Router incompatible | Custom `http2` server breaks middleware + SSR | 🔴 Blocker |
| Dev environment complexity | Proxy + certs for every developer | 🟠 Medium |
| `--experimental-https` doesn't give h2 | Just adds TLS, stays HTTP/1.1 | 🔴 Misleading |
| Our cert generation fails | `just dev-https` errors out today | 🟠 Medium |
| No upstream fix timeline | vercel/next.js#10842 open 6 years, no resolution | 🔴 High |

### Risk Summary
HTTP/2 would solve the SSE problem elegantly IF it worked. But the Next.js App Router incompatibility is an **upstream blocker with no fix timeline**. Investing in workarounds (reverse proxy) adds permanent dev environment complexity for a problem that has a simpler architectural solution.

---

## Q5: Alternatives Comparison

### Option Matrix

| Approach | Complexity | Browser Support | Solves Multi-Tab? | Solves Multi-Channel? | Dev Impact |
|----------|------------|-----------------|--------------------|-----------------------|------------|
| **A. Multiplexed SSE endpoint** | Moderate | Universal | Per-tab (1 conn) | ✅ Yes | None |
| **B. HTTP/2 via reverse proxy** | High | Modern only | ✅ Yes | ✅ Yes | Heavy |
| **C. Lazy SSE connect** | Low | Universal | Partial | ❌ No | None |
| **D. BroadcastChannel cross-tab** | Moderate | Modern only | ✅ Yes | ❌ No | None |
| **E. SharedWorker SSE** | High | Limited (no Safari mobile) | ✅ Yes | ✅ Yes | None |
| **F. WebSocket replacement** | Very High | Universal | Per-tab (1 conn) | ✅ Yes | Massive |

### Option A: Single Multiplexed SSE Endpoint (RECOMMENDED)

**How it works**: One `EventSource` connects to `/api/events/multiplexed?channels=file-changes,event-popper,agents`. Server sends ALL events from requested channels with a `channel` field in the payload. Client-side demultiplexer routes events to per-channel subscribers.

```
Browser Tab
  └── 1× EventSource('/api/events/multiplexed?channels=file-changes,event-popper,work-unit-state')
        ├── receives: { channel: 'file-changes', type: 'file-changed', changes: [...] }
        ├── receives: { channel: 'event-popper', type: 'question-asked', questionId: '...' }
        └── receives: { channel: 'work-unit-state', type: 'status-changed', id: '...' }
              ↓ demultiplexer
        ├── FileChangeProvider gets file-changes events
        ├── useQuestionPopper gets event-popper events
        └── ServerEventRoute gets work-unit-state events
```

**Server-side change**: New route `/api/events/multiplexed` that registers with SSEManager for multiple channels. The existing `SSEManager.broadcast()` already sends to all controllers on a channel — just need to register one controller on multiple channels.

**Client-side change**: New `MultiplexedSSEProvider` (or enhanced `useSSE`) at workspace layout level. Channel consumers subscribe to filtered event streams.

**Why this is the right answer**:
- Works on HTTP/1.1 — no TLS, no certs, no proxy
- 1 connection per tab regardless of feature count
- The codebase already documents this as the intended fix (state-connector.tsx line 30-32)
- Aligns with ADR-0007's single-channel philosophy
- Production-compatible with Vercel HTTP/2 (but doesn't require it)
- Re-enables GlobalStateConnector (currently disabled due to connection limits)

**Estimated effort**: ~2 phases (server multiplexed route + client demultiplexer migration)

### Option C: Lazy SSE Connect (QUICK STOPGAP)

Only open event-popper SSE when the overlay is actually visible. Close after 30s grace period.

```typescript
// In useQuestionPopper:
useEffect(() => {
  if (isOverlayOpen || outstandingCount > 0) {
    connectSSE();
  } else {
    // Grace period before disconnect
    const timer = setTimeout(disconnectSSE, 30_000);
    return () => clearTimeout(timer);
  }
}, [isOverlayOpen, outstandingCount]);
```

**Pros**: Minimal change, fixes immediate regression for users who rarely get questions
**Cons**: Still 2 SSEs when overlay is open. Doesn't scale. Misses questions during disconnect window.

### Option D: BroadcastChannel Cross-Tab (COMPLEMENTARY)

One "leader tab" owns the SSE connection; other tabs receive events via BroadcastChannel.

**Pros**: Reduces server load proportional to tab count
**Cons**: Doesn't solve per-tab multi-channel problem. Leader election complexity. Only modern browsers.

**Best used as**: A Phase 2 optimization on top of Option A.

---

## Recommendation

### Immediate (this plan): Option A — Multiplexed SSE Endpoint

Build a single `/api/events/multiplexed` endpoint that carries all channels over one EventSource per tab. This:
- Fixes the post-merge regression (question-popper doubling SSEs)
- Re-enables GlobalStateConnector (disabled since Plan 053)
- Scales to unlimited future SSE channels
- Requires no infrastructure changes
- Works identically in dev and production

### Future (separate plan): Option D — BroadcastChannel

Once multiplexed SSE works, add cross-tab sharing so N tabs share 1 SSE connection total. This is a nice-to-have optimization, not a blocker.

### Deferred: HTTP/2

HTTP/2 becomes relevant when:
- Next.js resolves the App Router + `http2` pseudo-header bug (vercel/next.js#10842)
- OR we move to a deployment platform that handles h2 termination (Vercel already does)
- It's a "free win" in production behind Vercel/nginx but not worth pursuing for local dev

---

## Open Questions

### Q1: Should the multiplexed endpoint replace or coexist with per-channel endpoints?

**OPEN**: Options:
- **Replace**: Remove `/api/events/[channel]` entirely. Simpler, but breaks any direct channel subscribers.
- **Coexist**: Keep both. Multiplexed is the new default; per-channel stays for backwards compat.
- **Recommendation**: Coexist initially, deprecate per-channel after migration complete.

### Q2: How should channel subscription be negotiated?

**OPEN**: Options:
- **Query parameter**: `/api/events/multiplexed?channels=a,b,c` — simple, visible
- **POST body**: Send channel list in request body — but EventSource is GET-only
- **Subscribe-all**: Server sends all channels, client filters — simplest server, more bandwidth
- **Recommendation**: Query parameter. EventSource supports query strings natively.

### Q3: Should we add `document.visibilitychange` handling?

**RESOLVED**: Yes, as a complementary optimization. Disconnect SSE when tab is backgrounded, reconnect on foreground. Reduces connection pressure from inactive tabs. Implement alongside multiplexed endpoint, not as a separate effort.

---

## Appendix: Verified Facts from Our Repo

| Fact | Evidence |
|------|----------|
| Dev server is HTTP/1.1 | `performance.getEntriesByType('navigation')[0].nextHopProtocol === 'http/1.1'` |
| `just dev-https` fails | Cert generation crashes, terminal sidecar can't find `certificates/localhost.pem` |
| `--experimental-https` gives HTTP/1.1, not HTTP/2 | Node.js `https.createServer()` defaults to HTTP/1.1 |
| 2 SSE connections per tab post-merge | `/api/events/file-changes` + `/api/events/event-popper` |
| GlobalStateConnector disabled | browser-client.tsx line 77-80: "stalling client-side navigation" |
| state-connector.tsx documents multiplexed fix | Line 30-32: "single multiplexed SSE endpoint" |
| Next.js custom HTTP/2 server breaks App Router | vercel/next.js#10842, open since 2020 |
| Browsers don't support h2c | Chrome, Firefox, Safari all require TLS for HTTP/2 |
