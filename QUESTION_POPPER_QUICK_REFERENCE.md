# Question Popper UI — Quick Reference & Copy-Paste Patterns

## 1. Overlay Provider Hook Template (Copy from Activity Log)

**Source:** `/apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx`

**Template for QuestionPopper:**
```typescript
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface QuestionPopperOverlayState {
  isOpen: boolean;
  questionId: string | null;
  question: StoredQuestion | null;
}

interface QuestionPopperOverlayContextValue extends QuestionPopperOverlayState {
  openQuestion: (question: StoredQuestion) => void;
  closeQuestion: () => void;
}

const QuestionPopperOverlayContext = createContext<QuestionPopperOverlayContextValue | null>(null);

export function QuestionPopperOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuestionPopperOverlayState>({
    isOpen: false,
    questionId: null,
    question: null,
  });

  // DYK-01: Guard to prevent self-close when dispatching overlay:close-all
  const isOpeningRef = useRef(false);

  const closeQuestion = useCallback(() => {
    setState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  const openQuestion = useCallback((question: StoredQuestion) => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setState({ isOpen: true, questionId: question.id, question });
  }, []);

  // Listen for overlay:close-all (mutual exclusion)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return; // DYK-01: skip self-close
      closeQuestion();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closeQuestion]);

  return (
    <QuestionPopperOverlayContext.Provider
      value={{ ...state, openQuestion, closeQuestion }}
    >
      {children}
    </QuestionPopperOverlayContext.Provider>
  );
}

export function useQuestionPopperOverlay(): QuestionPopperOverlayContextValue {
  const context = useContext(QuestionPopperOverlayContext);
  if (!context) {
    throw new Error('useQuestionPopperOverlay must be used within QuestionPopperOverlayProvider');
  }
  return context;
}
```

---

## 2. SSE Subscription Hook

**Source:** `/apps/web/src/hooks/useWorkspaceSSE.ts`

**Template for EventPopper Channel:**
```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from './use-workspace'; // or from context

export function useQuestionPopperSSE(
  onQuestionAsked: (data: { questionId: string; text: string }) => void,
  onQuestionAnswered: (data: { questionId: string; status: string }) => void
) {
  const workspace = useWorkspace();
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!workspace?.slug) return;

    const url = `/api/workspaces/${encodeURIComponent(workspace.slug)}/events/question-popper`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('open', () => {
      setIsConnected(true);
    });

    // SSE channel: WorkspaceDomain.EventPopper
    // Event types: 'question-asked', 'question-answered', 'rehydrated'
    eventSource.addEventListener('question-asked', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onQuestionAsked(data);
      } catch {
        console.warn('Failed to parse question-asked event');
      }
    });

    eventSource.addEventListener('question-answered', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onQuestionAnswered(data);
      } catch {
        console.warn('Failed to parse question-answered event');
      }
    });

    eventSource.addEventListener('error', () => {
      setIsConnected(false);
      eventSource.close();
    });
  }, [workspace?.slug, onQuestionAsked, onQuestionAnswered]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
```

---

## 3. Overlay Wrapper Component (Mounted in Layout)

**Source:** `/apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx`

**Template for QuestionPopper:**
```typescript
'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { QuestionPopperOverlayProvider } from '../../src/features/067-question-popper/hooks/use-question-popper-overlay';

const QuestionPopperOverlayPanel = dynamic(
  () =>
    import('../../src/features/067-question-popper/components/question-popper-overlay-panel').then(
      (m) => m.QuestionPopperOverlayPanel
    ),
  { ssr: false }
);

class QuestionPopperErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export function QuestionPopperOverlayWrapper({ children }: { children: ReactNode }) {
  return (
    <QuestionPopperOverlayProvider>
      {children}
      <QuestionPopperErrorBoundary>
        <QuestionPopperOverlayPanel />
      </QuestionPopperErrorBoundary>
    </QuestionPopperOverlayProvider>
  );
}
```

