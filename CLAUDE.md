# Chainglass Project Context for Claude Code

## Framework & Stack

- **Next.js 16.x** with App Router and Turbopack (default bundler)
- **Node.js 20.19+** required (enforced via engines + .nvmrc)
- **React 19** with Server Components as default
- **Tailwind CSS v4** with tailwind-merge for className composition
- **TypeScript 5.7+** with strict mode

## Git & PR Style

- **No emojis** in commit messages, PR titles, or PR descriptions
- **No AI attribution** in commit messages or PR descriptions — do not mention Claude, AI, Co-Authored-By, or any AI tool
- Keep commit messages and PR descriptions factual and concise
- **MANDATORY: Run `just fft` before every commit** — this runs lint, format, and tests. Do not commit if it fails. If lint fails due to unrelated issues (e.g., broken symlinks from other plans), you may proceed after verifying tests pass with `pnpm test`.
- **NEVER use `git stash`, `git stash pop`, `git checkout -- .`, `git reset`, or any command that discards/undoes work** unless the user gives express permission. If you need a clean state, ask first.
- **XDG_CONFIG_HOME override**: This agent is launched with `XDG_CONFIG_HOME=~/.copilot-alt`, which means `gh` CLI commands inherit the wrong config and show "not logged in". For any `gh` or `git push` commands that need GitHub auth, prefix with `XDG_CONFIG_HOME=~/.config` to use the real credentials at `~/.config/gh/hosts.yml`.

## Communication Style

- **Always end with next steps** — after completing any task, reporting status, or answering a question, tell the user what you think should happen next. The user works on many things and won't always remember the current plan state.
- Suggest the specific command or action, not just "we could do X or Y"
- If there are multiple reasonable next steps, rank them by priority
- **Intent updates must include plan/phase context** — when calling `report_intent`, always include which plan number and phase you are working on (e.g., "065 Phase 3 implementation" not just "Implementing phase")

## Conventions

### Components

- **Default to Server Components** - only add `'use client'` when interactivity is required
- **Client Components** for: useState, useEffect, event handlers, browser APIs
- **Server Actions** for mutations - define in `app/actions/` or co-locate with `'use server'`

### Routing

- **App Router** only (no Pages Router)
- **Route Handlers** in `app/api/*/route.ts`
- **Dynamic segments**: `[param]` for single, `[...slug]` for catch-all
- **Async params**: Route handler params are Promises in Next.js 16 - await them

### Styling

- Tailwind CSS with `tailwind-merge` for className composition
- `next-themes` for dark mode support with `suppressHydrationWarning`

### Testing

- **Vitest** for unit/integration tests
- **Lightweight approach** - verify existing tests pass, avoid unnecessary new tests
- **Avoid mocks** - use real data/fixtures

## Architecture

### Monorepo Structure

```
apps/
  web/          # Next.js frontend (this project)
  cli/          # Command-line tool
packages/
  shared/       # Shared utilities and types
```

### Package Manager & Build

- **pnpm** (v9.15+)
- **Turbo** for monorepo builds
- **Turbopack** for Next.js dev/build

## C4 Architecture Diagrams

C4 model diagrams live in `docs/c4/` (L1 System Context, L2 Containers, L3 Components per domain). When creating or editing C4 files, follow the authoring principles in [.github/instructions/c4-authoring.instructions.md](.github/instructions/c4-authoring.instructions.md). All diagrams use Mermaid native C4 syntax (`C4Context`, `C4Container`, `C4Component`).

**Keep C4 diagrams in sync with domain changes.** When adding, removing, or renaming domain components, contracts, or relationships, update the corresponding `docs/c4/components/` file in the same PR. If a new domain is created, create its L3 component diagram and add it to `docs/c4/README.md`. If a domain is retired, remove its C4 file and links.

## Critical Patterns

### Mermaid Diagrams

Use `<br/>` for newlines in Mermaid node labels and edge labels. `\n` does NOT work.

```mermaid
%% GOOD
A["Line 1<br/>Line 2"]

%% BAD - \n renders literally
A["Line 1\nLine 2"]
```

### Shiki Syntax Highlighting

Shiki must stay **server-side only** via `serverExternalPackages` in next.config.mjs.
Never import shiki directly in client components.

```typescript
// GOOD: Server Action for highlighting
'use server'
import { codeToHtml } from 'shiki'

// BAD: Don't do this in client components
'use client'
import { codeToHtml } from 'shiki' // Will fail
```

### Error Handling

Use Result types from `packages/shared` for error handling.

### Data Fetching

- Server Components for data fetching
- Pass data as props to Client Components
- Don't use `useEffect` for initial data loads

### Search Before Creating — Mandatory Concept Check

**NEVER propose a new class, service, utility, hook, or pattern without first searching for existing implementations.** Code in this codebase may use different names than you expect — `connectNode` might be `GraphBuilder.link()`, a "rate limiter" might be `ThrottleGuard`.

