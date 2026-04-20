# Workshop: Harness Route Validation Command (`check-route`)

**Type**: CLI Flow
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-04-20
**Status**: Draft

**Related Documents**:
- [Workshop 007 — Harness Container Commands](007-harness-container-commands.md) (container CLI patterns)
- [harness/README.md](../../../../harness/README.md) (harness architecture)
- Code review agent magic wand (Plan 083 Phase 6): *"Add one route-validation wrapper that consistently accepts a relative workspace URL with query params, normalizes it once, and runs the common live-review checks."*

**Domain Context**:
- **Primary Domain**: `_(harness)_` (agent-facing CLI infrastructure)
- **Related Domains**: `file-browser` (routes being validated), `_platform/viewer` (editor surfaces)

---

## Purpose

Design a single CLI command that an agent (or human) runs to validate a Next.js route in the harness browser — navigating, checking for errors, and capturing evidence in one atomic operation. Today, agents must compose `screenshot`, `console-logs`, and manual CDP interactions separately, with inconsistent URL handling across commands. This workshop designs `check-route` as a unified route-verification primitive.

## Key Questions Addressed

- What checks should `check-route` perform in a single call?
- How should URLs be normalized (relative vs absolute, query params)?
- What does the JSON envelope look like?
- How does this compose with existing commands (`screenshot`, `console-logs`)?
- Should it support selector-wait assertions?
- What error codes and failure modes exist?

---

## The Problem

### Current Agent Experience

An agent validating a route today runs 3+ separate commands:

```bash
# Step 1: Screenshot (accepts --url with full or relative URL — unclear which)
just harness screenshot my-page --url "/workspaces/ws/browser?file=test.md&mode=rich"

# Step 2: Console errors (accepts --url as path — normalizes differently)  
just harness console-logs --url "/workspaces/ws/browser?file=test.md&mode=rich" --filter errors

# Step 3: Manual assertion — agent must parse both envelopes and correlate
```

**Pain points** (from code review agent retrospective MH-001):
1. `screenshot` treats `--url` as a full URL; `console-logs` treats it as a path — agents guess wrong
2. No single "is this page healthy?" verdict
3. Three round-trips to CDP for what is conceptually one check
4. No selector-wait — agents can't confirm a specific element rendered before the screenshot
5. Console error filtering requires post-processing the envelope

### Desired Agent Experience

```bash
just harness check-route "browser?file=test.md&mode=rich" \
  --workspace harness-test-workspace \
  --screenshot before-edit \
  --console-errors \
  --wait-for '[data-testid="md-wysiwyg-root"]'
```

One command. One CDP connection. One envelope. Clear verdict.

---

## Command Design

### Synopsis

```
harness check-route <path> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<path>` | Yes | Route path, relative to workspace. Accepts: `browser?file=x.md&mode=rich`, `/workspaces/ws/browser`, or full URL. Normalized internally. |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--workspace <slug>` | auto-detect | Workspace slug. If omitted, uses `HARNESS_WORKSPACE` env or first seeded workspace. |
| `--worktree <path>` | auto-detect | Worktree path inside container. Default: `/app/scratch/<workspace>`. |
| `--screenshot <name>` | none | If provided, captures screenshot to `results/<name>-<viewport>.png`. |
| `--console-errors` | false | Fail if any `error`-level console messages are present. |
| `--console-warnings` | false | Include `warning`-level messages in the check. |
| `--wait-for <selector>` | none | CSS selector to wait for before asserting. Fails if not visible within timeout. |
| `--wait-for-text <text>` | none | Wait for visible text content on the page. |
| `--viewport <name>` | `desktop-lg` | Viewport for the check. |
| `--viewports <list>` | none | Comma-separated viewports to check (runs all, one CDP session). |
| `--timeout <ms>` | `15000` | Navigation + wait-for timeout. |
| `--delay <ms>` | `2000` | Post-navigation hydration delay. |
| `--wait-until <strategy>` | `domcontentloaded` | Playwright load strategy. |

### URL Normalization

The command normalizes `<path>` through a consistent pipeline:

```
Input: "browser?file=test.md&mode=rich"
  ↓ prepend workspace path if bare
  → "/workspaces/harness-test-workspace/browser?file=test.md&mode=rich"
  ↓ prepend worktree query param if not present
  → "/workspaces/harness-test-workspace/browser?worktree=%2Fapp%2Fscratch%2Fharness-test-workspace&file=test.md&mode=rich"
  ↓ prepend base URL
  → "http://127.0.0.1:3000/workspaces/harness-test-workspace/browser?worktree=...&file=test.md&mode=rich"
