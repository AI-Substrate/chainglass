# Fix FX004: Harness check-route command + mobile viewer auto-switch

**Created**: 2026-04-20
**Status**: Complete
**Plan**: [076-harness-workflow-runner](../harness-workflow-runner-plan.md)
**Source**: Code review agent magic wand (Plan 083 Phase 6 MH-001) + Discovery D008 (mobile viewer hidden)
**Domain(s)**: `_(harness)_` (primary), `file-browser` (mobile fix)

---

## Problem

Two friction points surfaced during Plan 083 Phase 6:

1. **Harness route validation requires 3 commands.** Agents must run `screenshot`, `console-logs`, and `screenshot-all` separately — with inconsistent URL handling (`screenshot`/`screenshot-all` pass `opts.url` through raw; `console-logs` normalizes as path with `http://127.0.0.1:${ports.app}${path}`). There is no single "is this page healthy?" verdict, no selector-wait, and no pass/fail envelope.

2. **Mobile viewport hides the viewer panel.** Navigating to `?file=x.md&mode=rich` at 375px width shows the file tree, not the viewer. The editor element is mounted but hidden behind the "Content" tab (`mobileActiveIndex !== 1`). `mobileActiveIndex` is initialized from the `mobileView` URL param (lines 124-131 of `browser-client.tsx`); there is no linkage from `file` param to the active tab.

## Proposed Fix

1. **Add `harness check-route` CLI command** — a unified route-validation primitive that navigates, waits for a selector or text, checks console errors/warnings, captures screenshots at one or more viewports, and returns a single pass/fail/degraded verdict in a HarnessEnvelope. Includes workspace-aware URL normalization and auto-detect. Design per [Workshop 014](../workshops/014-harness-check-route.md).

2. **Auto-switch to Content tab on mobile when `file` param is present and `mobileView` is absent** — in `browser-client.tsx`, after `mobileActiveIndex` is initialized from `mobileView` URL param, add: if `mobileView` is not set AND `params.file` is non-empty, default `mobileActiveIndex` to 1 (Content). Preserves explicit `mobileView` deep-link precedence.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_(harness)_` | primary | New `check-route` command + URL normalizer + error codes E135-E137 + justfile recipe |
| `file-browser` | secondary | `browser-client.tsx` — auto-switch mobile tab when `file` param present and `mobileView` absent |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX004-1 | Create `url-normalizer.ts` — pure function that takes a bare path, workspace slug, worktree path, and app port, and returns a fully-qualified URL. Rules: (1) starts with `http` → use as-is, (2) starts with `/workspaces/` → prepend base URL only, (3) starts with `/` → prepend base URL, (4) bare path → prepend `/workspaces/<slug>/`, (5) inject `worktree` query param if absent and `--worktree` set. Also implement workspace auto-detect: check `HARNESS_WORKSPACE` env, then fall back to first seeded workspace slug. Unit test with all 5 URL cases + workspace auto-detect. | `_(harness)_` | `/Users/jordanknight/substrate/083-md-editor/harness/src/cdp/url-normalizer.ts` (new), `/Users/jordanknight/substrate/083-md-editor/harness/tests/unit/cdp/url-normalizer.test.ts` (new) | All 5 URL normalization cases pass + workspace auto-detect case passes; function exported | Workshop 014 §URL Normalization |
| [x] | FX004-2 | Create `check-route.ts` command. Single CDP connection → navigate (configurable `--wait-until`, `--timeout`, `--delay`) → optional `--wait-for` selector / `--wait-for-text` → collect console messages (filterable via `--console-errors` / `--console-warnings`) → optional `--screenshot` (single viewport via `--viewport`, or multi-viewport via `--viewports`) → compute verdict (pass/fail/degraded). Register in `index.ts`. Add error codes to `output.ts`: `E135` (`ROUTE_CHECK_FAILED`), `E136` (`WAIT_FOR_TIMEOUT`), `E137` (`CONSOLE_ERRORS_PRESENT`). Output follows HarnessEnvelope: single-viewport returns `data: CheckRouteResult`; multi-viewport returns `data: { results: CheckRouteResult[], overallVerdict }`. | `_(harness)_` | `/Users/jordanknight/substrate/083-md-editor/harness/src/cli/commands/check-route.ts` (new), `/Users/jordanknight/substrate/083-md-editor/harness/src/cli/index.ts` (register), `/Users/jordanknight/substrate/083-md-editor/harness/src/cli/output.ts` (error codes E135-E137) | `cd harness && pnpm exec tsx src/cli/index.ts check-route --help` shows all options; `check-route "/" --screenshot home-test` returns HarnessEnvelope with `command:"check-route"`, `status:"ok"`, `data.verdict:"pass"` | Workshop 014 §Command Design, §Check Pipeline, §Output Envelope. E131/E132 already taken by `workflow.ts:243-246` — use E135+. |
| [x] | FX004-3 | Add `just harness check-route` justfile recipe, following the existing `harness *ARGS` pattern. Format: extend the harness command or add a dedicated recipe. Test: `just harness check-route "/" --screenshot smoke-test` runs and returns a JSON envelope. | `_(harness)_` | `/Users/jordanknight/substrate/083-md-editor/justfile` (add recipe or extend harness passthrough) | `just harness check-route "/" --screenshot smoke-test` exits 0 and stdout contains `"command":"check-route"` | Follow existing pattern at justfile:114-117 |
| [x] | FX004-4 | Mobile viewer auto-switch. In `browser-client.tsx`, where `mobileActiveIndex` is initialized from `mobileView` URL param (~line 124-131): if `mobileView` param is NOT set AND `params.file` is non-empty (a file was selected via URL), default `mobileActiveIndex` to `1` (Content tab). This preserves explicit `?mobileView=2` deep-links (e.g., terminal redirect). Regression guard: `?mobileView=2&file=x.md` must still land on tab 2 (Terminal), not auto-switch to Content. | `file-browser` | `/Users/jordanknight/substrate/083-md-editor/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | At 375px viewport, navigating to `?file=x.md&mode=rich` (without `mobileView`) shows Content tab. `?mobileView=2&file=x.md` still shows Terminal tab. | D008. `mobileActiveIndex` is `useState` initialized from `mobileView` URL param. Content is `mobileViews[1]` (browser-client.tsx:961-964). File taps already force Content via `setMobileActiveIndex(1)` at :576-580. |
| [x] | FX004-5 | Smoke-test both fixes. (a) Desktop: `just harness check-route "browser?file=sample-rich.md&mode=rich" --wait-for '[data-testid="md-wysiwyg-root"]' --screenshot fx004-desktop --console-errors` → returns pass verdict. (b) Multi-viewport: `just harness check-route "browser?file=sample-rich.md&mode=rich" --viewports desktop-lg,tablet --screenshot fx004-multi` → returns envelope with `results[]` array + `overallVerdict`. (c) Mobile: run `cd harness && npx playwright test tests/smoke/markdown-wysiwyg-smoke.spec.ts --project=mobile -g "bottom-sheet"` and verify the T004 mobile test no longer skips with "viewer panel hidden". | `_(harness)_`, `file-browser` | `/Users/jordanknight/substrate/083-md-editor/harness/tests/smoke/markdown-wysiwyg-smoke.spec.ts` (may remove mobile skip) | All 3 smoke checks pass; mobile Playwright test runs (not skips) | |

