# Code Review: Phase 5: Overlay UI

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 5: Overlay UI
**Date**: 2026-03-07
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight (from the phase dossier; the spec has no dedicated testing-strategy section)

## A) Verdict

**REQUEST_CHANGES**

Phase 5 ships two user-visible behavior gaps (initial outstanding-count sync and the missing always-available freeform field for text questions), and the accompanying test file does not validate the real overlay UI while also violating the required Test Doc doctrine.

**Key failure areas**:
- **Implementation**: The indicator can stay gray/zero on first load despite outstanding items, and text questions lose the required separate freeform context field.
- **Domain compliance**: The domain manifest, `question-popper/domain.md`, and `domain-map.md` lag the delivered Phase 5 UI surface.
- **Testing**: T010's promised lightweight UI coverage was replaced by helper-only assertions that do not render the provider, indicator, overlay, or answer form.
- **Doctrine**: Every new Phase 5 test omits the required 5-field Test Doc comment.

## B) Summary

The Phase 5 overlay surface is mostly in place: the provider/wrapper/panel/card structure matches the planned shape, no cross-domain internal imports were found, and no harness was configured for live validation. The main blocker is correctness: `useQuestionPopper` never derives `outstandingCount` from the initial list fetch, so the indicator/badge can misreport an already-outstanding queue until a later SSE event arrives. `AnswerForm` also hides the extra freeform text field for `text` questions, which directly contradicts AC-21's "always available" requirement. Review confidence is further reduced because the phase test file passes without rendering any of the shipped UI and without the mandated Test Doc blocks, while the domain artifacts are only partially updated for the new UI contracts.

## C) Checklist

**Testing Approach: Lightweight**

- [ ] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:100-124,154-163 | correctness | `outstandingCount` never syncs from the initial `/api/event-popper/list` fetch, so the indicator/header can show zero outstanding items on first load even when pending questions or unread alerts already exist. | Derive `outstandingCount` from fetched items inside `fetchItems()` (and keep it aligned after local refetch paths). |
| F002 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx:48-49,65-82,241-250 | correctness | `AnswerForm` hides the separate freeform context textarea for `text` questions, violating AC-21's requirement that the additional text field is always available. | Render the extra freeform field for all question types and preserve `AnswerPayload.text` independently from the typed answer. |
| F003 | HIGH | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx:1-227; /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/tasks.md:154-165 | testing | The Phase 5 test file never renders the provider, indicator, overlay panel, cards, or answer form, so the lightweight UI validation promised by T010 is absent. | Replace helper-only tests with RTL/JSDOM coverage for indicator state, overlay behavior, answer/clarify/dismiss/acknowledge flows, and notification suppression. |
| F004 | HIGH | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx:56-226 | doctrine | Every new Phase 5 test omits the required 5-field Test Doc comment mandated by `R-TEST-002` and Constitution §3.2. | Add a complete Test Doc block to each surviving test while rewriting the suite around real UI interactions. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-35,47-55,56-82,92-137 | domain-compliance | `question-popper/domain.md` is internally inconsistent after Phase 5: it still says the domain does not own UI components, omits the new notification utility from ownership/composition, and leaves Concepts/Dependencies in a pre-Phase-5 state. | Refresh Boundary, Composition, Concepts, Dependencies, and History so the document matches the shipped UI layer. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100; /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:42-46,123-166 | domain-compliance | The plan Domain Manifest and `domain-map.md` do not fully cover the delivered Phase 5 files/contracts (`layout.tsx`, `desktop-notifications.ts`, `ui-components.test.tsx`, `useQuestionPopper`, `QuestionPopperProvider`). | Add the missing manifest rows and update the `question-popper` node/health summary so the docs reflect the current domain surface. |

## E) Detailed Findings

### E.1) Implementation Quality
- **F001 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:100-124,154-163`  
  `QuestionPopperIndicator` and the overlay header both consume `outstandingCount`, but `fetchItems()` only stores `items`. The generic SSE route (`/Users/jordanknight/substrate/067-question-popper/apps/web/app/api/events/[channel]/route.ts:39-102`) sends only heartbeats on connect, and the service's `rehydrated` event (`/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/question-popper.service.ts:341-345`) fires during service construction rather than client connect, so a browser that loads after existing questions were created can show a false zero state until another event happens.

- **F002 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx:48-49,65-82,241-250`  
  The component comment says the freeform text is "always available," but the render guard `questionType !== 'text'` suppresses it for text questions. That removes the separate `AnswerPayload.text` path exactly where AC-21 says it must still exist alongside the typed answer.

