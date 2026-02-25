# Workshop 01: Browser-Side Event Hub Design

**Type**: Integration Pattern
**Plan**: 041-file-browser
**Spec**: `file-browser-spec.md`
**Research**: `research.md`
**Created**: 2026-02-24
**Status**: Draft

**Related Documents**:
- `workshops/workspace-context-session-binding.md` — Workspace/worktree context binding
- `docs/adr/adr-0010-central-domain-event-notification-architecture.md` — Three-layer notification pattern
- `docs/how/dev/central-events/3-adapters.md` — Adapter pattern guide
- `docs/domains/_platform/events/domain.md` — Notifications domain

**Domain Context**:
- **Primary Domain**: `_platform/events` — owns SSE infrastructure, useSSE, WorkspaceDomain
- **Related Domains**: `file-browser` — owns consumer hooks and UI integration

---

## Purpose

Design a browser-side event hub that receives file change events via SSE and dispatches them to subscribing UI components via path-pattern matching. The hub must be trivially easy to use — the "SDK For Us" concept — so that any component can subscribe to file changes with a single hook call and automatically clean up on unmount.

## Key Questions Addressed

- How do UI components subscribe to file changes for specific paths or directories?
- What is the hook API? How does a component say "notify me when files in `/src/components/` change"?
- How many SSE connections are needed? One per worktree? One per component?
- How does the hub handle deduplication, debouncing, and event ordering?
- How does the hub integrate with the existing notification-fetch pattern (ADR-0007)?
- What happens when the user navigates away from a worktree?

---

## Overview

The browser-side event hub sits between the SSE transport layer and the UI components. It maintains a **single SSE connection per worktree** and fans out events to subscribers based on path patterns. Components subscribe via a React hook that returns a stream of change events for paths they care about.

```
SSE Connection (/api/events/file-changes)
        │
        ▼
┌─────────────────────────────────┐
│     FileChangeHub (singleton)   │
│                                 │
│  subscribers: Map<id, {         │
│    pattern: string | RegExp,    │
│    callback: (event) => void    │
│  }>                             │
│                                 │
│  on SSE message:                │
│    for each subscriber:         │
│      if pathMatches(pattern):   │
│        callback(event)          │
└─────────────────────────────────┘
        │           │           │
        ▼           ▼           ▼
   FileTree    FileViewer    ChangesView
  (dir match)  (exact path)  (all changes)
```

## Design Decision: Single Hub, Single Connection

**Why one SSE connection per worktree, not per component:**
- Each SSE connection holds a server-side `ReadableStreamController` open
- Multiple components on the same page would create N connections to the same channel
- Server broadcasts to ALL connections on a channel — each message is sent N times
- Hub pattern: one connection, client-side fan-out → minimal server load

**Why a hub, not direct hook usage:**
- The existing `useSSE` hook returns raw messages — components would need to filter independently
- Pattern-matching logic would be duplicated across every consumer
- No deduplication — same event processed by every component independently
- The hub centralizes filtering, dedup, and debouncing

## SSE Channel & Event Types

### WorkspaceDomain Extension

```typescript
// packages/shared/src/features/027-central-notify-events/workspace-domain.ts
export const WorkspaceDomain = {
  Workgraphs: 'workgraphs',
  Agents: 'agents',
  FileChanges: 'file-changes',    // NEW — entire-worktree file events
} as const;
```

**Why `file-changes` not `files`:** Disambiguates from a hypothetical "files" REST API domain. The channel name clearly communicates that these are change notifications.

### SSE Event Payload

```typescript
// Minimal payload per ADR-0007 (notification-fetch pattern)
interface FileChangeSSEEvent {
  type: 'file-changed';
  changes: FileChange[];
}

interface FileChange {
  path: string;            // Relative to worktree root, e.g. "src/components/Button.tsx"
  eventType: 'add' | 'change' | 'unlink';
  timestamp: number;       // Unix ms
}
```

**Why batched `changes[]` not individual events:**
- Server-side debounce window (300ms) batches rapid changes into one SSE message
- Reduces SSE message volume during git operations (checkout, merge, rebase)
- Client receives one message with 50 changes, not 50 individual messages

**Why relative paths:**
- Worktree root is known to the hub (passed at connection time)
- Relative paths are shorter (less SSE bandwidth)
- Pattern matching against relative paths is more intuitive: `src/components/**`

