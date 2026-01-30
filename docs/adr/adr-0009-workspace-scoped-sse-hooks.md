# ADR-0009: Workspace-Scoped SSE Hooks Architecture

**Status**: SEED (Draft from DYK session - Plan 018 Phase 3)
**Date**: 2026-01-28
**Deciders**: Development Team
**Context**: Plan 018 Phase 3 - Web UI Integration

## Context

Plan 018 Phase 3 introduces workspace-scoped agent pages that need SSE (Server-Sent Events) for real-time event streaming. The existing `useServerSession` hook from Plan 015 doesn't support workspace context - it hardcodes the legacy `/api/agents/events` endpoint.

As we add more workspace-scoped domains (samples, prompts, workflows), each will need similar SSE capabilities. Without a shared pattern, we risk:
- Duplicated SSE logic across domain-specific hooks
- Inconsistent URL construction patterns
- Maintenance burden as the pattern diverges

## Decision

Implement a **layered hooks architecture** for workspace-scoped SSE:

```
┌─────────────────────────────────────────────────────────────┐
│  Domain-specific hooks (agent, sample, prompt, workflow)    │
│  useServerSession({ sessionId, workspaceSlug })             │
│  useSampleEvents({ sampleSlug, workspaceSlug })             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  useWorkspaceSSE (shared primitive) [EXEMPLAR]              │
│  useWorkspaceSSE({ workspaceSlug, path, params? })          │
│  Constructs: /api/workspaces/${slug}/${path}                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Base SSE utilities (EventSource wrapper, reconnection)     │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **`useWorkspaceSSE` is the shared primitive**
   - Accepts `workspaceSlug` and relative `path`
   - Constructs full URL: `/api/workspaces/${workspaceSlug}/${path}`
   - Handles SSE connection lifecycle, reconnection, error states
   - Domain-agnostic - doesn't know about agents, samples, etc.

2. **Domain hooks delegate to `useWorkspaceSSE`**
   - `useServerSession` calls `useWorkspaceSSE({ workspaceSlug, path: \`agents/${sessionId}/events\` })`
   - Future `useSampleEvents` calls `useWorkspaceSSE({ workspaceSlug, path: \`samples/${slug}/events\` })`
   - Domain hooks add domain-specific parsing, state management, typing

3. **Backwards compatibility via optional `workspaceSlug`**
   - If `workspaceSlug` is provided → new workspace-scoped URL
   - If omitted → legacy behavior (for migration period)

### API Design

```typescript
// Shared primitive
interface UseWorkspaceSSEOptions {
  workspaceSlug: string;
  path: string;                    // Relative path after /api/workspaces/${slug}/
  params?: Record<string, string>; // Query params (?since=xxx)
  enabled?: boolean;               // Control subscription
}

function useWorkspaceSSE<T>(options: UseWorkspaceSSEOptions): {
  data: T[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
}

// Domain-specific (agents)
interface UseServerSessionOptions {
  workspaceSlug?: string;  // Optional for backwards compat
  subscribeToUpdates?: boolean;
}

function useServerSession(
  sessionId: string,
  options?: UseServerSessionOptions
): {
  session: ServerSession | null;
  events: StoredAgentEvent[];
  isLoading: boolean;
  isConnected: boolean;
}
```

## Consequences

### Positive

- **Single source of truth** for workspace URL construction
- **Reusable pattern** for all future workspace-scoped domains
- **Consistent testing** - test `useWorkspaceSSE` once, domain hooks get it free
- **Clear separation** - SSE mechanics vs domain logic
- **Exemplar for future domains** - samples, prompts, workflows follow same pattern

### Negative

- **Additional abstraction layer** - one more hook in the chain
- **Migration effort** - existing `useServerSession` callers need updates
- **Learning curve** - developers need to understand the layered architecture

### Neutral

- **File locations**: 
  - `apps/web/src/hooks/useWorkspaceSSE.ts` (shared)
  - `apps/web/src/hooks/useServerSession.ts` (updated)

## Implementation Notes

- Created in Plan 018 Phase 3 as T005a/T005b
- Agents domain is the exemplar; future domains should copy the pattern
- Consider extracting to `@chainglass/shared` if used across packages

## Related

- ADR-0007: SSE Single Channel Routing (establishes SSE patterns)
- ADR-0008: Workspace Split Storage Data Model (workspace URL structure)
- Plan 018: Agent Workspace Data Model Migration

---

_This ADR was seeded from a DYK (Did You Know) clarity session. Promote to full ADR status after implementation validates the pattern._