```

Rules:
1. If `<path>` starts with `http`, use as-is (full URL)
2. If `<path>` starts with `/workspaces/`, prepend base URL only
3. If `<path>` starts with `/`, prepend base URL
4. Otherwise, treat as a route within the workspace: prepend `/workspaces/<slug>/`
5. If `worktree` query param is absent and `--worktree` is set, inject it

This resolves MH-001: agents don't need to think about URL construction.

---

## Check Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CONNECT — single CDP connection, single browser context      │
│   • Reuses getWsEndpoint() + chromium.connectOverCDP()          │
│   • Set viewport(s)                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. NAVIGATE — normalized URL, configurable wait strategy        │
│   • page.goto(normalizedUrl, { waitUntil, timeout })            │
│   • Post-navigation delay for React hydration                   │
│   • Start capturing console messages                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. WAIT — optional selector/text assertion                      │
│   • --wait-for: page.waitForSelector(sel, { state: 'visible' }) │
│   • --wait-for-text: page.getByText(text).waitFor()             │
│   • Timeout → check fails with E130                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. COLLECT — gather evidence                                    │
│   • Console messages (filtered by --console-errors/warnings)    │
│   • Screenshot (if --screenshot provided)                       │
│   • HTTP status code from navigation response                   │
│   • Page title                                                  │
│   • Final URL (may differ from input if redirected)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. VERDICT — pass / fail / degraded                             │
│   • FAIL: HTTP != 200, wait-for timeout, console errors (if on) │
│   • DEGRADED: console warnings (if --console-warnings)          │
│   • PASS: all checks satisfied                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Output Envelope

```typescript
interface CheckRouteResult {
  url: string;           // Normalized URL that was checked
  httpStatus: number;    // Response status code
  title: string;         // Page title after load
  finalUrl: string;      // Final URL (after redirects)
  viewport: string;      // Viewport used
  verdict: 'pass' | 'fail' | 'degraded';
  checks: {
    navigation: { ok: boolean; status: number };
    waitFor: { ok: boolean; selector?: string; text?: string } | null;
    consoleErrors: { ok: boolean; count: number; messages: ConsoleMessage[] } | null;
    screenshot: { ok: boolean; path: string } | null;
  };
  durationMs: number;
}
```

Envelope shape (per HarnessEnvelope convention):

```json
{
  "command": "check-route",
  "status": "ok",
  "timestamp": "2026-04-20T05:00:00.000Z",
  "data": {
    "url": "http://127.0.0.1:3000/workspaces/harness-test-workspace/browser?...",
    "httpStatus": 200,
    "title": "Browser — harness-test-workspace",
    "finalUrl": "http://127.0.0.1:3000/workspaces/harness-test-workspace/browser?...",
    "viewport": "desktop-lg",
    "verdict": "pass",
    "checks": {
      "navigation": { "ok": true, "status": 200 },
      "waitFor": { "ok": true, "selector": "[data-testid=\"md-wysiwyg-root\"]" },
      "consoleErrors": { "ok": true, "count": 0, "messages": [] },
      "screenshot": { "ok": true, "path": "results/before-edit-desktop-lg.png" }
    },
    "durationMs": 3250
  }
}
```

Multi-viewport runs return an array:

```json
{
  "command": "check-route",
  "status": "ok",
  "data": {
    "results": [
      { "viewport": "desktop-lg", "verdict": "pass", "..." : "..." },
      { "viewport": "mobile", "verdict": "fail", "..." : "..." }
    ],
    "overallVerdict": "fail"
  }
}
```

---

## Error Codes

| Code | Name | Cause |
|------|------|-------|
| E130 | `ROUTE_CHECK_FAILED` | Navigation failed (non-200 status) |
| E131 | `WAIT_FOR_TIMEOUT` | `--wait-for` selector not visible within timeout |
| E132 | `CONSOLE_ERRORS_PRESENT` | `--console-errors` enabled and errors found |
| E108 | `INVALID_ARGS` | Bad URL, unknown viewport, etc. |
| E104 | `CDP_UNAVAILABLE` | Cannot connect to browser |

---

## Usage Examples

### Basic route check (is it alive?)

```bash
$ just harness check-route "browser"
# → navigates to /workspaces/<auto>/browser, checks HTTP 200
```

### Rich editor page with screenshot

```bash
$ just harness check-route "browser?file=sample-rich.md&mode=rich" \
    --screenshot rich-mode \
    --wait-for '[data-testid="md-wysiwyg-root"]'
