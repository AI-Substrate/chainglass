# Workshop 02: Worktree-Wide Watcher Strategy

**Type**: Integration Pattern
**Plan**: 041-file-browser
**Spec**: `file-browser-spec.md`
**Research**: `research.md`
**Created**: 2026-02-24
**Status**: Draft

**Related Documents**:
- `workshops/01-browser-event-hub-design.md` — Browser-side event hub (consumer of these events)
- `docs/adr/adr-0010-central-domain-event-notification-architecture.md` — Three-layer notification pattern
- `docs/how/dev/central-events/3-adapters.md` — Adapter pattern guide
- `docs/plans/023-central-watcher-notifications/` — Original watcher plan

**Domain Context**:
- **Primary Domain**: `_platform/events` — owns CentralWatcherService, IWatcherAdapter, SSE pipeline
- **Related Domains**: `file-browser` — owns the concrete FileChangeWatcherAdapter and consumer hooks

---

## Purpose

Design the server-side strategy for expanding filesystem watching from `.chainglass/data/` directories to entire worktrees. This covers ignore patterns, event volume management, debouncing, the new watcher adapter, and the domain event adapter that feeds file change events into the SSE pipeline.

## Key Questions Addressed

- How do we expand CentralWatcherService to watch full worktrees without modifying its core?
- What ignore patterns prevent event storms from `node_modules`, `.git`, etc.?
- How do we debounce/batch rapid file changes into efficient SSE messages?
- Should we watch all worktrees eagerly or only the one the user is browsing?
- What happens during git operations (checkout, merge, rebase)?
- How do we handle the lifecycle — start watching when user navigates, stop when they leave?

---

## Overview

The existing `CentralWatcherService` creates one chokidar watcher per worktree, scoped to `<worktree>/.chainglass/data/`. To watch entire worktrees, we add a **parallel watch path** alongside the existing data directory watch. The service already dispatches ALL events to ALL registered adapters — a new `FileChangeWatcherAdapter` self-filters for source file events.

```
CentralWatcherService
├── Data watchers (existing): <worktree>/.chainglass/data/
│   └── WorkGraphWatcherAdapter (filters state.json)
│
└── Source watchers (NEW): <worktree>/ (with ignore patterns)
    └── FileChangeWatcherAdapter (filters by interest, batches, emits)
```

## Design Decision: Extend CentralWatcherService, Not a New Service

**Option A: Add source watchers to CentralWatcherService** ✅ CHOSEN
- Reuses existing worktree discovery, rescan, lifecycle management
- Single service to start/stop in bootstrap
- Adapters already wired — just register a new one
- Change is additive: new `createSourceWatchers()` method alongside `createDataWatchers()`

**Option B: Create a separate SourceFileWatcherService** ❌ REJECTED
- Duplicates worktree discovery logic
- Requires separate DI registration, separate bootstrap wiring
- Two services to coordinate lifecycle
- Violates DRY for no architectural benefit

**Option C: Make data watcher path configurable per registration** ❌ REJECTED
- Over-engineers the watch path — we always want `.chainglass/data/` AND the worktree root
- Configuration complexity for a binary choice (data vs source vs both)

## Ignore Patterns

### Default Ignore Set

```typescript
// packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts

/**
 * Ignore patterns for worktree-wide file watching.
 * These are passed to chokidar's `ignored` option.
 *
 * Strategy: ignore build artifacts, dependencies, VCS internals,
 * and anything that generates high-frequency transient changes.
 */
export const SOURCE_WATCHER_IGNORED: (string | RegExp)[] = [
  // VCS
  '**/.git/**',

  // Dependencies
  '**/node_modules/**',
  '**/vendor/**',
  '**/.pnpm-store/**',

  // Build artifacts
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/__pycache__/**',

  // IDE / editor
  '**/.idea/**',
  '**/.vscode/**',     // Settings, not user code
  '**/*.swp',
  '**/*.swo',
  '**/*~',

  // OS
  '**/.DS_Store',
  '**/Thumbs.db',

  // Chainglass data (already watched by data watchers)
  '**/.chainglass/**',

  // Lock files (change on every install, not user-authored)
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
];
```

