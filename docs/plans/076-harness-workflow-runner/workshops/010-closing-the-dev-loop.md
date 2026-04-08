# Workshop: Closing the Agent Development Loop

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-24
**Status**: Draft

**Related Documents**:
- [Workshop 008: Harness Wishlist](008-harness-wishlist-fixes.md) — friction points
- [Workshop 009: Error Visibility](009-workflow-error-visibility.md) — UI diagnostics
- [AGENTS.md](../../../AGENTS.md) — agent behavioral guide

**Domain Context**:
- **Primary Domain**: _(harness)_ — external tooling
- **Related Domains**: workflow-ui (browser verification), _platform/positional-graph (CLI)

---

## Purpose

An agent working on Chainglass should be able to: edit code → verify in browser → run a workflow → see what happened → fix what's broken → repeat. Today the loop is broken in several places. This workshop designs the fixes and proposes AGENTS.md updates so agents remember how to act.

## The Five Gaps

| # | Gap | Effect |
|---|-----|--------|
| G1 | **Two worlds** — harness targets container, dev server is on localhost:3000. No unified interface. | Agent falls back to raw CLI calls for host workflows |
| G2 | **No live log streaming** — `workflow logs` shows cached history, not real-time engine events | Agent is blind during execution, waits for failure |
| G3 | **Browser verification is an afterthought** — agents diagnose via CLI, never check the UI | UI bugs go unnoticed, visual regressions accumulate |
| G4 | **Error visibility only in CLI** — per-node errors don't surface in the browser | Human user can't see why a node failed |
| G5 | **AGENTS.md doesn't teach the workflow** — tells agents what NOT to do (no curl) but not what TO do | Agents don't know the right sequence of operations |

---

## G1: Two Worlds — Host vs Container

### The Problem

```
HOST (localhost:3000)                    CONTAINER (localhost:3101)
┌─────────────────────┐                 ┌─────────────────────┐
│ Dev server (just dev)│                 │ Docker (just harness dev)│
│ jordo-test workflow  │                 │ test-workflow        │
│ Real workspace       │                 │ Seeded workspace     │
│                      │                 │                      │
│ NO just shortcuts    │                 │ just wf-run/status   │
│ Must use raw CLI     │                 │ just harness-cg      │
└─────────────────────┘                 └─────────────────────┘
```

An agent editing `jordo-test` on localhost:3000 has no `just` shortcut. They must:
```bash
node apps/cli/dist/cli.cjs wf show jordo-test --detailed --json --pretty \
  --server --server-url http://localhost:3000 \
  --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents
```

### Design: `--dev` Flag on Workflow Shortcuts

Add a `--dev` flag (or make it the default) that targets the host dev server instead of the container:

```just
# Target: auto-detect. Uses host dev server if running, falls back to container.
# Override: just wf-run slug --dev (force host) or just wf-run slug --container (force container)

wf-run slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf run {{slug}} --server
    else
        node apps/cli/dist/cli.cjs wf run {{slug}} \
          --json --pretty --server \
          --workspace-path "$(pwd)"
    fi

wf-status slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf show {{slug}} --detailed --server
    else
        node apps/cli/dist/cli.cjs wf show {{slug}} \
          --detailed --json --pretty --server \
          --workspace-path "$(pwd)"
    fi
```

**Why default to host?** Most of the time, the agent is editing code and running the dev server locally. The container is for CI-style validation. The host is the hot path.

**Server URL discovery**: The CLI already has `discoverServerContext()` which walks up from CWD looking for `server.json`. From the repo root, it finds `apps/web/.chainglass/server.json`. No `--server-url` needed.

### Decision D1: Default target?

| Option | Pros | Cons |
|--------|------|------|
| **A: Default host, `--container` override** | Matches natural workflow — agent is working on host | Container validation requires explicit flag |
| **B: Default container, `--dev` override** | Current behavior, no breaking change | Most common case requires extra flag |
| **C: Auto-detect** | Magical, zero flags | Complex, fragile, confusing when both running |

**Recommendation: Option A** — default to host dev server. The container is a special case for isolated testing.

---

## G2: Live Log Streaming

### The Problem

When a workflow runs, the agent has no way to watch what's happening in real-time. They start it, poll status, and hope for the best. If it hangs, they don't know where or why until it times out.

### Design: `just wf-watch`

A new recipe that polls `--detailed --server` every 2 seconds and shows a live status table:

```just
# Watch workflow execution in real-time (polls every 2s, Ctrl+C to stop)
wf-watch slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    while true; do
        clear
        echo "=== $(date +%H:%M:%S) === Watching: {{slug}} ==="
        node apps/cli/dist/cli.cjs wf show {{slug}} \
          --detailed --json --pretty --server \
          --workspace-path "$(pwd)" 2>&1 || true
        sleep 2
    done
```

**Usage**:
```bash
# Terminal 1: Start workflow
just wf-run jordo-test

# Terminal 2: Watch it
just wf-watch jordo-test
# Shows live updating status every 2s:
#   === 03:31:25 === Watching: jordo-test ===
#   Status: running | Progress: 33% | Nodes: 1/3
#     ✅ test-user-input-7cf    complete     48s
#     🔄 sample-spec-builder    running      12s
#     ⏸ sample-coder-242       pending
```

**Future enhancement**: Replace polling with SSE streaming when `cg wf watch` command exists.

---

## G3: Browser Verification in the Loop

### The Problem

Agents have Playwright available but never use it proactively. The workflow is: edit code → run tests → commit. The browser is ignored.

### Design: Encode Browser Checks in AGENTS.md

