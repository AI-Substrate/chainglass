# Execution Log: Phase 5 — Overlay UI

## T001: `useQuestionPopper` Hook

**Started**: 2026-03-07T11:35Z
**Completed**: 2026-03-07T11:38Z
**Status**: Done

Created `apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx`:
- `QuestionPopperProvider` context with SSE subscription to `/api/events/event-popper`
- `useQuestionPopper` hook: items, outstandingCount, overlay state, action methods
- Mutual exclusion via `overlay:close-all` CustomEvent + `isOpeningRef` guard
- Notification-fetch pattern: SSE event → refetch full list via API
- Type guards: `isQuestionItem()`, `isAlertItem()`
- Reconnection with exponential backoff (max 5 attempts)

## T006: AnswerForm

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/components/answer-form.tsx`:
- 4 question type variants: textarea (text), radio (single), checkbox (multi), Yes/No buttons (confirm)
- Freeform text field always available alongside typed answer
- "Needs More Info" toggles clarification input
- "Dismiss" button for skipping questions
- Resolved questions show status instead of form
- Confirm type submits immediately on Yes/No click

## T004: QuestionCard

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/components/question-card.tsx`:
- Markdown description rendering via `react-markdown` + `remark-gfm`
- Tmux session/window badge from `meta.tmux`
- Time-ago utility (inline, no date-fns dependency)
- Status badge with color-coding per status
- Embeds AnswerForm for pending questions

## T005: AlertCard

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/components/alert-card.tsx`:
- Similar to QuestionCard but with "Mark Read" button instead of answer form
- Acknowledged alerts show acknowledgment time

## T002: QuestionPopperIndicator

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/components/question-popper-indicator.tsx`:
- Round question mark icon (SVG)
- Large (h-10) + green glow + shadow when outstanding > 0
- Small (h-7) + gray when nothing outstanding
- Red badge with count (99+ cap)
- Pulse animation ring when outstanding
- Accessible: aria-label, aria-expanded

## T003: QuestionPopperOverlayPanel

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/components/question-popper-overlay-panel.tsx`:
- Fixed position bottom-right, z-45, max 80vh height
- Shows outstanding items when present, history when none
- Close button + Escape key handler
- Connection status indicator
- Uses `<section>` instead of `<div role="dialog">` per biome a11y rules

## T007: Toast + Desktop Notifications

**Completed**: 2026-03-07T11:40Z

Created `apps/web/src/features/067-question-popper/lib/desktop-notifications.ts`:
- `toastNewQuestion()` / `toastNewAlert()` via sonner
- `sendDesktopNotification()` via Notifications API
- `requestNotificationPermission()` — lazy, safe to call multiple times
- All functions no-op gracefully when APIs unavailable

## T008: QuestionPopperOverlayWrapper

**Completed**: 2026-03-07T11:41Z

Created `apps/web/app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx`:
- Provider wraps children
- NotificationBridge: tracks new items, triggers toast + desktop notifications
- Indicator rendered with fixed position top-right (z-50)
- Panel dynamically imported (ssr: false) with error boundary
- Follows ActivityLogOverlayWrapper pattern exactly

## T009: Mount Wrapper in Workspace Layout

**Completed**: 2026-03-07T11:41Z

Modified `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`:
- Added `QuestionPopperOverlayWrapper` import
- Inserted wrapper between `ActivityLogOverlayWrapper` and `WorkspaceAgentChrome`

## T010: Component Tests

**Completed**: 2026-03-07T11:42Z

Created `test/unit/question-popper/ui-components.test.tsx` — 18 tests:
- Type guards: isQuestionItem, isAlertItem (4 tests)
- Desktop notifications: toast functions, permission check, safe no-op (4 tests)
- AnswerPayload construction for all 4 types (4 tests)
- Outstanding item filtering: pending/answered/dismissed/unread/acknowledged (6 tests)

## Evidence

- Biome lint: clean (0 errors in our files, 263 pre-existing in other packages)
- TypeScript: clean (0 errors in our files, pre-existing errors in other packages)
- Tests: 5125 passed, 80 skipped (18 new from this phase)
- 359 test files passed, 10 skipped
