# Agent Workspace Data Model Migration Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-28
**Spec**: [agents-workspace-data-model-spec.md](./agents-workspace-data-model-spec.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests](#phase-1-agentsession-entity--agentsessionadapter--contract-tests)
   - [Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage)](#phase-2-agenteventadapter-workspace-scoped-event-storage)
   - [Phase 3: Web UI Integration (Workspace-Scoped Agents Page)](#phase-3-web-ui-integration-workspace-scoped-agents-page)
   - [Phase 4: Migration Tool + Documentation](#phase-4-migration-tool--documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)
10. [Appendix A: Anchor Naming Conventions](#appendix-a-anchor-naming-conventions)
11. [Appendix B: Graph Traversal Guide](#appendix-b-graph-traversal-guide)

---

## Executive Summary

**Problem**: Agent sessions are currently stored in a non-standard path (`.chainglass/workspaces/default/data/`) and rely on localStorage for session metadata. This doesn't align with ADR-0008's split storage architecture where domain data lives in `<worktree>/.chainglass/data/`. 

**Solution**: Migrate agent session storage to follow the workspace data model established in Plan 014. Agent sessions will be stored per-worktree at `<worktree>/.chainglass/data/agents/` following the Sample exemplar pattern. The web UI will integrate agents into workspace navigation, allowing users to view agent sessions scoped to their selected workspace/worktree.

**Expected Outcomes**:
- Agent sessions are workspace-scoped (different projects have different sessions)
- Session data can be git-committed for team sharing/debugging (with optional gitignore)
- Consistent patterns across all domains (samples, agents, future prompts)
- Cross-machine session resumption via git clone/pull
- Server-side session metadata replaces localStorage

**Success Metrics**:
- All acceptance criteria (AC-01 through AC-24) verified
- 100% contract test parity between Fake and Real adapters
- Zero breaking changes to existing Plan 015 features (SSE, tool call cards)
- Migration tool successfully moves existing sessions to new location

---

## Technical Context

### Current System State

**Plan 014 Infrastructure** (Complete):
- Global registry at `~/.config/chainglass/workspaces.json`
- Per-worktree data at `<worktree>/.chainglass/data/<domain>/`
- WorkspaceDataAdapterBase provides path management and I/O utilities
- Sample domain exemplar demonstrates full adapter/service/entity pattern

**Plan 015 Agent Architecture** (Implemented):
- Storage: `<cwd>/.chainglass/workspaces/default/data/<sessionId>/events.ndjson`
- Client-side: localStorage for session list (AgentSessionStore)
- Server-side: EventStorageService for event persistence (NDJSON)
- SSE streaming for real-time updates
- Tool call cards for agent activity visualization

### Integration Requirements

**Workspace Context**:
- All adapter methods must accept `WorkspaceContext` as first parameter
- Use `ctx.worktreePath` for storage paths (not `ctx.workspacePath`)
- WorkspaceContext includes: `worktreePath`, `workspaceSlug`, `workspaceName`, `worktreeBranch`, `isMainWorktree`

**EventStorageService Migration**:
- Current: Static `baseDir` constructor parameter
- New: WorkspaceContext-aware path resolution via wrapper adapter
- Maintain NDJSON format and timestamp-based ID generation
- Preserve DYK findings: Path traversal prevention, malformed line skipping

**Web UI Routes**:
- Primary: `/workspaces/[slug]/agents` (workspace-scoped)
- Legacy: `/agents` redirects to first workspace
- Both URL patterns must work with 307 redirect + deprecation period

### Constraints and Limitations

**Architecture Boundaries** (Per Discovery S4-01, S4-02):
- AgentSessionAdapter MUST extend WorkspaceDataAdapterBase
- Services MUST depend on interfaces only (never concrete adapters)
- No circular dependencies between packages
- Adapters live in `packages/workflow`, not `apps/web`

**Security Constraints** (Per Discovery S2-03):
- Session IDs must be validated to prevent path traversal
- Use `validateSessionId()` before any filesystem operation
- Reject `../`, `/`, `\`, `.` in session IDs

**Framework Constraints** (Per Discovery S2-02, S2-05):
- Next.js routes using DI container must have `export const dynamic = 'force-dynamic'`
- Route parameters are Promises in Next.js 16+ (must await)
- EventStorageService is server-only (not browser-compatible)

### Assumptions

1. Plan 014 workspace infrastructure is complete and stable
2. WorkspaceContext and WorkspaceDataAdapterBase are available and tested
3. Users have at least one workspace registered before creating agent sessions
4. Existing sessions in old path can be migrated with user confirmation

---

## Critical Research Findings

### 🚨 Critical Discoveries (Impact: Critical)

#### Discovery 01: WorkspaceDataAdapterBase Pattern - Foundation for All Domain Adapters
**Sources**: [S1-01] (Pattern Analyst)  
**Problem**: AgentSessionAdapter must extend WorkspaceDataAdapterBase to inherit workspace-aware path management, I/O utilities, and error handling.  
**Root Cause**: All per-worktree domain adapters follow this pattern (established by Sample exemplar in Plan 014). Diverging creates inconsistency and maintenance burden.  
**Solution**: Extend `WorkspaceDataAdapterBase`, set `domain = 'agents'`, use inherited methods:
- `getDomainPath(ctx)` → `<worktreePath>/.chainglass/data/agents/`
- `getEntityPath(ctx, slug)` → entity file path
- `ensureStructure(ctx)` → directory creation with error handling
- `readJson<T>()`, `writeJson<T>()`, `listEntityFiles()`, `deleteFile()` → I/O operations

**Example**:
```typescript
// ✅ CORRECT - Extends base class, follows Sample pattern
export class AgentSessionAdapter extends WorkspaceDataAdapterBase implements IAgentSessionAdapter {
  readonly domain = 'agents';
  
  async save(ctx: WorkspaceContext, session: AgentSession): Promise<AgentSessionSaveResult> {
    const path = this.getEntityPath(ctx, session.id);
    const result = await this.writeJson(path, session.toJSON());
    if (!result.ok) {
      return { ok: false, errorCode: 'E091', errorMessage: result.error };
    }
    return { ok: true, created: !await this.exists(ctx, session.id) };
  }
}
```
**Affects Phases**: Phase 1 (entity/adapter implementation)

---

#### Discovery 02: WorkspaceContext - Runtime Context Required in All Adapter Methods
**Sources**: [S1-02] (Pattern Analyst)  
**Problem**: AgentSessionAdapter methods must accept `WorkspaceContext` as first parameter to enable multi-workspace support.  
**Root Cause**: WorkspaceContext provides `worktreePath` (storage location), `workspaceSlug` (URL routing), `workspaceName` (display), and git metadata.  
**Solution**: All public adapter methods signature: `method(ctx: WorkspaceContext, ...args)`  
**Example**:
```typescript
// ✅ CORRECT - WorkspaceContext first parameter
interface IAgentSessionAdapter {
  save(ctx: WorkspaceContext, session: AgentSession): Promise<AgentSessionSaveResult>;
  load(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession | null>;
  list(ctx: WorkspaceContext): Promise<AgentSession[]>;
  remove(ctx: WorkspaceContext, sessionId: string): Promise<void>;
  exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean>;
}
```
**Affects Phases**: Phase 1 (interface definition), Phase 2 (event adapter), Phase 3 (web integration)

---

#### Discovery 03: EventStorageService Cannot Run in Browser Context
**Sources**: [S2-01] (Technical Investigator)  
**Problem**: EventStorageService uses Node.js `fs/promises` API, not browser-compatible. Exporting from `@chainglass/shared` creates bundle bloat if mistakenly imported client-side.  
**Root Cause**: Shared package mixes server-only code with client code; no clear API boundaries.  
**Solution**: 
- Export EventStorageService only from server entry point (`packages/shared/src/index.server.ts`)
- Use conditional exports in `package.json` with `"exports.server"` condition
- Client imports use `/index.js`; server-only imports use `/index.server.js`

**Example**:
```typescript
// ✅ CORRECT - Explicit server-only import
// In server route handler:
import { EventStorageService } from '@chainglass/shared/server';
```
**Affects Phases**: Phase 2 (event adapter implementation), Phase 3 (web route handlers)

---

#### Discovery 04: Next.js Dynamic Rendering Required for DI Container Access
**Sources**: [S2-02] (Technical Investigator)  
**Problem**: Route handlers using `getContainer()` must have `export const dynamic = 'force-dynamic'`. Without it, Next.js statically optimizes the route and container is never initialized.  
**Root Cause**: Next.js static optimization runs routes at build time without request context. DI container initialization requires runtime (config loading, file access).  
**Solution**: Add `export const dynamic = 'force-dynamic'` to every agent route that calls `getContainer()`, `getBootstrapSingleton()`, or `getConfig()`.  
**Example**:
```typescript
// ✅ CORRECT - Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const container = getContainer(); // Initialized on each request
  const service = container.resolve(WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE);
  // ...
}
```
**Affects Phases**: Phase 3 (web route handlers)

---

#### Discovery 05: Session ID Validation Must Prevent Path Traversal Attacks
**Sources**: [S2-03] (Technical Investigator)  
**Problem**: EventStorageService constructs filesystem paths using user-provided `sessionId`. Without validation, attackers can use `../` to escape intended directory.  
**Root Cause**: No input validation before path construction. Path traversal patterns not sanitized.  
**Solution**: Always validate sessionId using `validateSessionId()` before any filesystem operation. Validator rejects:
- Forward/backward slashes (`/`, `\`)
- Parent directory references (`..`)
- Current directory (`.`)
- Whitespace, strings longer than 255 chars
- Any character not in `[a-zA-Z0-9_-]`

**Example**:
```typescript
// ✅ CORRECT - Validation prevents traversal
async append(sessionId: string, event: AgentEvent) {
  validateSessionId(sessionId); // Throws if invalid
  const path = join(baseDir, sessionId, 'events.ndjson');
  await fs.appendFile(path, JSON.stringify(event));
}
```
**Affects Phases**: Phase 1 (entity validation), Phase 2 (event adapter), Phase 3 (API routes)

---

#### Discovery 06: Service → Adapter Dependency Flow Inversion (Clean Architecture)
**Sources**: [S4-02] (Dependency Mapper)  
**Problem**: Services MUST depend on interfaces, never concrete adapters. Breaking this causes tight coupling and prevents test isolation.  
**Root Cause**: Clean architecture principle - services own business logic, adapters own technical details.  
**Solution**: 
- AgentSessionService depends on `IAgentSessionAdapter` interface
- DI container binds interface to concrete adapter via `useFactory`
- Never import adapters directly in service files

**Example**:
```typescript
// ✅ CORRECT - Service imports interface only
import type { IAgentSessionAdapter } from '../interfaces/agent-session-adapter.interface';
export class AgentSessionService {
  constructor(private adapter: IAgentSessionAdapter) {}
}
```
**Affects Phases**: Phase 1 (service layer), Phase 3 (DI container registration)

---

### ⚠️ High Impact Discoveries

#### Discovery 07: Error Code Allocation E090-E099 for Agents Domain
**Sources**: [S1-03] (Pattern Analyst)  
**Problem**: Agent operations need structured error codes for consistent error handling and user guidance.  
**Root Cause**: Error codes are pre-allocated by domain. E082-E089 used by Sample, E090-E099 reserved for agents.  
**Solution**: Create `packages/workflow/src/errors/agent-errors.ts` with:
- `E090: AGENT_SESSION_NOT_FOUND`
- `E091: AGENT_SESSION_EXISTS`
- `E092: INVALID_AGENT_SESSION_DATA`
- `E093: AGENT_EVENT_NOT_FOUND`
- E094-E099: Reserved for future agent errors

**Action Required**: Define error classes matching Sample pattern (NotFound, Exists, InvalidData).  
**Affects Phases**: Phase 1 (error handling)

---

#### Discovery 08: Fake Pattern - Three-Part API for Complete Test Control
**Sources**: [S1-04] (Pattern Analyst)  
**Problem**: Fake implementations must pass identical contract tests as real adapters. Incomplete fake causes test/production divergence.  
**Root Cause**: Fakes are test doubles that enable service layer testing without I/O. Must mirror real adapter behavior exactly.  
**Solution**: Implement three-part API:
1. **State Setup**: `addSession(ctx, session)`, `getSessions(ctx)` for test data initialization
2. **Call Inspection**: `saveCalls`, `loadCalls`, `listCalls`, `removeCalls` (immutable getter arrays)
3. **Error Injection**: `injectSaveError`, `injectLoadError` properties for testing error paths

Plus: `reset()` method for test isolation.  
**Action Required**: Copy FakeSampleAdapter pattern (~250 lines) into FakeAgentSessionAdapter, adapt field names.  
**Affects Phases**: Phase 1 (fake implementation and contract tests)

---

#### Discovery 09: Contract Test Pattern - Ensuring Fake ↔ Real Parity
**Sources**: [S1-05] (Pattern Analyst)  
**Problem**: Contract tests must run against BOTH fake and real implementations to prevent "fake drift".  
**Root Cause**: Tests using only fake can pass while real adapter fails in production.  
**Solution**: 
1. Create contract factory function: `agentSessionAdapterContractTests(createContext)`
2. Test both implementations: `AgentAdapter (real)` and `FakeAgentAdapter`
3. Both must pass identical tests

**Example**:
```typescript
// Contract test factory
export function agentSessionAdapterContractTests(createContext: () => AdapterTestContext) {
  describe(`${createContext().name} implements IAgentSessionAdapter contract`, () => {
    it('should save agent and return ok=true with created flag', async () => {
      const result = await ctx.adapter.save(ctx.ctx, AGENT_1);
      expect(result.ok).toBe(true);
      expect(result.created).toBeDefined();
    });
  });
}
```
**Affects Phases**: Phase 1 (contract test suite)

---

#### Discovery 10: NDJSON Parsing Must Silently Skip Malformed Lines
**Sources**: [S2-04] (Technical Investigator)  
**Problem**: If a single NDJSON line is corrupted, `JSON.parse()` throws and entire `getAll()` fails. Breaks session history loading.  
**Root Cause**: NDJSON format means newline-delimited JSON. One corrupted line shouldn't break entire file.  
**Solution**: Wrap `JSON.parse()` in try-catch within line-parsing loop. Skip malformed lines, log warning, continue with valid lines (per DYK-04 from Plan 015).  
**Example**:
```typescript
// ✅ CORRECT - Skip malformed, continue with valid lines
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue; // Skip empty lines
  try {
    events.push(JSON.parse(trimmed));
  } catch {
    // Per DYK-04: Silently skip, could log warning
    console.warn(`Skipped malformed NDJSON line: ${line.substring(0, 100)}`);
  }
}
```
**Affects Phases**: Phase 2 (event adapter maintains existing behavior)

---

#### Discovery 11: Next.js Route Parameters Are Promises (Must Await)
**Sources**: [S2-05] (Technical Investigator)  
**Problem**: Next.js 16+ changed params to be async. Not awaiting returns undefined or causes type errors.  
**Root Cause**: Next.js 16+ supports streaming/partial rendering; params are now async.  
**Solution**: Always `await` params Promise before accessing properties.  
**Example**:
```typescript
// ✅ CORRECT - Await params first
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params; // Properly resolves
}
```
**Affects Phases**: Phase 3 (web route handlers)

---

#### Discovery 12: Workspace Selection - No Singleton Default (Migration Challenge)
**Sources**: [S3-01] (Specification Analyst)  
**Problem**: Existing localStorage sessions have no workspace association. Migration cannot infer which workspace they belong to.  
**Root Cause**: Old sessions stored as `{ id, type, status }` with no `workspaceId` field.  
**Solution**: Provide CLI migration tool `cg agent migrate --from-workspace <slug>` showing old session list with user confirmation. Prevents silent data loss.  
**Affects Phases**: Phase 4 (migration tool)

---

#### Discovery 13: Hard Delete - No Archive (Permanent Data Loss Risk)
**Sources**: [S3-02] (Specification Analyst)  
**Problem**: Agent sessions are permanently deleted (no archive). If user mistakenly deletes, data is gone.  
**Root Cause**: Per AC-14 and Clarification Q7, hard delete is intentional (agent sessions are per-machine, not shared).  
**Solution**: Keep hard delete BUT require confirmation + show size impact in UI. Add UX safeguard:
1. Show session size in delete dialog
2. Require explicit confirmation
3. Display "This cannot be undone" warning

**Affects Phases**: Phase 3 (web UI delete flow)

---

#### Discovery 14: DI Container Pattern - useFactory for Registration
**Sources**: [S1-07] (Pattern Analyst), [S4-08] (Dependency Mapper)  
**Problem**: TSyringe registration must use explicit `useFactory` pattern (no decorators).  
**Root Cause**: Decorators don't survive React Server Component compilation.  
**Solution**: 
- Register tokens in `WORKSPACE_DI_TOKENS` (`packages/shared/src/di-tokens.ts`)
- Use `useFactory` callbacks with explicit dependency resolution
- Register in both workflow container and web container

**Example**:
```typescript
childContainer.register<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER, {
  useFactory: (c) =>
    new AgentSessionAdapter(
      c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
      c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
    ),
});
```
**Affects Phases**: Phase 1 (DI token definition), Phase 3 (DI container registration)

---

#### Discovery 15: URL Routing - Both `/agents` and `/workspaces/[slug]/agents` Must Work
**Sources**: [S3-06] (Specification Analyst)  
**Problem**: Need both URL patterns. Current `/agents` uses localStorage; new pattern is workspace-aware.  
**Root Cause**: Per AC-15/AC-16 and Clarification Q5, both routes required for backward compatibility.  
**Solution**: Use 307 redirect from `/agents` → `/workspaces/[first-workspace]/agents` with console.warn deprecation notice. After 1 plan cycle, remove old route.  
**Example**:
```typescript
// In /agents/page.tsx
export default function AgentsPage() {
  useEffect(() => {
    const redirect = async () => {
      const workspaces = await fetchWorkspaces();
      if (workspaces.length === 0) return <NoWorkspaceError />;
      
      console.warn('[Deprecation] /agents is deprecated. Use /workspaces/[slug]/agents');
      router.push(`/workspaces/${workspaces[0].slug}/agents`);
    };
    redirect();
  }, []);
}
```
**Affects Phases**: Phase 3 (web routing)

---

### 📊 Medium Impact Discoveries

#### Discovery 16: Entity Serialization Pattern (toJSON/fromJSON)
**Sources**: [S4-04] (Dependency Mapper)  
**Problem**: AgentSession must follow Sample entity serialization pattern.  
**Solution**: Implement:
- Private constructor enforcing invariants
- Static `create()` factory method
- `toJSON(): AgentSessionJSON` with camelCase and ISO-8601 dates
- Zod schema in `packages/shared/src/schemas/`

**Affects Phases**: Phase 1 (entity implementation)

---

#### Discovery 17: Gitignore Agent Data - Prevent Event Bloat in Shared Repos
**Sources**: [S3-08] (Specification Analyst)  
**Problem**: Event files can grow large. If committed to git, repo bloats. Sessions are per-machine (no sharing value).  
**Solution**: Create `.chainglass/.gitignore` with `data/agents/` entry. Document in `docs/how/agents/`. Add CLI hint during migration.  
**Affects Phases**: Phase 4 (migration tool + documentation)

---

#### Discovery 18: Concurrent Session Creation - Race Condition on ID Generation
**Sources**: [S3-05] (Specification Analyst)  
**Problem**: Two browser tabs might generate same session ID (millisecond timestamp + random).  
**Solution**: Use timestamp + UUIDv4 short suffix (matches EventStorageService pattern DYK-01). Adapter checks `exists(id)` before write.  
**Example**:
```typescript
function generateSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[-:\.Z]/g, '');
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp.substring(0,14)}-${random}`;
}
```
**Affects Phases**: Phase 1 (entity ID generation)

