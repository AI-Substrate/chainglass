# Question Popper Overlay UI — Implementation Roadmap

## Phase 1: Core Infrastructure (1-2 days)

### Step 1.1: Create Overlay Hook
**File:** `src/features/067-question-popper/hooks/use-question-popper-overlay.tsx`

Copy Activity Log overlay pattern:
- Context provider with `{ isOpen, questionId, question }`
- Actions: `openQuestion()`, `closeQuestion()`
- Guard ref for mutual exclusion
- overlay:close-all listener

**Acceptance Criteria:**
- Hook throws if used outside provider
- `isOpeningRef` prevents self-close
- Listeners can be added/removed without memory leaks

### Step 1.2: Create Types
**File:** `src/features/067-question-popper/types.ts`

```typescript
// From @chainglass/shared/question-popper
export type QuestionType = 'yes-no' | 'multiple-choice' | 'text-input' | 'confirm';
export interface StoredQuestion {
  type: 'question';
  id: string;
  status: 'pending' | 'answered' | 'timeout';
  payload: {
    questionType: QuestionType;
    text: string;
    description: string | null;
    options: string[] | null;
    default: string | null;
    timeout: number;
  };
}
```

### Step 1.3: Create SSE Hook
**File:** `src/features/067-question-popper/hooks/use-question-popper-sse.ts`

- Import `useWorkspaceSSE`
- Subscribe to `/events/question-popper` path
- Listen for: `question-asked`, `question-answered`, `rehydrated`
- Return `{ isConnected }`

**Acceptance Criteria:**
- Hook connects on mount
- Hook disconnects on unmount
- Callbacks don't cause infinite loops

### Step 1.4: Mount Provider in Layout
**File:** `/app/(dashboard)/workspaces/[slug]/layout.tsx`

Add after ActivityLogOverlayWrapper:
```typescript
<QuestionPopperOverlayWrapper>
  <WorkspaceAgentChrome ...>
    {children}
  </WorkspaceAgentChrome>
</QuestionPopperOverlayWrapper>
```

**Acceptance Criteria:**
- Layout renders without errors
- Provider is in context tree
- Wrapper has error boundary

---

## Phase 2: UI Components (2-3 days)

### Step 2.1: Create Toast Hook
**File:** `src/features/067-question-popper/hooks/use-question-popper-toasts.tsx`

- Import `toast` from sonner
- Listen for questions via SSE hook
- Show toast only if overlay closed
- Track last shown ID to avoid duplicates

**Acceptance Criteria:**
- Toast shows on question arrival
- Toast hidden if overlay open
- Toast doesn't duplicate

### Step 2.2: Create Overlay Panel
**File:** `src/features/067-question-popper/components/question-popper-overlay-panel.tsx`

- Fixed position, right side, 480px wide
- Z-index: Z_INDEX.OVERLAY (45)
- Header with question type emoji + close button
- Content area with:
  - Question text (bold)
  - Description (if present)
  - Options as buttons (if multiple choice)
  - Text input field (if text-input type)
- Escape key closes

**Acceptance Criteria:**
- Panel renders when isOpen = true
- Panel hidden when isOpen = false
- Escape key closes without errors
- Options are clickable
- Z-index is correct (not hidden)

### Step 2.3: Create Wrapper Component
**File:** `/app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx`

- Dynamic import panel with `ssr: false`
- Provider + ErrorBoundary + ToastBridge
- Mount in layout between ActivityLogOverlayWrapper and content

**Acceptance Criteria:**
- Provider always present (even if panel crashes)
- Panel only loads on client
- Error boundary silently hides on error
- No console errors on SSR

### Step 2.4: Test Mutual Exclusion
Manual test:
1. Open Activity Log overlay
2. Simulate question arrival
3. Verify Activity Log closes + Question Popper opens
4. Open Agent overlay
5. Verify Question Popper closes + Agent opens

**Acceptance Criteria:**
- Only one overlay visible at a time
- No console errors on overlay switch
- overlay:close-all event fires

---

## Phase 3: Answer Submission (1-2 days)

### Step 3.1: Create Answer Handler
**File:** `src/features/067-question-popper/hooks/use-question-popper-submit.ts`