**Why ignore `.chainglass/`:** Data directory is already watched by the existing data watchers. Watching it twice would create duplicate events for workgraph state changes.

**Why ignore lock files:** They change frequently during `pnpm install` but aren't user-authored content. A `package.json` change IS watched (dependency intent), but the lock file is an artifact.

### Chokidar Configuration

```typescript
// Source watcher config — tuned for user-authored files
const sourceWatcherOptions: WatcherOptions = {
  ignoreInitial: true,          // Don't emit for existing files (PL-01)
  atomic: true,                 // Handle atomic writes (tmp → rename)
  awaitWriteFinish: {
    stabilityThreshold: 300,    // Slightly higher than data watchers (200ms)
    pollInterval: 100,          // Matches existing config
  },
  ignored: SOURCE_WATCHER_IGNORED,
  depth: 20,                    // Reasonable max depth
  persistent: true,
};
```

**Why `stabilityThreshold: 300ms` not 200ms:**
- Source files are often saved by editors that do write-rename-rename sequences
- Higher threshold reduces false positives from editor intermediate files
- 300ms is still fast enough for responsive UX (debounce adds 300ms → total ~600ms)

## CentralWatcherService Extension

### New Method: createSourceWatchers()

```typescript
// Addition to CentralWatcherService

/** Source file watchers keyed by worktree path */
private readonly sourceWatchers = new Map<string, IFileWatcher>();

private async createSourceWatchers(): Promise<void> {
  const workspaces = await this.registry.list().catch(() => []);

  const worktreeResults = await Promise.all(
    workspaces.map(async (workspace) => {
      const worktrees = await this.worktreeResolver
        .detectWorktrees(workspace.path)
        .catch(() => []);
      return worktrees.map((wt) => ({ path: wt.path, slug: workspace.slug }));
    })
  );

  await Promise.all(
    worktreeResults.flat().map((entry) =>
      this.createSourceWatcherForWorktree(entry.path, entry.slug)
    )
  );
}

private async createSourceWatcherForWorktree(
  worktreePath: string,
  workspaceSlug: string
): Promise<void> {
  try {
    const watcher = this.fileWatcherFactory.create({
      ignoreInitial: true,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      ignored: SOURCE_WATCHER_IGNORED,
      depth: 20,
    });

    watcher.add(worktreePath);

    const eventTypes: FileWatcherEvent[] = ['change', 'add', 'unlink'];
    for (const eventType of eventTypes) {
      watcher.on(eventType, (pathOrError) => {
        if (typeof pathOrError === 'string') {
          this.dispatchEvent(pathOrError, eventType, worktreePath, workspaceSlug);
        }
      });
    }

    this.sourceWatchers.set(worktreePath, watcher);
  } catch (err) {
    this.logError(`Failed to create source watcher for ${worktreePath}`, err);
  }
}
```

### Modified start() and stop()

```typescript
async start(): Promise<void> {
  if (this.watching) throw new Error('Already watching');

  await this.createDataWatchers();     // Existing
  await this.createSourceWatchers();   // NEW

  // Registry watcher (existing) — also triggers rescan for source watchers
  this.registryWatcher = this.fileWatcherFactory.create({ ... });
  // ...
  this.watching = true;
}

async stop(): Promise<void> {
  if (!this.watching) return;
  this.watching = false;

  // Close data watchers (existing)
  for (const [, watcher] of this.dataWatchers) await watcher.close();
  this.dataWatchers.clear();

  // Close source watchers (NEW)
  for (const [, watcher] of this.sourceWatchers) await watcher.close();
  this.sourceWatchers.clear();

  // Close registry watcher (existing)
  if (this.registryWatcher) {
    await this.registryWatcher.close();
    this.registryWatcher = null;
  }
}
```

### Modified rescan()

