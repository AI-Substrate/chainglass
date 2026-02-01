import {
  type WatcherEvent,
  type WorkGraphChangedEvent,
  WorkGraphWatcherAdapter,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Create a WatcherEvent for a given path and event type */
function makeEvent(
  path: string,
  eventType: 'change' | 'add' | 'unlink' = 'change',
  worktreePath = '/wt',
  workspaceSlug = 'my-ws'
): WatcherEvent {
  return { path, eventType, worktreePath, workspaceSlug };
}

/** Standard state.json path under work-graphs */
function stateJsonPath(slug: string, worktreePath = '/wt'): string {
  return `${worktreePath}/.chainglass/data/work-graphs/${slug}/state.json`;
}

// ═══════════════════════════════════════════════════════════════
// T002: State.json Change Detection & Filtering
// ═══════════════════════════════════════════════════════════════

describe('WorkGraphWatcherAdapter — filtering', () => {
  let adapter: WorkGraphWatcherAdapter;
  let received: WorkGraphChangedEvent[];

  beforeEach(() => {
    adapter = new WorkGraphWatcherAdapter();
    received = [];
    adapter.onGraphChanged((event) => received.push(event));
  });

  it('should emit event when state.json changes', () => {
    /*
    Test Doc:
    - Why: AC5 core behavior — state.json change under work-graphs/ must emit event
    - Contract: WatcherEvent with state.json path → WorkGraphChangedEvent emitted
    - Usage Notes: Subscribe via onGraphChanged() before dispatching events
    - Quality Contribution: Verifies core filtering logic works for the primary use case
    - Worked Example: change to work-graphs/my-graph/state.json → 1 event with graphSlug 'my-graph'
    */
    adapter.handleEvent(makeEvent(stateJsonPath('my-graph')));
    expect(received).toHaveLength(1);
  });

  it('should emit event when state.json is added', () => {
    /*
    Test Doc:
    - Why: AC5 covers add events — new graph creation triggers state.json add
    - Contract: WatcherEvent with eventType 'add' and state.json path → event emitted
    - Usage Notes: All three event types (change, add, unlink) are forwarded
    - Quality Contribution: Ensures new graph detection works
    - Worked Example: add of work-graphs/g1/state.json → 1 event
    */
    adapter.handleEvent(makeEvent(stateJsonPath('g1'), 'add'));
    expect(received).toHaveLength(1);
  });

  it('should emit event when state.json is unlinked', () => {
    /*
    Test Doc:
    - Why: AC5 covers unlink events — graph deletion triggers state.json unlink
    - Contract: WatcherEvent with eventType 'unlink' and state.json path → event emitted
    - Usage Notes: Adapter does not distinguish event types — all pass through
    - Quality Contribution: Ensures graph deletion detection works
    - Worked Example: unlink of work-graphs/g1/state.json → 1 event
    */
    adapter.handleEvent(makeEvent(stateJsonPath('g1'), 'unlink'));
    expect(received).toHaveLength(1);
  });

  it('should ignore graph.yaml changes', () => {
    /*
    Test Doc:
    - Why: Self-filtering correctness — only state.json matters
    - Contract: Non-state.json file under work-graphs/ → no event
    - Usage Notes: graph.yaml is the definition file, not the runtime state
    - Quality Contribution: Prevents false notifications for irrelevant changes
    - Worked Example: change to work-graphs/g1/graph.yaml → 0 events
    */
    adapter.handleEvent(makeEvent('/wt/.chainglass/data/work-graphs/g1/graph.yaml'));
    expect(received).toHaveLength(0);
  });

  it('should ignore layout.json changes', () => {
    /*
    Test Doc:
    - Why: Self-filtering correctness — layout.json is UI state, not graph state
    - Contract: layout.json under work-graphs/ → no event
    - Usage Notes: Only state.json triggers events
    - Quality Contribution: Prevents false UI-layout notifications
    - Worked Example: change to work-graphs/g1/layout.json → 0 events
    */
    adapter.handleEvent(makeEvent('/wt/.chainglass/data/work-graphs/g1/layout.json'));
    expect(received).toHaveLength(0);
  });

  it('should ignore state.json in non-workgraph domains', () => {
    /*
    Test Doc:
    - Why: AC4 — adapters self-filter, must not match other domains
    - Contract: state.json under agents/ (not work-graphs/) → no event
    - Usage Notes: The regex anchors on work-graphs/ path segment
    - Quality Contribution: Prevents cross-domain event leaks
    - Worked Example: change to agents/x/state.json → 0 events
    */
    adapter.handleEvent(makeEvent('/wt/.chainglass/data/agents/x/state.json'));
    expect(received).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T003: GraphSlug Extraction from Path
// ═══════════════════════════════════════════════════════════════

describe('WorkGraphWatcherAdapter — slug extraction', () => {
  let adapter: WorkGraphWatcherAdapter;
  let received: WorkGraphChangedEvent[];

  beforeEach(() => {
    adapter = new WorkGraphWatcherAdapter();
    received = [];
    adapter.onGraphChanged((event) => received.push(event));
  });

  it('should extract simple slug', () => {
    /*
    Test Doc:
    - Why: Core slug extraction — most common case
    - Contract: path .../work-graphs/my-graph/state.json → graphSlug = 'my-graph'
    - Usage Notes: Slug is the directory name between work-graphs/ and /state.json
    - Quality Contribution: Verifies regex capture group works for basic slugs
    - Worked Example: my-graph → 'my-graph'
    */
    adapter.handleEvent(makeEvent(stateJsonPath('my-graph')));
    expect(received[0].graphSlug).toBe('my-graph');
  });

  it('should extract slug with hyphens', () => {
    /*
    Test Doc:
    - Why: Edge case — slugs commonly contain multiple hyphens
    - Contract: Multi-hyphen slug extracted correctly
    - Usage Notes: Regex [^/]+ matches any non-slash characters
    - Quality Contribution: Prevents regression on common slug patterns
    - Worked Example: my-long-graph-name → 'my-long-graph-name'
    */
    adapter.handleEvent(makeEvent(stateJsonPath('my-long-graph-name')));
    expect(received[0].graphSlug).toBe('my-long-graph-name');
  });

  it('should extract slug with dots', () => {
    /*
    Test Doc:
    - Why: Edge case — version-like slugs contain dots
    - Contract: Dot-containing slug extracted correctly
    - Usage Notes: Regex [^/]+ matches dots
    - Quality Contribution: Prevents regression on version-style graph names
    - Worked Example: v2.0 → 'v2.0'
    */
    adapter.handleEvent(makeEvent(stateJsonPath('v2.0')));
    expect(received[0].graphSlug).toBe('v2.0');
  });

  it('should ignore nested node data paths', () => {
    /*
    Test Doc:
    - Why: Node data files are under work-graphs/<slug>/nodes/ — not state.json
    - Contract: Nested paths that don't end with /state.json → no event
    - Usage Notes: Regex requires state.json at the end after the slug directory
    - Quality Contribution: Prevents false matches on deeply nested files
    - Worked Example: work-graphs/g1/nodes/n1/data.json → 0 events
    */
    adapter.handleEvent(makeEvent('/wt/.chainglass/data/work-graphs/g1/nodes/n1/data.json'));
    expect(received).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// T004: Subscriber Callback Pattern
// ═══════════════════════════════════════════════════════════════

describe('WorkGraphWatcherAdapter — subscriber pattern', () => {
  let adapter: WorkGraphWatcherAdapter;

  beforeEach(() => {
    adapter = new WorkGraphWatcherAdapter();
  });

  it('should return unsubscribe function from onGraphChanged', () => {
    /*
    Test Doc:
    - Why: Callback-set pattern contract — callers need cleanup
    - Contract: onGraphChanged() returns a function
    - Usage Notes: Call the returned function to unsubscribe
    - Quality Contribution: Verifies API shape
    - Worked Example: onGraphChanged(cb) → typeof function
    */
    const unsubscribe = adapter.onGraphChanged(() => {});
    expect(typeof unsubscribe).toBe('function');
  });

  it('should not receive events after unsubscribe', () => {
    /*
    Test Doc:
    - Why: Unsubscribe must actually remove the callback
    - Contract: After unsubscribe(), callback is not called on new events
    - Usage Notes: Prevents memory leaks and stale notifications
    - Quality Contribution: Catches bugs where callbacks are never removed
    - Worked Example: subscribe → unsubscribe → handleEvent → 0 calls to callback
    */
    const received: WorkGraphChangedEvent[] = [];
    const unsubscribe = adapter.onGraphChanged((e) => received.push(e));

    unsubscribe();
    adapter.handleEvent(makeEvent(stateJsonPath('g1')));

    expect(received).toHaveLength(0);
  });

  it('should notify multiple subscribers independently', () => {
    /*
    Test Doc:
    - Why: Multi-subscriber dispatch — each subscriber gets every event
    - Contract: N subscribers → N calls per matching event
    - Usage Notes: Subscribers are independent — unsubscribing one doesn't affect others
    - Quality Contribution: Verifies Set iteration dispatches to all subscribers
    - Worked Example: 2 subscribers, 1 event → each receives 1 event
    */
    const received1: WorkGraphChangedEvent[] = [];
    const received2: WorkGraphChangedEvent[] = [];
    adapter.onGraphChanged((e) => received1.push(e));
    adapter.onGraphChanged((e) => received2.push(e));

    adapter.handleEvent(makeEvent(stateJsonPath('g1')));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it('should include correct WorkGraphChangedEvent fields', () => {
    /*
    Test Doc:
    - Why: CF-09 — event shape must match old GraphChangedEvent exactly
    - Contract: Event has graphSlug, workspaceSlug, worktreePath, filePath, timestamp (Date)
    - Usage Notes: timestamp is instanceof Date — no value assertion (Insight #2)
    - Quality Contribution: Catches shape drift from old interface
    - Worked Example: event for my-graph → all 5 fields present and correct
    */
    const received: WorkGraphChangedEvent[] = [];
    adapter.onGraphChanged((e) => received.push(e));

    const path = stateJsonPath('my-graph');
    adapter.handleEvent(makeEvent(path, 'change', '/wt', 'my-ws'));

    expect(received).toHaveLength(1);
    const event = received[0];
    expect(event.graphSlug).toBe('my-graph');
    expect(event.workspaceSlug).toBe('my-ws');
    expect(event.worktreePath).toBe('/wt');
    expect(event.filePath).toBe(path);
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it("should have name 'workgraph-watcher'", () => {
    /*
    Test Doc:
    - Why: IWatcherAdapter.name used in CentralWatcherService error messages (Insight #3)
    - Contract: adapter.name === 'workgraph-watcher'
    - Usage Notes: Name is readonly, set in constructor or class field
    - Quality Contribution: Catches accidental renames that break log messages
    - Worked Example: adapter.name → 'workgraph-watcher'
    */
    expect(adapter.name).toBe('workgraph-watcher');
  });

  it('should notify remaining subscribers when one throws', () => {
    /*
    Test Doc:
    - Why: Error isolation — one bad subscriber must not break others (Insight #5)
    - Contract: Throwing subscriber caught, remaining subscribers still called
    - Usage Notes: Matches CentralWatcherService per-adapter try/catch pattern
    - Quality Contribution: Prevents silent subscriber loss at runtime
    - Worked Example: [throws, collects] → collects receives event despite throws erroring
    */
    const received: WorkGraphChangedEvent[] = [];
    adapter.onGraphChanged(() => {
      throw new Error('subscriber error');
    });
    adapter.onGraphChanged((e) => received.push(e));

    adapter.handleEvent(makeEvent(stateJsonPath('g1')));

    expect(received).toHaveLength(1);
  });
});