---

#### Discovery 19: localStorage Sessions Have No Workspace Association
**Sources**: [S3-03] (Specification Analyst)  
**Problem**: Existing browser localStorage entries have no `workspaceId` field. Migration doesn't know which worktree to assign.  
**Solution**: During migration UI, show list of orphaned localStorage sessions; let user drag-select target workspace for each batch. Fallback: assign to first workspace with logged notice.  
**Affects Phases**: Phase 4 (migration tool)

---

#### Discovery 20: Events File Corruption - Malformed NDJSON Recovery
**Sources**: [S3-04] (Specification Analyst)  
**Problem**: EventStorageService silently skips malformed lines. User doesn't know session history is incomplete.  
**Solution**: Keep silent skip BUT add optional logging + UI indicator. Show banner if `eventCount < expectedCount` with "Some events may be missing" message.  
**Affects Phases**: Phase 2 (enhanced error reporting in adapter)

---

### 📦 Integration Points

#### Discovery 21: Web Route → Service → Adapter Layering
**Sources**: [S4-06] (Dependency Mapper)  
**Problem**: Web routes must follow strict layering: Route → Service → Adapter.  
**Solution**: 
- Routes depend on service interfaces only (injected via DI)
- Services resolve adapters from container
- No direct filesystem I/O in routes