- No additional HIGH security, error-handling, or performance defects were confirmed in the Phase 5 runtime code.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New runtime files live under `apps/web/src/features/067-question-popper/`, the wrapper lives under the workspace app tree, and tests stay under `test/unit/question-popper/`. |
| Contract-only imports | ✅ | The Phase 5 UI imports public contracts from `@chainglass/shared/question-popper`; no cross-domain internal-file import violation was found. |
| Dependency direction | ✅ | `question-popper` consumes infrastructure from `_platform/events`; no infrastructure→business inversion or business→business internal import violation was found. |
| Domain.md updated | ❌ | `docs/domains/question-popper/domain.md` still says the domain does not own UI components and does not fully describe the new notification utility / Phase 5 contract surface. |
| Registry current | ✅ | `docs/domains/registry.md` already contains `_platform/external-events` and `question-popper`. |
| No orphan files | ❌ | The plan Domain Manifest omits the changed `layout.tsx`, `desktop-notifications.ts`, and `ui-components.test.tsx` files. |
| Map nodes current | ❌ | `docs/domains/domain-map.md` still presents `question-popper` as a service/schema-only domain and does not reflect the new UI-facing contracts in the node/health summary. |
| Map edges current | ✅ | Phase 5 did not add a new cross-domain dependency edge beyond the existing `question-popper` → `_platform/events` / `_platform/external-events` relationships. |
| No circular business deps | ✅ | No new business-domain cycle was introduced. |
| Concepts documented | ⚠️ | A Concepts section exists, but it does not cover the newly documented UI-facing contracts (`useQuestionPopper`, `QuestionPopperProvider`). |

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:26-35,47-55,56-82,92-137`  
  The domain document was updated, but it is not internally consistent. The Boundary section still excludes UI components, the notification helper is absent from owned composition, the Concepts table does not describe the new UI contracts, and the "Domains That Depend On This" section still reads like a pre-Phase-3/4 placeholder.

- **F006 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-100`; `/Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md:42-46,123-166`  
  The domain-topology artifacts lag the code. The plan manifest does not account for all Phase 5 files, and the domain map/health summary still describe `question-popper` primarily as schemas + service rather than a shipped UI surface with `useQuestionPopper` / `QuestionPopperProvider`.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `QuestionPopperProvider` / `useQuestionPopper` SSE state hook | `/Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts` | `_platform/events` | Potential reuse opportunity — the generic SSE hook already exists, but this is not the primary blocker for Phase 5. |
| `AnswerForm` | `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/components/human-input-modal.tsx`; `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/components/qa-modal.tsx` | `workflow-ui` | Conceptual precedent only — similar 4-mode input UX exists, but the question-popper form adds different status and lifecycle actions. |
| `QuestionPopperOverlayWrapper`, cards, notification bridge | None | — | Proceed |

The anti-reinvention check found one worthwhile reuse opportunity around the existing generic `useSSE` hook, but it did not uncover a blocking duplicate subsystem.

### E.4) Testing & Evidence

**Coverage confidence**: 22%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-15 | 35 | `desktop-notifications.ts` and `QuestionPopperNotificationBridge` implement toast/desktop notifications, and `pnpm vitest run test/unit/question-popper/ui-components.test.tsx` proves the helpers do not throw, but no test verifies actual toast payloads, truncation, or granted-permission notifications. |
| AC-16 | 40 | `question-popper-indicator.tsx` implements the green/gray visual states, but no rendered test asserts the indicator's initial load behavior or visual-state classes. |
| AC-17 | 28 | `isOutstanding()` combines pending questions and unread alerts, yet no provider/indicator test proves the badge count reflects both types end-to-end. |
| AC-18 | 32 | The hook/panel implement overlay toggling and outstanding-vs-history selection, but there is no click/open/history test. |
| AC-19 | 30 | Mutual exclusion and non-modal overlay behavior are present in code, but they are not exercised by tests. |
| AC-20 | 30 | `QuestionCard` and `AlertCard` render markdown, tmux badges, and mark-read actions, but no UI test mounts them. |
| AC-21 | 12 | `AnswerForm` hides the freeform textarea for text questions (`questionType !== 'text'`), and no rendered test covers the always-available additional-context requirement. |
| AC-22 | 15 | The clarify flow exists in code, but no UI test proves the request path from the rendered form. |
| AC-23 | 25 | Alert acknowledgment is wired in code, but there is no render/click test for the Mark Read flow. |
| AC-30 | 28 | Desktop notification code exists, but evidence stops at no-op behavior when the Notification API is unavailable. |
| AC-31 | 22 | The dismiss button and API call exist, but there is no UI interaction test proving the flow. |
| AC-32 | 18 | The overlay can fall back to history and dismissed status is renderable, but no test proves dismissed questions remain visible in history. |

- **F003 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx:1-227`; `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/tasks.md:154-165`  
  The phase dossier promised lightweight UI validation for hook behavior, indicator state, and answer-form flows. The shipped suite instead checks type guards, helper no-throw behavior, literal payload shapes, and a locally redefined `isOutstanding()` helper. That left both F001 and F002 undetected.

### E.5) Doctrine Compliance
- **F004 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx:56-226`  
  `docs/project-rules/rules.md:100-120` and `docs/project-rules/constitution.md:133-146` both require every test to carry a 5-field Test Doc comment (Why, Contract, Usage Notes, Quality Contribution, Worked Example). None of the new Phase 5 tests include that documentation block.