## Workshops Consumed

- [Workshop 014: Harness check-route command](../workshops/014-harness-check-route.md)

## Acceptance

- [ ] `just harness check-route "/" --screenshot smoke` returns HarnessEnvelope with `command:"check-route"` and `data.verdict`
- [ ] `just harness check-route "browser?file=sample-rich.md&mode=rich" --wait-for '[data-testid="md-wysiwyg-root"]' --console-errors` returns pass
- [ ] Multi-viewport: `--viewports desktop-lg,tablet` returns `data.results[]` array with per-viewport verdicts + `data.overallVerdict`
- [ ] URL normalization handles all 5 input formats (unit tests green)
- [ ] Workspace auto-detect: bare `check-route "browser"` works without `--workspace`
- [ ] Mobile 375px: `?file=x.md&mode=rich` (without `mobileView`) auto-shows Content tab
- [ ] Mobile 375px: `?mobileView=2&file=x.md` still shows Terminal tab (regression guard)
- [ ] Existing harness commands (`screenshot`, `console-logs`, `screenshot-all`) unchanged
- [ ] Error codes E135-E137 in `output.ts` (no collision with workflow.ts E131/E132)

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## Validation Record (2026-04-20)

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth | Technical Constraints, Hidden Assumptions, Edge Cases | 1 HIGH + 1 MEDIUM — fixed | ⚠️ → ✅ |
| Cross-Reference | Integration & Ripple, Domain Boundaries, Concept Documentation, System Behavior | 1 HIGH + 3 MEDIUM — fixed | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Deployment & Ops, User Experience | 1 HIGH + 2 MEDIUM + 1 LOW — fixed | ⚠️ → ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `plan-6-v2-implement-phase` | Executable task list with absolute paths + testable done-when | shape mismatch | ✅ (fixed) | All 5 tasks have absolute paths; done-when specifies exact commands and expected output |
| `plan-7-v2-code-review` | AC traceability + domain compliance | contract drift | ✅ (fixed) | 9 acceptance criteria; domain impact table; workshop cross-refs |
| Future harness agents | Stable `check-route` contract with URL normalization + envelope | shape mismatch | ✅ (fixed) | Task now specifies full option set, envelope shape, multi-viewport `results[]`, workspace auto-detect |
| Deployment & Ops | No hidden deps/env/container changes | encapsulation lockout | ✅ | No new npm deps; error codes E135-E137 avoid collision; justfile recipe follows existing pattern |
| User Experience | Mobile fix self-contained, no regression | lifecycle ownership | ✅ (fixed) | `mobileView` precedence guard added; regression AC for `?mobileView=2` |

**Outcome alignment**: The artifact advances "agents can validate a page in one command instead of three" — the dossier now specifies the full check-route contract (all workshop options, envelope shape, multi-viewport, workspace auto-detect) plus the mobile fix with proper precedence guard, giving downstream consumers (plan-6 implementor, plan-7 reviewer, future agents) everything they need.

**Standalone?**: No — three named downstream consumers with concrete needs.

Overall: ⚠️ **VALIDATED WITH FIXES**
