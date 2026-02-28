# Research Report: FlowSpace Search Integration (`#` Mode)

**Generated**: 2026-02-26T11:45:00Z
**Research Query**: "Explore FlowSpace search capabilities for implementing `#` search mode"
**Mode**: Pre-Plan
**FlowSpace**: Available (v0.1.0, graph: 397MB, ~10,000 nodes indexed)
**Findings**: 45+

## Executive Summary

### What It Does
FlowSpace (fs2) is a code intelligence tool that builds a hierarchical graph of every structural code element (files, classes, functions, types, sections, blocks) using tree-sitter AST parsing. It provides 4 search modes (text, regex, semantic, auto), hierarchical tree navigation, and full node retrieval — all via CLI and MCP server.

### Business Purpose
The `#` prefix in the command palette is currently a stub (`createSymbolSearchStub()`) that shows "Symbol search (LSP/Flowspace) coming later". Implementing this would give users VS Code-like code intelligence directly in the browser — find any class, function, type, or symbol by name or concept, navigate to source, and understand code structure.

### Key Insights
1. **FlowSpace MCP is already connected** — the fs2 MCP server tools (`tree`, `search`, `get_node`) are available in this project's AI agent workflows. The same capabilities can be exposed to the web UI via an API route.
2. **4 search modes provide graduated power** — text (exact substring), regex (pattern matching), semantic (conceptual/AI-powered), and auto (smart mode detection). All return scored results with node_ids, line numbers, smart_content summaries, and file paths.
3. **Node categories map naturally to icons** — file (📄), callable/ƒ (functions/methods), type/📦 (classes/interfaces), section/📝 (headings), block/🏗️ (IaC blocks). These categories are language-agnostic.
4. **Smart content provides instant understanding** — Each node can have an AI-generated `smart_content` summary. This is perfect for search result descriptions.
5. **The existing dropdown architecture supports this cleanly** — `DropdownMode` already has `'symbols'` with rendering logic. The `CommandPaletteDropdown` pattern (selected index, keyboard nav, scrollIntoView) works identically for FlowSpace results.

### Quick Stats
- **Graph Size**: 397MB, ~10,000+ nodes across entire chainglass monorepo
- **Search Response Time**: text/regex <100ms, semantic ~200-500ms
- **Node Types**: file, callable, type, section, block, definition, statement, expression, other
- **Embedding Support**: Full — both content and smart_content embeddings indexed
- **MCP Tools**: 6 (tree, get_node, search, docs_list, docs_get, list_graphs)

---

## How FlowSpace Search Works

### Search Modes

| Mode | How It Works | Best For | Speed |
|------|-------------|----------|-------|
| **text** | Case-insensitive substring match in content, node_id, smart_content | Exact names: `useFileFilter`, `ExplorerPanel` | <100ms |
| **regex** | Pattern matching with timeout protection | Patterns: `export.*function.*search`, `class.*Service` | <100ms |
| **semantic** | Cosine similarity on embeddings (content + smart_content) | Concepts: "error handling", "command palette search" | 200-500ms |
| **auto** | Detects regex metacharacters → REGEX, else → SEMANTIC (fallback TEXT if no embeddings) | Default — good for general use | Varies |

### Search Result Shape (per result)

```typescript
interface FlowSpaceSearchResult {
  node_id: string;         // "callable:src/hooks/use-file-filter.ts:useFileFilter"
  start_line: number;      // 114
  end_line: number;        // 200
  match_start_line: number;
  match_end_line: number;
  smart_content: string | null;  // AI summary: "Client-side file search cache with SSE delta updates"
  snippet: string;         // First ~100 chars of smart_content or code
  score: number;           // 0.0 - 1.0 (text/regex: 0.5-0.8, semantic: 0.25-0.97)
  match_field: string;     // "content" | "node_id" | "smart_content" | "embedding" | "smart_content_embedding"
}
```

### Node Categories (for icons/badges)

```typescript
const CATEGORY_MAP = {
  file: { icon: '📄', label: 'File' },
  callable: { icon: 'ƒ', label: 'Function' },
  type: { icon: '📦', label: 'Type' },
  section: { icon: '📝', label: 'Section' },
  block: { icon: '🏗️', label: 'Block' },
  definition: { icon: '🔹', label: 'Definition' },
  other: { icon: '○', label: 'Other' },
};
```

### Envelope Shape (response wrapper)

```typescript
interface SearchEnvelope {
  meta: {
    total: number;
    showing: { from: number; to: number; count: number };
    pagination: { limit: number; offset: number };
    folders: Record<string, number>;  // e.g. {"src/": 30, "tests/": 17}
  };
  results: FlowSpaceSearchResult[];
}
```

### Tree Navigation

FlowSpace `tree` provides hierarchical code structure:
- `tree(pattern=".")` — top-level files/folders
- `tree(pattern="ClassName")` — find by name
- `tree(pattern="src/features/")` — scope by folder
- `tree(pattern=".", detail="max")` — includes signatures and AI summaries

### Get Node (Full Source)

