# Question Popper Overlay UI — Pattern Summary

## Quick Navigation
- **Full Research:** See `QUESTION_POPPER_UI_RESEARCH.md`
- **Copy-Paste Code:** See `QUESTION_POPPER_QUICK_REFERENCE.md`
- **This File:** Visual overview + key decisions

---

## Architecture Diagram

```
┌─ Workspace Layout ──────────────────────────────────────┐
│  /app/(dashboard)/workspaces/[slug]/layout.tsx         │
│                                                          │
│  └─ QuestionPopperOverlayWrapper                       │
│     ├─ QuestionPopperOverlayProvider (context)        │
│     ├─ QuestionPopperToastBridge (hook)               │
│     └─ QuestionPopperOverlayPanel (dynamic import)    │
│        └─ MarkdownViewer (content rendering)          │
│                                                          │
│  Other overlays (Terminal, Activity Log, Agent)       │
│  ← All listen for overlay:close-all event             │
└──────────────────────────────────────────────────────────┘
```

## State Flow

```
QuestionPopperService (server)
  │ askQuestion() → writes in.json
  │ answerQuestion() → writes out.json
  │ emit() → ICentralEventNotifier
  ├─→ question-asked event
  ├─→ question-answered event
  └─→ rehydrated event
       ↓ SSE broadcast
       
WorkspaceDomain.EventPopper channel
  │ /api/workspaces/{slug}/events/question-popper
  ├─→ EventSource (browser)
  │
  └─→ useQuestionPopperSSE hook
       │ onEvent('question-asked', { questionId })
       │ onEvent('question-answered', { status })
       │
       └─→ QuestionPopperOverlayProvider
           ├─→ setState({ isOpen: true, question })
           │
           ├─→ Dispatch 'overlay:close-all'
           │   (closes Terminal, Activity Log, Agent)
           │
           └─→ Components
               ├─→ QuestionPopperOverlayPanel
               ├─→ QuestionPopperToastBridge
               └─→ useQuestionPopper() consumers
```

## Overlay Coordination

### Opening Question Popper

```typescript
openQuestion(question) {
  1. Set isOpeningRef.current = true  // Guard
  2. Dispatch 'overlay:close-all'     // Tell siblings to close
  3. Set isOpeningRef.current = false // Release guard
  4. setState({ isOpen: true, question })
}
```

### Other Overlays (Terminal, Activity Log, Agent)

```typescript
// Listen in each provider
addEventListener('overlay:close-all', () => {
  if (isOpeningRef.current) return;  // Skip if WE'RE opening
  closeOverlay();                    // Otherwise close ourselves
})
```

**Result:** Only one overlay visible at a time ✓

---

## Component Structure

### 1. **QuestionPopperOverlayProvider**
- **File:** `src/features/067-question-popper/hooks/use-question-popper-overlay.tsx`
- **Responsibility:** Manages overlay visibility + context state
- **State:** `{ isOpen, questionId, question }`
- **Actions:** `openQuestion()`, `closeQuestion()`
- **Pattern:** Copy from Activity Log overlay

### 2. **useQuestionPopperSSE Hook**
- **File:** `src/features/067-question-popper/hooks/use-question-popper-sse.ts`
- **Responsibility:** Subscribes to EventPopper SSE channel
- **Listens For:** `question-asked`, `question-answered`, `rehydrated` events
- **Cleanup:** Closes EventSource on unmount
- **Pattern:** Copy from useWorkspaceSSE + modify for EventPopper

### 3. **useQuestionPopperToasts Hook**
- **File:** `src/features/067-question-popper/hooks/use-question-popper-toasts.tsx`
- **Responsibility:** Shows toast when question arrives + overlay is closed
- **Pattern:** Copy from Activity Log toasts
- **Integration:** Called from wrapper component

### 4. **QuestionPopperOverlayPanel**
- **File:** `src/features/067-question-popper/components/question-popper-overlay-panel.tsx`
- **Responsibility:** Main UI - displays question, renders content, handles answers
- **Features:**
  - Fixed position, right side, z-index 45
  - Escape key closes
  - Shows question text + description
  - Renders options as buttons (multiple choice)
  - Uses MarkdownViewer for rich content
- **Pattern:** Copy from Agent overlay panel