**Then update workspace layout:**
```typescript
// /apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
export default async function WorkspaceLayout({ children, params }: LayoutProps) {
  // ... existing code ...
  
  return (
    <WorkspaceProvider ...>
      <SDKWorkspaceConnector .../>
      <WorkspaceAttentionWrapper>
        <TerminalOverlayWrapper ...>
          <ActivityLogOverlayWrapper ...>
            <QuestionPopperOverlayWrapper>  {/* ADD THIS */}
              <WorkspaceAgentChrome ...>
                {children}
              </WorkspaceAgentChrome>
            </QuestionPopperOverlayWrapper>
          </ActivityLogOverlayWrapper>
        </TerminalOverlayWrapper>
      </WorkspaceAttentionWrapper>
    </WorkspaceProvider>
  );
}
```

---

## 4. Toast Notifications Pattern

**Source:** `/apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx`

**For QuestionPopper:**
```typescript
'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQuestionPopperOverlay } from './use-question-popper-overlay';

export function useQuestionPopperToasts() {
  const { isOpen, question } = useQuestionPopperOverlay();
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!question || isOpen) return; // Don't toast if overlay visible
    if (lastIdRef.current === question.id) return; // Already toasted

    lastIdRef.current = question.id;
    toast(`❓ ${question.payload.text}`, {
      duration: 5000,
      action: {
        label: 'Answer',
        onClick: () => {
          // Trigger open overlay (caller imports useQuestionPopperOverlay)
        },
      },
    });
  }, [question, isOpen]);
}
```

---

## 5. Overlay Panel Component

**Source:** `/apps/web/src/components/agents/agent-overlay-panel.tsx`

**Template for QuestionPopper:**
```typescript
'use client';

import { MarkdownViewer } from '@/components/viewers/markdown-viewer';
import { useQuestionPopperOverlay } from '@/features/067-question-popper/hooks/use-question-popper-overlay';
import { Z_INDEX } from '@/lib/agents/constants';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useCallback, useEffect } from 'react';

export function QuestionPopperOverlayPanel() {
  const { isOpen, question, closeQuestion } = useQuestionPopperOverlay();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeQuestion();
      }
    },
    [isOpen, closeQuestion]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen || !question) return null;

  return (
    <div
      className={cn(
        'fixed top-0 right-0 h-full',
        'flex flex-col border-l bg-background shadow-2xl',
        'animate-in slide-in-from-right-2 fade-in-0 duration-200'
      )}
      style={{ zIndex: Z_INDEX.OVERLAY, width: 'min(480px, 90vw)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h3 className="text-sm font-medium">
          {question.type === 'question' ? '❓ Question' : '⚠️ Alert'}
        </h3>
        <button
          type="button"
          onClick={closeQuestion}
          className="rounded-md p-1 hover:bg-accent transition-colors"
          aria-label="Close overlay"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <p className="font-medium mb-3">{question.payload.text}</p>
        {question.payload.description && (
          <p className="text-sm text-muted-foreground mb-4">
            {question.payload.description}
          </p>
        )}

        {/* Options (if multiple choice) */}
        {question.payload.options && question.payload.options.length > 0 && (
          <div className="space-y-2">
            {question.payload.options.map((option, idx) => (
              <button
                key={idx}
                className="w-full px-3 py-2 bg-accent hover:bg-accent/80 rounded transition-colors text-sm font-medium text-left"
                onClick={() => {
                  // Submit answer
                  closeQuestion();
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 6. Key Constants & Types

**Z-Index Pattern:**
```typescript
// apps/web/src/lib/agents/constants.ts
export const Z_INDEX = {
  TOOLTIP: 50,
  OVERLAY: 45,      // Use this for Question Popper
  MENU: 40,
} as const;
```

**EventPopper Domain:**
```typescript
// From @chainglass/shared/features/027-central-notify-events
export enum WorkspaceDomain {
  Files = 'files',
  Workflows = 'workflows',
  UnitCatalog = 'unit-catalog',
  EventPopper = 'event-popper',  // Question Popper SSE channel
  Agents = 'agents',
}
```

**Question Types:**
```typescript
export type QuestionType = 'yes-no' | 'multiple-choice' | 'text-input' | 'confirm';