### E.6) Harness Live Validation
N/A — no harness configured (`/Users/jordanknight/substrate/067-question-popper/docs/project-rules/harness.md` is absent).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-15 | Toast and desktop notification on new question/alert | `desktop-notifications.ts`, `QuestionPopperNotificationBridge`, targeted Vitest run only verifies helper no-throw behavior | 35 |
| AC-16 | Top-right indicator is always visible and glows green when outstanding | `question-popper-indicator.tsx` implementation present; no rendered indicator test | 40 |
| AC-17 | Badge count includes unanswered questions and unread alerts | `isOutstanding()` logic exists; no end-to-end badge assertion | 28 |
| AC-18 | Clicking indicator opens overlay and shows outstanding items or history | Hook/panel code present; no interaction test | 32 |
| AC-19 | Overlay is non-modal and participates in mutual exclusion | `overlay:close-all` + `aria-modal="false"` present; no mutual-exclusion test | 30 |
| AC-20 | Question/alert cards render markdown, tmux context, and mark-read behavior | Card components present; no mounted card test | 30 |
| AC-21 | Answer form matches question type and always includes extra freeform field | Implementation currently hides that field for text questions; no rendered form test | 12 |
| AC-22 | Needs More Information flow is available and wired | Clarify path present in code; no UI proof | 15 |
| AC-23 | Alerts can be marked read and stop counting as outstanding | Acknowledge path present in code; no click test | 25 |
| AC-30 | Desktop notifications fire when permission is granted | Notification helper exists; only unavailable-API behavior was tested | 28 |
| AC-31 | Questions can be dismissed without answering | Dismiss action present in code; no rendered-flow test | 22 |
| AC-32 | Dismissed questions remain visible in history | History fallback exists in code; no test proves retained dismissed history | 18 |

**Overall coverage confidence**: 22%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager diff b0bba25..44eaaf2 -- > /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/reviews/_computed.diff
git --no-pager diff --name-status b0bba25..44eaaf2
pnpm vitest run test/unit/question-popper/ui-components.test.tsx
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 5: Overlay UI
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/reviews/review.phase-5-overlay-ui.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | Reviewed | question-popper composition | Add manifest entry (F006) |
| /Users/jordanknight/substrate/067-question-popper/apps/web/app/(dashboard)/workspaces/[slug]/question-popper-overlay-wrapper.tsx | Reviewed | question-popper | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/alert-card.tsx | Reviewed | question-popper | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx | Needs changes | question-popper | Fix AC-21 freeform field gap (F002) |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-card.tsx | Reviewed | question-popper | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-popper-indicator.tsx | Reviewed | question-popper | Verify against fixed outstanding-count sync (F001) |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-popper-overlay-panel.tsx | Reviewed | question-popper | Add rendered coverage (F003) |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx | Needs changes | question-popper | Sync outstanding count from fetched items (F001) |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/desktop-notifications.ts | Reviewed | question-popper | Add manifest/domain-doc coverage (F006) |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Needs changes | question-popper docs | Refresh ownership/composition/concepts/history (F005) |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Reviewed | domain topology docs | Update `question-popper` node + health summary (F006) |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Reviewed | planning/docs | Add missing Phase 5 manifest rows (F006) |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/tasks.md | Evidence | plan artifact | Keep aligned with actual test scope after fixes |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/execution.log.md | Evidence | plan artifact | Append post-fix verification results |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-5-overlay-ui/tasks.fltplan.md | Evidence | plan artifact | None |
| /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx | Needs changes | question-popper verification | Replace helper-only coverage and add Test Docs (F003/F004) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx | Derive `outstandingCount` from fetched items and keep it aligned after refetches. | Prevent the indicator/header from showing a false zero state on first load. |
| 2 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx | Restore the always-available extra freeform field for text questions and preserve `AnswerPayload.text`. | AC-21 currently fails for text questions. |
| 3 | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx | Replace helper-only assertions with real provider/component interaction tests and add 5-field Test Docs. | The current suite does not validate the shipped UI and violates project doctrine. |
| 4 | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Refresh Phase 5 ownership/composition/concepts/history. | The domain document is internally inconsistent after the UI phase. |
| 5 | /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Update the `question-popper` node / health summary for the UI contracts. | Domain topology docs lag the delivered surface. |
| 6 | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Add the missing Phase 5 Domain Manifest rows. | The manifest currently leaves changed files orphaned. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Phase 5 Domain Manifest rows for `layout.tsx`, `desktop-notifications.ts`, and `ui-components.test.tsx` |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Consistent Phase 5 ownership, Concepts entries for UI contracts, updated dependency/consumer narrative |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md | Updated `question-popper` node label / Domain Health Summary for the UI layer |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md --phase "Phase 5: Overlay UI"