The existing `performRescan()` already diffs current worktrees against watched worktrees. Extend it to handle source watchers too:

```typescript
private async performRescan(): Promise<void> {
  // ... existing worktree discovery ...

  // Close data watchers for removed worktrees (existing)
  // Create data watchers for new worktrees (existing)

  // Close source watchers for removed worktrees (NEW)
  for (const [wtPath, watcher] of this.sourceWatchers) {
    if (!currentWorktrees.has(wtPath)) {
      await watcher.close();
      this.sourceWatchers.delete(wtPath);
    }
  }

  // Create source watchers for new worktrees (NEW)
  const sourceAdditions = [...currentWorktrees.entries()]
    .filter(([wtPath]) => !this.sourceWatchers.has(wtPath))
    .map(([wtPath, slug]) => this.createSourceWatcherForWorktree(wtPath, slug));
  await Promise.all(sourceAdditions);
}
```

## FileChangeWatcherAdapter

### Design

The adapter receives ALL filesystem events (from both data and source watchers) and filters for source file changes. It accumulates changes within a debounce window and emits batched events.

```typescript
// packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts

import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

export interface FileChangeEvent {
  /** Relative path from worktree root */
  path: string;
  /** Type of change */
  eventType: 'add' | 'change' | 'unlink';
  /** Worktree root path */
  worktreePath: string;
  /** Workspace slug */
  workspaceSlug: string;
  /** When the change was detected */
  timestamp: Date;
}

type FileChangeBatchCallback = (events: FileChangeEvent[]) => void;

/**
 * Watcher adapter that collects source file change events
 * and emits them in debounced batches.
 *
 * Filters out .chainglass/data/ events (already handled by
 * WorkGraphWatcherAdapter) and batches rapid changes into
 * single emissions.
 */
export class FileChangeWatcherAdapter implements IWatcherAdapter {
  readonly name = 'file-change-watcher';

  private readonly subscribers = new Set<FileChangeBatchCallback>();
  private pending: FileChangeEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  handleEvent(event: WatcherEvent): void {
    // Skip .chainglass/data/ events — handled by data watchers
    if (event.path.includes('/.chainglass/')) return;

    // Convert absolute path to relative
    const relativePath = event.path.startsWith(event.worktreePath + '/')
      ? event.path.slice(event.worktreePath.length + 1)
      : event.path;

    const fileEvent: FileChangeEvent = {
      path: relativePath,
      eventType: event.eventType as 'add' | 'change' | 'unlink',
      worktreePath: event.worktreePath,
      workspaceSlug: event.workspaceSlug,
      timestamp: new Date(),
    };

    this.pending.push(fileEvent);
    this.scheduleFlush();
  }

  /**
   * Subscribe to batched file change events.
   * @returns Unsubscribe function
   */
  onFilesChanged(callback: FileChangeBatchCallback): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return; // Already scheduled
    this.flushTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pending.length === 0) return;

    const batch = this.deduplicateBatch(this.pending);
    this.pending = [];

    for (const callback of this.subscribers) {
      try {
        callback(batch);
      } catch (err) {
        console.warn(`[${this.name}] Subscriber callback threw`, err);
      }
    }
  }

  /**
   * Deduplicate events for the same file within a batch.
   * If a file has multiple events, keep the latest one.
   * Special case: add + unlink in same batch = net delete.
   */
  private deduplicateBatch(events: FileChangeEvent[]): FileChangeEvent[] {
    const byPath = new Map<string, FileChangeEvent>();
    for (const event of events) {
      const key = `${event.worktreePath}:${event.path}`;
      byPath.set(key, event); // Last event wins
    }
    return [...byPath.values()];
  }

  /** For testing — flush pending events immediately */
  flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flush();
  }

  /** For cleanup — cancel pending flush */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pending = [];
  }
}
```

**Key Design Decisions:**

1. **Server-side debounce (300ms):** Batches rapid filesystem events (git checkout can produce hundreds in milliseconds) into single SSE messages. Reduces SSE message volume by 10-100x during bulk operations.