export interface StoredQuestion {
  version: 1;
  type: 'question';
  id: string;
  createdAt: string;
  source: string;
  status: QuestionStatus;
  payload: {
    questionType: QuestionType;
    text: string;
    description: string | null;
    options: string[] | null;
    default: string | null;
    timeout: number;
    previousQuestionId: string | null;
  };
  meta?: Record<string, unknown>;
}
```

---

## 7. Mount Order Checklist

When implementing Question Popper overlay UI:

1. ✅ Create hook: `use-question-popper-overlay.tsx`
   - Context provider with open/close logic
   - Guard ref for mutual exclusion
   - overlay:close-all listener

2. ✅ Create SSE hook: `use-question-popper-sse.ts`
   - Connect to EventPopper channel
   - Listen for question-asked, question-answered events
   - Proper cleanup on unmount

3. ✅ Create toast hook: `use-question-popper-toasts.tsx`
   - Use `toast()` from sonner
   - Skip if overlay is open
   - Track last ID to avoid duplicates

4. ✅ Create panel: `question-popper-overlay-panel.tsx`
   - Fixed position, z-index: Z_INDEX.OVERLAY
   - Escape key closes
   - Keyboard accessible

5. ✅ Create wrapper: `question-popper-overlay-wrapper.tsx`
   - Dynamic import with `ssr: false`
   - Error boundary around panel
   - Provider always mounted

6. ✅ Update layout: `/app/(dashboard)/workspaces/[slug]/layout.tsx`
   - Nest QuestionPopperOverlayWrapper
   - Inside ActivityLogOverlayWrapper, outside content

7. ✅ Wire into service discovery:
   - Ensure API endpoint `/api/workspaces/{slug}/events/question-popper` exists
   - SSE broadcasts WorkspaceDomain.EventPopper events
   - Question Popper service emits on state changes

---

## 8. Testing Patterns

**Test SSE Subscription:**
```typescript
// Use fake EventSource factory (see useSSE.ts line 19)
const fakeFactory = (url: string) => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  onopen: null,
  onerror: null,
  onmessage: null,
});
```

**Test Mutual Exclusion:**
```typescript
// Simulate opening question popper overlay
const { openQuestion } = renderHook(() => useQuestionPopperOverlay(), {
  wrapper: QuestionPopperOverlayProvider,
});

const dispatchedEvent = new CustomEvent('overlay:close-all');
vi.spyOn(window, 'dispatchEvent');

openQuestion(mockQuestion);
expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
```

---

## 9. Common Gotchas

1. **Toast from server actions:** `toast()` is client-only. Server must return result → client calls toast.

2. **Dynamic import SSR:** Always use `{ ssr: false }` for UI with browser-only dependencies (xterm.js, etc).

3. **EventSource cleanup:** Don't forget to `.close()` on unmount — keeps connection alive otherwise.

4. **Ref callbacks in deps:** When using `onEventRef.current =`, don't include callbacks in dependency arrays.

5. **Mutual exclusion order:** Set guard BEFORE dispatch, clear AFTER. Not the other way around.

6. **State reads outside setState:** Use `stateRef` pattern if toggle needs to read current state.

7. **Overlay positioning:** Z-index must be > all other overlays (use Z_INDEX.OVERLAY constant).

---

## 10. File Locations Quick Reference

| Pattern | File |
|---------|------|
| Activity Log Overlay | `src/features/065-activity-log/hooks/use-activity-log-overlay.tsx` |
| Agent Overlay | `src/hooks/use-agent-overlay.tsx` |
| Terminal Overlay | `src/features/064-terminal/hooks/use-terminal-overlay.tsx` |
| Activity Log Panel | `src/features/065-activity-log/components/activity-log-overlay-panel.tsx` |
| Agent Panel | `src/components/agents/agent-overlay-panel.tsx` |
| Terminal Panel | `src/features/064-terminal/components/terminal-overlay-panel.tsx` |
| useWorkspaceSSE | `src/hooks/useWorkspaceSSE.ts` |
| useSSE | `src/hooks/useSSE.ts` |
| Toast Provider | `src/components/ui/toaster.tsx` |
| Activity Log Toasts | `src/features/065-activity-log/hooks/use-activity-log-toasts.tsx` |
| Markdown Viewer | `src/components/viewers/markdown-viewer.tsx` |
| Dashboard Shell | `src/components/dashboard-shell.tsx` |
| Workspace Layout | `app/(dashboard)/workspaces/[slug]/layout.tsx` |
| Question Popper Service | `src/features/067-question-popper/lib/question-popper.service.ts` |
| DI Container | `src/lib/di-container.ts` (lines 596-625) |

