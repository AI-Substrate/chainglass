# Fix Tasks: Phase 1: Event Popper Infrastructure

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Expose Event Popper as a real shared public contract
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/packages/shared/package.json; /Users/jordanknight/substrate/067-question-popper/packages/shared/src/index.ts
- **Issue**: `apps/web/instrumentation.ts` imports `@chainglass/shared/event-popper`, but `packages/shared/package.json` does not export `./event-popper`, so the runtime import fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Fix**: Add a `./event-popper` subpath export that points at the built barrel, then decide whether the root shared barrel should also re-export the public Event Popper contracts to satisfy T009.
- **Patch hint**:
  ```diff
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
     },
  +  "./event-popper": {
  +    "import": "./dist/event-popper/index.js",
  +    "types": "./dist/event-popper/index.d.ts"
  +  },
     "./interfaces": {
       "import": "./dist/interfaces/index.js",
       "types": "./dist/interfaces/index.d.ts"
     }
   }
  ```

### FT-002: Replace the spoofable localhost guard
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/localhost-guard.ts; /Users/jordanknight/substrate/067-question-popper/apps/web/proxy.ts
- **Issue**: `localhostGuard()` falls back to the client-controlled `Host` header, so the auth-bypassed `/api/event-popper/*` surface is not actually localhost-only.
- **Fix**: Remove the `Host` fallback and enforce loopback access only where a trusted peer address is available. If the runtime layer cannot provide a trusted socket address, keep auth in place until a trustworthy localhost check is implemented.
- **Patch hint**:
  ```diff
  -  const host = request.headers.get('host');
  -  if (host) {
  -    const hostname = host.split(':')[0];
  -    if (LOOPBACK_HOSTS.has(hostname)) {
  -      return true;
  -    }
  -  }
  +  // Only trust a peer address supplied by the runtime, not client headers.
  +  // If no trusted peer address is available here, fail closed and let auth remain in place.
  ```

### FT-003: Make `generateEventId()` lexically monotonic
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/guid.ts; /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts
- **Issue**: The current `{timestamp}_{random}` format does not preserve call order within a single millisecond, and the targeted phase test already fails on that contract.
- **Fix**: Keep the filesystem-safe timestamp prefix, but add a same-millisecond sequence strategy so later calls sort after earlier ones.
- **Patch hint**:
  ```diff
  +let lastTimestamp = '';
  +let sameMsSequence = 0;
  +
   export function generateEventId(): string {
     const timestamp = new Date()
       .toISOString()
       .replace(/:/g, '-')
       .replace(/\./g, '-');
  -  const suffix = randomBytes(3).toString('hex');
  +  sameMsSequence = timestamp === lastTimestamp ? sameMsSequence + 1 : 0;
  +  lastTimestamp = timestamp;
  +  const suffix = `${sameMsSequence.toString(16).padStart(4, '0')}${randomBytes(1).toString('hex')}`;
     return `${timestamp}_${suffix}`;
   }
  ```

### FT-004: Implement real PID recycling detection
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/packages/shared/src/event-popper/port-discovery.ts; /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts
- **Issue**: `readServerInfo()` does not compare `startedAt` against the live process start time, so recycled-but-alive PIDs can be mistaken for the current server.
- **Fix**: Add a helper that reads the OS-reported start time for the target PID, compare it to `startedAt`, and return `null` on mismatch. Add a dedicated recycled-PID test.
- **Patch hint**:
  ```diff
  +function getProcessStartTime(pid: number): number | null {
  +  // Read OS process metadata and normalize to epoch milliseconds.
  +}
  +
     const info = result.data;
     if (!isPidAlive(info.pid)) {
       return null;
     }
  -  const recordedStart = new Date(info.startedAt).getTime();
  -  const now = Date.now();
  -  const maxAge = now - recordedStart;
  -  if (maxAge < -5000) {
  +  const recordedStart = new Date(info.startedAt).getTime();
  +  const liveStart = getProcessStartTime(info.pid);
  +  if (liveStart === null || liveStart > recordedStart + 5000) {
       return null;
     }
  ```

