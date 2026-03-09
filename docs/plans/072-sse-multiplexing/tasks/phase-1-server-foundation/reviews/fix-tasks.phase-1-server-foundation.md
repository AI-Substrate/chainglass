# Fix Tasks: Phase 1: Server Foundation

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Replace helper-level mux tests with real route-handler coverage
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/test/unit/web/api/events-mux-route.test.ts
  - /Users/jordanknight/substrate/067-question-popper/apps/web/app/api/events/mux/route.ts
- **Issue**: The new "route contract" suite never imports or executes the real `/api/events/mux` handler. It duplicates parsing logic in a local helper and drives `SSEManager` directly, so auth, response shape, heartbeats, and abort cleanup are not actually verified.
- **Fix**: Refactor to a fake-friendly seam if needed, then write tests that call the real `GET()` handler with `NextRequest` + `AbortController` and assert 400/401/200 behavior, SSE headers, initial heartbeat, 15-second heartbeat scheduling, multi-channel registration, and abort-driven cleanup.
- **Patch hint**:
  ```diff
  - function parseChannels(channelsParam: string | null) {
  -   // duplicated route logic under test
  - }
  -
  - describe('/api/events/mux route contract', () => {
  -   it('should reject missing channels parameter', () => {
  -     const result = parseChannels(null)
  -     expect(result.ok).toBe(false)
  -   })
  - })
  + import { GET } from '/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/events/mux/route'
  +
  + describe('/api/events/mux route contract', () => {
  +   it('returns 401 when auth() yields no session', async () => {
  +     const request = new NextRequest('http://localhost/api/events/mux?channels=file-changes')
  +     const response = await GET(request)
  +     expect(response.status).toBe(401)
  +   })
  +
  +   it('registers one controller per requested channel and cleans up on abort', async () => {
  +     const abortController = new AbortController()
  +     const request = new NextRequest('http://localhost/api/events/mux?channels=file-changes,event-popper', { signal: abortController.signal })
  +     const response = await GET(request)
  +     expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  +     abortController.abort()
  +     // assert sseManager cleanup and heartbeat behavior
  +   })
  + })
  ```

## Medium / Low Fixes

### FT-002: Align the plan manifest and phase metadata with the `_platform/state` touch
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/tasks.md
- **Issue**: `apps/web/src/lib/state/server-event-router.ts` is modified in Phase 1, but the plan Domain Manifest does not list it and the phase metadata still labels T003 as `_platform/events`.
- **Fix**: Add the file to `## Domain Manifest` as `_platform/state` internal work and update the T003 domain metadata to `_platform/state`.
- **Patch hint**:
  ```diff
  + | `apps/web/src/lib/state/server-event-router.ts` | `_platform/state` | internal | Extend `ServerEvent` with optional `channel` metadata for multiplexed delivery |
  
  - | [x] | T003 | Extend ServerEvent type with optional `channel` field | `_platform/events` | `apps/web/src/lib/state/server-event-router.ts` | ... |
  + | [x] | T003 | Extend ServerEvent type with optional `channel` field | `_platform/state` | `apps/web/src/lib/state/server-event-router.ts` | ... |
  ```

### FT-003: Update `_platform/events` and `_platform/state` domain docs for Plan 072
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md
- **Issue**: The touched domain docs are incomplete. `_platform/events` does not fully document the mux route as a contract/source/dependency, and `_platform/state` does not record the new `ServerEvent.channel?: string` metadata. Neither touched domain has a Concepts table.
- **Fix**: Update Contracts, Source Location, Dependencies, History, and add `## Concepts` sections covering the mux route and the server-event bridge.
- **Patch hint**:
  ```diff
  + | `/api/events/mux` | Route | Multiplexed SSE consumers | Multi-channel SSE endpoint with auth, validation, heartbeats, and atomic cleanup |
  +
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + |--------|-------------|--------------|
  + | Multiplexed SSE Route | `apps/web/app/api/events/mux/route.ts` | Registers one controller across multiple channels and streams channel-tagged SSE messages |
  
  + | Plan 072 Phase 1 | Added optional `channel?: string` metadata to `ServerEvent` for multiplexed SSE delivery. | 2026-03-08 |
  +
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + |--------|-------------|--------------|
  + | Server Event Bridge | `apps/web/src/lib/state/server-event-router.ts` | Describes how SSE payloads map into GlobalStateSystem updates, including optional channel metadata |
  ```

### FT-004: Refresh architecture evidence and reviewability artifacts
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-1-server-foundation/execution.log.md
- **Issue**: The domain map still omits the `_platform/events -> _platform/auth` session-check dependency, and the execution log reports pass counts without the actual command output used to prove the TDD tasks.
- **Fix**: Add the labeled auth edge plus refreshed health-summary rows, and record the exact verification commands/output (including route-level tests once added) in `execution.log.md`.
- **Patch hint**:
  ```diff
  + events -->|"auth()<br/>session check"| auth
  
  - - **Evidence**: 10/10 pass in 2ms
  + - **Command**: `pnpm vitest --run test/unit/web/api/events-mux-route.test.ts`
  + - **Evidence**: `10/10 tests passed` (include the copied output block or excerpt)
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain manifest and domain docs updated for the real phase footprint
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
