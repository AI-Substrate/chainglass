# Question Popper Overlay UI — Research & Pattern Guide

## Executive Summary
This document synthesizes existing UI patterns for building the Question Popper overlay UI. The codebase demonstrates three main overlay systems (Agent, Terminal, Activity Log) that follow consistent patterns for mutual exclusion, SSE subscription, and state management.

---

## 1. Activity Log Overlay Pattern

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx`

### How it Mounts
- **Context Provider** mounts in workspace layout via wrapper component
- Uses `ActivityLogOverlayProvider` wrapping the entire workspace
- Panel component dynamically imported with `ssr: false` to prevent server-side rendering of DOM-heavy component

**Provider Mount Location:**
```
/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
└─ ActivityLogOverlayWrapper
   └─ ActivityLogOverlayProvider (context)
      ├─ ActivityLogToastBridge (hook consumer)
      └─ ActivityLogOverlayPanel (dynamically imported, SSR: false)
```

### Mutual Exclusion Pattern
- **Event:** `overlay:close-all` custom event dispatched to window
- **Guard Mechanism:** `isOpeningRef` prevents self-closing when opening
- **Lifecycle:**
  1. Call `openActivityLog()` → sets `isOpeningRef.current = true`
  2. Dispatch `overlay:close-all` → sibling overlays listen
  3. Sibling listeners check `isOpeningRef.current` → skip close if true
  4. Set `isOpeningRef.current = false` after event dispatch
  5. Update state to open

**Code Pattern:**
```typescript
const openActivityLog = useCallback((worktreePath: string) => {
  isOpeningRef.current = true;  // DYK-01: Guard
  window.dispatchEvent(new CustomEvent('overlay:close-all'));
  isOpeningRef.current = false;
  setState({ isOpen: true, worktreePath });
}, []);

// Listener in same provider
useEffect(() => {
  const handler = () => {
    if (isOpeningRef.current) return; // DYK-01: skip self-close
    closeActivityLog();
  };
  window.addEventListener('overlay:close-all', handler);
  return () => window.removeEventListener('overlay:close-all', handler);
}, [closeActivityLog]);
```

### State Management
- **Context Type:** `ActivityLogOverlayContextValue`
- **State:** `{ isOpen: boolean, worktreePath: string | null }`
- **Actions:** `openActivityLog()`, `closeActivityLog()`, `toggleActivityLog()`
- **Additional Pattern:** `stateRef` tracks state outside setState for toggle logic that needs to read current state

---

## 2. Agent Overlay Pattern

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/use-agent-overlay.tsx`

### How it Mounts
- Global provider wrapping dashboard shell
- Uses same mutual exclusion pattern as Activity Log
- Panel component: `/apps/web/src/components/agents/agent-overlay-panel.tsx`

### Key Differences from Activity Log
- **State:** `{ activeAgentId: string | null, isOpen: boolean }`
- **No URL parameters** (unlike Activity Log which reads worktree from URL)
- **Simpler toggle logic** — only checks if same agent ID

### Positioning
- **Z-Index:** `Z_INDEX.OVERLAY` (fixed constant)
- **Position:** Fixed, top-right, `width: min(480px, 90vw)`, full height
- **Animation:** `slide-in-from-right-2 fade-in-0 duration-200`
- **Keyboard:** Escape closes overlay but keeps agent running in background

---

## 3. SSE Subscription Hooks

### Base Hook: `useSSE`
**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts`

```typescript
useSSE<T>(
  url: string,
  eventSourceFactory?: EventSourceFactory,
  options?: UseSSEOptions
): UseSSEReturn<T>
```

**Key Features:**
- Auto-reconnection with configurable delays (default 5s)
- Max reconnect attempts (default 5, 0 = unlimited)
- Message queue with max size (default 1000, 0 = unlimited) — FIX-004
- Optional Zod schema validation — FIX-002
- Cleanup: proper EventSource close + timeout cancellation

**Cleanup Pattern:**
```typescript
useEffect(() => {
  if (autoConnect) connect();
  return () => disconnect(); // Cleanup on unmount
}, [autoConnect, connect, disconnect]);
```

### Workspace-Scoped Hook: `useWorkspaceSSE`
**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useWorkspaceSSE.ts`

```typescript
useWorkspaceSSE(options: UseWorkspaceSSEOptions): UseWorkspaceSSEReturn
```

**Options:**
```typescript
{
  workspaceSlug: string;
  path: string; // e.g., 'agents/123/events'
  enabled?: boolean; // default: true
  eventTypes?: string[]; // named event types to listen for
  onEvent?: (eventType: string, data: unknown) => void;
  onError?: (error: Event) => void;
  onConnectionChange?: (isConnected: boolean) => void;
}
```

**URL Pattern:** `/api/workspaces/${workspaceSlug}/${path}`

**Callback Stability:** Uses refs for callbacks to avoid dependency array issues:
```typescript
const onEventRef = useRef(onEvent);
onEventRef.current = onEvent; // Keep ref in sync
// Then use onEventRef.current() in event handlers
```

### Example: Workflow SSE
**File Path:** `/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts`