2. **Deduplication within batch:** If `file.txt` changes 5 times in 300ms, only one event is emitted. Last event wins (most recent state is what matters).

3. **Relative paths:** Converted from absolute to relative at the adapter level. The SSE message and browser hub both work with relative paths — simpler pattern matching, less bandwidth.

4. **`.chainglass/` filter:** Source file adapter ignores events from `.chainglass/data/` because the WorkGraphWatcherAdapter already handles those. No double-processing.

## FileChangeDomainEventAdapter

```typescript
// apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts

import { DomainEventAdapter } from '@chainglass/shared';
import type { ICentralEventNotifier } from '@chainglass/shared';
import { WorkspaceDomain } from '@chainglass/shared';
import type { FileChangeEvent } from '@chainglass/workflow';

/**
 * Domain event adapter that transforms batched file change events
 * into SSE broadcasts on the 'file-changes' channel.
 */
interface FileChangeBatchEvent {
  changes: FileChangeEvent[];
}

export class FileChangeDomainEventAdapter extends DomainEventAdapter<FileChangeBatchEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.FileChanges, 'file-changed');
  }

  extractData(event: FileChangeBatchEvent): Record<string, unknown> {
    return {
      changes: event.changes.map((c) => ({
        path: c.path,
        eventType: c.eventType,
        worktreePath: c.worktreePath,
        timestamp: c.timestamp.getTime(),
      })),
    };
  }
}
```

**Why the adapter receives a batch, not individual events:**
- Per ADR-0007: SSE carries minimal data. A batch of `{ path, eventType }` objects is still minimal
- One SSE message per batch, not one per file — efficient transport
- Client-side hub receives one dispatch per batch — efficient rendering

## Bootstrap Wiring

```typescript
// apps/web/src/features/027-central-notify-events/start-central-notifications.ts
// Addition to existing bootstrap function

export async function startCentralNotificationSystem(): Promise<void> {
  // ... existing setup ...

  // Existing: WorkGraph watcher + domain adapter
  const workgraphWatcherAdapter = new WorkGraphWatcherAdapter();
  const workgraphDomainAdapter = new WorkgraphDomainEventAdapter(notifier);
  workgraphWatcherAdapter.onGraphChanged((event) => {
    workgraphDomainAdapter.handleEvent(event);
  });

  // NEW: File change watcher + domain adapter
  const fileChangeWatcherAdapter = new FileChangeWatcherAdapter(300);
  const fileChangeDomainAdapter = new FileChangeDomainEventAdapter(notifier);
  fileChangeWatcherAdapter.onFilesChanged((events) => {
    fileChangeDomainAdapter.handleEvent({ changes: events });
  });

  // Register both adapters with watcher service
  watcher.registerAdapter(workgraphWatcherAdapter);
  watcher.registerAdapter(fileChangeWatcherAdapter);   // NEW

  await watcher.start();
}
```

## Event Volume Analysis

### Normal Development

| Activity | Events/sec | After Debounce (300ms) | SSE Messages/sec |
|----------|-----------|------------------------|------------------|
| User saves a file | 1-3 | 1 | ~0.3 |
| Editor auto-save | 1-2 | 1 | ~0.3 |
| File creation | 1 | 1 | ~0.3 |
| Idle | 0 | 0 | 0 |

### Bulk Operations

| Activity | Events/sec | After Debounce | SSE Messages/sec |
|----------|-----------|----------------|------------------|
| `git checkout branch` | 100-500 | 2-5 batches | ~1.5 |
| `git merge` | 50-200 | 1-3 batches | ~1.0 |
| `pnpm install` | 1000+ | Ignored (node_modules) | 0 |
| `pnpm build` | 50-100 | Ignored (dist, .next) | 0 |

**Key insight:** The ignore patterns handle the truly explosive operations (install, build). Git operations produce moderate bursts that debouncing handles gracefully.

### Worst Case: Large Monorepo