### 5. **QuestionPopperOverlayWrapper**
- **File:** `app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx`
- **Responsibility:** Mounts provider + panel with error boundary
- **Dynamic Import:** Yes, with `ssr: false`
- **Error Boundary:** Wraps panel only (not provider)
- **Pattern:** Copy from Activity Log wrapper

---

## Key Decisions

### 1. **Why SSE for EventPopper?**
- Service (backend) emits events on state changes
- Clients (multiple browser tabs) see questions in real-time
- Low latency, persistent connection
- Better than polling for high-frequency updates

### 2. **Why Custom Event for Overlay Coordination?**
- Decoupled: overlays don't import each other
- Synchronous: guard prevents race conditions
- Reusable: same pattern for all overlays
- Simple: 4 lines of code per overlay

### 3. **Why Dynamic Import + SSR: false?**
- Panel might be heavy (Markdown rendering, etc)
- Prevents hydration mismatches
- Client-only initialization of EventSource
- Same pattern as Terminal + Activity Log

### 4. **Why MarkdownViewer for Content?**
- Already implemented in codebase
- Supports syntax highlighting
- Source/Preview toggle
- Accessible

### 5. **Why Toast Notifications?**
- Uses `sonner` (already in project)
- Toast-only when overlay closed (reduce noise)
- Click action to open overlay
- Auto-dismiss with action button

---

## Integration Checklist

### Phase 1: Scaffolding
- [ ] Create hook: `use-question-popper-overlay.tsx`
- [ ] Create SSE hook: `use-question-popper-sse.ts`
- [ ] Create toast hook: `use-question-popper-toasts.tsx`
- [ ] Create panel: `question-popper-overlay-panel.tsx`
- [ ] Create wrapper: `question-popper-overlay-wrapper.tsx`
- [ ] Add wrapper to workspace layout

### Phase 2: SSE Endpoint
- [ ] Create API route: `/api/workspaces/[slug]/events/question-popper`
- [ ] Route subscribes to EventPopper domain events
- [ ] Route broadcasts as SSE with proper event types

### Phase 3: Answer Submission
- [ ] Create API route: `/api/questions/[questionId]/answer`
- [ ] Route calls `QuestionPopperService.answerQuestion()`
- [ ] Route emits answer via SSE
- [ ] Frontend closes overlay on answer

### Phase 4: Polish
- [ ] Keyboard accessibility (Tab, Enter, Escape)
- [ ] ARIA labels for screen readers
- [ ] Error boundary tests
- [ ] SSE reconnection tests
- [ ] Mutual exclusion tests

---

## Real-World Example Flow

### Scenario: Agent asks "Confirm deployment?"

```
1. Backend (Node.js):
   agentService.askQuestion({
     text: 'Confirm deployment?',
     options: ['Deploy', 'Cancel'],
     timeout: 300 // 5 minutes
   })
   
   → QuestionPopperService.askQuestion()
   → Writes /event-popper/{id}/in.json
   → emit('question-asked', { questionId, outstandingCount: 5 })

2. SSE Broadcast:
   ICentralEventNotifier.emit(EventPopper, 'question-asked', {...})
   
   → CentralEventNotifierService forwards to broadcaster
   → ISSEBroadcaster sends to all connected clients on EventPopper channel

3. Frontend (React):
   useQuestionPopperSSE listens for 'question-asked'
   
   → onEvent('question-asked', { questionId })
   → Fetch full question from /api/questions/{questionId}
   → openQuestion(question)
   
   → Dispatch overlay:close-all
   → Activity Log, Terminal, Agent overlays close
   → QuestionPopperOverlayPanel renders

4. User interacts:
   <button onClick={() => answerQuestion(question.id, 'Deploy')}>
   
   → POST /api/questions/{id}/answer { answer: 'Deploy' }
   → QuestionPopperService.answerQuestion()
   → Writes /event-popper/{id}/out.json
   → emit('question-answered', { questionId, status: 'answered' })

5. SSE callback:
   onEvent('question-answered', { questionId })
   
   → closeQuestion()
   → setState({ isOpen: false })
   → Panel unmounts
   → EventSource continues listening for next question
```

---

## Files to Review

### Patterns
1. Activity Log Overlay: `src/features/065-activity-log/hooks/use-activity-log-overlay.tsx`
2. Agent Overlay: `src/hooks/use-agent-overlay.tsx`
3. Terminal Overlay: `src/features/064-terminal/hooks/use-terminal-overlay.tsx`

