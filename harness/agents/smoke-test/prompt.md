---
description: Verify the Chainglass harness is fully operational — health, screenshots, console, logs
tags: [harness, smoke-test, diagnostics]
---

# Smoke Test Agent

## Objective

Verify the Chainglass harness is fully operational by running diagnostics, capturing screenshots at multiple viewports, checking for browser console errors, reviewing server logs, and producing a structured report with an honest retrospective about the harness experience.

## Pre-flight

Run `just harness doctor --wait` to ensure the harness is healthy before proceeding. If doctor reports errors, follow the fix commands it suggests. Do not proceed until doctor reports healthy.

## Tasks

### 1. Health Check

Run `just harness health` and capture the JSON response. Verify all services show status "up". Record the health status for each service (app, mcp, terminal, cdp).

### 2. Screenshots

Capture the homepage at 3 viewports. The screenshot command saves files to `harness/results/` automatically.

```bash
just harness screenshot homepage-desktop --viewport desktop-lg
just harness screenshot homepage-tablet --viewport tablet
just harness screenshot homepage-mobile --viewport mobile
```

Each command returns JSON with the screenshot path. Record the path from each response — do not copy or move the files.

### 3. Browser Console Logs

Check the browser console for errors and warnings. The harness exposes Chrome DevTools Protocol (CDP). To discover the CDP endpoint:

```bash
just harness ports
```

This returns the CDP port. You can connect with Playwright (already installed in the harness workspace):

```javascript
// Run with: cd harness && pnpm exec tsx <script.ts>
import { chromium } from '@playwright/test';

const browser = await chromium.connectOverCDP('http://127.0.0.1:<cdp_port>');
const context = browser.contexts()[0] || await browser.newContext();
const page = context.pages()[0] || await context.newPage();

// Collect console messages
const messages: Array<{level: string, text: string}> = [];
page.on('console', msg => messages.push({ level: msg.type(), text: msg.text() }));

await page.goto('http://127.0.0.1:<app_port>');
await page.waitForLoadState('networkidle');

// Filter for errors and warnings
const issues = messages.filter(m => m.level === 'error' || m.level === 'warning');
console.log(JSON.stringify(issues, null, 2));

await browser.close();
```

Replace `<cdp_port>` and `<app_port>` with the actual ports from `just harness ports`.

If you cannot connect to CDP or Playwright is unavailable, note this in the report and skip to the next task.

### 4. Server Logs

Check the harness container logs for errors:

```bash
docker logs chainglass-harness-066-wf-real-agents 2>&1 | tail -50
```

If the container name doesn't match, find it with `docker ps --format '{{.Names}}'` and use that name. Summarize any errors or warnings found.

### 5. Report

Write `output/report.json` to the path provided in the output hint above this prompt. The report must be valid JSON matching the output schema. Include:

- Health check results (status per service)
- Screenshot references (name, viewport, path from command output)
- Console errors/warnings (if captured; empty array if none or skipped)
- Server log summary (brief text)
- Overall verdict: `"pass"` if health is ok and no console errors, `"fail"` if health is degraded/error, `"partial"` if health is ok but there were console errors or issues
- Retrospective (see below)

### 6. Retrospective — Harness UX Audit

This is the most important part of the report. You are the first autonomous agent to use this harness end-to-end. Your honest feedback directly improves the system.

Answer these questions specifically and honestly:

- **workedWell**: What CLI commands were intuitive and worked on the first try? What about the harness experience was pleasant or well-designed?
- **confusing**: What was confusing, unclear, or required trial-and-error? What information did you need that wasn't easily discoverable? Were any error messages unhelpful?
- **magicWand**: If you could add or change one thing about the harness to make your job easier, what would it be? Be concrete — name a specific command, flag, output format, or workflow improvement.
- **cliDiscoverability**: Which commands did you find via `--help`? Were there commands you wished existed? Was the JSON output format easy to parse?
- **improvementSuggestions**: List 1-3 specific, actionable improvements you'd make to the harness CLI or documentation.

Be specific. "The screenshot command was easy" is less useful than "The screenshot command's JSON response included the file path, which made it easy to reference in my report without guessing paths."

## Output

Write your structured JSON report to the file path specified in the output hint injected above this prompt. The report must conform to the output-schema.json in this agent's folder. After writing the report, verify it is valid JSON by reading it back.