Watching a worktree with 10,000+ tracked files:
- **Memory**: chokidar uses ~50-100 bytes per watched file = ~1MB overhead
- **CPU**: Idle watching costs essentially zero (inotify/FSEvents is kernel-level)
- **Burst**: Git operations on 10K files produce ~10K events in ~2 seconds
  - Debounce batches into ~7 messages (2000ms / 300ms window)
  - Each message may contain 100-1500 changes
  - Client hub dispatches 7 times, components re-render 7 times (debounced locally)

**Verdict: Acceptable.** The debounce + ignore pattern combination keeps volume manageable even for large repos.

## Lifecycle Management

### Eager vs Lazy Watching

**RESOLVED: Eager watching (watch all worktrees at startup)**

Rationale:
- CentralWatcherService already watches all worktrees for `.chainglass/data/`
- Adding source watchers to the same worktrees is a marginal cost increase
- Lazy watching would require client-to-server signaling ("start watching this worktree")
- Eager watching means events are ready the instant a user opens a worktree
- Memory/CPU cost is negligible (see analysis above)

**If this becomes a problem later:** Add an opt-in per-workspace config: `"watchSourceFiles": true/false`. Default true for small repos, false for monorepos with 50K+ files.

### Worktree Add/Remove

Already handled by the existing `rescan()` mechanism:
- Registry watcher detects workspace add/remove
- `performRescan()` diffs current worktrees against watched worktrees
- New worktrees get both data + source watchers
- Removed worktrees get both watchers closed

### Server Shutdown

```
Next.js process exits
  → CentralWatcherService.stop() called (if graceful)
  → All chokidar watchers closed
  → No orphaned file handles
```

If ungraceful (kill -9), chokidar handles are cleaned up by the OS. No persistent state to corrupt.

## Git Operation Handling

### Problem: Git Operations Create Event Storms

A `git checkout` that changes 200 files produces 200 `unlink` events + 200 `add` events = 400 events in ~100ms.

### Solution: Multi-Layer Debouncing

```
Layer 1: chokidar awaitWriteFinish (300ms stabilization)
  → Absorbs write-rename-write sequences from editors
  → Absorbs partial file states during git checkout

Layer 2: FileChangeWatcherAdapter batch debounce (300ms)
  → Accumulates all events within 300ms window
  → Deduplicates: same file multiple events → last event wins
  → Emits one batch to domain adapter

Layer 3: Client-side useFileChanges debounce (100ms default)
  → Absorbs multiple SSE batches arriving in quick succession
  → Each component controls its own re-render frequency
```

**Total worst-case latency:** 300ms (chokidar) + 300ms (adapter batch) + 100ms (client debounce) = **~700ms** from file change to UI update. Acceptable for a "something changed" notification.

### Deduplication During Git Checkout

```
Time 0ms:   git checkout starts
Time 10ms:  unlink src/App.tsx          ← pending
Time 15ms:  unlink src/index.ts         ← pending
Time 20ms:  add src/App.tsx (new ver)   ← replaces unlink in pending
Time 25ms:  add src/index.ts (new ver)  ← replaces unlink in pending
Time 300ms: flush batch → [
  { path: 'src/App.tsx', eventType: 'add' },      // Net: file replaced
  { path: 'src/index.ts', eventType: 'add' },     // Net: file replaced
]
```

The "last event wins" deduplication naturally resolves unlink→add sequences into a single `add` event. The client sees "files were updated" — correct behavior.

## Testing Strategy

### Unit Tests (FileChangeWatcherAdapter)

```typescript
// test/unit/workflow/file-change-watcher.adapter.test.ts

describe('FileChangeWatcherAdapter', () => {
  it('filters out .chainglass/ events');
  it('converts absolute paths to relative');
  it('debounces rapid events into batches');
  it('deduplicates same-file events within batch (last wins)');
  it('emits to all subscribers');
  it('isolates subscriber errors');
  it('flushNow() emits immediately');
  it('destroy() cancels pending flush');
});
```

### Contract Tests (Fake Parity)