**Affects Phases**: Phase 3 (API route implementation)

---

#### Discovery 22: Logging & Error Handling Consistency
**Sources**: [S4-07] (Dependency Mapper)  
**Problem**: All services must use consistent logging and error handling patterns.  
**Solution**: 
- Inject `ILogger` in adapter constructors
- Use `EntityNotFoundError` for missing entities
- Validate `sessionId` using `validateSessionId()`
- Reserve error codes E090-E099

**Affects Phases**: Phase 1 (error handling), Phase 2 (event adapter logging)

---

### Summary Statistics

- **Total Discoveries**: 22 (deduplicated from 32 raw findings across 4 subagents)
- **Critical**: 6 discoveries (WorkspaceDataAdapterBase, WorkspaceContext, browser incompatibility, DI rendering, path traversal, dependency inversion)
- **High**: 9 discoveries (error codes, fake API, contract tests, NDJSON parsing, async params, workspace selection, hard delete, DI factories, routing)
- **Medium**: 7 discoveries (entity serialization, gitignore, race conditions, localStorage migration, corruption recovery, web layering, logging)
- **Deduplication Log**: Merged S1-06 + S4-05 (EventStorageService migration), S1-08 + S4-06 (web integration points)

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Full TDD (Test-Driven Development)  
**Rationale**: Following Plan 014 Sample exemplar pattern; all logic must be testable without UI  
**Focus Areas**:
- AgentSession entity creation and serialization
- AgentSessionAdapter contract compliance (FakeAgentSessionAdapter ↔ AgentSessionAdapter)
- AgentEventAdapter refactored with WorkspaceContext
- Service layer business logic (session CRUD, event operations)
- Error handling paths (E090-E099 error codes)
- Migration tool correctness

**Excluded**:
- UI component visual testing (rely on type safety and manual verification)
- SSE streaming (already tested in Plan 015)

### Test-Driven Development

**MUST**: Follow RED-GREEN-REFACTOR cycle for all implementation work:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Mock Usage: Fakes Only (No vi.mock per R-TEST-007)

**MUST** use full fake implementations that implement interfaces:
- NO `vi.mock()`, `jest.mock()`, `vi.spyOn()`, Sinon stubs
- YES `FakeAgentSessionAdapter`, `FakeAgentEventAdapter` with test helper methods
- MUST provide three-part API: State Setup, State Inspection, Error Injection
- MUST run contract tests against both fake and real implementations

### Test Documentation

Every test MUST include a Test Doc comment with 5 required fields:

```typescript
it('should save agent session and return ok=true', async () => {
  /*
  Test Doc:
  - Why: Verify adapter persists session data correctly
  - Contract: save(ctx, session) → { ok: true, created: boolean }
  - Usage Notes: Use FakeAgentSessionAdapter.addSession() for test setup
  - Quality Contribution: Catches filesystem I/O errors and data corruption
  - Worked Example: save(ctx, { id: 'abc' }) → { ok: true, created: true }
  */
  // test implementation
});
```

### Contract Tests for Interface Compliance

**MUST**: All interface implementations (fakes AND adapters) pass shared contract tests:

```typescript
export function agentSessionAdapterContractTests(name: string, createAdapter: () => IAgentSessionAdapter) {
  describe(`${name} implements IAgentSessionAdapter contract`, () => {
    it('should save agent session', () => {
      const adapter = createAdapter();
      const result = await adapter.save(ctx, session);
      expect(result.ok).toBe(true);
    });
  });
}

// Run for BOTH implementations
agentSessionAdapterContractTests('FakeAgentSessionAdapter', () => new FakeAgentSessionAdapter());
agentSessionAdapterContractTests('AgentSessionAdapter', () => new AgentSessionAdapter(fs, pathResolver));
```

---

## Implementation Phases


### Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests

**Objective**: Create the foundational AgentSession entity, adapter, and fake following the Sample exemplar pattern with comprehensive TDD coverage.

**Deliverables**:
- `AgentSession` entity with toJSON/fromJSON serialization
- `IAgentSessionAdapter` interface
- `AgentSessionAdapter` extending WorkspaceDataAdapterBase
- `FakeAgentSessionAdapter` with three-part API
- Contract test suite verifying fake-real parity
- Error classes (E090-E093)
- Zod schemas for validation
- DI token definitions

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fake drift (fake/real behavior mismatch) | Medium | High | Contract tests run against both; fail fast if diverge |
| Path traversal vulnerability | Low | Critical | Use validateSessionId() in all I/O paths |
| WorkspaceContext integration errors | Low | High | Reference Sample adapter tests for correct usage |

### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Write interface for IAgentSessionAdapter | 1 | Interface defines: save, load, list, remove, exists methods with WorkspaceContext | - | packages/workflow/src/interfaces/agent-session-adapter.interface.ts |
| 1.2 | [x] | Write Zod schema for AgentSession | 1 | Schema validates: id, type ('claude'\|'copilot'), status, createdAt, updatedAt | - | packages/shared/src/schemas/agent-session.schema.ts |
| 1.3 | [x] | Write tests for AgentSession entity | 2 | Tests cover: create(), toJSON(), fromJSON(), validation, invariants | - | test/unit/workflow/agent-session.entity.test.ts |
| 1.4 | [x] | Implement AgentSession entity | 2 | Entity has: private constructor, static create(), toJSON() with ISO dates | - | packages/workflow/src/entities/agent-session.ts |
| 1.5 | [x] | Write error classes (E090-E093) | 1 | Errors defined: AgentSessionNotFound, AgentSessionExists, InvalidData, EventNotFound | - | packages/workflow/src/errors/agent-errors.ts |
| 1.6 | [x] | Write contract tests for IAgentSessionAdapter | 3 | Contract test factory function with 12+ test cases covering all methods | - | test/contracts/agent-session-adapter.contract.ts |
| 1.7 | [x] | Write FakeAgentSessionAdapter with three-part API | 3 | Fake has: State Setup (addSession), Call Inspection (saveCalls), Error Injection (injectSaveError), reset() | - | packages/workflow/src/fakes/fake-agent-session-adapter.ts |
| 1.8 | [x] | Run contract tests against FakeAgentSessionAdapter | 1 | All contract tests pass for fake implementation | - | test/contracts/agent-session-adapter.contract.test.ts |
| 1.9 | [x] | Write unit tests for AgentSessionAdapter | 2 | Tests cover: save, load, list, remove, exists with WorkspaceContext | - | Covered by contract tests (same tests for fake+real) |
| 1.10 | [x] | Implement AgentSessionAdapter extending WorkspaceDataAdapterBase | 3 | Adapter has: domain='agents', uses getEntityPath(), writeJson(), readJson() | - | packages/workflow/src/adapters/agent-session.adapter.ts |
| 1.11 | [x] | Run contract tests against AgentSessionAdapter | 1 | All contract tests pass for real implementation (same tests as fake) | - | Verify fake-real parity |
| 1.12 | [x] | Add agent DI tokens to WORKSPACE_DI_TOKENS | 1 | Tokens defined: AGENT_SESSION_ADAPTER, AGENT_SESSION_SERVICE, AGENT_EVENT_ADAPTER | - | packages/shared/src/di-tokens.ts |
| 1.13 | [x] | Write AgentSessionService tests using fake | 2 | Service tests use FakeAgentSessionAdapter; verify business logic | - | test/unit/workflow/agent-session-service.test.ts |
| 1.14 | [x] | Implement AgentSessionService | 2 | Service depends on IAgentSessionAdapter interface; implements CRUD operations | - | packages/workflow/src/services/agent-session.service.ts |
| 1.15 | [x] | Register adapters in workflow DI container | 1 | Production container uses AgentSessionAdapter; test container uses FakeAgentSessionAdapter | - | packages/workflow/src/container.ts |
| 1.16 | [x] | Verify all tests pass (unit + contract) | 1 | Run `pnpm test packages/workflow`; 100% pass rate | - | Integration checkpoint |

### Test Examples (Write First!)