```typescript
export function useQuestionPopperSubmit() {
  return useCallback(async (questionId: string, answer: string) => {
    const res = await fetch(`/api/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    if (!res.ok) throw new Error('Failed to submit answer');
    return res.json();
  }, []);
}
```

### Step 3.2: Wire into Panel
Update `question-popper-overlay-panel.tsx`:
- Call `useQuestionPopperSubmit()`
- Button onClick → `submitAnswer(question.id, selectedOption)`
- On success → `closeQuestion()`
- On error → show toast error

**Acceptance Criteria:**
- Answer submission succeeds
- Overlay closes after submission
- Network error shown as toast
- Can't submit twice (button disabled)

### Step 3.3: Update SSE Hook
Listen for `question-answered` events:
- Receive `{ questionId, status }`
- If status = 'answered', close overlay
- Remove from queue

**Acceptance Criteria:**
- Answered questions auto-close
- Timeout questions show warning
- Rehydrated event updates outstanding count

---

## Phase 4: Polish & Testing (1-2 days)

### Step 4.1: Accessibility
- [ ] All buttons have aria-label
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Color contrast meets WCAG AA
- [ ] Focus visible
- [ ] Screen reader announces question

**Code:**
```typescript
<button
  aria-label={`Answer: ${option}`}
  onClick={() => submitAnswer(option)}
>
  {option}
</button>
```

### Step 4.2: Error Handling
- [ ] SSE disconnect handled gracefully
- [ ] Invalid question data caught
- [ ] Panel crashes don't break workspace
- [ ] Network errors shown to user
- [ ] Timeout countdown shown

**Code:**
```typescript
<p className="text-xs text-muted-foreground">
  Expires in {Math.max(0, timeoutSeconds)}s
</p>
```

### Step 4.3: Testing
- [ ] Unit tests: overlay hook (open/close/guard)
- [ ] Unit tests: SSE hook (connect/disconnect)
- [ ] Integration tests: mutual exclusion
- [ ] Integration tests: answer submission
- [ ] E2E tests: full flow (question → answer → close)

### Step 4.4: Documentation
- [ ] Add JSDoc comments
- [ ] Update README with usage example
- [ ] Add troubleshooting section
- [ ] Document event types

---

## Phase 5: Markdown & Rich Content (Optional, 1 day)

### Step 5.1: Integrate MarkdownViewer
Update panel to render rich content:

```typescript
{question.payload.description && (
  <MarkdownViewer
    file={undefined}
    highlightedHtml={question.payload.description}
    preview={<ReactMarkdown>{question.payload.description}</ReactMarkdown>}
  />
)}
```

### Step 5.2: Server-Side Markdown Rendering
Create server component `MarkdownDescriptionRenderer`:
- Takes raw markdown from question
- Returns pre-rendered HTML
- Pass as `preview` prop

**Acceptance Criteria:**
- Code blocks highlighted
- Links clickable
- Images load
- No XSS vulnerabilities

---

## Implementation Timeline

| Week | Phase | Days | Status |
|------|-------|------|--------|
| Week 1 | Phase 1 + Phase 2 | 3-5 | ⏳ TODO |
| Week 2 | Phase 3 + Phase 4 | 2-4 | ⏳ TODO |
| Week 3 | Phase 5 + Deploy | 1-2 | ⏳ TODO |

---

## File Checklist

### New Files to Create
```
src/features/067-question-popper/
├── hooks/
│   ├── use-question-popper-overlay.tsx     (Phase 1.1)
│   ├── use-question-popper-sse.ts          (Phase 1.3)
│   ├── use-question-popper-toasts.tsx      (Phase 2.1)
│   └── use-question-popper-submit.ts       (Phase 3.1)
├── components/
│   ├── question-popper-overlay-panel.tsx   (Phase 2.2)
│   └── question-option-buttons.tsx         (Phase 2.2, if split)
├── types.ts                                 (Phase 1.2)
└── index.ts                                 (exports)

app/(dashboard)/workspaces/[slug]/
└── question-popper-overlay-wrapper.tsx     (Phase 2.3)

// Update existing:
app/(dashboard)/workspaces/[slug]/layout.tsx (Phase 1.4, Phase 2.3)
```

---

## API Endpoints Needed

### 1. GET /api/questions/:id
Return full question details with status

### 2. POST /api/questions/:id/answer
Submit answer, returns success/error

### 3. GET /api/workspaces/:slug/events/question-popper
SSE endpoint for EventPopper domain events

**Example SSE Response:**
```
event: question-asked
data: {"questionId":"evt-123","outstandingCount":5}