## Hub Implementation

### Core Hub Class

```typescript
// apps/web/src/features/041-file-browser/hooks/file-change-hub.ts

type FileChangeCallback = (changes: FileChange[]) => void;
type PathMatcher = (path: string) => boolean;

interface Subscription {
  id: string;
  matcher: PathMatcher;
  callback: FileChangeCallback;
}

export class FileChangeHub {
  private subscriptions = new Map<string, Subscription>();
  private nextId = 0;

  /**
   * Subscribe to file changes matching a pattern.
   *
   * @param pattern - Glob-like pattern or exact path
   *   - "src/components/" → changes in that directory (non-recursive)
   *   - "src/components/**" → changes recursively under that path
   *   - "src/components/Button.tsx" → exact file match
   *   - "*" → all changes
   * @param callback - Called with matching changes (batched)
   * @returns Unsubscribe function
   */
  subscribe(pattern: string, callback: FileChangeCallback): () => void {
    const id = `sub_${this.nextId++}`;
    const matcher = this.createMatcher(pattern);
    this.subscriptions.set(id, { id, matcher, callback });
    return () => { this.subscriptions.delete(id); };
  }

  /**
   * Dispatch SSE events to matching subscribers.
   * Called by the hub's SSE connection handler.
   */
  dispatch(changes: FileChange[]): void {
    for (const [, sub] of this.subscriptions) {
      const matching = changes.filter((c) => sub.matcher(c.path));
      if (matching.length > 0) {
        try {
          sub.callback(matching);
        } catch (err) {
          console.warn('[FileChangeHub] Subscriber threw', err);
        }
      }
    }
  }

  /** Number of active subscriptions (for diagnostics) */
  get subscriberCount(): number {
    return this.subscriptions.size;
  }

  private createMatcher(pattern: string): PathMatcher {
    if (pattern === '*') {
      return () => true;
    }
    // Exact file match
    if (!pattern.includes('*') && !pattern.endsWith('/')) {
      return (path) => path === pattern;
    }
    // Directory match (non-recursive): "src/components/"
    if (pattern.endsWith('/')) {
      const dir = pattern;
      return (path) => {
        if (!path.startsWith(dir)) return false;
        // No further slashes = direct child
        return !path.slice(dir.length).includes('/');
      };
    }
    // Recursive match: "src/components/**"
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3); // Remove /**
      return (path) => path.startsWith(prefix + '/') || path === prefix;
    }
    // Fallback: prefix match
    return (path) => path.startsWith(pattern);
  }
}
```

**Why not use a library (minimatch, picomatch)?**
- Only 3 patterns needed: exact, directory, recursive
- Library adds bundle weight for unused features
- Simple implementation is testable and debuggable
- Can upgrade to picomatch later if glob complexity grows

### React Context & Provider

```typescript
// apps/web/src/features/041-file-browser/hooks/file-change-provider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

const FileChangeHubContext = createContext<FileChangeHub | null>(null);

interface FileChangeProviderProps {
  worktreePath: string;
  children: React.ReactNode;
}

/**
 * Provides a FileChangeHub scoped to a worktree.
 * Manages the single SSE connection lifecycle.
 *
 * Mount inside BrowserClient — one per worktree view.
 */
export function FileChangeProvider({ worktreePath, children }: FileChangeProviderProps) {
  const hub = useMemo(() => new FileChangeHub(), [worktreePath]);

  // SSE connection lifecycle
  useEffect(() => {
    const eventSource = new EventSource(`/api/events/${WorkspaceDomain.FileChanges}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FileChangeSSEEvent;
        if (data.type === 'file-changed' && data.changes) {
          hub.dispatch(data.changes);
        }
      } catch {
        // Malformed message — ignore
      }
    };

    eventSource.onerror = () => {
      // useSSE handles reconnection; if we use raw EventSource,
      // browser auto-reconnects per SSE spec
    };

    return () => {
      eventSource.close();
    };
  }, [hub, worktreePath]);

  return (
    <FileChangeHubContext.Provider value={hub}>
      {children}
    </FileChangeHubContext.Provider>
  );
}

