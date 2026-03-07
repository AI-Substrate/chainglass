You are working in the Chainglass monorepo at the current directory.

## Task: Screenshot Audit

Take screenshots of the running Chainglass app at 3 viewport sizes (desktop, tablet, mobile) and report what you see.

## How

This repo has an agentic development harness. Read `docs/project-rules/harness.md` for full documentation.

### Step 1: Run doctor to check harness status

```bash
just harness doctor
```

If all checks pass (✓), skip to Step 3.

If any checks fail (✗), run the fix command shown in the output, then run `just harness doctor` again. Repeat until healthy.

If the harness is not running at all:

```bash
just harness-install          # first time only
just harness doctor --wait    # starts container and waits until healthy (up to 5 min for cold boot)
```

**Cold boot note**: First boot installs deps and builds packages (~2-3 min). Subsequent boots are fast (~10s). The `--wait` flag handles this automatically.

### Step 2: Take screenshots at 3 viewports

```bash
just harness screenshot homepage-desktop --viewport desktop-lg
just harness screenshot homepage-tablet --viewport tablet
just harness screenshot homepage-mobile --viewport mobile
```

### Step 3: Report what you see

- Look at each screenshot file in `harness/results/` (they're PNG files)
- Describe: What's on the page? Is there a sidebar? Navigation? Content area?
- Note any differences between desktop, tablet, and mobile layouts
- Report the JSON output from each screenshot command

All CLI commands return JSON: `{"command":"screenshot","status":"ok","data":{...}}`

If any command returns `"status":"error"`, report the error details and the fix command if provided.

## If things go wrong

Don't try to debug Docker internals. Run `just harness doctor` — it will tell you exactly what's wrong and how to fix it. If doctor says the harness is healthy but commands still fail, report the error output as-is.
