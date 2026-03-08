# Mobile UX Audit Agent

## Objective

Evaluate the mobile experience of the Chainglass web app, with a particular focus on the terminal view inside a worktree. The terminal currently consumes excessive screen real estate on mobile viewports and the overall experience is known to be poor. Your job is to document exactly what's wrong, capture evidence, and propose concrete improvements.

## Pre-flight

1. Run `just harness doctor --wait` to ensure the harness is healthy.
2. Run `just harness seed` to ensure test data exists.

## Tasks

### 1. Discover the Workspace

Run `just harness health` to get the app port, then navigate to the workspaces page to find the seeded workspace slug. The app is at `http://127.0.0.1:<app_port>`. Try the URL `/workspaces` to list workspaces.

### 2. Mobile Homepage Assessment

Capture the homepage at mobile viewport:
```bash
just harness screenshot-all mobile-home --viewports mobile
```

Assess:
- Is the navigation usable on mobile? Can you see the sidebar?
- Is text readable? Are touch targets large enough?
- Does the layout feel native or is it a desktop layout squished?

### 3. Navigate to a Worktree

Find the seeded workspace (slug: `harness-test-workspace`) and navigate to its worktree page at `/workspaces/harness-test-workspace/worktree`. Capture a screenshot at mobile viewport.

Use Playwright via CDP to navigate and screenshot (see instructions for CDP access):
```bash
just harness ports
```
Then write a small script to navigate and capture what you see.

### 4. Terminal View Deep Dive

Navigate to the terminal page at `/workspaces/harness-test-workspace/terminal`. This is the critical page — it's known to be problematic on mobile.

Capture screenshots and evaluate:
- How much screen space does the terminal occupy? (percentage estimate)
- Can you see any other UI elements (nav, breadcrumbs, actions) or does the terminal consume everything?
- Is the terminal text readable at mobile font sizes?
- Can you scroll or interact with the terminal area?
- Is there a way to collapse or resize the terminal?

Take multiple screenshots if needed — the terminal at different scroll positions, with/without keyboard visible conceptually, etc.

### 5. Cross-Page Mobile Assessment

Also quickly check these pages at mobile viewport:
- `/workspaces/harness-test-workspace/workflows` — workflow list on mobile
- `/workspaces/harness-test-workspace/agents` — agents page on mobile

Screenshot each and note any obvious mobile UX issues.

### 6. Console Errors on Mobile

Check for mobile-specific JavaScript errors:
```bash
just harness console-logs --filter errors --wait 3
```

### 7. Write the Report

Write `output/report.json` to the path specified in the output hint above. The report must conform to the output schema. Include:
- Per-page assessments with severity ratings
- Screenshot evidence
- Concrete improvement proposals (not vague suggestions — specific CSS/layout/component changes)
- A prioritized list of the top 3 fixes that would most improve mobile UX

### 8. Retrospective

As with all harness agents, provide honest feedback:
- How well did the harness support mobile UX auditing?
- What CLI commands or capabilities would make this task easier?
- Any friction points in the workflow?

## Output

Write your structured JSON report to the file path specified in the output hint injected above this prompt.