export function useFileChangeHub(): FileChangeHub {
  const hub = useContext(FileChangeHubContext);
  if (!hub) {
    throw new Error('useFileChangeHub must be used within a FileChangeProvider');
  }
  return hub;
}
```

**RESOLVED: Why React Context, not module singleton?**
- Hub is scoped to a worktree — navigating to a different worktree creates a new hub
- Module singleton would leak subscriptions across worktree navigations
- Context cleanup on unmount automatically closes SSE connection
- Testable: wrap test components with `<FileChangeProvider>` using fake hub

## Consumer Hook API — "SDK For Us"

### useFileChanges — The Primary Hook

```typescript
// apps/web/src/features/041-file-browser/hooks/use-file-changes.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFileChangesOptions {
  /** Debounce window in ms (default: 100) */
  debounce?: number;
  /** Whether to accumulate changes or replace (default: 'replace') */
  mode?: 'accumulate' | 'replace';
}

interface UseFileChangesReturn {
  /** Latest batch of changes matching the pattern */
  changes: FileChange[];
  /** Clear accumulated changes (e.g., after handling) */
  clearChanges: () => void;
  /** Whether any changes have occurred since last clear */
  hasChanges: boolean;
}

/**
 * Subscribe to file changes matching a path pattern.
 *
 * @example
 * // Watch a specific file (for "changed externally" banner)
 * const { hasChanges } = useFileChanges('src/App.tsx');
 *
 * // Watch a directory (for tree view updates)
 * const { changes } = useFileChanges('src/components/');
 *
 * // Watch everything recursively (for changes sidebar)
 * const { changes } = useFileChanges('*');
 */
export function useFileChanges(
  pattern: string,
  options: UseFileChangesOptions = {}
): UseFileChangesReturn {
  const { debounce = 100, mode = 'replace' } = options;
  const hub = useFileChangeHub();
  const [changes, setChanges] = useState<FileChange[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unsubscribe = hub.subscribe(pattern, (incoming) => {
      // Debounce rapid changes into a single state update
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setChanges((prev) =>
          mode === 'accumulate' ? [...prev, ...incoming] : incoming
        );
      }, debounce);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hub, pattern, debounce, mode]);

  const clearChanges = useCallback(() => setChanges([]), []);

  return {
    changes,
    clearChanges,
    hasChanges: changes.length > 0,
  };
}
```

### Usage Examples — How Easy Is It?

```typescript
// ─── FileTree: Watch expanded directories ───
function FileTree({ expandedDirs }: Props) {
  // Watch all expanded directories for new/removed files
  for (const dir of expandedDirs) {
    const { hasChanges } = useFileChanges(`${dir}/`);
    // hasChanges triggers re-fetch of that directory's entries
  }
}

// ─── FileViewerPanel: Watch open file ───
function FileViewerPanel({ filePath }: Props) {
  const { hasChanges, clearChanges } = useFileChanges(filePath);

  // Show banner when file changes externally
  if (hasChanges) {
    return <ExternalChangeBanner onRefresh={() => {
      refreshFile();   // Re-read from server
      clearChanges();  // Dismiss banner
    }} />;
  }
}

// ─── ChangesView: Watch entire worktree ───
function ChangesView() {
  const { changes } = useFileChanges('*', { mode: 'accumulate' });
  // Re-fetch working changes list when any file changes
}
```

**That's the "SDK For Us" vision:** One line to subscribe. Automatic cleanup. Pattern-based filtering. No SSE plumbing visible.

## Integration with FileTree

### Challenge: Dynamic Subscriptions for Expanded Directories

The tree view needs to watch directories that are currently expanded. As the user expands/collapses, subscriptions must be added/removed.

```typescript
// Hook: useTreeDirectoryChanges
// Manages a set of directory subscriptions that changes as dirs expand/collapse