### SSE Integration
1. useWorkspaceSSE: `src/hooks/useWorkspaceSSE.ts`
2. useSSE: `src/hooks/useSSE.ts`
3. Workflow SSE: `src/features/050-workflow-page/hooks/use-workflow-sse.ts`

### Toast & Notifications
1. Toast Provider: `src/components/ui/toaster.tsx`
2. Activity Log Toasts: `src/features/065-activity-log/hooks/use-activity-log-toasts.tsx`

### Content Rendering
1. Markdown Viewer: `src/components/viewers/markdown-viewer.tsx`

### Service & DI
1. Question Popper Service: `src/features/067-question-popper/lib/question-popper.service.ts`
2. DI Container: `src/lib/di-container.ts` (lines 596-625)
3. Central Event Notifier: `src/features/027-central-notify-events/central-event-notifier.service.ts`

### Layout
1. Workspace Layout: `/app/(dashboard)/workspaces/[slug]/layout.tsx`
2. Dashboard Shell: `src/components/dashboard-shell.tsx`

### Wrappers (for reference)
1. Activity Log Wrapper: `/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx`
2. Terminal Wrapper: `/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx`

---

## Constants & Enums

### Z-Index
```typescript
export const Z_INDEX = {
  OVERLAY: 45,  // Use this for question popper panel
};
```

### Workspace Domain (SSE Channel)
```typescript
enum WorkspaceDomain {
  EventPopper = 'event-popper',  // Question popper SSE channel
}
```

### Event Types (emitted by QuestionPopperService)
- `question-asked` - New question added
- `question-answered` - Question answered
- `rehydrated` - Service started, loaded outstanding count

---

## Common Mistakes to Avoid

1. ❌ Forgetting to close EventSource on unmount → memory leak + zombie connections
2. ❌ Not setting guard ref BEFORE dispatching overlay:close-all → self-closes
3. ❌ Importing overlay provider conditionally → loses context
4. ❌ Not using `ssr: false` for panel → hydration mismatch
5. ❌ Calling toast() from server action → silent no-op
6. ❌ Using wrong Z_INDEX → overlay hidden behind other UI
7. ❌ Missing error boundary → panel crash crashes entire workspace
8. ❌ Not clearing message queue → memory leak in useSSE

---

## Quick Debug Checklist

**SSE not receiving events?**
- [ ] Check API endpoint exists: `/api/workspaces/{slug}/events/question-popper`
- [ ] Check service emits: `this.notifier.emit(WorkspaceDomain.EventPopper, ...)`
- [ ] Check browser console for errors
- [ ] Verify EventSource is connecting (DevTools → Network tab)

**Overlay not showing?**
- [ ] Check context provider is mounted (check layout tree)
- [ ] Check `isOpen` state is true
- [ ] Check Z_INDEX.OVERLAY is correct (45)
- [ ] Check error boundary didn't swallow error (add console log)

**Mutual exclusion not working?**
- [ ] Check `isOpeningRef` is set BEFORE dispatch
- [ ] Check siblings have overlay:close-all listener
- [ ] Check guard is cleared AFTER dispatch
- [ ] Verify event is custom event, not standard

**Toasts not showing?**
- [ ] Check `<Toaster />` is mounted in Providers
- [ ] Check `toast()` called from client component
- [ ] Check overlay is not open (toasts skip when overlay visible)
- [ ] Check duration hasn't auto-dismissed

---

## Performance Considerations

1. **EventSource is persistent** — one connection per browser tab
2. **Message queue pruning** — useSSE limits to last 1000 messages (FIX-004)
3. **Dynamic imports** — panel code-split, loaded only when needed
4. **Markdown rendering** — memoized via `useMarkdownViewerState`
5. **Ref callbacks** — avoid unnecessary re-renders (onEventRef pattern)

---

## Next Steps

1. Read `QUESTION_POPPER_UI_RESEARCH.md` for detailed patterns
2. Read `QUESTION_POPPER_QUICK_REFERENCE.md` for copy-paste code
3. Start with Phase 1: Create overlay hook (simplest)
4. Test mutual exclusion with existing overlays
5. Implement SSE subscription (requires API endpoint)
6. Add panel UI + Markdown rendering
7. Wire answer submission + cleanup

Good luck! 🚀
