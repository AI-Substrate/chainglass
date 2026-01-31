# Prior Discoveries & Learnings: Agent System Refactoring

**Query**: Search for prior discoveries and learnings relevant to Agent System refactoring
**Focus**: Plans 002 (agent-control), 012 (web-agents), 015 (better-agents), 018 (agents-workspace-data-model)
**Research Date**: 2026-01-28
**Findings**: 15 institutional knowledge items extracted from completed phases

---

## PL-01: Event-Sourced Storage Before SSE Broadcast (Critical)

**Source**: Plan 015, Phase 1 (Event Storage Foundation) - Critical Discovery 01  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Event-Sourced Storage Required Before Adapters" - All events must flow through storage before SSE broadcast. The storage layer is the source of truth, not the broadcast mechanism.

**Resolution**: 
- Implemented EventStorageService with NDJSON persistence
- All adapter events call `append()` BEFORE `sseManager.broadcast()`
- DYK-06: On append() failure, log warning but continue with broadcast (graceful degradation)

**Why It Matters for Refactor**:
The new agent architecture MUST maintain this storage-first pattern. Any event from adapters (Claude, Copilot, new providers) must persist to disk before being broadcast via SSE. This enables:
- Session recovery across browser refreshes
- Cross-device session access
- Audit trails for debugging
- Migration to new storage backends

**Critical**: Do NOT reverse the order or make storage optional.

---

## PL-02: Three-Layer Type Sync Must Be Atomic (Critical)

**Source**: Plan 015, Phase 1 (Event Storage Foundation) - Critical Discovery 02  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Three-Layer Sync Must Be Atomic" - Event types defined in Phase 1 must be complete before Phase 2 adapter work. The discriminated union requires all layers (storage schema, SSE schema, TypeScript types) to know about new event types simultaneously.

**Resolution**:
- Define all Zod schemas FIRST in packages/shared/src/schemas/
- Derive TypeScript types via `z.infer<>`
- Add to discriminated union arrays atomically
- DYK-03: Zod-First Single Source of Truth prevents type/schema drift

**Why It Matters for Refactor**:
When adding new event types (e.g., for new adapter capabilities, reasoning events, multi-modal content):
1. Define Zod schema first
2. Add to `AgentEvent` discriminated union
3. Update storage service to handle new type
4. Update SSE broadcast schemas
5. Deploy atomically (no partial rollouts)

**Critical**: Schema drift causes runtime validation failures that are hard to debug.

---

## PL-03: Claude Content Blocks vs Copilot Event Model (High)

**Source**: Plan 015, Phase 2 (Adapter Event Parsing) - Critical Discovery 03 & 04  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-2-adapter-event-parsing/tasks.md

**Original Discovery**:
> **Discovery 03**: "Claude Content Blocks Already Available" - Claude uses `tool_use`, `tool_result`, `thinking` content blocks within assistant/user messages.
> 
> **Discovery 04**: "Copilot Uses Different Event Model" - Copilot has dedicated events (`tool.execution_start`, `tool.execution_complete`, `assistant.reasoning`) not content blocks.

**Resolution**:
- Claude adapter: Parse content blocks from message arrays, extract tool_use/tool_result/thinking
- Copilot adapter: Switch statement on event type, handle dedicated tool/reasoning events
- Normalize BOTH to unified `AgentEvent` discriminated union (tool_call, tool_result, thinking)

**Why It Matters for Refactor**:
The adapter abstraction layer MUST normalize provider-specific formats to a common event model. Future providers (OpenAI, Gemini, local models) will have different formats:
- Some use content blocks (like Claude)
- Some use dedicated events (like Copilot)
- Some may use function calling schemas

**Recommendation**: Extract a `ContentBlockParser` and `EventTranslator` pattern that each adapter implements. The normalization logic is critical to maintain.

---

## PL-04: Session Destruction Race Condition in Copilot (Medium)

**Source**: Plan 015, Phase 2 (Adapter Event Parsing) - High Discovery 07  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-2-adapter-event-parsing/tasks.md

**Original Discovery**:
> "Session Destruction Race in Copilot compact()" - The compact() method must NOT call run() because it destroys the session. Must add defensive assertion: `if (!this._session || this._session.destroyed) throw`