export function useTreeDirectoryChanges(
  expandedDirs: Set<string>
): Map<string, FileChange[]> {
  const hub = useFileChangeHub();
  const [dirChanges, setDirChanges] = useState(new Map<string, FileChange[]>());
  const subsRef = useRef(new Map<string, () => void>());

  useEffect(() => {
    const currentSubs = subsRef.current;

    // Unsubscribe from collapsed directories
    for (const [dir, unsub] of currentSubs) {
      if (!expandedDirs.has(dir)) {
        unsub();
        currentSubs.delete(dir);
      }
    }

    // Subscribe to newly expanded directories
    for (const dir of expandedDirs) {
      if (!currentSubs.has(dir)) {
        const unsub = hub.subscribe(`${dir}/`, (changes) => {
          setDirChanges((prev) => {
            const next = new Map(prev);
            next.set(dir, changes);
            return next;
          });
        });
        currentSubs.set(dir, unsub);
      }
    }

    return () => {
      // Cleanup all on unmount
      for (const unsub of currentSubs.values()) unsub();
      currentSubs.clear();
    };
  }, [hub, expandedDirs]);

  return dirChanges;
}
```

**Integration in BrowserClient:**
```typescript
// In BrowserClient, after tree directories change
const dirChanges = useTreeDirectoryChanges(expandedDirs);

useEffect(() => {
  for (const [dir, changes] of dirChanges) {
    // Re-fetch directory entries for changed dirs
    handleExpand(dir);
  }
}, [dirChanges]);
```

## Integration with File Viewer

### "Changed Externally" Banner

```typescript
// In BrowserClient or FileViewerPanel wrapper
function FileViewerWithChanges({ filePath, ...props }: FileViewerPanelProps) {
  const { hasChanges, clearChanges } = useFileChanges(filePath);

  return (
    <FileViewerPanel
      {...props}
      externallyChanged={hasChanges}
      onRefreshFile={() => {
        handleRefreshFile();  // Existing refresh logic
        clearChanges();       // Dismiss the banner
      }}
    />
  );
}
```

The `FileViewerPanel` already has a `conflictError` banner (amber styling). The "externally changed" banner should be visually distinct:

```
┌──────────────────────────────────────────────────────────┐
│ ℹ️  This file was modified externally.  [Refresh]        │
│     Content may be out of date.                          │
└──────────────────────────────────────────────────────────┘
```

**Color**: Blue/info (not amber — amber is for save conflicts). Amber means "you tried to save and the file changed." Blue means "FYI, the file changed."

### Preview Mode: Auto-Refresh

In preview mode (read-only), the viewer can auto-refresh when the file changes — there's no unsaved state to protect.

```typescript
// Auto-refresh in preview mode
const { hasChanges, clearChanges } = useFileChanges(filePath);

useEffect(() => {
  if (hasChanges && mode === 'preview') {
    handleRefreshFile();
    clearChanges();
  }
}, [hasChanges, mode]);
```

### Edit Mode: Show Banner, Don't Auto-Refresh

In edit mode, auto-refresh would destroy the user's unsaved changes. Show the banner instead and let the user choose to refresh.

## Double-Event Suppression

**Problem (PL-04):** When the user saves a file in the editor, the watcher detects the change and sends an SSE event — creating a false "changed externally" notification.

**Solution:** Suppression window after UI-initiated saves.

```typescript
// In BrowserClient or hub integration
const recentSaves = useRef(new Set<string>());

async function handleSave(filePath: string, content: string) {
  // Mark file as recently saved
  recentSaves.current.add(filePath);

  const result = await saveFile(slug, worktreePath, filePath, content, expectedMtime);

  // Clear suppression after 2 seconds (covers chokidar's 200ms stabilization + SSE latency)
  setTimeout(() => {
    recentSaves.current.delete(filePath);
  }, 2000);

  return result;
}

// In hub event handler or useFileChanges wrapper
function filterSelfEdits(changes: FileChange[]): FileChange[] {
  return changes.filter((c) => !recentSaves.current.has(c.path));
}
```

**Why 2 seconds:**
- chokidar `awaitWriteFinish.stabilityThreshold`: 200ms
- Server-side debounce window: 300ms
- SSE broadcast + network latency: ~100ms
- Safety margin: ~1300ms
- Total: ~2000ms covers the round-trip

## Connection Lifecycle

### When to Connect

```
User navigates to /workspaces/[slug]/browser?worktree=/path/to/worktree
  → BrowserClient mounts
    → <FileChangeProvider worktreePath={worktreePath}>
      → Opens EventSource to /api/events/file-changes
      → Hub ready for subscriptions
```

### When to Disconnect

```
User navigates away (different worktree or different page)
  → BrowserClient unmounts
    → <FileChangeProvider> cleanup effect fires
      → eventSource.close()
      → Hub garbage collected (no more references)
      → All subscriptions gone