```typescript
// Contract test example
export function agentSessionAdapterContractTests(createContext: () => AgentSessionAdapterTestContext) {
  let ctx: AgentSessionAdapterTestContext;
  
  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });
  
  describe(`${createContext().name} implements IAgentSessionAdapter contract`, () => {
    describe('save() contract', () => {
      it('should save new session and return created=true', async () => {
        /*
        Test Doc:
        - Why: Proves adapter correctly persists new session data
        - Contract: save(ctx, session) → { ok: true, created: true }
        - Usage Notes: Adapter writes to <worktreePath>/.chainglass/data/agents/<id>.json
        - Quality Contribution: Catches filesystem I/O errors and data corruption
        - Worked Example: save(ctx, {id:'abc'}) → {ok:true, created:true}
        */
        const session = AgentSession.create({
          id: 'test-session-1',
          type: 'claude',
          status: 'active',
          createdAt: new Date(),
        });
        
        const result = await ctx.adapter.save(ctx.ctx, session);
        
        expect(result.ok).toBe(true);
        expect(result.created).toBe(true);
      });
      
      it('should update existing session and return created=false', async () => {
        /*
        Test Doc:
        - Why: Ensures adapter distinguishes between create vs update
        - Contract: save(ctx, existingSession) → { ok: true, created: false }
        - Quality Contribution: Prevents duplicate session creation
        */
        // Pre-existing session
        const session = AgentSession.create({ id: 'existing', type: 'copilot', status: 'active', createdAt: new Date() });
        await ctx.adapter.save(ctx.ctx, session);
        
        // Update same session
        const updated = AgentSession.create({ ...session.toJSON(), status: 'completed' });
        const result = await ctx.adapter.save(ctx.ctx, updated);
        
        expect(result.ok).toBe(true);
        expect(result.created).toBe(false);
      });
    });
    
    describe('load() contract', () => {
      it('should return session when exists', async () => {
        /*
        Test Doc:
        - Why: Verifies adapter can retrieve persisted sessions
        - Contract: load(ctx, id) → AgentSession when exists
        - Quality Contribution: Catches deserialization bugs
        */
        const session = AgentSession.create({ id: 'load-test', type: 'claude', status: 'active', createdAt: new Date() });
        await ctx.adapter.save(ctx.ctx, session);
        
        const loaded = await ctx.adapter.load(ctx.ctx, 'load-test');
        
        expect(loaded).not.toBeNull();
        expect(loaded!.id).toBe('load-test');
        expect(loaded!.type).toBe('claude');
      });
      
      it('should return null when session not found', async () => {
        /*
        Test Doc:
        - Why: Ensures adapter handles missing sessions gracefully
        - Contract: load(ctx, unknownId) → null (not throw)
        - Quality Contribution: Prevents crashes on missing data
        */
        const loaded = await ctx.adapter.load(ctx.ctx, 'nonexistent');
        
        expect(loaded).toBeNull();
      });
    });
    
    describe('list() contract', () => {
      it('should return all sessions in workspace', async () => {
        /*
        Test Doc:
        - Why: Proves adapter correctly scopes sessions to workspace
        - Contract: list(ctx) → AgentSession[] for this workspace only
        - Quality Contribution: Prevents cross-workspace data leakage
        */
        const session1 = AgentSession.create({ id: 's1', type: 'claude', status: 'active', createdAt: new Date() });
        const session2 = AgentSession.create({ id: 's2', type: 'copilot', status: 'completed', createdAt: new Date() });
        
        await ctx.adapter.save(ctx.ctx, session1);
        await ctx.adapter.save(ctx.ctx, session2);
        
        const sessions = await ctx.adapter.list(ctx.ctx);
        
        expect(sessions).toHaveLength(2);
        expect(sessions.map(s => s.id)).toContain('s1');
        expect(sessions.map(s => s.id)).toContain('s2');
      });
      
      it('should return empty array when no sessions exist', async () => {
        /*
        Test Doc:
        - Why: Handles empty workspace gracefully
        - Contract: list(ctx) → [] when no data
        - Quality Contribution: Prevents undefined errors in UI
        */
        const sessions = await ctx.adapter.list(ctx.ctx);
        
        expect(sessions).toEqual([]);
      });
    });
    
    describe('remove() contract', () => {
      it('should delete session file permanently', async () => {
        /*
        Test Doc:
        - Why: Verifies hard delete implementation (per AC-14)
        - Contract: remove(ctx, id) → deletes file, no archive
        - Quality Contribution: Ensures data cleanup on delete
        */
        const session = AgentSession.create({ id: 'delete-test', type: 'claude', status: 'active', createdAt: new Date() });
        await ctx.adapter.save(ctx.ctx, session);
        
        await ctx.adapter.remove(ctx.ctx, 'delete-test');
        
        const exists = await ctx.adapter.exists(ctx.ctx, 'delete-test');
        expect(exists).toBe(false);
      });
      
      it('should not throw when removing nonexistent session', async () => {
        /*
        Test Doc:
        - Why: Idempotent delete prevents double-delete errors
        - Contract: remove(ctx, unknownId) → silent success
        - Quality Contribution: Handles race conditions gracefully
        */
        await expect(ctx.adapter.remove(ctx.ctx, 'nonexistent')).resolves.not.toThrow();
      });
    });
    
    describe('exists() contract', () => {
      it('should return true when session exists', async () => {
        const session = AgentSession.create({ id: 'exists-test', type: 'claude', status: 'active', createdAt: new Date() });
        await ctx.adapter.save(ctx.ctx, session);
        
        const exists = await ctx.adapter.exists(ctx.ctx, 'exists-test');
        
        expect(exists).toBe(true);
      });
      
      it('should return false when session does not exist', async () => {
        const exists = await ctx.adapter.exists(ctx.ctx, 'nonexistent');
        
        expect(exists).toBe(false);
      });
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] Invalid session ID (path traversal attempt)
- [ ] Workspace directory not writable
- [ ] Concurrent save operations
- [ ] Malformed JSON in session file
- [ ] Session file deleted during read

### Acceptance Criteria
- [ ] All tests passing (50+ tests across unit + contract)
- [ ] Contract tests pass for BOTH fake and real implementations
- [ ] No vi.mock() usage (fakes only per R-TEST-007)
- [ ] Test coverage > 90% for new code
- [ ] All errors use E090-E093 codes
- [ ] Session IDs validated with `validateSessionId()`
- [ ] Entity serialization uses camelCase + ISO-8601 dates
- [ ] Adapters extend WorkspaceDataAdapterBase
- [ ] DI tokens registered in WORKSPACE_DI_TOKENS

---

### Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage)

**Objective**: Refactor EventStorageService to be workspace-aware via AgentEventAdapter wrapper, maintaining NDJSON format and existing DYK behaviors.

**Deliverables**:
- `IAgentEventAdapter` interface (workspace-aware event operations)
- `AgentEventAdapter` wrapping EventStorageService with WorkspaceContext
- Updated event storage paths: `<worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson`
- Tests verifying workspace isolation
- Integration with existing SSE broadcast

**Dependencies**: Phase 1 complete (AgentSession entity available)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing Plan 015 SSE features | Medium | High | Integration tests verify SSE still works; no API changes to EventStorageService |
| NDJSON parsing regression | Low | Medium | Maintain DYK-04 behavior (skip malformed lines) |
| Workspace path resolution errors | Low | High | Reuse WorkspaceDataAdapterBase patterns |

### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write interface for IAgentEventAdapter | 1 | Interface defines: append, getAll, getSince, archive, exists with WorkspaceContext | - | packages/workflow/src/interfaces/agent-event-adapter.interface.ts |
| 2.2 | [ ] | Write tests for AgentEventAdapter with WorkspaceContext | 2 | Tests cover: workspace-scoped paths, NDJSON format preserved, DYK-04 behavior | - | test/unit/workflow/agent-event-adapter.test.ts |
| 2.3 | [ ] | Implement AgentEventAdapter wrapping EventStorageService | 3 | Adapter accepts WorkspaceContext, constructs baseDir per workspace, delegates to EventStorageService | - | packages/workflow/src/adapters/agent-event.adapter.ts |
| 2.4 | [ ] | Write integration tests for workspace isolation | 2 | Tests verify: events in workspace A don't appear in workspace B queries | - | test/integration/workspace-agent-isolation.test.ts |
| 2.5 | [ ] | Write tests for event ID generation (timestamp-based) | 1 | Tests verify: generateEventId() format matches DYK-01 pattern | - | Reuse existing EventStorageService tests |
| 2.6 | [ ] | Write tests for session ID validation in append() | 1 | Tests verify: validateSessionId() called before filesystem operations | - | Per Discovery 05 |
| 2.7 | [ ] | Update EventStorageService to export from server-only entry point | 1 | Service exported from `packages/shared/src/index.server.ts` not `index.ts` | - | packages/shared/src/index.server.ts |
| 2.8 | [ ] | Write tests for NDJSON malformed line handling | 2 | Tests verify: corrupted lines skipped per DYK-04, valid lines parsed | - | Per Discovery 10 |
| 2.9 | [ ] | Add optional logging to malformed line skipping | 1 | Logger.warn() called when skipping malformed line (if logger injected) | - | Per Discovery 20 |
| 2.10 | [ ] | Write FakeAgentEventAdapter for service testing | 2 | Fake has: State Setup (addEvent), Call Inspection (appendCalls), Error Injection, reset() | - | packages/workflow/src/fakes/fake-agent-event-adapter.ts |
| 2.11 | [ ] | Register AgentEventAdapter in workflow DI container | 1 | Production container uses AgentEventAdapter; test container uses FakeAgentEventAdapter | - | packages/workflow/src/container.ts |
| 2.12 | [ ] | Verify SSE integration still works with new paths | 2 | Integration test: append event, broadcast via SSE, client receives notification | - | Regression test for Plan 015 functionality |
| 2.13 | [ ] | Verify all tests pass (unit + integration) | 1 | Run `pnpm test packages/workflow packages/shared`; 100% pass rate | - | Integration checkpoint |

### Test Examples (Write First!)

```typescript
describe('AgentEventAdapter with WorkspaceContext', () => {
  let adapter: AgentEventAdapter;
  let ctx: WorkspaceContext;
  let fs: IFileSystem;
  let pathResolver: IPathResolver;
  
  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new PathResolver();
    adapter = new AgentEventAdapter(fs, pathResolver);
    ctx = createMockWorkspaceContext({
      worktreePath: '/home/user/project',
      workspaceSlug: 'test-workspace',
    });
  });
  
  it('should store events in workspace-scoped directory', async () => {
    /*
    Test Doc:
    - Why: Proves adapter uses WorkspaceContext for path resolution
    - Contract: append(ctx, sessionId, event) → stores at <worktreePath>/.chainglass/data/agents/<sessionId>/events.ndjson
    - Quality Contribution: Prevents cross-workspace event leakage
    - Worked Example: append(ctx, 's1', event) → writes to /home/user/project/.chainglass/data/agents/s1/events.ndjson
    */
    const event: AgentStoredEvent = {
      type: 'tool_call',
      timestamp: new Date().toISOString(),
      data: { tool: 'test', args: {} },
    };
    
    const stored = await adapter.append(ctx, 'session-123', event);
    
    expect(stored.id).toBeDefined();
    
    // Verify path
    const eventsPath = '/home/user/project/.chainglass/data/agents/session-123/events.ndjson';
    const fileExists = await fs.exists(eventsPath);
    expect(fileExists).toBe(true);
  });
  
  it('should isolate events between workspaces', async () => {
    /*
    Test Doc:
    - Why: Ensures workspace-scoped storage prevents data leakage
    - Contract: Events in workspace A are invisible to workspace B queries
    - Quality Contribution: Catches path resolution bugs that leak data across workspaces
    */
    const ctx1 = createMockWorkspaceContext({ worktreePath: '/workspace-1', workspaceSlug: 'ws1' });
    const ctx2 = createMockWorkspaceContext({ worktreePath: '/workspace-2', workspaceSlug: 'ws2' });
    
    const event1 = { type: 'tool_call', timestamp: new Date().toISOString(), data: { workspace: 1 } };
    const event2 = { type: 'tool_call', timestamp: new Date().toISOString(), data: { workspace: 2 } };
    
    await adapter.append(ctx1, 'session-1', event1);
    await adapter.append(ctx2, 'session-1', event2);
    
    const events1 = await adapter.getAll(ctx1, 'session-1');
    const events2 = await adapter.getAll(ctx2, 'session-1');
    
    expect(events1).toHaveLength(1);
    expect(events1[0].data).toEqual({ workspace: 1 });
    
    expect(events2).toHaveLength(1);
    expect(events2[0].data).toEqual({ workspace: 2 });
  });
  
  it('should skip malformed NDJSON lines per DYK-04', async () => {
    /*
    Test Doc:
    - Why: Maintains DYK-04 resilience behavior from EventStorageService
    - Contract: Malformed lines are skipped silently, valid lines parsed
    - Quality Contribution: Prevents session history load failures on corrupted data
    */
    // Manually write corrupted NDJSON
    const eventsPath = pathResolver.join(ctx.worktreePath, '.chainglass/data/agents/session-corrupted/events.ndjson');
    await fs.mkdir(pathResolver.dirname(eventsPath), { recursive: true });
    await fs.writeFile(eventsPath, [
      '{"id":"1","type":"tool_call"}',
      '{invalid json line',
      '{"id":"2","type":"result"}',
    ].join('\n'));
    
    const events = await adapter.getAll(ctx, 'session-corrupted');
    
    expect(events).toHaveLength(2); // Skipped malformed line
    expect(events[0].id).toBe('1');
    expect(events[1].id).toBe('2');
  });
  
  it('should validate session ID before append to prevent path traversal', async () => {
    /*
    Test Doc:
    - Why: Security constraint per Discovery 05
    - Contract: Invalid sessionId (with ../) throws before filesystem access
    - Quality Contribution: Prevents path traversal attacks
    */
    const maliciousId = '../../../etc/passwd';
    const event = { type: 'tool_call', timestamp: new Date().toISOString(), data: {} };
    
    await expect(adapter.append(ctx, maliciousId, event)).rejects.toThrow(/invalid.*session.*id/i);
  });
});
```

### Non-Happy-Path Coverage
- [ ] NDJSON file with mixed valid/invalid lines
- [ ] Session ID with path traversal attempt
- [ ] Concurrent append operations
- [ ] Events directory not writable
- [ ] Session deleted during getAll()

### Acceptance Criteria
- [ ] All tests passing (30+ tests)
- [ ] No vi.mock() usage (fakes only)
- [ ] Test coverage > 85% for adapter code
- [ ] EventStorageService exported from server-only entry point
- [ ] Workspace isolation verified via integration tests
- [ ] NDJSON format preserved (DYK-04 behavior maintained)
- [ ] Session IDs validated before filesystem operations
- [ ] SSE integration still works (no regressions)
- [ ] Optional logging added for malformed line skipping

---

### Phase 3: Web UI Integration (Workspace-Scoped Agents Page)

**Objective**: Integrate agents into workspace navigation, create workspace-scoped agents pages, migrate AgentSessionStore from localStorage to server-side, and implement API routes with DI container.

**Deliverables**:
- API routes: `/api/workspaces/[slug]/agents`, `/api/workspaces/[slug]/agents/[id]/events`
- Web routes: `/workspaces/[slug]/agents`, `/agents` (with redirect)
- Server-side `sessions.json` replaces localStorage
- Workspace navigation menu includes "Agents" link
- DI container registration in web app
- Delete confirmation dialog (hard delete with size display)

**Dependencies**: Phase 1 and Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Next.js route parameter Promise errors | Medium | Medium | Always await params (per Discovery 11) |
| DI container not initialized | Medium | High | Use `export const dynamic = 'force-dynamic'` (per Discovery 04) |
| localStorage migration data loss | Medium | High | Provide migration UI with user confirmation (per Discovery 12) |

### Tasks (Full TDD Approach)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Register agent adapters/services in web DI container | 2 | Container resolves AGENT_SESSION_ADAPTER, AGENT_SESSION_SERVICE, AGENT_EVENT_ADAPTER using useFactory | - | apps/web/src/lib/di-container.ts |
| 3.2 | [ ] | Write tests for GET /api/workspaces/[slug]/agents | 2 | Tests verify: returns all sessions for workspace, 404 on invalid workspace | - | test/integration/web/agents-api.test.ts |
| 3.3 | [ ] | Implement GET /api/workspaces/[slug]/agents route | 3 | Route has: export const dynamic='force-dynamic', await params, resolve service from container, return JSON | - | apps/web/app/api/workspaces/[slug]/agents/route.ts |
| 3.4 | [ ] | Write tests for POST /api/workspaces/[slug]/agents/[id]/save | 2 | Tests verify: saves session metadata, validates schema, returns ok=true | - | Test workspace-scoped save |
| 3.5 | [ ] | Implement POST /api/workspaces/[slug]/agents/[id]/save route | 3 | Route saves session via AgentSessionService, validates with Zod schema | - | apps/web/app/api/workspaces/[slug]/agents/[id]/save/route.ts |
| 3.6 | [ ] | Write tests for DELETE /api/workspaces/[slug]/agents/[id] | 2 | Tests verify: hard delete (no archive), removes session + events folder | - | Per AC-14 |
| 3.7 | [ ] | Implement DELETE /api/workspaces/[slug]/agents/[id] route | 2 | Route calls adapter.remove(), deletes both session.json and events folder | - | apps/web/app/api/workspaces/[slug]/agents/[id]/route.ts |
| 3.8 | [ ] | Write tests for GET /api/workspaces/[slug]/agents/[id]/events | 2 | Tests verify: returns workspace-scoped events, supports ?since= parameter | - | SSE integration |
| 3.9 | [ ] | Implement GET /api/workspaces/[slug]/agents/[id]/events route | 3 | Route resolves AgentEventAdapter, calls getAll() or getSince(), returns NDJSON events | - | apps/web/app/api/workspaces/[slug]/agents/[id]/events/route.ts |
| 3.10 | [ ] | Refactor AgentSessionStore to use server API (not localStorage) | 3 | Store fetches sessions from /api/workspaces/[slug]/agents, no localStorage reads/writes | - | apps/web/src/lib/stores/agent-session.store.ts |
| 3.11 | [ ] | Create /workspaces/[slug]/agents page component | 3 | Page fetches sessions from server, displays list, handles loading/error states | - | apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx |
| 3.12 | [ ] | Create /workspaces/[slug]/agents/[id] detail page | 2 | Detail page shows session metadata + event stream via SSE | - | apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx |
| 3.13 | [ ] | Implement /agents redirect to first workspace | 2 | Page redirects to /workspaces/[first-slug]/agents with 307 status, logs deprecation warning | - | apps/web/app/(dashboard)/agents/page.tsx |
| 3.14 | [ ] | Add "Agents" link to workspace navigation menu | 1 | Workspace detail page shows "Agents" link, navigates to /workspaces/[slug]/agents | - | apps/web/app/(dashboard)/workspaces/[slug]/page.tsx |
| 3.15 | [ ] | Create delete confirmation dialog component | 2 | Dialog shows: session size, "cannot be undone" warning, requires explicit confirmation | - | apps/web/src/components/agents/delete-session-dialog.tsx |
| 3.16 | [ ] | Wire delete confirmation to delete button | 1 | Delete button opens dialog, confirmation triggers DELETE API call | - | Per Discovery 13 |
| 3.17 | [ ] | Write E2E test for full agent creation flow | 3 | Test creates session in workspace, verifies file exists, deletes session, verifies removal | - | test/e2e/agent-workspace-integration.test.ts |
| 3.18 | [ ] | Verify all web routes work in dev mode | 1 | Start dev server, manually verify: /workspaces/[slug]/agents, /agents redirect, delete flow | - | Manual smoke test |

### Test Examples (Write First!)

```typescript
describe('GET /api/workspaces/[slug]/agents', () => {
  let container: DependencyContainer;
  let fakeAdapter: FakeAgentSessionAdapter;
  
  beforeEach(() => {
    container = createTestContainer();
    fakeAdapter = container.resolve<FakeAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER);
    fakeAdapter.reset();
  });
  
  it('should return all sessions for workspace', async () => {
    /*
    Test Doc:
    - Why: Proves API route correctly scopes sessions to workspace
    - Contract: GET /api/workspaces/my-workspace/agents → sessions for my-workspace only
    - Quality Contribution: Catches cross-workspace data leakage bugs
    - Worked Example: Request to /api/workspaces/ws1/agents → returns sessions from ws1, not ws2
    */
    const ctx = createMockWorkspaceContext({ workspaceSlug: 'my-workspace' });
    const session1 = AgentSession.create({ id: 's1', type: 'claude', status: 'active', createdAt: new Date() });
    const session2 = AgentSession.create({ id: 's2', type: 'copilot', status: 'completed', createdAt: new Date() });
    
    fakeAdapter.addSession(ctx, session1);
    fakeAdapter.addSession(ctx, session2);
    
    const response = await fetch('http://localhost:3000/api/workspaces/my-workspace/agents');
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions.map(s => s.id)).toContain('s1');
    expect(data.sessions.map(s => s.id)).toContain('s2');
  });
  
  it('should return 404 when workspace not found', async () => {
    /*
    Test Doc:
    - Why: Handles invalid workspace slug gracefully per AC-21
    - Contract: GET /api/workspaces/nonexistent/agents → 404 error
    - Quality Contribution: Prevents undefined errors in client
    */
    const response = await fetch('http://localhost:3000/api/workspaces/nonexistent/agents');
    
    expect(response.status).toBe(404);
    
    const data = await response.json();
    expect(data.error).toMatch(/workspace.*not.*found/i);
  });
});