`get_node(node_id)` returns complete source code + metadata:
- Full `content` (actual source code)
- `signature` (first line of declaration)
- `language`, `category`, `start_line`/`end_line`
- `parent_node_id` (hierarchy)

---

## Current Architecture: `#` Symbol Mode

### Entry Point
`explorer-panel.tsx` line 121:
```typescript
const symbolMode = editing && inputValue.startsWith('#');
```

### Mode Derivation
```typescript
const dropdownMode = paramGathering
  ? 'param'
  : paletteMode ? 'commands'   // > prefix
  : symbolMode ? 'symbols'     // # prefix
  : 'search';                   // plain text
```

### Current Stub Rendering
`command-palette-dropdown.tsx` line 292-296:
```tsx
{mode === 'symbols' && (
  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
    <Hash className="inline h-4 w-4 mr-1 -mt-0.5" />
    Symbol search (LSP/Flowspace) coming later
  </div>
)}
```

### Stub Handler
`stub-handlers.ts`:
```typescript
export function createSymbolSearchStub(): BarHandler {
  return async (input) => {
    if (!input.startsWith('#')) return false;
    toast.info('Symbol search (LSP/Flowspace) coming later');
    return true;
  };
}
```

---

## Wormhole MCP (VS Code LSP Bridge)

FlowSpace also has a **Wormhole MCP** server that bridges to VS Code's Language Server Protocol. This provides:

| Tool | Purpose |
|------|---------|
| `search_symbol_search` | Workspace-wide or per-file symbol search (classes, methods, functions, fields) |
| `symbol_calls` | Call hierarchy (incoming callers / outgoing callees) |
| `symbol_navigate` | Find all references or implementations |
| `diagnostic_collect` | Compiler errors, warnings, linting issues |
| `editor_get_context` | Current VS Code editor state |
| `symbol_rename` | Workspace-wide rename |

**Note**: Wormhole requires VS Code running with the bridge extension. For the web app, we'd use fs2's native MCP tools (tree/search/get_node) rather than Wormhole.

---

## Suggestions for `#` Search Mode Implementation

### Tier 1: Core Search (MVP)

**When user types `# <query>`:**

1. **Strip the `#` prefix** and use the remainder as the search query
2. **Call fs2 search** via a new API route `/api/flowspace/search`
3. **Display results** in the dropdown with:
   - Category icon (ƒ for functions, 📦 for types, 📄 for files)
   - Node name (e.g., `useFileFilter`)
   - File path (truncated, e.g., `...hooks/use-file-filter.ts`)
   - Line range badge (e.g., `L114-200`)
   - Smart content summary (if available, 1 line truncated)
   - Score indicator (high/medium relevance)
4. **On select**: Navigate to the file at the specific line

### Tier 2: Mode Sub-Prefixes

Leverage FlowSpace's multiple search modes with sub-prefixes:

| Input | Mode | Behavior |
|-------|------|----------|
| `# useFileFilter` | auto (→ semantic) | Conceptual search — finds the hook and related code |
| `#t useFileFilter` | text | Exact substring — faster, precise name matches |
| `#r export.*Filter` | regex | Pattern matching — power user feature |
| `#s error handling` | semantic | Pure semantic/conceptual search |

### Tier 3: Rich Results

**Category Badges**: Show node category as a colored badge
```
ƒ useFileFilter         hooks/use-file-filter.ts  L114-200
  Client-side file search cache with SSE delta updates...
```

**Folder Distribution**: Show folder breakdown in header
```
# error handling    [apps/: 4  packages/: 2  test/: 1]
```

**Smart Content Preview**: For semantic results, show AI-generated summaries as a second line

### Tier 4: Tree Navigation

When a result is selected, offer tree expansion:
- **Enter**: Navigate to file + line
- **Right Arrow / Tab**: Expand node in tree view (show children — methods of a class, etc.)
- **Ctrl+Enter**: Show full source in a preview panel

### Tier 5: FlowSpace Availability Detection

```typescript
// Check if fs2 is available by trying the API route
const flowspaceAvailable = await fetch('/api/flowspace/health').then(r => r.ok).catch(() => false);

// If not available, show install prompt:
{!flowspaceAvailable && mode === 'symbols' && (
  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
    <Hash className="inline h-4 w-4 mr-1" />
    FlowSpace code intelligence not available
    <a href="https://github.com/AI-Substrate/flow_squared" className="text-primary underline ml-1">
      Install fs2
    </a>
  </div>
)}
```

---

## Architectural Approach: CLI Subprocess

```
Browser → Server Action / API Route → spawn `fs2 search` → parse JSON → return
```

fs2 CLI is installed globally (`/Users/jordanknight/.local/bin/fs2`) and all commands output clean JSON to stdout with no pagers or colors when piped. This is the simplest, zero-dependency approach.

### CLI Commands Used

