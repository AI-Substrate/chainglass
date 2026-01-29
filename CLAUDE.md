# Chainglass Project Context for Claude Code

## Framework & Stack

- **Next.js 16.x** with App Router and Turbopack (default bundler)
- **Node.js 20.19+** required (enforced via engines + .nvmrc)
- **React 19** with Server Components as default
- **Tailwind CSS v4** with tailwind-merge for className composition
- **TypeScript 5.7+** with strict mode

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

## Critical Patterns

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

## Quick Reference

### Justfile Commands (Preferred)

Use `just` for common development tasks. Run `just --list` to see all commands.

```bash
# Quality checks (USE THESE BEFORE COMMITTING)
just fft                    # Fix, Format, Test - runs lint, format, then test
just check                  # Full quality check: lint, typecheck, test
just lint                   # Run biome linter only
just format                 # Format code only
just typecheck              # TypeScript type checking only

# Development
just dev                    # Start development server
just build                  # Build all packages
just test                   # Run test suite

# Setup & Maintenance
just install                # Install deps, build, link CLI globally
just clean                  # Clean build artifacts
just reset                  # Full reset (clean + reinstall)
```

### pnpm Commands (Alternative)

```bash
pnpm dev                    # Start dev server (apps/web)
pnpm build                  # Build all packages
pnpm test                   # Run test suite

# From apps/web
ANALYZE=true pnpm build     # Bundle analysis (requires --webpack flag with Turbopack)
```