Pattern: Base `useSSE` → filter by graphSlug → debounce callbacks → clear messages.

---

## 4. useGlobalState Pattern

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/state/use-global-state.ts`

```typescript
useGlobalState<T>(path: string, defaultValue?: T): T | undefined
```

**Implementation:**
- Uses `useSyncExternalStore` for React 18 concurrent safety
- Per DYK-16: Default pinned with `useRef` to prevent infinite re-renders
- Per DYK-19: `subscribe` and `getSnapshot` wrapped in `useCallback` for stable identity

**Pattern:**
```typescript
export function useGlobalState<T>(path: string, defaultValue?: T): T | undefined {
  const system = useStateSystem();
  const pinnedDefault = useRef(defaultValue).current; // DYK-16

  const subscribe = useCallback(
    (onStoreChange: () => void) => system.subscribe(path, onStoreChange),
    [system, path]
  );

  const getSnapshot = useCallback(
    () => system.get<T>(path) ?? pinnedDefault,
    [system, path, pinnedDefault]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```

**Usage:**
```typescript
const status = useGlobalState<string>('workflow:wf-1:status', 'idle');
```

---

## 5. Toast Notifications

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/components/ui/toaster.tsx`

### Integration
- Uses `sonner` library (not native browser notifications)
- Mounted once in provider tree — automatically available globally
- Accessed via `import { toast } from 'sonner'` in any client component

### Configuration
```typescript
<SonnerToaster
  position="bottom-right"
  richColors
  closeButton
  theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
  toastOptions={{ className: 'font-sans' }}
/>
```

### Usage Pattern
```typescript
import { toast } from 'sonner';

// Simple text toast
toast('Your message');

// With options
toast(`${icon} ${windowName} ${label}`, { duration: 4000 });

// Types: success, error, loading, promise
toast.success('Operation complete!');
toast.error('Something went wrong');
```

### Activity Log Toast Example
**File Path:** `/apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx`

- Polling approach (not SSE) with 15s interval
- Shows toast for each new entry
- Skips toasts when overlay is open (user already sees entries)
- Each entry has icon (`🤖` agent, `🖥` system) and window name metadata

---

## 6. Desktop Notifications

**Current Status:** ❌ Not implemented in codebase

No existing implementations of browser `Notification` API found. This would be a new feature if needed.

**Implementation Pattern (if added):**
```typescript
// Request permission on mount
if (Notification.permission === 'granted') {
  new Notification('Title', { body: 'Message', icon: 'url' });
}
// Or: Notification.requestPermission()
```

---

## 7. Dashboard Shell & Workspace Layout

### Dashboard Shell
**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/components/dashboard-shell.tsx`

```typescript
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <DashboardSidebar />
        <SidebarInset>
          <main className="flex-1 overflow-hidden min-w-0">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

### Workspace Layout Mount Order
**File Path:** `/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`

```
WorkspaceLayout (Server Component)
├─ WorkspaceProvider (context: workspace metadata)
├─ SDKWorkspaceConnector
├─ WorkspaceAttentionWrapper (attention system)
└─ TerminalOverlayWrapper
   └─ ActivityLogOverlayWrapper
      └─ WorkspaceAgentChrome (agent overlay + chat)
         └─ {children}
```

**Key Pattern:** Wrappers provide context + dynamically mount panels. Panels live inside providers (not siblings).

### Workspace Agent Chrome
**File Path:** `/apps/web/src/components/agents/workspace-agent-chrome.tsx`

Provides agent overlay + chat functionality. Mounted at workspace level so agents persist across page navigation.

---

## 8. Overlay Mutual Exclusion

### Event-Based Coordination
All three overlays use the same pattern:

1. **Dispatching overlay:close-all**
   ```typescript
   window.dispatchEvent(new CustomEvent('overlay:close-all'));
   ```

2. **Listening for overlay:close-all**
   ```typescript
   useEffect(() => {
     const handler = () => {
       if (isOpeningRef.current) return; // Skip if we're opening
       closeOverlay();
     };
     window.addEventListener('overlay:close-all', handler);
     return () => window.removeEventListener('overlay:close-all', handler);
   }, [closeOverlay]);
   ```

3. **Guard to prevent self-close**
   ```typescript
   const openOverlay = useCallback((params) => {
     isOpeningRef.current = true; // Set guard BEFORE dispatch
     window.dispatchEvent(new CustomEvent('overlay:close-all'));
     isOpeningRef.current = false; // Clear guard AFTER dispatch
     setState({ isOpen: true, ...params });
   }, []);
   ```

### Why This Pattern Works
- Synchronous: guard is set before dispatch, cleared after
- Efficient: no circular message passing
- Decoupled: overlays don't know about each other
- Reusable: same pattern for all three overlays

---

## 9. Markdown Rendering

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/components/viewers/markdown-viewer.tsx`

### Component Architecture
```typescript
interface MarkdownViewerProps {
  file: ViewerFile | undefined;
  highlightedHtml: string;        // Pre-highlighted source (from Shiki)
  preview: ReactNode;              // Pre-rendered preview (from MarkdownServer)
}

export function MarkdownViewer({ file, highlightedHtml, preview }) {
  const { isPreviewMode, setMode } = useMarkdownViewerState(file);
  // Toggle between source (FileViewer) and preview
}
```

### Server-Side Rendering
**File Path:** `/apps/web/src/components/viewers/markdown-server.tsx`

- Uses `react-markdown` with `@shikijs/rehype` for syntax highlighting
- Rendered as Server Component, passed to client as `preview` prop

### Key Features
- Source/Preview toggle buttons with aria-pressed states
- FileViewer for source with syntax highlighting
- Mode persistence via `useMarkdownViewerState` hook
- Accessible toolbar with role="group" aria-label

---

## 10. DI Container SSE/State Access

**File Path:** `/Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/di-container.ts` (lines 596-625)

### QuestionPopperService Registration
```typescript
// Line 596-625
let questionPopperInstance: IQuestionPopperService | null = null;
childContainer.register<IQuestionPopperService>(
  WORKSPACE_DI_TOKENS.QUESTION_POPPER_SERVICE,
  {
    useFactory: (c) => {
      if (questionPopperInstance) return questionPopperInstance;
      
      const notifier = c.resolve<ICentralEventNotifier>(
        WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER
      );
      
      questionPopperInstance = new QuestionPopperService(
        resolvedWorktreePath ?? process.cwd(),
        notifier
      );
      return questionPopperInstance;
    },
  }
);
```

### Service Dependencies
- **ICentralEventNotifier** — SSE broadcaster for domain events
- **WorkspaceDomain.EventPopper** — SSE channel for question events

### Service Implementation
**File Path:** `/apps/web/src/features/067-question-popper/lib/question-popper.service.ts`

**SSE Emission Pattern:**
```typescript
private emit(eventType: string, data: Record<string, unknown>): void {
  this.notifier.emit(WorkspaceDomain.EventPopper, eventType, data);
}

// Usage:
this.emit('question-asked', { questionId, outstandingCount });
this.emit('question-answered', { questionId, status: 'answered' });
this.emit('rehydrated', { outstandingCount });
```

### Central Event Notifier
**File Path:** `/apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts`

```typescript
export class CentralEventNotifierService implements ICentralEventNotifier {
  constructor(private readonly broadcaster: ISSEBroadcaster) {}

  emit(domain: WorkspaceDomainType, eventType: string, data: Record<string, unknown>): void {
    // Per ADR-0007: Domain value IS the SSE channel name
    this.broadcaster.broadcast(domain, eventType, data);
  }
}
```

**Key Insight:** Domain directly maps to SSE channel. `WorkspaceDomain.EventPopper` becomes the SSE channel name.

---

## Architecture Summary for Question Popper UI

### Component Stack (Top-Down)
```
WorkspaceLayout
└─ QuestionPopperOverlayWrapper (NEW)
   ├─ QuestionPopperProvider (context)
   ├─ QuestionPopperToastBridge (hook consumer)
   └─ QuestionPopperOverlayPanel (dynamically imported, SSR: false)
      └─ MarkdownViewer (for rendering question content)
```

### Data Flow
```
QuestionPopperService (server)
  ├─ emit() → ICentralEventNotifier
  └─ WorkspaceDomain.EventPopper channel

  ↓ SSE

Client Hook (NEW: useQuestionPopperSSE)
  └─ subscribes to EventPopper channel
     ├─ onEvent: (type, data) → update context state
     └─ cleanup: EventSource.close()

  ↓

QuestionPopperProvider (context)
  ├─ outstandingCount
  ├─ activeQuestion
  └─ actions: open(), close(), answer()

  ↓

Components
├─ QuestionPopperOverlayPanel (UI)
├─ QuestionPopperToastBridge (notifications)
└─ useQuestionPopper() hook (consumers)
```

### Key Patterns to Implement
1. **Overlay Pattern** — Copy Activity Log overlay hook structure
2. **SSE Subscription** — Use `useWorkspaceSSE` with EventPopper channel
3. **Toast Notifications** — Import `toast` from sonner, show on question-asked
4. **Mutual Exclusion** — Dispatch `overlay:close-all` on open
5. **State Management** — Context + hook for consumer access
6. **Markdown Rendering** — Use existing `MarkdownViewer` for content
7. **Dynamic Import** — Load panel with `ssr: false` + error boundary

---

## Recommended File Structure
```
src/features/067-question-popper/
├─ hooks/
│  ├─ use-question-popper-overlay.tsx    (context + provider)
│  ├─ use-question-popper-sse.ts         (SSE subscription)
│  └─ use-question-popper-toasts.tsx     (notification polling)
├─ components/
│  ├─ question-popper-overlay-panel.tsx  (main UI)
│  ├─ question-option-buttons.tsx        (answer selection)
│  └─ question-markdown-viewer.tsx       (content display)
└─ types.ts                              (TS interfaces)

app/(dashboard)/workspaces/[slug]/
└─ question-popper-overlay-wrapper.tsx   (mounted in layout)
```