```bash
# Search (all modes)
fs2 search "useFileFilter" --mode text --limit 10
fs2 search "export.*Filter" --mode regex --limit 10
fs2 search "error handling" --mode semantic --limit 10
fs2 search "something" --mode auto --limit 10

# Tree navigation
fs2 tree "ClassName" --detail max --json
fs2 tree "src/features/" --depth 2 --json

# Full source retrieval
fs2 get-node "callable:src/hooks/use-file-filter.ts:useFileFilter"

# Include/exclude filtering
fs2 search "auth" --include "src/" --exclude "test"
```

### Execution Pattern

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function fs2Search(pattern: string, mode: string, limit: number) {
  const { stdout } = await execFileAsync('fs2', [
    'search', pattern, '--mode', mode, '--limit', String(limit),
  ], { timeout: 5000 });
  return JSON.parse(stdout);
}
```

### Performance Characteristics (Observed)

| Command | Time | Notes |
|---------|------|-------|
| `fs2 search "X" --mode text` | ~200-400ms | Process startup + search |
| `fs2 search "X" --mode regex` | ~200-400ms | Similar to text |
| `fs2 search "X" --mode semantic` | ~400-800ms | Embedding comparison adds time |
| `fs2 tree "Name" --json` | ~300-500ms | Graph load + filter |
| `fs2 get-node "id"` | ~200-400ms | Graph load + single node |

Process startup (~150ms) is the main overhead. Acceptable with 300ms debounce.

### Availability Detection

```bash
# Check if fs2 is installed and graph exists
which fs2 && test -f .fs2/graph.pickle
```

If either fails, show the "not installed" message with install URL.

---

## Implementation Notes

### fs2 CLI Output
All fs2 commands output JSON to stdout (no pagers, no colors when piped). Example:
```bash
fs2 search "useFileFilter" --mode text --limit 10 | jq
```

### Debounce Strategy
Follow the same debounce pattern as file search (DEBOUNCE_MS=300). Semantic searches take longer (~200-500ms) so consider showing a loading spinner.

### Error Handling
fs2 returns clear exit codes:
- `0`: Success (even if no results)
- `1`: User error (missing config, invalid pattern)
- `2`: System error (corrupted graph)

### Security
The `save_to_file` parameter validates paths stay under CWD. For the API route, we won't use save_to_file — just return JSON results.

### Graph Freshness
The graph is built by `fs2 scan` and stored at `.fs2/graph.pickle`. It doesn't auto-update. Consider:
- Adding `fs2 watch` for auto-rebuild on file changes
- Or manual `fs2 scan` as a dev task
- Show "last scanned: X ago" in the UI

---

## Prior Learnings

### PL-01: BarHandler Chain Pattern
**Source**: Plan 047 Phase 3
The `#` prefix is intercepted by `createSymbolSearchStub()` in the handler chain. The new implementation should **replace** the stub handler, not add alongside it. The stub currently calls `toast.info()` — the real implementation should instead update the `symbolMode` state and trigger the API call.

### PL-02: Dropdown Mode Architecture  
**Source**: Plan 047/049
The `CommandPaletteDropdown` already handles 4 modes with shared keyboard navigation (selectedIndex, ArrowUp/Down, Enter, Escape). The `symbols` mode can follow the exact same pattern as `search` mode — just with different data source and result rendering.

### PL-03: vi.fn() Prohibition
**Source**: Plan 049 Review FT-003
Tests must use `fakeCallback<T>()` pattern, not `vi.fn()`. Any new tests for FlowSpace search must follow this doctrine.

---

## Critical Discoveries

### 🚨 Critical: Smart Content is the Killer Feature
FlowSpace's `smart_content` field provides AI-generated summaries of every code element. Example:
> "Client-side file search cache with SSE delta updates, debounce, sort cycling"

This is dramatically better than just showing file paths and line numbers. **Always show smart_content when available** — it's what makes FlowSpace search feel like IDE-level intelligence.

### 🚨 Critical: Node IDs Enable Deep Linking
Every result includes a `node_id` like `callable:src/hooks/use-file-filter.ts:useFileFilter`. This can be used to:
- Build a stable deep link to the code location
- Fetch full source via `get_node(node_id)`
- Navigate the hierarchy via `parent_node_id`

### 🚨 Critical: Folder Distribution is Free Metadata
Every search response includes `folders: {"src/": 30, "tests/": 17}`. This enables a free scope filter in the UI — let users click to filter by folder.

### 🚨 Critical: Semantic Search Needs Embeddings
Semantic mode requires `fs2 scan --embed` which needs an LLM/embedding API configured. If embeddings aren't available, AUTO mode gracefully falls back to TEXT. The UI should detect this and adjust messaging.

---

## Next Steps

1. **Decide scope**: Is this Plan 049 Feature 3, Plan 050 extension, or new Plan 051?
2. **Run `/plan-1b-specify`** to create the feature specification
3. **Key design decisions**:
   - API route approach (CLI subprocess vs MCP client)
   - Sub-prefix modes (#t, #r, #s) or just auto-detect?
   - Tree navigation on results?
   - FlowSpace availability detection strategy

---

**Research Complete**: 2026-02-26T11:50:00Z
**Report Location**: Session workspace (flowspace-search-research.md)