describe('/workspaces/[slug]/agents page', () => {
  it('should display all sessions for workspace', async () => {
    /*
    Test Doc:
    - Why: Verifies UI correctly renders workspace-scoped session list
    - Contract: Page fetches from /api/workspaces/[slug]/agents, displays all sessions
    - Quality Contribution: Catches UI rendering bugs and API integration errors
    */
    render(<AgentsPage params={{ slug: 'test-workspace' }} />);
    
    await waitFor(() => {
      expect(screen.getByText(/session-1/i)).toBeInTheDocument();
      expect(screen.getByText(/session-2/i)).toBeInTheDocument();
    });
  });
  
  it('should show "No workspace" message when no workspaces registered', async () => {
    /*
    Test Doc:
    - Why: Handles AC-20 edge case (no workspace context)
    - Contract: When no workspaces exist, show "Add a workspace to use agents"
    - Quality Contribution: Prevents blank page on first-time users
    */
    // Mock empty workspace list
    mockWorkspaceList([]);
    
    render(<AgentsPage params={{ slug: '' }} />);
    
    await waitFor(() => {
      expect(screen.getByText(/add a workspace to use agents/i)).toBeInTheDocument();
    });
  });
});

describe('Delete session flow', () => {
  it('should show confirmation dialog with session size', async () => {
    /*
    Test Doc:
    - Why: Implements Discovery 13 (hard delete safeguard)
    - Contract: Delete button opens dialog showing size + "cannot be undone" warning
    - Quality Contribution: Prevents accidental data loss
    */
    const session = { id: 'test-session', type: 'claude', size: 2048576 }; // 2MB
    
    render(<SessionList sessions={[session]} />);
    
    const deleteButton = screen.getByText(/delete/i);
    fireEvent.click(deleteButton);
    
    await waitFor(() => {
      expect(screen.getByText(/2\.0 MB/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });
  });
  
  it('should call DELETE API when confirmed', async () => {
    /*
    Test Doc:
    - Why: Verifies hard delete implementation per AC-14
    - Contract: Confirmation triggers DELETE /api/workspaces/[slug]/agents/[id]
    - Quality Contribution: Ensures delete actually removes data
    */
    const mockDelete = vi.fn();
    global.fetch = mockDelete;
    
    render(<DeleteSessionDialog sessionId="test-session" workspaceSlug="ws1" />);
    
    const confirmButton = screen.getByText(/confirm/i);
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        '/api/workspaces/ws1/agents/test-session',
        { method: 'DELETE' }
      );
    });
  });
});
```

### Non-Happy-Path Coverage
- [ ] Workspace slug not found (404 error)
- [ ] No workspaces registered (AC-20)
- [ ] Network error fetching sessions
- [ ] Delete confirmation canceled by user
- [ ] DI container not initialized (missing dynamic='force-dynamic')

### Acceptance Criteria
- [ ] All web tests passing (40+ tests)
- [ ] API routes use `export const dynamic = 'force-dynamic'`
- [ ] Route params awaited before use (Next.js 16+ compatibility)
- [ ] AgentSessionStore no longer uses localStorage
- [ ] Delete flow shows confirmation dialog with size
- [ ] /agents redirects to /workspaces/[first-slug]/agents with 307
- [ ] Agents link visible in workspace navigation
- [ ] E2E test covers full create → view → delete flow
- [ ] No regressions to existing agent features (SSE, tool call cards)

---

### Phase 4: Migration Tool + Documentation

**Objective**: Provide CLI migration tool for existing localStorage sessions, create documentation in `docs/how/agents/`, and configure `.chainglass/.gitignore` for agent data.

**Deliverables**:
- CLI command: `cg agent migrate --workspace <slug>`
- Migration UI for orphaned localStorage sessions
- Documentation in `docs/how/agents/` (numbered structure)
- `.chainglass/.gitignore` template with `data/agents/` entry
- Migration idempotency (safe to run multiple times)

**Dependencies**: Phase 1, 2, 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration data loss | Medium | High | Dry-run mode + user confirmation before move |
| localStorage sessions orphaned | High | Medium | Interactive migration UI shows session list |
| Git history bloat from events | Low | Low | Document gitignore pattern; optional exclusion |

### Tasks (Lightweight Testing Approach for CLI + Documentation)

| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Survey existing docs/how/ directories | 1 | Documented existing structure, identified agents/ as new directory | - | Discovery step |
| 4.2 | [ ] | Create docs/how/agents/1-overview.md | 2 | Introduction, motivation, workspace-scoped sessions, architecture diagram | - | docs/how/agents/1-overview.md |
| 4.3 | [ ] | Create docs/how/agents/2-usage.md | 2 | Step-by-step: create session, view events, delete, workspace selection | - | docs/how/agents/2-usage.md |
| 4.4 | [ ] | Create docs/how/agents/3-migration.md | 2 | Migration guide: CLI tool usage, localStorage → server-side, troubleshooting | - | docs/how/agents/3-migration.md |
| 4.5 | [ ] | Create docs/how/agents/4-gitignore.md | 1 | Gitignore strategy: why exclude agent data, how to configure, team sharing | - | docs/how/agents/4-gitignore.md |
| 4.6 | [ ] | Write tests for migration tool (dry-run mode) | 2 | Tests verify: dry-run lists sessions to migrate, no actual data moved | - | test/unit/cli/agent-migrate.test.ts |
| 4.7 | [ ] | Implement cg agent migrate command | 3 | CLI command has: --workspace flag, --dry-run mode, interactive session selection | - | apps/cli/src/commands/agent-migrate.ts |
| 4.8 | [ ] | Write tests for migration idempotency | 2 | Tests verify: running migrate twice skips already-migrated sessions | - | Per AC-19 |
| 4.9 | [ ] | Implement migration idempotency check | 2 | Migration checks if session already exists in target workspace, skips if found | - | Prevent duplicates |
| 4.10 | [ ] | Write tests for localStorage session detection | 1 | Tests verify: finds sessions in localStorage with no workspace association | - | Per Discovery 19 |
| 4.11 | [ ] | Implement localStorage session parser | 2 | Parses localStorage entries, extracts session metadata, flags orphaned sessions | - | Handle missing workspaceId field |
| 4.12 | [ ] | Create .chainglass/.gitignore template | 1 | Template contains: data/agents/ entry, comments explaining per-machine exclusion | - | .chainglass/.gitignore |
| 4.13 | [ ] | Add gitignore hint to migration CLI output | 1 | After migration, CLI prints: "✓ Add .chainglass/.gitignore to your repo (if not present)" | - | Per Discovery 17 |
| 4.14 | [ ] | Write E2E test for full migration flow | 3 | Test: old session in localStorage → run migration → session appears in workspace → verify file exists | - | test/e2e/agent-migration.test.ts |
| 4.15 | [ ] | Manual testing: run migration on real data | 1 | Migrate actual localStorage sessions from Plan 015 to new structure | - | Validation with real data |
| 4.16 | [ ] | Review documentation for clarity | 1 | Peer review of all docs/how/agents/ files, verify links work | - | Quality check |

### Test Examples

```typescript
describe('cg agent migrate command', () => {
  it('should list sessions to migrate in dry-run mode', async () => {
    /*
    Test Doc:
    - Why: Dry-run provides preview before destructive operation
    - Contract: --dry-run lists sessions, no files moved
    - Quality Contribution: Prevents accidental data loss
    - Worked Example: cg agent migrate --workspace ws1 --dry-run → shows 3 sessions, no move
    */
    // Mock localStorage with 3 sessions
    mockLocalStorage({
      's1': { id: 's1', type: 'claude', status: 'active' },
      's2': { id: 's2', type: 'copilot', status: 'completed' },
      's3': { id: 's3', type: 'claude', status: 'terminated' },
    });
    
    const output = await runCLI(['agent', 'migrate', '--workspace', 'test-ws', '--dry-run']);
    
    expect(output).toContain('Found 3 sessions to migrate');
    expect(output).toContain('s1');
    expect(output).toContain('s2');
    expect(output).toContain('s3');
    expect(output).toContain('(Dry run - no data moved)');
  });
  
  it('should migrate sessions to target workspace', async () => {
    /*
    Test Doc:
    - Why: Verifies migration moves data to correct workspace
    - Contract: migrate --workspace ws1 → moves sessions to <worktree>/.chainglass/data/agents/
    - Quality Contribution: Ensures data preservation during migration
    */
    mockLocalStorage({ 's1': { id: 's1', type: 'claude', status: 'active' } });
    mockWorkspaceContext({ workspaceSlug: 'ws1', worktreePath: '/test/workspace' });
    
    await runCLI(['agent', 'migrate', '--workspace', 'ws1']);
    
    const sessionPath = '/test/workspace/.chainglass/data/agents/s1.json';
    expect(fs.existsSync(sessionPath)).toBe(true);
    
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    expect(sessionData.id).toBe('s1');
  });
  
  it('should skip already-migrated sessions (idempotency)', async () => {
    /*
    Test Doc:
    - Why: Implements AC-19 (idempotent migration)
    - Contract: Running migrate twice skips already-migrated sessions
    - Quality Contribution: Prevents duplicate sessions on repeated runs
    */
    mockLocalStorage({ 's1': { id: 's1', type: 'claude', status: 'active' } });
    
    // First run: migrate
    await runCLI(['agent', 'migrate', '--workspace', 'ws1']);
    
    // Second run: should skip
    const output = await runCLI(['agent', 'migrate', '--workspace', 'ws1']);
    
    expect(output).toContain('Skipped 1 already-migrated session');
    expect(output).toContain('s1 (already exists)');
  });
  
  it('should warn when no workspace registered', async () => {
    /*
    Test Doc:
    - Why: Implements AC-18 (graceful handling of missing workspace)
    - Contract: migrate with no workspaces → warning message
    - Quality Contribution: Prevents silent failure
    */
    mockWorkspaceList([]); // Empty workspace list
    
    const output = await runCLI(['agent', 'migrate', '--workspace', 'ws1']);
    
    expect(output).toContain('No workspace registered');
    expect(output).toContain('Please add a workspace first');
  });
});
```

### Content Outlines

**docs/how/agents/1-overview.md**:
- Introduction: What are workspace-scoped agent sessions?
- Motivation: Why migrate from localStorage?
- Architecture: Split storage model (registry + per-worktree data)
- Data flow diagram: localStorage → server-side sessions.json
- When to use agents vs. other domains

**docs/how/agents/2-usage.md**:
- Creating an agent session in a workspace
- Viewing agent events (SSE streaming)
- Deleting sessions (hard delete with confirmation)
- Workspace selection (/agents redirect vs /workspaces/[slug]/agents)
- Troubleshooting common issues

**docs/how/agents/3-migration.md**:
- Prerequisites: Workspace registered, data backed up
- Running migration: `cg agent migrate --workspace <slug>`
- Dry-run mode: Preview before migrating
- Handling orphaned localStorage sessions
- Verification: Check new paths after migration

**docs/how/agents/4-gitignore.md**:
- Why exclude agent data from git
- Configuring `.chainglass/.gitignore`
- Team collaboration: What to commit, what to exclude
- Optional: Committing session metadata (not events)

### Acceptance Criteria
- [ ] All documentation files created (4 files)
- [ ] Migration CLI tests passing (10+ tests)
- [ ] Migration tool handles dry-run mode
- [ ] Migration is idempotent (AC-19)
- [ ] Warning shown when no workspace registered (AC-18)
- [ ] .chainglass/.gitignore template created
- [ ] E2E migration test passes
- [ ] Documentation reviewed for clarity
- [ ] No broken links in docs
- [ ] Manual migration tested with real localStorage data

---

## Cross-Cutting Concerns

### Security Considerations

**Input Validation**:
- Session IDs validated with `validateSessionId()` to prevent path traversal (Discovery 05)
- Workspace slugs validated before path construction
- Event data sanitized via Zod schemas

**Authentication/Authorization**:
- Web routes require same-user access (web server owns `~/.config/chainglass/`)
- No cross-workspace data leakage (workspace isolation verified via integration tests)
- Hard delete removes data permanently (no recovery attack surface)

### Observability

**Logging Strategy**:
- All adapters inject `ILogger` for structured logging
- Event adapter logs when skipping malformed NDJSON lines
- Migration tool logs session moves and skipped duplicates
- Error logs include error codes (E090-E099) and context

**Metrics to Capture**:
- Session creation rate per workspace
- Event append latency
- Migration success/failure counts
- NDJSON malformed line skip count

**Error Tracking**:
- Error codes E090-E099 for agent-specific errors
- Structured error classes (AgentSessionNotFound, InvalidData, etc.)
- Error context includes workspace slug, session ID, operation type

### Documentation

**Location**: `docs/how/agents/` (per Documentation Strategy from spec)

**Content Structure**:
1. `1-overview.md` - Introduction, architecture, motivation
2. `2-usage.md` - Creating sessions, viewing events, deleting
3. `3-migration.md` - Migration tool usage, troubleshooting
4. `4-gitignore.md` - Git strategy, team collaboration

**Target Audience**: Developers extending agent functionality

**Maintenance**: Update docs when agent storage patterns or UI workflows change

**ADR References**: 
- [ADR-0008: Workspace Split Storage Data Model](../../adr/adr-0008-workspace-split-storage-data-model.md) constrains storage architecture
- Link to ADR-0008 in `1-overview.md` for architectural context

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| AgentSessionAdapter | 3 | Medium | S=2,I=1,D=1,N=0,F=0,T=1 | 10+ files touched (adapter, fake, contract tests, entity), depends on WorkspaceDataAdapterBase, new sessions.json format, follows established Sample pattern | Contract tests verify fake-real parity; integration tests catch path resolution bugs |
| AgentEventAdapter | 3 | Medium | S=2,I=1,D=1,N=0,F=0,T=1 | EventStorageService wrapper + workspace integration, NDJSON format preserved, DYK behaviors maintained | Reuse existing EventStorageService tests; workspace isolation integration tests |
| Web UI Integration | 4 | Large | S=2,I=1,D=1,N=1,F=0,T=2 | Multiple routes (API + web), DI container wiring, localStorage → server-side migration, both URL patterns supported | Phased rollout: API routes → web pages → migration; E2E tests cover full flow |
| Migration Tool | 2 | Small | S=1,I=0,D=1,N=0,F=0,T=1 | Single CLI command, handles localStorage parsing, idempotent, dry-run mode | Dry-run testing prevents data loss; manual validation with real data |

**Total Complexity**: Phase 1 (CS-3) + Phase 2 (CS-3) + Phase 3 (CS-4) + Phase 4 (CS-2) = **CS-12 equivalent work** across 4 phases

**Mitigation for CS ≥ 4** (Phase 3):
- Staged rollout: Complete API routes before touching web UI
- Feature flag: Optional `ENABLE_WORKSPACE_AGENTS` env var for gradual rollout
- Rollback plan: Keep `/agents` old route functional during transition period (1 plan cycle)
- Monitoring: Track API error rates, session creation success rate, migration completion rate

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests - Status: PENDING
- [ ] Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage) - Status: PENDING
- [ ] Phase 3: Web UI Integration (Workspace-Scoped Agents Page) - Status: PENDING
- [ ] Phase 4: Migration Tool + Documentation - Status: PENDING

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

**Allocation Strategy**:
- plan-6a reads the current ledger and determines the next available footnote number
- Footnote numbers are sequential and shared across all phases and subtasks (e.g., [^1], [^2], [^3]...)
- Each invocation of plan-6a increments the counter and updates BOTH ledgers (plan and dossier) atomically
- Footnotes are never manually assigned; always delegated to plan-6a for consistency

**Format**:
```markdown
[^N]: Task {plan-task-id} - {one-line summary}
  - `{flowspace-node-id}`
  - `{flowspace-node-id}`