```

### What If User Closes Browser?

```
Browser tab closed or internet disconnected
  → EventSource connection drops
    → Server heartbeat (30s) detects dead controller
      → sseManager.removeConnection(channel, controller)
      → Connection cleaned up, no resource leak
```

**No special handling needed.** The existing SSE heartbeat mechanism (30-second `: heartbeat\n\n` comments) already handles this. Dead connections are removed when heartbeat enqueue fails.

### What If Server Restarts?

```
Next.js server restarts (HMR or full restart)
  → All SSE connections drop
  → EventSource auto-reconnects (browser native behavior)
  → New connection registered with SSEManager (globalThis singleton survives HMR)
  → Events resume flowing
```

## Server-Side: Worktree-Scoped Filtering

The hub receives ALL file change events for the `file-changes` channel. Events include `worktreePath` metadata so the hub can filter to the current worktree.

```typescript
// In FileChangeProvider SSE handler
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data) as FileChangeSSEEvent;
  if (data.type === 'file-changed') {
    // Filter to current worktree only
    const relevant = data.changes.filter(
      (c) => c.worktreePath === worktreePath
    );
    if (relevant.length > 0) {
      hub.dispatch(relevant);
    }
  }
};
```

**RESOLVED: Why not a per-worktree SSE channel?**
- Would require dynamic channel creation: `/api/events/file-changes-${encodedWorktreePath}`
- More SSE connections on the server side (one per open worktree)
- Single channel with client-side filtering is simpler and sufficient
- If volume becomes a problem, can add server-side channel scoping later

## Open Questions

### Q1: Should the hub debounce per-subscriber or globally?

**RESOLVED: Per-subscriber debounce via useFileChanges options.**
- Global debounce would delay all subscribers, even ones that want instant updates
- Per-subscriber debounce (default 100ms) lets each consumer choose its latency
- Tree view: 100ms debounce (batch rapid changes)
- File viewer banner: 0ms (instant feedback)
- Changes sidebar: 300ms (heavy re-fetch, more batching)

### Q2: Should we use useSSE or raw EventSource in the provider?

**RESOLVED: Raw EventSource (browser-native auto-reconnect).**
- `useSSE` adds message accumulation we don't need (hub dispatches immediately)
- `useSSE` reconnection is configurable but the browser's native EventSource auto-reconnect is sufficient
- Simpler is better for the provider layer
- If we need configurable reconnection later, swap to `useSSE` — the hub API doesn't change

### Q3: How does this interact with the existing `useWorkspaceSSE` hook?

**RESOLVED: They are independent patterns.**
- `useWorkspaceSSE` is for workspace-scoped REST API endpoints (e.g., `/api/workspaces/${slug}/agents/events`)
- `FileChangeProvider` connects to the global channel `/api/events/file-changes`
- No conflict or overlap — different channels, different use cases
- The `useWorkGraphSSE` exemplar is a domain-specific hook; `useFileChanges` follows the same philosophy

---

## Quick Reference

### For Consumers (Component Authors)

```typescript
// 1. Watch a specific file
const { hasChanges } = useFileChanges('path/to/file.tsx');

// 2. Watch a directory (direct children only)
const { changes } = useFileChanges('src/components/');

// 3. Watch recursively
const { changes } = useFileChanges('src/**');

// 4. Watch everything
const { changes } = useFileChanges('*');

// 5. Custom debounce
const { changes } = useFileChanges('src/', { debounce: 300 });

// 6. Accumulate (don't replace)
const { changes, clearChanges } = useFileChanges('*', { mode: 'accumulate' });
```

### For Infrastructure (Setting Up the Provider)

```tsx
// In BrowserClient or page layout
<FileChangeProvider worktreePath={worktreePath}>
  <FileTree ... />
  <FileViewerPanel ... />
</FileChangeProvider>
```

### Pattern Matching Reference

| Pattern | Matches | Does NOT Match |
|---------|---------|----------------|
| `src/App.tsx` | `src/App.tsx` | `src/App.test.tsx` |
| `src/components/` | `src/components/Button.tsx` | `src/components/ui/Input.tsx` |
| `src/components/**` | `src/components/Button.tsx`, `src/components/ui/Input.tsx` | `src/hooks/useX.ts` |
| `*` | Everything | Nothing |