event: question-answered
data: {"questionId":"evt-123","status":"answered"}

event: rehydrated
data: {"outstandingCount":2}
```

---

## Testing Scenarios

### Scenario 1: Basic Question Flow
```
1. Agent asks yes/no question
2. SSE broadcasts question-asked
3. Overlay opens with question
4. User clicks "Yes"
5. Answer submitted to /api/questions/:id/answer
6. SSE broadcasts question-answered
7. Overlay closes
```

### Scenario 2: Mutual Exclusion
```
1. Activity Log overlay open
2. Question arrives
3. Activity Log overlay closes
4. Question Popper overlay opens
5. User opens Terminal
6. Question Popper overlay closes
7. Terminal overlay opens
```

### Scenario 3: Timeout
```
1. Question has 30s timeout
2. Countdown shown in overlay
3. User doesn't answer
4. After 30s, overlay closes
5. SSE broadcasts question-answered (status: timeout)
```

### Scenario 4: Multiple Choice
```
1. Agent asks multiple choice question
2. Options rendered as buttons
3. User clicks option
4. Answer submitted
5. Overlay closes
```

### Scenario 5: Text Input
```
1. Agent asks text input question
2. Text input field shown
3. User types text
4. User clicks Submit button
5. Text submitted as answer
6. Overlay closes
```

---

## Success Criteria (Definition of Done)

- [ ] Overlay opens when question arrives
- [ ] Overlay closes when answer submitted
- [ ] Overlay closes on Escape key
- [ ] Only one overlay visible at a time
- [ ] Toast notification shown when overlay closed
- [ ] SSE reconnects on disconnect
- [ ] Error boundary prevents workspace crash
- [ ] Accessible via keyboard + screen reader
- [ ] No memory leaks (EventSource closed)
- [ ] All questions types supported (yes-no, multiple-choice, text-input)
- [ ] Timeout countdown shown
- [ ] Answer submission succeeds
- [ ] Tests pass (unit + integration + e2e)
- [ ] Documentation complete

---

## Rollback Plan

If issues discovered in production:

1. **Quick Fix:** Remove wrapper from layout → overlays disabled
2. **Feature Flag:** Add `questionPopperEnabled` environment variable
3. **Partial Rollback:** Keep SSE subscription, disable panel rendering
4. **Full Rollback:** Revert all commits, restore previous version

---

## Notes & Tips

- **DI Container:** QuestionPopperService already registered in `src/lib/di-container.ts` (lines 596-625)
- **SSE Channel:** `WorkspaceDomain.EventPopper` is the channel name
- **Event Types:** Copy from `@chainglass/shared/question-popper`
- **Styling:** Use Tailwind + shadcn components (button, card, etc)
- **Animation:** Use `animate-in slide-in-from-right-2 fade-in-0 duration-200`
- **Z-Index:** Always use `Z_INDEX.OVERLAY` constant (45)
- **Toast:** Use `sonner` library, already mounted in providers

---

## Questions to Answer During Implementation

1. Should timeout countdown be in header or body?
2. Should unanswered questions auto-close after timeout?
3. Should user get warning before timeout?
4. Should we support text input validation?
5. Should we show retry button on network error?
6. Should we persist answer history?
7. Should we support question chaining (previousQuestionId)?

---

## Related Documentation

- Question Popper Service: `src/features/067-question-popper/lib/question-popper.service.ts`
- Activity Log Overlay: `src/features/065-activity-log/hooks/use-activity-log-overlay.tsx`
- Agent Overlay: `src/hooks/use-agent-overlay.tsx`
- useWorkspaceSSE: `src/hooks/useWorkspaceSSE.ts`
- MarkdownViewer: `src/components/viewers/markdown-viewer.tsx`

---

## Contact & Review

- Ping `@team` for design review on Phase 2.2 (panel UI)
- Ping `@backend` for API endpoint availability (Phase 3.1)
- Code review before merging Phase 1 (core hooks)
- Performance review after Phase 2 (before shipping)

Good luck! 🚀