```

**Initial State** (before implementation begins):
```markdown
[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
...
```

---

## Appendix A: Anchor Naming Conventions

All deep links in the FlowSpace provenance graph use kebab-case anchors for consistency and reliability.

### Phase Anchors
**Format**: `phase-{number}-{slug}`
**Example**: `phase-2-agenteventadapter-workspace-scoped-event-storage`

Generated from: "Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage)"

### Task Anchors (Plan)
**Format**: `task-{number}-{slug}` (use plan task number like "11" for task 1.1)
**Example**: `task-11-write-interface-for-iagentsessionadapter`

Generated from: Task 1.1 with name "Write interface for IAgentSessionAdapter"
Note: Use the flattened number (1.1 → 11) for uniqueness

### Slugification Rules

**Algorithm** (used by plan-5, plan-5a, plan-6a):
1. Convert to lowercase
2. Replace spaces with hyphens
3. Replace non-alphanumeric characters (except hyphens) with hyphens
4. Collapse multiple consecutive hyphens to single hyphen
5. Trim leading and trailing hyphens

**Command**:
```bash
ANCHOR=$(echo "${INPUT}" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

**Examples**:
- "Phase 2: AgentEventAdapter" → `phase-2-agenteventadapter`
- "Task 1.1: Write Interface" → `task-11-write-interface`

---

## Appendix B: Graph Traversal Guide

The FlowSpace planning system creates a **bidirectional provenance graph** connecting tasks, logs, files, and footnotes. This guide shows how to navigate the graph in all directions.

### Graph Node Types

1. **Plan Tasks** - Tasks in plan.md (numbered 1.1, 2.3, etc.)
2. **Dossier Tasks** - Tasks in `tasks/phase-N/tasks.md` (numbered T001, T002, etc.)
3. **Execution Log Entries** - In `tasks/phase-N/execution.log.md`
4. **Modified Files** - Source code with embedded FlowSpace IDs
5. **Footnotes** - In plan.md § 9 and dossier footnote stubs

### Navigation Patterns

#### From Task → Everything

**Starting Point**: Dossier task T003 in `tasks/phase-2/tasks.md`

1. **Find execution log entries**:
   - Look in Notes column for: `log#task-23-implement-validation`
   - Open: `tasks/phase-2/execution.log.md#task-23-implement-validation`

2. **Find modified files**:
   - Look in Absolute Path(s) column
   - Look in Notes column for footnote: `[^3]`
   - Jump to footnote ledger → Read FlowSpace node IDs

3. **Find plan task**:
   - Look in Notes column for: "Supports plan task 2.3"
   - Open: `../../plan.md#task-23-implement-validation`

#### From File → Tasks

**Starting Point**: Source file with FlowSpace ID comment

```typescript
// FlowSpace: [^3] [^7] [^12] function:src/adapters/agent-session.adapter.ts:save
async save(ctx: WorkspaceContext, session: AgentSession) { ... }
```

1. Note footnote numbers: `[^3]`, `[^7]`, `[^12]`
2. Look up in plan.md § 9 Change Footnotes Ledger
3. Navigate to task IDs from footnote references

**Result**: Complete modification history showing which tasks touched this file

---

*Plan Version 1.0.0 - Created 2026-01-28*


---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-worktree-landing-page | 2026-01-28 | Phase 3: Web UI Integration | T014 | Navigation broken - worktrees link to samples, not a landing page for agents access | [ ] Pending | [Link](tasks/phase-3-web-ui-integration/001-subtask-worktree-landing-page.md) |

