# The Harness Pattern: A Playbook for Closed-Loop Agent Development

> **What this is**: A portable guide to building a self-improving development harness — the pattern we built for Chainglass and want to replicate elsewhere. This isn't about any specific tech stack. It's about the *system* that makes rapid agent-driven development possible.

---

## The Problem

Modern development with AI agents creates a new class of friction:

1. **Agents can't see what users see.** They edit code but can't verify it renders correctly. They run commands but can't see the browser. They produce output but can't tell if it's actually good.

2. **Agent feedback disappears.** Every agent run surfaces friction — commands that don't exist, output that's unparseable, workflows that are confusing. This feedback evaporates unless you capture it structurally.

3. **Stale state causes silent failures.** A stale build, a dead server, a missing dependency — agents don't notice these the way humans do. They charge ahead with wrong assumptions.

4. **The dev loop is too long.** Edit → build → deploy → test → read logs → fix → repeat. Each step is a context switch. Agents amplify this problem because they work faster but can't close the loop themselves.

The Harness Pattern solves all four.

---

## The Core Idea

A harness is a **development-time system** — not production infrastructure — that gives both humans and AI agents three capabilities:

| Capability | What it means |
|------------|--------------|
| **Boot** | Start the app in a known-good state with one command |
| **Interact** | Send inputs, navigate pages, trigger workflows, execute commands |
| **Observe** | Capture evidence: screenshots, console logs, structured output, test results |

If you can boot, interact, and observe — you can close the loop. The agent edits code, boots the app, interacts with it, observes what happened, and decides what to do next. No human in the middle.

---

## The Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Developer / Agent                     │
│                                                          │
│   just dev          just wf-run foo      just preflight  │
│   just agent-list   just wf-logs foo     just agent-dry  │
└─────────────────────────┬───────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │    CLI Backbone       │
              │   (justfile recipes)  │
              │                       │
              │  Structured JSON I/O  │
              │  stdout = machine     │
              │  stderr = human       │
              └───────────┬───────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐    ┌──────▼──────┐   ┌────▼─────┐
    │  Host   │    │  Container  │   │  Agent   │
    │  Dev    │    │  Sandbox    │   │  Runner  │
    │  Server │    │  (Docker)   │   │  (minih) │
    │         │    │             │   │          │
    │ Real    │    │ Seeded data │   │ Prompts  │
    │ data,   │    │ Browser     │   │ Schemas  │
    │ fast    │    │ CDP/PW      │   │ History  │
    │ HMR     │    │ Isolated    │   │ Retro    │
    └─────────┘    └─────────────┘   └──────────┘