**Resolution**:
- Added session state validation in compact() before any operations
- compact() only processes existing session state, never spawns
- Sessions are single-use: create fresh session per method call

**Why It Matters for Refactor**:
Copilot SDK sessions are stateful and can be destroyed. The adapter layer must:
1. Check session validity before every operation
2. Never reuse destroyed sessions
3. Fail fast with clear errors on invalid session access
4. Use fresh sessions for each request (no session pooling)

**Pattern**: Add defensive checks at method entry points, not just in happy paths.

---

## PL-05: Node.js localStorage Gotcha (Gotcha)

**Source**: Plan 012, Phase 1 (Foundation) - Discovery T009  
**Plan/Phase**: docs/plans/012-web-agents/tasks/phase-1-foundation/tasks.md

**Original Discovery**:
> "Node.js defines `globalThis.localStorage` as empty object without methods" - Testing revealed that checking for `localStorage` truthy is insufficient; must check for methods.

**Resolution**:
- Changed detection from `if (localStorage)` to `if (typeof localStorage.getItem === 'function')`
- Prevents runtime errors in Node.js/SSR contexts

**Why It Matters for Refactor**:
Agent code runs in both browser AND server (Next.js SSR, CLI). Any browser API usage must have proper detection:
- Check method existence, not just object presence
- Provide server-side fallbacks or throw explicit errors
- Test in both environments

**Pattern**: `typeof someAPI.method === 'function'` not just `someAPI`

---

## PL-06: jsdom Lacks localStorage in Tests (Workaround)

**Source**: Plan 012, Phase 2 (Core Chat) - Discovery T017  
**Plan/Phase**: docs/plans/012-web-agents/tasks/phase-2-core-chat/tasks.md

**Original Discovery**:
> "jsdom lacks localStorage; page tests failed" - Vitest with jsdom environment doesn't provide localStorage by default.

**Resolution**:
- Added localStorage mock to `test/setup-browser-mocks.ts`
- Centralized mock setup for all browser APIs

**Why It Matters for Refactor**:
Test environment setup is critical for agent UI tests. When refactoring:
- Maintain centralized mock setup
- Document all required browser API mocks
- Verify tests run in both jsdom and real browser (Playwright)

**Location**: `test/setup-browser-mocks.ts` contains all browser API mocks

---

## PL-07: Silent Skip for Malformed NDJSON Lines (Decision)

**Source**: Plan 015, Phase 1 (Event Storage Foundation) - DYK-04  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Silent Skip for Malformed NDJSON Lines" - `getAll()` and `getSince()` silently skip unparseable lines, returning only valid events. This matches existing StreamJsonParser `catch {}` pattern.

**Resolution**:
- Corrupted lines are skipped during event file read
- Valid events are still returned
- No error thrown for partial corruption
- Optional: Log skipped lines in production for observability (added in Phase 2)

**Why It Matters for Refactor**:
Event files can be corrupted (disk errors, incomplete writes, manual editing). The system should be resilient:
- Don't fail entire session on single corrupt line
- Return what's recoverable
- Log corruption for ops visibility
- Consider adding repair/compaction tooling later

**Trade-off**: Corruption is silent by default. Add optional logging/metrics for production.

---

## PL-08: Timestamp-Based Event IDs for Natural Ordering (Insight)

**Source**: Plan 015, Phase 1 (Event Storage Foundation) - DYK-01  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Timestamp-based event IDs (`YYYY-MM-DDTHH:mm:ss.sssZ_<random>`) avoid race conditions and provide natural ordering"

**Resolution**:
- Event IDs: `2026-01-27T12:00:00.000Z_a7b3c`
- Naturally sortable (lexicographic sort = chronological)
- No concurrency issues (timestamp + random suffix)
- getSince() works by string comparison

**Why It Matters for Refactor**:
This ID format is CRITICAL for incremental event fetching and ordering. Do not change to:
- UUID v4 (no chronological order)
- Sequential integers (race conditions in distributed systems)
- Timestamps without random suffix (collisions on rapid events)

**Invariant**: Keep ISO-8601 timestamp prefix for all event IDs.

---

## PL-09: Path Traversal Prevention in Session IDs (Security)

**Source**: Plan 015, Phase 1 (Event Storage Foundation); Plan 018, Phase 2 Fix SEC-001  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Session IDs must be sanitized to prevent directory traversal" - Rejects `/`, `..`, `\`, whitespace in session IDs before filesystem operations.

