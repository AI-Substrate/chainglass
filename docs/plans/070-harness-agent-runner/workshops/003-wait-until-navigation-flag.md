# Workshop: `--wait-until` Navigation Flag for Harness CLI

**Type**: CLI Flow
**Plan**: 070-harness-agent-runner
**Created**: 2026-03-09
**Status**: Draft

**Related Documents**:
- [FX001 Execution Log](../../072-sse-multiplexing/fixes/FX001-agent-sse-migration.log.md) — discovered the need during harness verification
- [Harness README](../../../harness/README.md)
- [Playwright goto docs](https://playwright.dev/docs/api/class-page#page-goto)

**Domain Context**:
- **Primary Domain**: `_platform/harness` (CLI commands, browser automation)
- **Related Domains**: `_platform/events` (SSE connections cause `networkidle` to never fire)

---

## Purpose

Add a `--wait-until` flag to all harness CLI commands that navigate pages, and change the default from `networkidle` to `domcontentloaded`. This makes the harness usable on pages with permanent SSE connections (which includes every workspace page after Plan 072).

## Key Questions Addressed

- What wait strategy should be the default for harness navigation?
- Which commands need the flag?
- How do we make the option discoverable when agents hit timeout errors?
- Should we also expose `--timeout`?

---

## The Problem

### Evidence: CLI vs Tests

Three CLI commands hardcode `waitUntil: 'networkidle'`:

| Command | File | Line | Strategy |
|---------|------|------|----------|
| `screenshot` | `harness/src/cli/commands/screenshot.ts` | 56 | `networkidle` |
| `screenshot-all` | `harness/src/cli/commands/screenshot-all.ts` | 75 | `networkidle` |
| `console-logs` | `harness/src/cli/commands/console-logs.ts` | 74 | `networkidle` |

Meanwhile, the test files already know the right answer:

| Test File | Strategy Used | Count |
|-----------|--------------|-------|
| `browser-smoke.spec.ts` | `domcontentloaded` | 8 uses |
| `routes-smoke.spec.ts` | `domcontentloaded` | 1 use |
| `cdp-integration.test.ts` | `domcontentloaded` | 2 uses |
| `seed-verification.spec.ts` | `domcontentloaded` | 2 uses |
| `sidebar-responsive.spec.ts` | `domcontentloaded` | 2 uses |

**15 test navigations use `domcontentloaded`** vs **3 CLI navigations using `networkidle`**. The tests were written after SSE was introduced; the CLI commands were written before.

### Why `networkidle` Fails

`networkidle` waits for zero network requests for 500ms. This never happens on workspace pages because:

1. **MultiplexedSSEProvider** keeps a permanent EventSource to `/api/events/mux`
2. **Terminal WebSocket** maintains a persistent connection
3. **React Query polling** fires every 2-5 seconds

Result: `page.goto()` hangs for 30s then throws `Timeout 30000ms exceeded`.

---

## Design

### Playwright `waitUntil` Values

| Value | Waits For | Use Case |
|-------|-----------|----------|
| `commit` | Response received | Fastest — just checks server responded |
| `domcontentloaded` | HTML parsed, DOM ready | **Best default** — page structure ready, JS executing |
| `load` | All resources loaded (images, stylesheets) | When you need visual completeness |
| `networkidle` | No requests for 500ms | Only for truly static pages with no SSE/WS/polling |

### Proposed Changes

#### 1. Add `--wait-until` to all 3 commands

```
just harness screenshot agents --wait-until domcontentloaded
just harness screenshot-all home --wait-until load
just harness console-logs --url /agents --wait-until domcontentloaded
```

#### 2. Change default to `domcontentloaded`

**Why**: Matches what the tests already do. Works on SSE pages. Still waits for the DOM to be parsed and interactive. If someone needs `networkidle`, they can opt in explicitly.

#### 3. Add `--timeout` flag

```
just harness screenshot agents --timeout 10000
```

Default: 30000ms (Playwright default). Exposed so agents can set shorter timeouts for known-fast pages or longer for cold starts.

#### 4. Smart error messages

When navigation times out, include the wait strategy in the error and suggest alternatives:

```json
{
  "command": "screenshot",
  "status": "error",
  "error": {
    "code": "E106",
    "message": "Screenshot capture failed",
    "details": {
      "message": "page.goto: Timeout 30000ms exceeded.",
      "waitUntil": "networkidle",
      "hint": "Page has active SSE/WebSocket connections. Try: --wait-until domcontentloaded"
    }
  }
}
```

---

## Implementation

### Shared Navigation Helper

Extract the repeated goto+waitUntil pattern into a shared helper:

```typescript
// harness/src/cdp/navigate.ts

import type { Page } from '@playwright/test';

/** Playwright-supported waitUntil values */
export const WAIT_UNTIL_VALUES = ['commit', 'domcontentloaded', 'load', 'networkidle'] as const;
export type WaitUntilValue = (typeof WAIT_UNTIL_VALUES)[number];

export const DEFAULT_WAIT_UNTIL: WaitUntilValue = 'domcontentloaded';
export const DEFAULT_TIMEOUT = 30_000;

export interface NavigateOptions {
  waitUntil?: WaitUntilValue;
  timeout?: number;
}

/**
 * Navigate to a URL with configurable wait strategy.
 * Wraps page.goto with the harness defaults.
 */
export async function navigateTo(
  page: Page,
  url: string,
  options: NavigateOptions = {},
): Promise<void> {
  const waitUntil = options.waitUntil ?? DEFAULT_WAIT_UNTIL;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  await page.goto(url, { waitUntil, timeout });
}
```

### Command Changes (all 3 files)

Each command adds two options and delegates to `navigateTo`:

```typescript
// In registerScreenshotCommand, registerScreenshotAllCommand, registerConsoleLogsCommand:

import { WAIT_UNTIL_VALUES, DEFAULT_WAIT_UNTIL, DEFAULT_TIMEOUT, navigateTo } from '../../cdp/navigate.js';
import type { WaitUntilValue } from '../../cdp/navigate.js';

program
  .command('screenshot <name>')
  .description('Capture a screenshot via CDP and save to results/')
  .option('--viewport <name>', 'Viewport to use', DEFAULT_VIEWPORT)
  .option('--url <url>', 'URL to navigate to')
  .option('--wait-until <strategy>', `Page load strategy: ${WAIT_UNTIL_VALUES.join(', ')}`, DEFAULT_WAIT_UNTIL)
  .option('--timeout <ms>', 'Navigation timeout in milliseconds', String(DEFAULT_TIMEOUT))
  .action(async (name, opts) => {
    // Validate --wait-until
    const waitUntil = opts.waitUntil as WaitUntilValue;
    if (!WAIT_UNTIL_VALUES.includes(waitUntil)) {
      exitWithEnvelope(
        formatError('screenshot', ErrorCodes.INVALID_ARGS,
          `Unknown wait-until strategy: ${waitUntil}`,
          { available: [...WAIT_UNTIL_VALUES] }),
      );
    }

    // ... existing setup ...

    // BEFORE: await page.goto(targetUrl, { waitUntil: 'networkidle' });
    // AFTER:
    await navigateTo(page, targetUrl, {
      waitUntil,
      timeout: Number(opts.timeout),
    });

    // ... rest unchanged ...
  });
```

### Help Text (Commander auto-generates)

```
$ just harness screenshot --help

Usage: harness screenshot [options] <name>

Capture a screenshot via CDP and save to results/

Options:
  --viewport <name>         Viewport to use (default: "desktop-lg")
  --url <url>               URL to navigate to
  --wait-until <strategy>   Page load strategy: commit, domcontentloaded, load, networkidle
                            (default: "domcontentloaded")
  --timeout <ms>            Navigation timeout in milliseconds (default: "30000")
  -h, --help                display help for command
```

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `harness/src/cdp/navigate.ts` | **NEW** — shared navigation helper with types and defaults | ~30 |
| `harness/src/cli/commands/screenshot.ts` | Add `--wait-until`, `--timeout` options; use `navigateTo` | ~+8, -1 |
| `harness/src/cli/commands/screenshot-all.ts` | Same pattern | ~+8, -1 |
| `harness/src/cli/commands/console-logs.ts` | Same pattern | ~+8, -1 |
| `harness/README.md` | Document new options in command table and quick reference | ~+15 |

**Estimated net**: ~60 new lines, 3 lines replaced. No test changes needed (tests already use `domcontentloaded`).

---

## README Updates

### Command Table (update existing rows)

```markdown
| Command | Description |
|---------|-------------|
| `just harness screenshot <name>` | Capture screenshot via CDP. Options: `--viewport`, `--url`, `--wait-until`, `--timeout` |
| `just harness screenshot-all <name>` | Screenshots at all viewports. Options: `--viewports`, `--url`, `--wait-until`, `--timeout` |
| `just harness console-logs` | Capture browser console logs. Options: `--filter`, `--url`, `--wait`, `--wait-until`, `--timeout` |
```

### New Section: Page Navigation

```markdown
## Page Navigation

All commands that navigate to pages accept these options:

| Option | Default | Values | Purpose |
|--------|---------|--------|---------|
| `--wait-until` | `domcontentloaded` | `commit`, `domcontentloaded`, `load`, `networkidle` | When to consider page "loaded" |
| `--timeout` | `30000` | milliseconds | How long to wait before timing out |

**Which strategy to use:**

- **`domcontentloaded`** (default) — DOM is parsed and ready. Works on all pages including SSE-enabled workspace pages. Best for most harness use cases.
- **`networkidle`** — No network requests for 500ms. Only works on fully static pages with no SSE, WebSocket, or polling. Will timeout on workspace pages.
- **`load`** — All resources (images, CSS) finished loading. Use when visual completeness matters.
- **`commit`** — Server responded. Fastest, but page content may not be rendered yet.

**Example:**
```bash
# Default (domcontentloaded) — works on SSE pages
just harness screenshot agents --url http://127.0.0.1:3159/workspaces/ws/agents

# Explicit networkidle for a known-static page
just harness screenshot login --wait-until networkidle

# Short timeout for a fast page
just harness screenshot home --timeout 5000
```
```

---

## Quick Reference

```bash
# Screenshot with default (domcontentloaded)
just harness screenshot agents --url http://127.0.0.1:3159/workspaces/ws/agents

# Screenshot with explicit wait strategy
just harness screenshot agents --url "..." --wait-until load

# Console logs with wait strategy
just harness console-logs --url /agents --wait-until domcontentloaded --wait 5

# Multi-viewport with timeout
just harness screenshot-all home --timeout 10000 --wait-until domcontentloaded
```

---

## Verification Checklist

- [ ] `just harness screenshot home` works (default = domcontentloaded)
- [ ] `just harness screenshot home --wait-until networkidle` works on landing page
- [ ] `just harness screenshot agents --url .../agents` works (SSE page, domcontentloaded)
- [ ] `just harness screenshot agents --url .../agents --wait-until networkidle` times out (expected)
- [ ] `just harness screenshot --help` shows all options with defaults
- [ ] `just harness console-logs --url /agents` works (SSE page)
- [ ] Invalid `--wait-until` value returns E108 INVALID_ARGS error
- [ ] harness/README.md documents all navigation options
- [ ] `just fft` passes

---

## Open Questions

### Q1: Should the default be `domcontentloaded` or keep `networkidle`?

**RESOLVED**: Change to `domcontentloaded`. Evidence: 15/18 test navigations already use it. The SSE multiplexer makes `networkidle` unusable on workspace pages, which are the primary harness target. Breaking change is acceptable — `networkidle` was silently broken on SSE pages anyway (30s timeout = unusable).

### Q2: Should `screenshot` also support `--full-page`?

**DEFERRED**: Currently hardcoded to `fullPage: false`. Useful but orthogonal to this fix. Could be a separate micro-enhancement.

### Q3: Should error messages detect SSE timeouts and suggest the fix?

**RESOLVED**: Yes. When goto throws a timeout error with `networkidle`, include a `hint` field suggesting `--wait-until domcontentloaded`. This is the key discoverability mechanism — agents hitting the error get the fix suggestion inline.