### FT-005: Make the phase evidence green and complete
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-1-event-popper-infrastructure/execution.log.md
- **Issue**: The suite is currently red (21/22), and critical T004/T005/T006/T008 branches are either missing or unsupported by the execution log.
- **Fix**: Add tests (or concrete manual evidence where code is not unit-testable) for localhost allow/deny behavior, `X-Forwarded-For` rejection, recycled PID handling, tmux command failure, and any boot/shutdown behavior claimed by the execution log. Re-run the phase checks and update the log with actual outputs.
- **Patch hint**:
  ```diff
  +describe('localhostGuard', () => {
  +  it('rejects requests with x-forwarded-for', () => { /* ... */ });
  +  it('rejects non-loopback callers', () => { /* ... */ });
  +});
  +
  +describe('readServerInfo recycled pid', () => {
  +  it('returns null when live pid start time is newer than recorded startedAt', () => { /* ... */ });
  +});
  +
  +describe('detectTmuxContext command failure', () => {
  +  it('returns undefined when tmux display-message fails', () => { /* ... */ });
  +});
  ```

## Medium / Low Fixes

### FT-006: Sync domain registry and topology
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/registry.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
- **Issue**: The new `_platform/external-events` domain and its dependency on `_platform/events` are absent from the registry/map.
- **Fix**: Add a registry row, an infrastructure node, the labeled dependency edge, and a Domain Health Summary row for `_platform/external-events`.
- **Patch hint**:
  ```diff
  +| External Events | _platform/external-events | infrastructure | _platform | Plan 067 — Event Popper | active |
  ```
  ```diff
  +    externalEvents["📡 _platform/external-events<br/>EventPopperRequest · EventPopperResponse<br/>generateEventId · readServerInfo<br/>localhostGuard · detectTmuxContext"]:::infra
  +    externalEvents -->|"WorkspaceDomain.EventPopper"| events
  ```

### FT-007: Complete domain docs and manifest coverage
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/external-events/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
- **Issue**: The new domain doc is missing Boundary/Composition, `_platform/events` is missing Plan 067 Concepts/History updates, and the plan's Domain Manifest omits several touched files.
- **Fix**: Add the missing sections and manifest rows so the docs fully reflect the phase.
- **Patch hint**:
  ```diff
  +## Boundary
  +
  +### Owns
  +- ...
  +
  +### Does NOT Own
  +- ...
  +
  +## Composition
  +
  +| Component | Role | Depends On |
  +|-----------|------|------------|
  +| ... | ... | ... |
  ```
  ```diff
  +| `apps/web/instrumentation.ts` | `_platform/external-events` | internal |
  +| `apps/web/proxy.ts` | `_platform/external-events` | internal |
  +| `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` | `_platform/events` | contract |
  +| `test/unit/event-popper/infrastructure.test.ts` | `_platform/external-events` | verification |
  ```

### FT-008: Bring the tests back into rule compliance
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/unit/event-popper/infrastructure.test.ts
- **Issue**: The Phase 1 tests omit required Test Doc comments and use a relative cross-package import path.
- **Fix**: After FT-001 lands, import through the supported public contract and add the required 5-field Test Doc block to each test.
- **Patch hint**:
  ```diff
  -import {
  -  EventPopperRequestSchema,
  -  EventPopperResponseSchema,
  -  generateEventId,
  -  readServerInfo,
  -  writeServerInfo,
  -  removeServerInfo,
  -} from '../../../packages/shared/src/event-popper/index';
  +import {
  +  EventPopperRequestSchema,
  +  EventPopperResponseSchema,
  +  generateEventId,
  +  readServerInfo,
  +  writeServerInfo,
  +  removeServerInfo,
  +} from '@chainglass/shared/event-popper';
  +
  +/*
  +Test Doc:
  +- Why: ...
  +- Contract: ...
  +- Usage Notes: ...
  +- Quality Contribution: ...
  +- Worked Example: ...
  +*/
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