**Resolution**:
- Implemented `validateSessionId()` function
- Called at every adapter method entry point
- Rejects dangerous characters before path construction
- Phase 018 review found 4 methods missing validation (CRITICAL finding)

**Why It Matters for Refactor**:
ANY user-controlled input used in file paths MUST be validated. Session IDs, workspace names, agent names all need sanitization. Missing validation = arbitrary file read/write.

**Critical**: Call validateSessionId() or equivalent at EVERY method that accepts sessionId parameter. Add contract tests to verify.

---

## PL-10: SSE Notification-Fetch Pattern (Architecture)

**Source**: Plan 015, Phase 3 (SSE Broadcast Integration) - DYK-06, DYK-07  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-3-sse-broadcast-integration/tasks.md

**Original Discovery**:
> "SSE is Hint, Not Truth" - Changed from SSE-as-data-source to SSE-as-notification. SSE sends `{ type: 'session_updated', sessionId }` only. Client fetches via REST API.

**Resolution**:
- SSE broadcasts lightweight notifications (no full event data)
- React Query hook subscribes to notifications
- Notifications trigger `queryClient.invalidateQueries()`
- React Query fetches fresh data via GET /api/agents/sessions/:id
- Server-side storage is always the source of truth

**Why It Matters for Refactor**:
This pattern solves several problems:
1. SSE unreliability (connections drop) - data still accessible via fetch
2. Cross-device sync - all devices fetch from same source
3. Event deduplication - React Query handles this automatically
4. Simpler SSE payloads - lower bandwidth, easier to debug

**Architecture**: SSE = "cache invalidation signal", NOT "data delivery mechanism"

---

## PL-11: Dual-Layer Testing with Contract Parity (Testing)

**Source**: Plan 015, Phase 1 (Event Storage Foundation) - DYK-05  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-1-event-storage-foundation/tasks.md

**Original Discovery**:
> "Dual-Layer Test Strategy with Contract Parity" - Storage service tests use real temp dir; API route tests use fake via DI; contract tests verify parity between Fake and Real implementations.

**Resolution**:
- Real implementation: Uses actual filesystem in temp directories
- Fake implementation: In-memory with same interface
- Contract tests: Same test suite runs against BOTH implementations
- Ensures Fake behaves identically to Real

**Why It Matters for Refactor**:
When creating new adapters or services:
1. Create Fake implementation FIRST (test double)
2. Write contract test suite using Fake
3. Implement Real to pass same contract tests
4. Use Fake in all tests that don't explicitly need Real filesystem

**Benefits**: Fast tests (no I/O), guaranteed Fake/Real parity, easier debugging

---

## PL-12: Event Handler Registration Timing (Gotcha)

**Source**: Plan 006, Phase 2 (Copilot SDK) - DYK-03  
**Plan/Phase**: docs/plans/006-copilot-sdk/tasks/phase-2-core-adapter-implementation/tasks.md

**Original Discovery**:
> "Event Emission: Handler must be registered via `on()` BEFORE calling `sendAndWait()` or events are missed"

**Resolution**:
```typescript
// ✅ Correct order
session.on('tool.execution_start', handler);
session.on('assistant.reasoning', handler);
await session.sendAndWait({ prompt });

// ❌ Wrong - events missed
await session.sendAndWait({ prompt });
session.on('tool.execution_start', handler); // Too late!
```

**Why It Matters for Refactor**:
This is a race condition in async event-driven code. When wrapping SDKs or adapters:
- Register ALL event listeners FIRST
- Then trigger the action that emits events
- Document this requirement clearly in adapter code

**Pattern**: "Subscribe before send" - applies to any event-driven system

---

## PL-13: Schema Shape Mismatch During Migration (Migration)

**Source**: Plan 015, Phase 4 (UI Components) - DYK-P4-02  
**Plan/Phase**: docs/plans/015-better-agents/tasks/phase-4-ui-components/tasks.md

**Original Discovery**:
> "Schema Shape Mismatch (Fixture vs Phase 1-3)" - Existing dialog uses old fixture shapes that differ from new schemas:
> - Old: `role: 'tool'` → New: `contentType: 'tool_call'`
> - Old: `tool.name` → New: `data.toolName`
> - Old: `status: 'failed'` → New: `data.isError: boolean`

