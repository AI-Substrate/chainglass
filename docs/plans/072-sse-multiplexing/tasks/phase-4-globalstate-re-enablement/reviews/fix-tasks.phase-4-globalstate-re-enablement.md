# Fix Tasks: Phase 4: GlobalState Re-enablement

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add concrete AC-26 / AC-28 verification evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-4-globalstate-re-enablement/execution.log.md
- **Issue**: The phase marks AC-26 and AC-28 complete, but the execution log only records `pnpm test`. There is no preserved evidence that a muxed `work-unit-state` event reached `GlobalStateSystem`, and no recorded 3-tab smoke test demonstrating that lockups are gone.
- **Fix**: Re-run the Phase 4 verification and record the observed results. At minimum, capture one work-unit-state event flowing through `ServerEventRoute` into the state system (or add an integration test that proves the same path), and document the 3-tab smoke test with connection counts/responsiveness outcomes.
- **Patch hint**:
  ```diff
  @@
   **Evidence**: `pnpm test` — 5173 passed, 80 skipped, 0 failures (173s).
  +
  +**Manual verification**:
  +- Opened 3 workspace tabs on the same worktree; each tab showed a single `/api/events/mux?...` EventSource and no separate `work-unit-state` connection.
  +- Triggered a `work-unit-state` event and observed the mapped state path update in GlobalStateSystem / state inspector.
  +- Confirmed REST navigation and data fetches remained responsive while all 3 tabs were open.
  ```

## Medium / Low Fixes

### FT-002: Update `_platform/state` docs for multiplexed SSE
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/state/domain.md
- **Issue**: The history row was updated for 072-P4, but the Composition and Dependencies sections still describe `ServerEventRoute` as a `useSSE` consumer.
- **Fix**: Replace the stale transport references with the mux contracts that Phase 4 now uses (`useChannelEvents`, multiplexed SSE provider/channel hooks).
- **Patch hint**:
  ```diff
  -| ServerEventRoute | Invisible bridge: subscribes SSE channel → maps events → publishes to state with source metadata | useSSE, IStateService, ServerEventRouteDescriptor |
  +| ServerEventRoute | Invisible bridge: subscribes muxed channel events → maps events → publishes to state with source metadata | useChannelEvents, IStateService, ServerEventRouteDescriptor |
  @@
  -| `_platform/events` | useSSE, useWorkspaceSSE, FileChangeHub pattern | State change transport from server; GlobalStateConnector subscribes to SSE and translates events to state |
  +| `_platform/events` | useChannelEvents, MultiplexedSSEProvider, FileChangeHub pattern | State change transport from server; GlobalStateConnector subscribes to multiplexed channel events and translates them to state |
  ```

### FT-003: Refresh the domain map for Phase 4 transport changes
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
- **Issue**: The domain map still shows `_platform/events` and `_platform/state` using legacy `useSSE` wording, and it omits the now-reenabled state composition surface.
- **Fix**: Update the `_platform/events` / `_platform/state` node labels, the `_platform/state` → `_platform/events` dependency text, and the health-summary row so the map matches the current mux architecture.
- **Patch hint**:
  ```diff
  -events["🔔 _platform/events<br/>ICentralEventNotifier<br/>ISSEBroadcaster · useSSE<br/>FileChangeHub · useFileChanges<br/>toast() · Toaster"]
  +events["🔔 _platform/events<br/>ICentralEventNotifier<br/>ISSEBroadcaster · useSSE<br/>MultiplexedSSEProvider · useChannelEvents<br/>FileChangeHub · useFileChanges<br/>toast() · Toaster"]
  -state["💾 _platform/state<br/>IStateService<br/>useGlobalState<br/>useGlobalStateList<br/>GlobalStateProvider<br/>StateChangeLog<br/>ServerEventRoute"]
  +state["💾 _platform/state<br/>IStateService<br/>useGlobalState<br/>useGlobalStateList<br/>GlobalStateProvider<br/>GlobalStateConnector<br/>StateChangeLog<br/>ServerEventRoute"]
  @@
  -| _platform/state | ... | useSSE | events | ✅ |
  +| _platform/state | ... | useChannelEvents | events | ✅ |
  ```

### FT-004: Add the touched state-domain doc to the Domain Manifest
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/sse-multiplexing-plan.md
- **Issue**: `_platform/state/domain.md` was modified during Phase 4 but is missing from the plan's `## Domain Manifest` table.
- **Fix**: Add the domain doc row so the phase has complete file→domain traceability.
- **Patch hint**:
  ```diff
   | `docs/domains/_platform/events/domain.md` | `_platform/events` | internal | Add contracts, composition, history |
  +| `docs/domains/_platform/state/domain.md` | `_platform/state` | internal | Update Phase 4 state-domain history and multiplexed transport docs |
   | `docs/domains/registry.md` | cross-domain | cross-domain | Update if needed |
  ```

### FT-005: Fix the stale `SERVER_EVENT_ROUTES` comment
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/state-connector.tsx
- **Issue**: The comment still says each route creates its own SSE connection, which is no longer true after the mux migration.
- **Fix**: Rewrite the comment to describe one invisible bridge component per route sharing the single multiplexed EventSource.
- **Patch hint**:
  ```diff
  - * Each entry here creates one SSE connection and one invisible React component.
  + * Each entry mounts one invisible bridge component; all routes share the
  + * single multiplexed SSE connection provided by Plan 072.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
