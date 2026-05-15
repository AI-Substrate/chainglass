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

#### 4a. Terminal Session Persistence (FX005 + FX006)

Verify that the auto-picked tmux session lands on the worktree-folder
session, survives a mobile sleep/wake cycle, and survives a hard
refresh. The mobile Terminal tab is **auto-pick only by design** —
there is no in-tab session picker UI; the auto-pick must be correct
on its own (resolution order: URL `?session=` → worktree-folder match
→ branch-name match → first stable-sorted). FX005 covers the URL
persistence + phantom cleanup; FX006 covers the worktree-folder
match that fixed the original "wrong tmux session" regression on
non-branch-named worktrees.

1. **Auto-pick on cold load (FX006 regression)**: cold-load
   `/workspaces/<slug>/browser?mobileView=2&worktree=<abs-path>`
   without `?session=` in the URL, choosing a worktree where the
   branch name does **not** match a session name (e.g.
   `/Users/.../higgs-jordo` while on branch `main`). After the page
   settles, assert the URL now contains
   `?session=<worktree-folder-basename>` — i.e. `?session=higgs-jordo`,
   not `?session=osk-data` or any other older session.
2. **URL persistence across sleep/wake**: with the auto-picked session
   loaded, swipe to the Files tab (mobileView=0). Simulate a
   sleep/wake cycle in Playwright by firing the events the real
   mobile browser would fire on resume — order matters:
   ```js
   await page.evaluate(() => {
     Object.defineProperty(document, 'hidden', { value: true, configurable: true });
     document.dispatchEvent(new Event('visibilitychange'));
   });
   await page.waitForTimeout(50);
   await page.evaluate(() => {
     Object.defineProperty(document, 'hidden', { value: false, configurable: true });
     document.dispatchEvent(new Event('visibilitychange'));
     window.dispatchEvent(new Event('focus'));
   });
   ```
3. Swipe back to the Terminal tab. Assert:
   - The previously-auto-picked session is still selected.
   - The URL still contains `?session=<name>`.
   - The terminal pane is wired to the named session (no flicker to a
     different session and back).
4. **Deep-link**: navigate cold to
   `/workspaces/<slug>/browser?mobileView=2&session=<known-good-name>&worktree=<path>`.
   The hook should keep the URL-supplied name (URL is canonical
   override). Assert the named session is the one shown.
5. **Phantom-link cleanup**: navigate cold to
   `/workspaces/<slug>/browser?mobileView=2&session=ghost-nonexistent-${Date.now()}&worktree=<path>`.
   The hook should fall back (auto-pick) AND remove the phantom name
   from the URL — the address bar should NOT still show
   `session=ghost-...` after the page settles. Save the post-load URL.
6. **Hard-refresh test**: with the auto-picked session loaded, hit
   browser refresh. After reload, assert the same session is still
   selected (URL persisted across reload).

**Out of scope**: the mobile Terminal tab does not (and should not)
have a session-picker UI. Auto-pick is the contract. If the auto-pick
lands on the wrong session, the bug is in the resolution order, not
in a missing picker.

If the harness is unhealthy at audit time, the operator can verify
manually via `just dev` + Chrome DevTools: same flow, but fire the
visibilitychange / focus events from the Console panel.

### 5. Recent Changes / History Tab

The browser page has a 4-tab mobile strip: **Files · Content · Terminal · History**.
The 4th tab (History) hosts the Recent Changes Feed. Verify:

- The 4-icon tab strip renders without overflow at 390px width — all four
  icons + labels visible, none clipped or wrapped to a second line.
- Tapping the History tab loads the feed and sets `?view=recent-feed`
  in the URL.
- Tapping a feed card switches to the Content tab and loads the file in
  the viewer panel (URL: `view` cleared, `file` set).
- Tapping back to History from Content reopens the feed in the same
  scroll/filter state (lazy mount preserved across tab switches).
- Filter chip strip (All / Images / Videos / Audio / Markdown / Code /
  Other) fits on one line — chips may horizontally scroll if needed,
  but should not wrap or get cut off by tab strip / right action.
- The header row (title · live indicator · count · pause/refresh/
  settings icons) doesn't overlap the close button or right-side
  page actions.
- Feed-card preview content (image / video / audio / excerpt) honors
  the 60vh max-height ceiling on a phone-tall viewport — cards don't
  consume the entire viewport in a single item.

Screenshot the tab strip in each of: Files / Content / Terminal /
History active states. Save as `mobile-tabs-{label}.png`.

### 6. Cross-Page Mobile Assessment

Also quickly check these pages at mobile viewport:
- Workflows page
- Agents page

Screenshot each and note any obvious mobile UX issues.

### 7. Console Errors

Check for mobile-specific JavaScript errors via Playwright console event listener, or `just harness console-logs --filter errors --wait 3` if harness is running.

### 8. Write the Report

Write `output/report.json` to the path specified in the output hint above. The report must conform to the output schema. Include:
- Per-area findings with severity ratings
- Screenshot evidence (paths relative to run dir)
- Concrete improvement proposals (specific CSS/layout/component changes, not vague suggestions)
- A prioritized list of the top 3 fixes that would most improve mobile UX

### 9. Retrospective

As with all harness agents, provide honest feedback:
- How well did the tools support mobile UX auditing?
- What CLI commands or capabilities would make this task easier?
- Any friction points in the workflow?

## Output

Write your structured JSON report to the file path specified in the output hint injected above this prompt.