**Resolution**:
- Components must handle BOTH old and new shapes during migration
- Use discriminators: `role === 'tool' OR contentType === 'tool_call'`
- Gradual migration: Phase 4 delivers new components, Phase 5+ migrates pages

**Why It Matters for Refactor**:
Large refactors often require supporting TWO schemas simultaneously:
1. Old data still exists in localStorage/files
2. New data uses improved schema
3. UI must gracefully handle both

**Strategy**:
- Add schema version field if doing major migration
- Support both schemas in UI for 1-2 releases
- Log usage of old schema for deprecation tracking
- Provide migration tooling for power users

---

## PL-14: AgentStoredEvent Union Type Pattern (TypeScript)

**Source**: Plan 018, Phase 2 (AgentEventAdapter) - Execution Log Discovery  
**Plan/Phase**: docs/plans/018-agents-workspace-data-model/tasks/phase-2-agenteventadapter/execution.log.md

**Original Discovery**:
> "gotcha: AgentStoredEvent is a discriminated union, so StoredAgentEvent must use intersection type (`AgentStoredEvent & { id: string }`) rather than `extends`"

**Resolution**:
```typescript
// ❌ Wrong - extends doesn't work with unions
type StoredAgentEvent = AgentStoredEvent extends { id: string };

// ✅ Correct - intersection type
type StoredAgentEvent = AgentStoredEvent & { id: string; timestamp: string };
```

**Why It Matters for Refactor**:
When working with discriminated unions (AgentEvent, WorkspaceContext, etc.):
- Use intersection types (&) for adding fields
- Don't use inheritance (extends) - TypeScript won't infer types correctly
- Discriminated unions require all variants to have the discriminator field

**Common Error**: Type narrowing fails if using extends instead of intersection

---

## PL-15: Workspace-Scoped Data Paths (Architecture)

**Source**: Plan 018, Phase 1 & 2 (AgentSession Entity, AgentEventAdapter)  
**Plan/Phase**: docs/plans/018-agents-workspace-data-model/tasks/phase-1-agentsession-entity/tasks.md

**Original Discovery**:
> "Agent sessions and events must be workspace-scoped following ADR-0008 workspace data model. Each worktree gets its own storage at `<worktree>/.chainglass/data/agents/`"

**Resolution**:
- Old: `.chainglass/workspaces/default/data/abc/events.ndjson`
- New: `<worktree>/.chainglass/data/agents/abc.json` (session metadata)
- New: `<worktree>/.chainglass/data/agents/abc/events.ndjson` (events)

**Why It Matters for Refactor**:
The new agent architecture MUST be workspace-aware from day one:
- All adapters accept `WorkspaceContext` parameter
- Storage paths resolve via workspace context
- Multi-project isolation (workspace A agents ≠ workspace B agents)
- Enables git-based sharing (sessions checked into repo)

**Migration Path**: Phase 4 will migrate from old localStorage + legacy paths to workspace-scoped storage. Plan for data migration tooling.

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Critical | 2 (PL-01, PL-02) |
| High | 2 (PL-03, PL-09) |
| Medium | 1 (PL-04) |
| Gotchas | 3 (PL-05, PL-06, PL-12) |
| Decisions | 2 (PL-07, PL-10) |
| Insights | 2 (PL-08, PL-11) |
| Migration | 2 (PL-13, PL-15) |
| TypeScript | 1 (PL-14) |
| **Total** | **15** |

## Application to Agent System Refactor

**Must Have**:
1. Storage-first event persistence (PL-01)
2. Atomic schema updates across layers (PL-02)
3. Path traversal validation (PL-09)
4. Workspace-scoped storage (PL-15)

**Should Have**:
5. Provider-specific format normalization (PL-03)
6. Dual-layer testing with contract parity (PL-11)
7. SSE notification-fetch pattern (PL-10)
8. Timestamp-based event IDs (PL-08)

**Be Aware Of**:
9. Session destruction races (PL-04)
10. Browser API detection patterns (PL-05, PL-06)
11. Event handler registration timing (PL-12)
12. Schema migration support (PL-13)
13. TypeScript union type patterns (PL-14)
14. NDJSON corruption resilience (PL-07)

