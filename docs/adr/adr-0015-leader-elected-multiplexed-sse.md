---
title: "ADR-0015: Leader-Elected Multiplexed SSE Connection"
status: "Accepted"
date: "2026-07-26"
authors: "Development Team"
tags: ["architecture", "decision", "sse", "real-time", "events", "streaming", "browser-limits"]
supersedes: "ADR-0007"
superseded_by: ""
---

# ADR-0015: Leader-Elected Multiplexed SSE Connection

## Status

Accepted — supersedes [ADR-0007](./adr-0007-sse-single-channel-routing.md).

## Context

ADR-0007 established a **single global SSE channel per page** (`/api/events/agents`) with client-side
routing by `sessionId`. That decision correctly solved the problem it was aimed at: per-session
channels exhausted connections when one page held many agent sessions.

Two things have since invalidated it.

**1. The connection limit is per-browser, not per-page.** Browsers cap concurrent HTTP/1.1 connections
to roughly **six per origin, shared across every tab**. An SSE connection holds one of those sockets
open permanently. ADR-0007's model opens one connection *per tab*, so the limit is reached at the
**sixth tab**, not the sixth session.

This was measured, not inferred:

| Tabs open | `fetch('/api/health')` from the last tab |
|---|---|
| 1 | 200 in 11 ms |
| 5 | 200 in 6 ms |
| **6** | **BLOCKED — aborted at 20 001 ms** |

At six tabs every request in every tab queues behind the exhausted socket pool while the server is
entirely healthy. The application appears frozen and no server-side metric shows a problem.

**2. The agent surface no longer exists.** `/api/events/agents`, the agent manager feature, its
components and pages were removed (`11f257984`). ADR-0007's Exemplar Implementation,
`apps/web/app/(dashboard)/agents/page.tsx`, no longer exists, and its stated decision references a
route that returns 404.

## Decision

Adopt **one leader-elected, multiplexed SSE connection per browser**, shared across all tabs.

1. **One connection per browser, not per tab.** A single `EventSource` to `/api/events/mux?channels=…`
   carries every domain channel, multiplexed.
2. **Leader election via the Web Locks API.** Tabs contend for
   `chainglass-sse-leader:${channelsKey}`. The winner opens the socket; the rest open **zero**. The
   lock is held for the tab's lifetime and released by the browser on close, crash, or navigation — so
   there is **no heartbeat, no TTL, and no stale-leader detection**.
3. **Fan-out via BroadcastChannel.** The leader relays every message to followers over
   `chainglass-sse:${channelsKey}`. Followers dispatch to their own subscribers as if locally
   connected.
4. **Automatic promotion.** When the leader closes, the browser releases the lock and a queued follower
   is granted it, opens the socket, and takes over. No coordination code runs at teardown.
5. **Graceful degradation.** Where `navigator.locks` or `BroadcastChannel` is unavailable, each tab
   falls back to opening its own connection — exactly ADR-0007's behaviour, so no environment is worse
   off than before.

**Exemplar implementation:** `apps/web/src/lib/sse/multiplexed-sse-provider.tsx`

The public contract is unchanged from the consumer's point of view — `subscribe(channel, cb)`,
`isConnected`, `error` — so features consume events without knowing whether their tab is leader or
follower.

## Consequences

**Measured after implementation**, same probe as the Context table:

| | Before | After |
|---|---|---|
| EventSources across 6 tabs | 6 | **1** |
| 6th-tab request | blocked, aborted at 20 001 ms | **200 in 6 ms** |

- The six-connection ceiling is no longer reachable by opening tabs. One socket serves the browser.
- **Channel membership is now load-bearing on identity.** `channelsKey` names the lock, the
  BroadcastChannel, *and* the mux URL. Adding or removing a channel rotates all three together. During
  a transition an old tab and a new tab hold *different* lock names and both lead — two connections
  until the old tab reloads. This is expected and self-heals; do not add migration logic for it.
- Followers hold no socket, so their `isConnected` / `error` state is relayed rather than observed.
- A tab whose leader body fails stands down, releases the lock, surfaces the error, and degrades to a
  working follower rather than becoming a socket-less phantom leader.

## Alternatives Considered

- **BroadcastChannel + heartbeat/TTL election.** Rejected: requires a timer, a liveness protocol, and
  stale-leader detection. Web Locks gets release-on-death from the browser for free.
- **`localStorage` lease with expiry.** Rejected for the same reason, plus clock-skew and
  write-contention failure modes across tabs.
- **SharedWorker owning the connection.** Genuinely viable and arguably cleaner, but a larger change
  with weaker Safari history; Web Locks achieves the same invariant with ~200 lines and no new runtime.
- **Keeping per-tab connections and raising the limit.** Not available — the cap is browser-enforced.
  HTTP/2 would multiplex, but dev runs over HTTP/1.1 and the fix must hold there.

## Implementation Notes

- Feature detection is per-capability; absence of either API takes the fallback path.
- The election callback is guarded by an **effect-local** disposal token, not a shared ref. React
  StrictMode runs setup → cleanup → setup on one instance, and a grant landing after its own effect
  run's cleanup would otherwise strand the lock in a closure nothing can release — a browser-wide dead
  pipe with no self-heal.
- `AbortSignal` removes a *queued* lock request; it does **not** release a granted one. The held promise
  must resolve on unmount.

## References

- Supersedes: [ADR-0007: SSE Single-Channel Event Routing Pattern](./adr-0007-sse-single-channel-routing.md)
- Related: [ADR-0010: Central Domain Event Notification Architecture](./adr-0010-central-domain-event-notification-architecture.md)
- Implementation: `apps/web/src/lib/sse/multiplexed-sse-provider.tsx`; contract tests under
  `test/unit/web/sse/`
- Commits: `68d5f9989` (leader election), `11f257984` (agent surface removal)