```typescript
// FakeFileChangeWatcherAdapter with same API:
// - handleEvent(), onFilesChanged(), flushNow(), subscriberCount
// - Records events for test inspection
```

### Integration Tests

```typescript
// test/integration/file-change-watcher.integration.test.ts

describe('FileChangeWatcherAdapter integration', () => {
  it('watcher event → adapter → domain adapter → notifier.emit');
  it('rapid changes batched into single emit');
  it('.chainglass events not emitted');
});
```

## Open Questions

### Q1: Should we watch dot-directories (`.github/`, `.vscode/`)?

**RESOLVED: No for `.vscode/` and `.idea/`, yes for `.github/`.**
- `.vscode/` and `.idea/` are IDE settings — not user-authored content relevant to file browsing
- `.github/` contains workflows, issue templates — user-authored, should be browsable and watchable
- Added `.vscode/` and `.idea/` to ignore list; `.github/` is NOT ignored

### Q2: Should we support configurable ignore patterns per workspace?

**OPEN → DEFERRED: Not for v1.**
- Default patterns cover 95% of use cases
- Configuration UI and storage adds complexity
- If needed, add `"sourceWatcherIgnore": [...]` to workspace preferences later
- The ignore list is a constant — easy to extend or make configurable in v2

### Q3: What about symlinked directories?

**RESOLVED: Follow chokidar defaults (follow symlinks).**
- chokidar follows symlinks by default (`followSymlinks: true`)
- This matches user expectation — if they symlink `shared/` into their worktree, changes to symlinked files should appear
- If a symlink points to `node_modules/` or another ignored path, the ignore pattern catches it

### Q4: Memory impact of watching large worktrees?

**RESOLVED: Acceptable for typical projects.**
- chokidar uses inotify (Linux) / FSEvents (macOS) — kernel-level, O(1) per watched directory
- Memory: ~50-100 bytes per watched path in the Node.js heap
- 10,000 files = ~1MB overhead
- 50,000 files = ~5MB overhead (monorepo scale — may want opt-in)
- CPU at idle: effectively zero (kernel-level event notification)

---

## Quick Reference

### New Files to Create

| File | Package | Purpose |
|------|---------|---------|
| `source-watcher.constants.ts` | workflow | SOURCE_WATCHER_IGNORED patterns |
| `file-change-watcher.adapter.ts` | workflow | FileChangeWatcherAdapter |
| `file-change-watcher.adapter.test.ts` | test | Unit tests |
| `fake-file-change-watcher.adapter.ts` | workflow | Test fake |
| `file-change-domain-event-adapter.ts` | web (027) | Domain adapter |
| `file-change-domain-event-adapter.test.ts` | test | Unit tests |

### Files to Modify

| File | Change |
|------|--------|
| `workspace-domain.ts` | Add `FileChanges: 'file-changes'` |
| `central-watcher.service.ts` | Add `sourceWatchers` map, `createSourceWatchers()`, modify `start()`/`stop()`/`rescan()` |
| `start-central-notifications.ts` | Wire FileChangeWatcherAdapter + FileChangeDomainEventAdapter |
| `central-watcher.interface.ts` | No change needed (start/stop/rescan/registerAdapter cover it) |

### Event Flow Summary

```
File saved on disk
  → chokidar detects change (300ms stabilization)
    → CentralWatcherService.dispatchEvent()
      → FileChangeWatcherAdapter.handleEvent() [self-filter, accumulate]
        → 300ms debounce window expires
          → flush() → dedup → emit batch to subscribers
            → FileChangeDomainEventAdapter.handleEvent({ changes })
              → notifier.emit('file-changes', 'file-changed', { changes })
                → SSEManagerBroadcaster.broadcast('file-changes', ...)
                  → SSEManager → all connected EventSource clients
                    → FileChangeHub.dispatch(changes)
                      → useFileChanges subscribers re-render
```

**Total latency: ~600-700ms** (chokidar stabilization + adapter debounce + SSE transport)
