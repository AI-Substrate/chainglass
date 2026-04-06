---
description: Evaluate mobile UX of the Chainglass web app — terminal view, layout, responsiveness
tags: [ux, mobile, audit]
---

# Mobile UX Audit Agent

## Objective

Evaluate the mobile experience of the Chainglass web app, with a particular focus on the terminal view inside a worktree. The terminal currently consumes excessive screen real estate on mobile viewports and the overall experience is known to be poor. Your job is to document exactly what's wrong, capture evidence via screenshots, and propose concrete improvements.

## Pre-flight

1. Check if the harness Docker container is running: `just harness health`. If it is, use its app port.
2. If not, check if the host dev server is running: `just preflight`. If it is, use `http://localhost:3000`.
3. Run `just harness seed` to ensure test data exists (if harness is running).

## Taking Screenshots

Use Playwright to navigate and screenshot at mobile viewport (390×844, iPhone 14 equivalent):

```javascript
// Run from repo root: npx playwright test --headed (or write inline script)
const { chromium } = require('playwright');
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.goto('http://localhost:3000/workspaces');
await page.screenshot({ path: 'mobile-home.png', fullPage: true });
```

Save screenshots to `$MINIH_RUN_DIR/output/` alongside your report.

## Tasks

### 1. Discover the App

Find the running app URL (harness port or localhost:3000). Navigate to `/workspaces` to find available workspaces. Pick one that has worktrees.

### 2. Mobile Homepage Assessment

Navigate to the homepage at mobile viewport (390×844). Screenshot and assess:
- Is the navigation usable on mobile? Can you see the sidebar?
- Is text readable? Are touch targets large enough (48px minimum)?
- Does the layout feel native or is it a desktop layout squished?

### 3. Navigate to a Worktree

Find a workspace and navigate to its browser page. Screenshot at mobile viewport.

### 4. Terminal View Deep Dive

Navigate to the terminal page. This is the critical page — it's known to be problematic on mobile.

Screenshot and evaluate:
- How much screen space does the terminal occupy? (percentage estimate)
- Can you see any other UI elements (nav, breadcrumbs, actions) or does the terminal consume everything?
- Is the terminal text readable at mobile font sizes?
- Can you scroll or interact with the terminal area?
- Is there a way to collapse or resize the terminal?

### 5. Cross-Page Mobile Assessment

Also quickly check these pages at mobile viewport:
- Workflows page
- Agents page

Screenshot each and note any obvious mobile UX issues.

### 6. Console Errors

Check for mobile-specific JavaScript errors via Playwright console event listener, or `just harness console-logs --filter errors --wait 3` if harness is running.

### 7. Write the Report

Write `output/report.json` to the path specified in the output hint above. The report must conform to the output schema. Include:
- Per-area findings with severity ratings
- Screenshot evidence (paths relative to run dir)
- Concrete improvement proposals (specific CSS/layout/component changes, not vague suggestions)
- A prioritized list of the top 3 fixes that would most improve mobile UX

### 8. Retrospective

As with all harness agents, provide honest feedback:
- How well did the tools support mobile UX auditing?
- What CLI commands or capabilities would make this task easier?
- Any friction points in the workflow?

## Output

Write your structured JSON report to the file path specified in the output hint injected above this prompt.