```

Two environments, one CLI surface, one agent system. Pick the right tool for the task.

---

## The Seven Pillars

### 1. CLI Backbone

**Everything goes through the CLI.** Not curl. Not manual browser clicks. Not ad-hoc shell scripts. One CLI surface that returns structured JSON.

```bash
# All commands return: { command, status, timestamp, data?, error? }
just harness health      # → {"status":"ok","data":{"app":"up","cdp":"up"}}
just wf-logs my-wf       # → {"timeline":[...],"diagnostics":[...]}
just agent-list           # → {"agents":[{"slug":"smoke-test",...}]}
```

**Why it matters**: Agents can parse JSON. Humans can read stderr. Both use the same commands. There's no "agent version" vs "human version" — one interface serves both.

**Implementation pattern**:
- Use `just` (or `make`, `task`, whatever) as the recipe layer
- Every recipe wraps a CLI tool that outputs JSON to stdout and progress to stderr
- Commands are composable: `just wf-run foo && just wf-watch foo`
- Short aliases for common flows: `wf-run`, `wf-logs`, `preflight`

**Recipe categories you'll need**:

| Category | Recipes | Purpose |
|----------|---------|---------|
| Lifecycle | `dev`, `stop`, `build`, `health`, `doctor` | Boot and manage the app |
| Evidence | `screenshot`, `console-logs`, `test`, `results` | Capture observable state |
| Workflows | `wf-run`, `wf-status`, `wf-stop`, `wf-logs`, `wf-watch` | Execute and observe workflows |
| Agents | `agent-list`, `agent-dry-run`, `agent-history`, `agent-resume` | Manage agent execution |
| Quality | `fft`, `lint`, `format`, `typecheck`, `test` | Pre-commit quality gates |
| Preflight | `preflight` | Verify environment before work |

---

### 2. Two Environments

You need two places to run the app, and you need to know when to use each.

**Host Dev Server** — your primary development loop. Real workspace, real data, fast iteration. Code changes reflect via HMR. This is where you spend 90% of your time.

```bash
just dev          # Start the app
just preflight    # Verify everything is healthy
# Edit code → HMR picks it up → verify in browser
```

**Container Sandbox** — isolated, reproducible, CI-like. Docker with seeded test data, browser automation, no host contamination. Use for: creating things from scratch, browser verification, pre-commit proof.

```bash
just harness dev           # Boot container (~2 min cold)
just harness doctor --wait # Wait until healthy
just harness seed          # Create test data
just harness screenshot home --viewport mobile
```

**The rule**: Host for speed, container for proof. Never force one when the other is better.

| Task | Use Host | Use Container |
|------|----------|---------------|
| Edit + verify a feature | ✅ | |
| Browser screenshot proof | | ✅ |
| Run agent against live app | ✅ | |
| CI-like validation | | ✅ |
| Debug a failing workflow | ✅ | |
| Test with seeded data | | ✅ |

---

### 3. Browser Automation as Evidence

Agents can't look at screens. The harness gives them eyes.

**Chrome DevTools Protocol (CDP)** provides:
- Screenshots at any viewport (mobile, tablet, desktop)
- Console log capture (errors, warnings)
- DOM inspection and interaction
- Network request monitoring

**Playwright** connects to the running browser (not a separate one):

```javascript
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
const page = await browser.contexts()[0].pages()[0];
await page.screenshot({ path: 'evidence.png', fullPage: true });
```

**Why connect, not launch**: The app is already running in the container with its own Chrome. Connecting to it means you see exactly what the app is rendering — not a fresh browser with no state.

**Evidence commands**:
```bash
just harness screenshot home                    # Single viewport
just harness screenshot-all home                # All viewports
just harness console-logs --filter errors       # Just errors
just harness console-logs --url /workflows      # Specific page
```

Every screenshot and log capture returns a path in the JSON response. Agents reference these paths in their reports. No guessing where files went.

---

### 4. Declarative Agent System

Agents are folders, not scripts. Each agent is a versioned definition with clear contracts.

```
agents/
├── _shared/
│   └── preamble.md              # Injected into every agent
├── smoke-test/
│   ├── prompt.md                # What to do (YAML frontmatter)
│   ├── output-schema.json       # What to produce
│   ├── instructions.md          # Agent identity + rules
│   └── runs/                    # Auto-created per run
│       └── 2026-04-06T.../
│           ├── prompt.md        # Frozen prompt snapshot
│           ├── events.ndjson    # Full event stream
│           ├── completed.json   # Run metadata
│           └── output/
│               └── report.json  # Structured output
```

**Key design decisions**:

1. **`prompt.md` with YAML frontmatter** — description, tags, model preferences. The prompt is the mission brief.

2. **`output-schema.json`** — validates agent output. Keep it loose. Agents will invent their own field names for domain-specific data. Only enforce system fields (`summary`, `retrospective`).

3. **`instructions.md`** — agent-specific rules only. Common boilerplate (git gotchas, output discipline, CLI reference) goes in the shared preamble.

4. **`_shared/preamble.md`** — injected before every agent's prompt. Contains environment orientation, gotchas, output rules, and the feedback philosophy.

5. **Run folders are frozen evidence bundles** — every run snapshots the exact prompt, schema, and instructions used. You can always trace what an agent saw when it ran.

**Agent runner (minih) provides**:
```bash
minih run smoke-test --model claude-sonnet-4      # Execute
minih run smoke-test --dry-run                     # Preview prompt
minih list                                         # Available agents
minih doctor                                       # Convention check
minih history smoke-test                           # Past runs
minih validate smoke-test                          # Re-validate output
minih resume smoke-test "check the tests too"      # Follow up
minih tail smoke-test                              # Live stream
```

---

### 5. The Retrospective Loop (The Most Important Part)

Every agent output MUST include:

```json
{
  "summary": "What I did and found.",
  "retrospective": {
    "workedWell": "What was smooth about using the tools.",
    "confusing": "What required trial-and-error.",
    "magicWand": "The ONE thing I'd change to make my job easier."
  }
}
```

**`magicWand` is the most valuable thing an agent produces.** Not the test results. Not the screenshots. The magicWand. Because it tells you exactly where the friction is — from the perspective of an entity that uses your tools hundreds of times.

**The cycle**:

```
Agent runs → produces retrospective → magicWand captured
                                          ↓
