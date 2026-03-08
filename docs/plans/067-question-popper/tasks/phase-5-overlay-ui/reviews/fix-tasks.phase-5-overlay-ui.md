# Fix Tasks: Phase 5: Overlay UI

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Synchronize outstanding count from fetched items
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx
- **Issue**: The provider initializes `outstandingCount` to `0` and only updates it from later SSE payloads, so the indicator/header can misreport outstanding work on first load.
- **Fix**: Compute `outstandingCount` from the fetched `items` list inside `fetchItems()` and keep it aligned after local action-triggered refetches.
- **Patch hint**:
  ```diff
  @@
-       setItems(data.items);
+       const fetchedOutstanding = data.items.filter(isOutstanding).length;
+       setItems(data.items);
+       setOutstandingCount(fetchedOutstanding);
        setError(null);
  ```

### FT-002: Restore AC-21's always-available freeform field
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx
- **Issue**: The extra freeform textarea is hidden for `text` questions even though AC-21 says it is always available regardless of question type.
- **Fix**: Render the freeform textarea for all question types and keep `AnswerPayload.text` distinct from the primary typed answer.
- **Patch hint**:
  ```diff
  @@
-      {/* Freeform text — always available (AC-21) */}
-      {questionType !== 'text' && (
+      {/* Freeform text — always available (AC-21) */}
+      {
         <textarea
           value={freeformText}
           onChange={(e) => setFreeformText(e.target.value)}
           placeholder="Additional context (optional)..."
@@
-        />
-      )}
+        />
+      }
  ```

### FT-003: Replace helper-only tests with real UI coverage and Test Docs
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx
- **Issue**: The phase promised lightweight UI validation, but the current suite only tests helpers/payload literals and omits the required Test Doc format.
- **Fix**: Rewrite the suite around rendered `QuestionPopperProvider`, `QuestionPopperIndicator`, `QuestionPopperOverlayPanel`, and `AnswerForm` interactions. Add 5-field Test Docs to each new `it(...)` block.
- **Patch hint**:
  ```diff
  @@
- describe('AnswerPayload construction for each question type', () => {
-   it('text answer has string answer and optional text', () => {
-     const answer: AnswerPayload = { answer: 'Hello world', text: null };
-     expect(answer.answer).toBe('Hello world');
-   });
- });
+ describe('AnswerForm', () => {
+   it('submits text answers with additional context', async () => {
+     /*
+     Test Doc:
+     - Why: Protect AC-21's dual-field text-question behavior.
+     - Contract: text questions expose both the primary answer field and the extra freeform field.
+     - Usage Notes: Render the real component and assert callbacks rather than rebuilding payloads by hand.
+     - Quality Contribution: Catches regressions in rendered form wiring and payload construction.
+     - Worked Example: typing "Ship it" + "because CI is green" submits { answer: 'Ship it', text: 'because CI is green' }.
+     */
+     // render + interact with real component here
+   });
+ });
  ```

## Medium / Low Fixes

### FT-004: Sync Phase 5 domain artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md, /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md, /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
- **Issue**: The plan Domain Manifest, domain document, and domain map/health summary do not fully describe the delivered Phase 5 UI surface.
- **Fix**: Add the missing manifest rows, remove the stale "Does NOT Own UI components" statement, document the notification utility/UI contracts in Composition + Concepts, and update the `question-popper` node/health summary.
- **Patch hint**:
  ```diff
  @@ /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
+ | `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | `question-popper` | internal |
+ | `apps/web/src/features/067-question-popper/lib/desktop-notifications.ts` | `question-popper` | internal |
+ | `test/unit/question-popper/ui-components.test.tsx` | `question-popper` | verification |
  @@ /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md
- - UI components (Phase 5 — implemented)
+ - CLI commands (`cg question`, `cg alert`) and API routes remain outside this UI/service domain boundary
+ | `desktop-notifications.ts` | Toast + Notifications API bridge | `sonner`, browser Notifications API |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
