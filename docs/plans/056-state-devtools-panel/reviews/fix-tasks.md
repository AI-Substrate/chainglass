# Fix Tasks: Simple Mode (State DevTools Panel)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Correct stream clear/pause semantics in `useStateInspector`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts
- **Issue**: Clear boundary and buffered count rely on mutable array indices from a capped FIFO and paused mode drops visible history.
- **Fix**: Use monotonic marker(s) (e.g., log version at clear + pause snapshot) and compute buffered delta while keeping pre-pause history visible.
- **Patch hint**:
  ```diff
  - const [cleared, setCleared] = useState(false);
  - const clearedAtVersionRef = useRef(0);
  + const [clearVersion, setClearVersion] = useState<number | null>(null);
  + const pausedAtVersionRef = useRef<number | null>(null);
  ...
  - logEntries = logEntries.filter((_, i) => i >= clearedAtVersionRef.current);
  + if (clearVersion !== null) logEntries = logEntries.filter((e) => e.timestamp >= clearVersion);
  ...
  - logEntries: paused ? [] : logEntries,
  - bufferedCount: paused ? logEntries.length : 0,
  + logEntries,
  + bufferedCount: paused ? Math.max(0, logEntries.length - prePauseCount) : 0,
  ```

### FT-002: Add throttled/batched refresh under high-frequency updates
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts
- **Issue**: `'*'` subscription triggers multiple state updates per event without throttle.
- **Fix**: Batch updates via RAF or fixed interval and commit a single snapshot update per tick.
- **Patch hint**:
  ```diff
  - const refresh = () => {
  -   setDomains(system.listDomains());
  -   setEntries(system.list('*'));
  -   setSubscriberCount(system.subscriberCount);
  -   setEntryCount(system.entryCount);
  - };
  + const refresh = throttle(() => {
  +   const nextDomains = system.listDomains();
  +   const nextEntries = system.list('*');
  +   setSnapshot({ nextDomains, nextEntries, subscribers: system.subscriberCount, entries: system.entryCount });
  + }, 100);
  ```

### FT-003: Restore Full-TDD evidence artifact
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/execution.log.md
- **Issue**: Required execution log is missing; no RED→GREEN progression captured.
- **Fix**: Create execution log with per-task failing test, implementation step, passing test output, and final verification commands.
- **Patch hint**:
  ```diff
  + # Execution Log — Plan 056
  + ## T00X
  + - RED: pnpm vitest ... (failing output)
  + - GREEN: <implementation summary>
  + - VERIFY: pnpm vitest ... (passing output)
  ```

### FT-004: Close AC verification gaps with inspector behavior tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-inspector.test.tsx
- **Issue**: Test suite verifies only a subset of required inspector acceptance criteria.
- **Fix**: Add tests for domain overview rendering, entries view, stream filtering, pause/resume buffering, clear semantics at cap, detail panel, diagnostics updates, and route/nav integration where unit-testable.
- **Patch hint**:
  ```diff
  + it('buffers events while paused and resumes without data loss', () => { ... })
  + it('clear resets visible stream and accepts new events after ring-buffer rollover', () => { ... })
  + it('renders domain overview and entry detail metadata', () => { ... })
  ```

### FT-005: Add `_platform/dev-tools` domain artifact
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/dev-tools/domain.md
- **Issue**: New domain lacks required domain documentation.
- **Fix**: Create full domain doc with purpose, boundary, contracts, composition, source location, dependencies, concepts table, and history entry for Plan 056.
- **Patch hint**:
  ```diff
  + # Domain: Dev Tools (`_platform/dev-tools`)
  + ## Contracts (Public Interface)
  + ## Composition (Internal)
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + ## History
  ```

### FT-006: Update registry + map for new domain
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: Registry and map do not represent `_platform/dev-tools` and its labeled dependency edges.
- **Fix**: Add domain registry row, add map node, add labeled dev-tools→state edges, and update health summary row.
- **Patch hint**:
  ```diff
  + | Dev Tools | _platform/dev-tools | infrastructure | _platform | Plan 056 | active |
  ...
  + devTools["🛠️ _platform/dev-tools<br/>StateInspector · useStateInspector · useStateChangeLog"]:::infra
  + devTools -->|"IStateService<br/>useStateSystem"| state
  ```

### FT-007: Remove forbidden mocks and add required Test Docs
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts
- **Issue**: Uses `vi.fn()` and lacks required Test Doc comments.
- **Fix**: Replace listeners with fake counters/collectors and add 5-field Test Doc block to each test.
- **Patch hint**:
  ```diff
  - const listener = vi.fn();
  + const calls: number[] = [];
  + const listener = () => { calls.push(Date.now()); };
  ...
  + /**
  +  * Why: ...
  +  * Contract: ...
  +  * Usage Notes: ...
  +  * Quality Contribution: ...
  +  * Worked Example: ...
  +  */
  ```

## Medium / Low Fixes

### FT-008: Update `_platform/state` domain.md for Plan 056
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md
- **Issue**: Missing `state-change-log.ts`, `StateChangeLogContext`, consumer/dependency and history updates.
- **Fix**: Update Contracts, Composition, Source Location, Dependencies, and History sections for Plan 056.

### FT-009: Use contract/public import for state log context
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts
- **Issue**: Imports internal file path from another domain.
- **Fix**: Re-export/import `StateChangeLogContext` via `@/lib/state` public surface.

### FT-010: Safe serialization for inspector value rendering
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx
- **Issue**: Direct `JSON.stringify` can throw and crash rendering.
- **Fix**: Introduce shared safe stringify helper and fallback label for unserializable values.

### FT-011: Add explicit return types on exported components/pages (optional)
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/dev/state-inspector/page.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/domain-overview.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx
- **Issue**: Public exported functions are missing explicit return types.
- **Fix**: Add `: JSX.Element` or `: ReactElement` annotations as appropriate.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md` and achieve zero HIGH/CRITICAL