# → navigates, waits for editor root, screenshots, returns verdict
```

### Mobile + desktop in one call

```bash
$ just harness check-route "browser?file=sample-rich.md&mode=rich" \
    --viewports desktop-lg,mobile \
    --screenshot rich-responsive \
    --console-errors
# → checks both viewports, screenshots each, surfaces any console errors
```

### Full CI-style validation

```bash
$ just harness check-route "browser?file=sample-rich.md&mode=rich" \
    --viewports desktop-lg,tablet,mobile \
    --screenshot ci-check \
    --console-errors \
    --wait-for '[data-testid="md-wysiwyg-root"]' \
    --wait-until networkidle
# → most thorough check: all viewports, screenshots, console errors, selector wait
```

---

## Justfile Recipe

```just
# Validate a route in the harness browser (one command, one verdict)
check-route url *FLAGS:
    cd harness && pnpm exec tsx src/cli/index.ts check-route "{{url}}" {{FLAGS}}
```

---

## Implementation Notes

### Reuses Existing Infrastructure

| Component | Source | How `check-route` Uses It |
|-----------|--------|--------------------------|
| CDP connection | `harness/src/cdp/connect.ts` | `getWsEndpoint()` |
| Navigation | `harness/src/cdp/navigate.ts` | `navigateTo()` with options |
| Viewports | `harness/src/viewports/devices.ts` | `HARNESS_VIEWPORTS` lookup |
| Output format | `harness/src/cli/output.ts` | `formatSuccess` / `formatError` |
| Screenshot capture | `screenshot.ts` pattern | Same `page.screenshot()` logic |
| Console capture | `console-logs.ts` pattern | Same `page.on('console')` logic |

### New Code Required

1. **`harness/src/cli/commands/check-route.ts`** — command registration + pipeline
2. **`harness/src/cdp/url-normalizer.ts`** — URL normalization logic (testable pure function)
3. **Unit tests** for URL normalizer

### Estimated Complexity: CS-2

Single-file command (~200 lines) plus a small URL normalizer utility (~50 lines). No new deps. Pattern established by `screenshot-all.ts`.

---

## Comparison With Existing Commands

| Feature | `screenshot` | `console-logs` | `screenshot-all` | **`check-route`** |
|---------|-------------|----------------|-------------------|-------------------|
| Navigate to URL | ✅ | ✅ | ✅ | ✅ |
| Capture screenshot | ✅ | ❌ | ✅ | ✅ (opt-in) |
| Capture console msgs | ❌ | ✅ | ❌ | ✅ (opt-in) |
| Wait for selector | ❌ | ❌ | ❌ | ✅ |
| Multi-viewport | ❌ | ❌ | ✅ | ✅ |
| URL normalization | ❌ (raw) | ❌ (path only) | ❌ (raw) | ✅ (workspace-aware) |
| Pass/fail verdict | ❌ | ❌ | ❌ | ✅ |
| Single CDP session | ✅ | ✅ | ✅ | ✅ |

`check-route` is a superset that composes the capabilities of the other three commands.

---

## Open Questions

### Q1: Should `check-route` replace `screenshot` and `console-logs`?

**OPEN**: Three options:
- **Option A**: Keep all three. `check-route` is the recommended path; others remain for backward compat.
- **Option B**: Deprecate `screenshot` and `console-logs` with a message pointing to `check-route`.
- **Option C**: Make `screenshot` and `console-logs` thin wrappers that call `check-route` internally.

**Recommendation**: Option A for now. Revisit deprecation when agents are fully migrated.

### Q2: Should workspace auto-detection read from `harness/seed.json`?

**OPEN**: The seed command creates workspaces — `check-route` could read the seed manifest to auto-detect the workspace slug instead of requiring `--workspace`. This would make the zero-config experience work out of the box.

### Q3: Axe integration?

**OPEN**: Should `check-route` support `--axe` to run axe-core accessibility checks as part of the pipeline? This would address the `@axe-core/playwright` follow-up from Plan 083 Phase 6. If yes, it adds `@axe-core/playwright` as a dep to `harness/package.json`.

---

## Success Criteria

- ✅ Single command validates a route with navigation + optional assertions
- ✅ URL normalization handles all three input formats (bare path, workspace-relative, full URL)
- ✅ Console error and selector-wait checks produce a clear pass/fail verdict
- ✅ Multi-viewport support in one CDP session
- ✅ Output follows HarnessEnvelope convention
- ✅ Agents can validate a page in one command instead of three