**Before creating anything new, you MUST run a concept search as a subagent:**

1. **Launch `/code-concept-search` via the Task tool** (subagent) with a natural-language description of what you intend to build. This keeps the search results out of the main context window — the subagent does the heavy exploration and returns a concise summary.
   ```
   Task(subagent_type="general-purpose", prompt='Use /code-concept-search "file change notification service"')
   Task(subagent_type="general-purpose", prompt='Use /code-concept-search "graph node connection utility" --scope "packages/"')
   ```
   The subagent searches semantically (not just by name) and returns provenance, usage, and reuse assessment.

2. **If `/code-concept-search` is not available**, launch a subagent that uses FlowSpace semantic search:
   ```
   Task(subagent_type="Explore", prompt='Search for existing implementations of "your concept" using FlowSpace semantic search')
   ```

3. **If no search tools are available**, the subagent should walk the directory tree manually — read `tree` output, follow imports, and reason about what modules likely contain the functionality.

**Why a subagent?** Concept searches are token-heavy — they explore multiple directories, read source files, and trace provenance. Running inline bloats the main context. A subagent does the work and returns only the findings.

**What counts as "creating something new":**
- A new file (class, service, utility, hook, component)
- A new exported function that could overlap with existing helpers
- A new type/interface that models a concept already in the codebase
- A new pattern (e.g., event bus, pub/sub, observer) that may already be implemented

**If you find an existing implementation:**
- Reuse it, extend it, or explain to the user why a new one is warranted
- Reference the existing code by file path and line number

**If you skip this check**, you risk duplicating functionality and increasing maintenance burden. This is a blocking requirement, not a suggestion.

## MCP Integration

### FlowSpace (fs2) — Preferred Code Intelligence

**Always prefer FlowSpace MCP tools over legacy search tools (Grep, Glob) for code exploration.** FlowSpace provides structured, hierarchy-aware code intelligence that outperforms raw text search.

**Tools** (in recommended usage order):

1. **`tree`** — Explore codebase structure. Start here when orienting.
   - `tree(pattern=".")` — top-level overview
   - `tree(pattern="src/features/")` — folder-scoped exploration
   - `tree(pattern="ClassName", detail="max")` — find specific classes/functions with signatures
2. **`get_node`** — Retrieve full source code by `node_id` (obtained from `tree` or `search`).
3. **`search`** — Find code by text, regex, or semantic meaning.
   - `search(pattern="validate", mode="text")` — exact substring
   - `search(pattern="def test_.*config", mode="regex")` — pattern matching
   - `search(pattern="error handling logic", mode="semantic")` — conceptual search
   - Use `include`/`exclude` to scope by path (e.g., `include=["src/.*"]`, `exclude=["test.*"]`)
4. **`docs_list` / `docs_get`** — Browse and read bundled fs2 documentation.

**When to use FlowSpace vs legacy tools:**

| Task | Use FlowSpace | Use Grep/Glob/Read |
|------|---------------|---------------------|
| Explore structure / orient | `tree` | — |
| Find definitions | `tree(pattern="Name")` | — |
| Get full source of a code element | `get_node` | `Read` if you already know the exact path |
| Conceptual/semantic search | `search(mode="semantic")` | Not available |
| Search code content | `search(mode="text")` | `Grep` as fallback |
| Search non-code files (docs, config) | — | `Grep` |
| Find files by path pattern | — | `Glob` |

**Workflow:** `tree` to orient → `search` to find → `get_node` to read source → `Read`/`Edit` to modify.

### Next.js MCP

This project has MCP configured at `/_next/mcp` when running `pnpm dev`.

Available MCP tools:
- `get_routes` - List all application routes
- `get_errors` - Get current build/runtime errors
- `get_page_metadata` - Page component information
- `get_project_metadata` - Project configuration

See `/docs/how/nextjs-mcp-llm-agent-guide.md` for detailed workflows.

## Auth Bypass (Development)

To disable authentication for testing (e.g., Playwright browser automation):

1. Set `DISABLE_AUTH=true` in `apps/web/.env.local`
2. Restart the dev server (`just dev`)

This bypasses both the middleware redirect (in `proxy.ts`) and API route session checks (in `auth.ts`). Remove or set to `false` to re-enable auth.

## Quick Reference

### Justfile Commands (Preferred)

Use `just` for common development tasks. Run `just --list` to see all commands.

```bash
# Quality checks (USE THESE BEFORE COMMITTING)
just fft                    # Fix, Format, Test - runs lint, format, typecheck, then test
just check                  # Full quality check: lint, typecheck, test
just lint                   # Run biome linter only
just format                 # Format code only
just typecheck              # TypeScript type checking only

# Fast feedback (USE DURING DEVELOPMENT)
just test-feature 040       # Run tests for a specific plan (~1-2s)
just test-watch 040         # Watch mode for a plan (re-runs on change)

# Development
just dev                    # Start development server
just build                  # Build all packages
just test                   # Run full test suite

# Setup & Maintenance
just install                # Install deps, build, link CLI globally
just clean                  # Clean build artifacts
just reset                  # Full reset (clean + reinstall)
```