Developer reads magicWand → creates fix task (quotes agent's words)
                                          ↓
Fix implemented → same agent reruns → confirms fix works
                                          ↓
                                   Better next run
```

**This is not aspirational. It is operational.** Real examples from our harness:

| Agent Said | What Shipped |
|-----------|-------------|
| "No `console-logs` command — had to write Playwright from scratch" | Added `console-logs` + `screenshot-all` commands |
| "Screenshot command timed out on SSE pages" | Added `--wait-until` flag with `domcontentloaded` default |
| "No single place to see what happened in a workflow" | Built unified execution logs with auto-diagnostics |
| "Fix the CDP port collision so screenshots work" | (Next fix queued) |

**Rules for good feedback** (put these in your preamble):

Bad: "Screenshots were easy."
Good: "The screenshot command's JSON response included the file path in `data.path`, which I could reference directly in my report without guessing where files went."

Bad: "Domain checks were hard."
Good: "I had to manually navigate `docs/domains/` to find registry.md — a `just harness domains` command listing all domains would save exploration time."

---

### 6. Preflight Checks

**Run before every work session.** Catches the three most common stale-state bugs:

```bash
just preflight
  ✓ CLI build fresh       # Is dist/ newer than src/?
  ✓ Dev server running    # Is the PID alive?
  ✓ Workspace exists      # Does the data directory exist?
```

If any check fails, it prints exactly what to run to fix it. No guessing.

**Why this matters for agents**: An agent with a stale CLI build will run old code and produce confusing results. A dead dev server means API calls silently fail. A missing workspace means everything 404s. Preflight catches all three before the agent wastes tokens.

**Implementation**:
- Check file modification times (CLI dist vs src)
- Read PID files and `kill -0` to verify process is alive
- Check directory existence
- Print remediation commands on failure
- Suppress color codes in programmatic contexts (`FORCE_COLOR=0`)

---

### 7. The Friction Wishlist

When you hit friction — a command that fails, output that's unreadable, a flow that's confusing — write it down immediately.

```markdown
### W008 — Node properties null crash
**Severity**: 🔴 Blocker
**Problem**: Clicking a node with no stored state crashes the panel
**Impact**: Can't inspect any unexecuted node
**Fix**: Guard against null storedState in NodePropertiesPanel
```

**The wishlist is not a backlog. It's a live document.** Items get fixed in the same session they're discovered. Our wishlist had 10 items — all 10 were resolved within the same development arc.

The wishlist serves two purposes:
1. **For the current session**: reminds you what to fix before you forget
2. **For future sessions**: shows the trajectory of improvements (what used to be broken, what got fixed, how)

---

## Bringing It All Together: The Development Loop

```
┌─────────────────────────────────────────────────────────┐
│                    The Harness Loop                      │
│                                                          │
│   1. just preflight          ← Verify state              │
│   2. Edit code               ← Make changes              │
│   3. just wf-run foo         ← Execute                   │
│   4. just wf-watch foo       ← Observe (live polling)    │
│   5. just wf-logs foo        ← Diagnose (if failed)      │
│   6. Fix the issue           ← Iterate                   │
│   7. just wf-restart foo     ← Re-run                    │
│   8. Repeat 4-7              ← Until green                │
│   9. just fft                ← Quality gate               │
│  10. Commit                  ← Ship it                    │
│                                                          │
│  Parallel: agents run the same loop autonomously         │
│  After: agent retrospectives → fix tasks → better loop   │
└─────────────────────────────────────────────────────────┘
```

The harness makes this loop fast enough that you can run it dozens of times per hour. Agents can run it without human intervention. And every run makes the next run better.

---

## Replicating This on a New Project

### Phase 0: Foundation (Day 1)

1. **Create a `justfile`** with `dev`, `stop`, `health`, `preflight` recipes
2. **Dockerize the app** for isolated runs (bind mount source, named volume for deps)
3. **Add structured JSON output** to every CLI command
4. **Write the first preflight check** (is the app running?)

```bash
# You should be able to do this on day 1:
just dev
just health          # → {"status":"ok"}
just preflight       # → All checks passed
```

### Phase 1: Evidence (Week 1)

4. **Add browser automation** — Playwright + CDP in the container
5. **Add `screenshot` and `console-logs` commands** with JSON output
6. **Add `seed` command** for reproducible test data
7. **Add `doctor` command** — layered diagnostics with actionable fixes

```bash
# You should be able to do this by end of week 1:
just harness dev
just harness screenshot home --viewport mobile
just harness console-logs --filter errors
```

### Phase 2: Agents (Week 2)

8. **Install minih** as agent runner
9. **Create `agents/_shared/preamble.md`** with environment orientation
10. **Create first agent** (`smoke-test`) that validates the harness itself
11. **Run it** — fix what breaks
12. **Read the retrospective** — implement the magicWand suggestion

```bash
# You should be able to do this by end of week 2:
minih init smoke-test --agents-dir agents
minih run smoke-test --agents-dir agents
minih history smoke-test --agents-dir agents
```

### Phase 3: The Loop (Week 3+)

13. **Add workflow shortcuts** (`wf-run`, `wf-logs`, etc.) for your domain
14. **Add more agents** (code-review, UX audit, convention check)
15. **Start the wishlist** — capture friction as it happens
16. **Start fixing from retrospectives** — close the loop

At this point, the system is self-improving. Every agent run produces feedback. Every feedback item becomes a fix. Every fix makes the next run smoother.

---

## What Makes This Work (and What Doesn't)

### What makes it work

- **One CLI surface** for everything. No secret commands, no manual steps.
- **JSON everywhere**. Machines parse stdout, humans read stderr.
- **Agents are first-class**. Not afterthoughts bolted on. The system is designed for them.
- **Retrospectives are mandatory**. Not optional. Not "nice to have." Required.
- **Fixes ship fast**. Same session, not next sprint.
- **Two environments, clear rules**. Host for speed, container for proof. No ambiguity.

### What doesn't work

- **Overly strict output schemas**. Agents invent their own field names. Enforce structure loosely — require `summary` + `retrospective`, let everything else be `additionalProperties: true`.
- **CDP port conflicts**. If Chromium and the proxy fight over the same port, screenshots break and two agents in a row will complain about it. Fix port allocation early.
- **Aspirational wishlists**. If wishlist items don't get fixed quickly, they become noise. Fix them in the same session or delete them.
- **Docker cold boot time**. 2-3 minutes is too long for tight iteration. Use the host dev server for speed, container only for proof.

---

## The Vibe

The harness isn't a testing tool. It's a **product improvement engine** that happens to test things along the way.

Every agent that runs is a user of your developer tools. Every retrospective is a usability study. Every magicWand is a feature request from someone who actually used the thing, not someone who imagined using it.

The traditional development loop is: human writes code → human tests it → human ships it.

The harness loop is: human writes code → agent tests it → agent reports what sucked → human fixes what sucked → agent tests again → it sucks less → repeat.

The gap between "works on my machine" and "works for autonomous agents" is exactly the gap between "kinda works" and "actually works." Closing that gap makes everything better — for humans too.

---

*Built from the Chainglass harness (Plans 067, 070, 076). Portable to any project that needs rapid closed-loop development with AI agents.*