This isn't a tooling fix — it's a behavioral fix. AGENTS.md should tell agents **when** to check the browser and **how**.

**Proposed AGENTS.md section**:

```markdown
### Browser Verification

When working on UI features or workflow execution, **verify in the browser** at key moments:

1. **After adding/removing nodes**: Take a screenshot to confirm the canvas updated
2. **After starting execution**: Check the status badge changed from idle
3. **After a failure**: Check what the user sees — is the error visible?
4. **Before committing UI changes**: Screenshot the affected page

Use the dev server URL directly with Playwright (browser_eval tool):
- Navigate to the workflow page
- Take a screenshot
- Check for console errors

This is not optional for UI work. If you can't see it, you can't ship it.
```

### Decision D2: Should we add a `just wf-screenshot` helper?

```just
wf-screenshot slug:
    just harness screenshot "wf-{{slug}}" \
      --url "http://localhost:3000/workspaces/chainglass/workflows/{{slug}}?worktree=$(pwd)" \
      --wait-until domcontentloaded
```

**Recommendation**: Yes — makes browser verification a one-liner. But it targets the harness Playwright, which connects to the container's browser. For the host dev server, we'd need to use the Playwright MCP tool directly. Add as a helper but don't mandate it.

---

## G4: Error Visibility in UI

Covered in detail by [Workshop 009](009-workflow-error-visibility.md). Summary:

- **P1**: Per-node error in properties panel (click failed node → see error)
- **P2**: Diagnostics panel toggle in toolbar
- **P3**: Color-coded execution status badge

This workshop doesn't duplicate that design — it notes G4 as a dependency.

---

## G5: AGENTS.md — Teaching the Workflow

### The Problem

AGENTS.md says "use the harness" and "don't use curl" but doesn't teach the natural workflow. An agent arriving cold doesn't know:
- What order to do things
- When to check the browser vs CLI
- How to debug a failed workflow
- Which command to use when

### Design: Workflow Development Playbook

Replace the current commands-only section with a narrative flow:

```markdown
### Working on Workflows

**The loop**: Edit → Run → Observe → Fix → Repeat

#### Starting a workflow session

1. Make sure the dev server is running: `just dev`
2. Check workflow state: `just wf-status <slug>`
3. If you need a clean start: `just wf-restart <slug>`

#### Running and observing

1. Start: `just wf-run <slug>` — returns immediately with next steps
2. Watch: `just wf-watch <slug>` — live polling every 2s (Ctrl+C to stop)
3. Or poll manually: `just wf-status <slug>`
4. Check the browser: navigate to the workflow page to see the visual state

#### When something fails

1. Check status: `just wf-status <slug>` — look for `blocked-error` nodes
2. Read the error: the `error.message` field tells you what went wrong
3. Fix the root cause in code
4. Rebuild if needed: `pnpm --filter @chainglass/cli build`
5. Restart: `just wf-restart <slug>`

#### Editing the workflow itself

Use `cg` CLI commands against the dev server:

```bash
# List available work units
node apps/cli/dist/cli.cjs unit list --json --pretty --workspace-path .

# Add a line to a workflow
node apps/cli/dist/cli.cjs wf line add <slug> --json --workspace-path .

# Add a node to a line
node apps/cli/dist/cli.cjs wf node add <slug> <lineId> <unitSlug> --json --workspace-path .
```

These edit the workflow on the host dev server. Changes appear in the browser
via file watchers automatically.

#### Container vs host

- **`just wf-run/status/stop`** — targets the host dev server (default)
- **`just wf-run slug --container`** — targets the harness Docker container
- **`just harness-cg wf ...`** — always targets the container (for ad-hoc commands)

Most of the time, use the defaults. The container is for isolated testing
and CI-like validation.
```

---

## Implementation Plan

| Priority | Item | Effort | Gap |
|----------|------|--------|-----|
| **1** | Update `just wf-*` shortcuts to default to host dev server | 30 min | G1 |
| **2** | Add `just wf-watch` recipe | 10 min | G2 |
| **3** | Rewrite AGENTS.md workflow section with playbook | 20 min | G5 |
| **4** | Add browser verification guidance to AGENTS.md | 10 min | G3 |
| **5** | Implement Workshop 009 P1 (per-node error in UI) | 1-2 hrs | G4 |

Items 1-4 are quick and close most of the loop. Item 5 is a separate implementation effort.

---

## Decisions Summary

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | Default target for wf-* shortcuts? | OPEN | Leaning A: default host, `--container` override |
| D2 | Add `just wf-screenshot`? | OPEN | Leaning yes, low effort |
| D3 | `wf-watch` polling interval? | RESOLVED | 2 seconds |
| D4 | Should `wf-watch` use SSE instead of polling? | RESOLVED | Polling for now, SSE when `cg wf watch` exists |
| D5 | Where to document the playbook? | RESOLVED | AGENTS.md § Working on Workflows |

---

## AGENTS.md Changes Summary

| Section | Change | Why |
|---------|--------|-----|
| § The Harness is Non-Negotiable | Soften "NEVER use curl" to acknowledge host dev server CLI is valid | Agents need to use CLI directly for host workflows |
| § Harness Commands | Update wf-* shortcuts to show `--container` flag | New default behavior |
| NEW § Working on Workflows | Add narrative playbook (edit→run→observe→fix) | Agents don't know the sequence |
| NEW § Browser Verification | Add guidance on when/how to check the browser | Agents skip visual verification |
| § Harness Wishlist | Keep as-is, reference from playbook | Friction reporting stays |