See `docs/how/dev/fast-feedback-loops.md` for the full testing strategy and feedback tier guide.

### Harness Commands (Agentic Development)

The harness provides a Docker-containerized dev environment with browser automation. Each worktree gets unique ports derived from its name. See `docs/project-rules/harness.md` for full documentation.

#### Harness Feedback Loop

The harness isn't just a testing tool — it's a product improvement engine. Every harness agent writes a structured retrospective with a required `magicWand` field capturing what would make the agent's job easier. These retrospectives become real fix tasks that ship in the same sprint.

**The cycle**: Agent runs → honest retrospective → FX task → implementation → better next run.

This is operational, not aspirational. FX002 (`console-logs` + `screenshot-all` commands) was sourced from the smoke-test agent's first retrospective. FX003 (`--wait-until` flag) was sourced from FX001 harness verification.

**When creating harness agents**, always include:
- A retrospective section in `prompt.md` asking what worked, what was confusing, and a magic wand wish
- `magicWand` as a **required** field in `output-schema.json`
- Specific examples of good vs bad feedback in `instructions.md`

See `harness/README.md` for the full philosophy and agent creation guide.

```bash
# Port allocation (unique per worktree)
just harness ports          # Show this worktree's port allocation

# Diagnostics (start here when something's wrong)
just harness doctor         # Run diagnostic checks with actionable fixes
just harness doctor --wait  # Wait for harness to become healthy (cold boot ~2-3 min)

# Lifecycle
just harness dev            # Start container (auto-computes ports)
just harness stop           # Stop container
just harness health         # Probe all endpoints (JSON)
just harness build          # Rebuild Docker image

# Testing & Evidence
just harness test --suite smoke              # Run smoke tests
just harness test --viewport mobile          # Test at mobile viewport
just harness screenshot home                 # Capture screenshot via CDP
just harness results                         # Read latest test results

# Seed Data
just harness seed           # Create test workspace + worktrees

# Agent Runner (Plan 070)
just harness agent run <slug>              # Execute an agent definition
just harness agent run <slug> --model gpt-5.4  # With model selection
just harness agent list                    # List available agents
just harness agent history <slug>          # Show past runs
just harness agent validate <slug>         # Re-validate most recent output

# Standalone harness deps (first time only)
just harness-install        # Install harness node_modules
```

### pnpm Commands (Alternative)

```bash
pnpm dev                    # Start dev server (apps/web)
pnpm build                  # Build all packages
pnpm test                   # Run test suite

NOTE: `just fft` is the preferred way to run tests and linter etc before commiting. 

# From apps/web
ANALYZE=true pnpm build     # Bundle analysis (requires --webpack flag with Turbopack)
```

### Scripts

The `scripts/` directory contains demo, test, and utility scripts. See `scripts/scripts.md` for the full index.

**When adding, removing, or renaming scripts, update `scripts/scripts.md` to keep the index current.**

### Event Popper CLI (Plan 067)

When you need to ask the user a question or send them a notification, use the Event Popper CLI. Requires the Chainglass dev server running (`just dev`).

- **Ask a question**: `cg question ask --type <text|single|multi|confirm> --text "Your question"` — blocks until answered (default 10 min timeout)
- **Send an alert**: `cg alert send --text "Your notification"` — fire-and-forget, returns immediately
- **Check answer**: `cg question get <questionId>` — retrieve answer for a previously asked question
- Run `cg question --help` and `cg alert --help` for full usage details, examples, and all available options.

### SSE Multiplexing (Plan 072)

Migrated workspace channel consumers share a **single multiplexed EventSource** connection per browser tab via `/api/events/mux`. Do NOT use the legacy `useSSE` hook (deleted) or create new direct EventSource connections.

> **Note**: Some agent hooks (`useAgentManager`, `useAgentInstance`) and the unused `useWorkspaceSSE`/`useServerSession` still use direct EventSource. These are outside Plan 072 scope.

**Two hooks** (import from `@/lib/sse`):
- **`useChannelEvents(channel, { maxMessages? })`** — Accumulates messages into an array. Use for index-cursor patterns or batch processing. Returns `{ messages, isConnected, clearMessages }`.
- **`useChannelCallback(channel, callback)`** — Fire-and-forget per-message callback. Use for notification→fetch patterns. Returns `{ isConnected }`.

**Adding a new SSE channel**:
1. Add channel name to `WORKSPACE_SSE_CHANNELS` in `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`
2. Use `useChannelEvents` or `useChannelCallback` in your component
3. Server-side: `sseManager.broadcast(channelName, data)` — the mux endpoint delivers it

See `docs/how/sse-integration.md` for full guide.
