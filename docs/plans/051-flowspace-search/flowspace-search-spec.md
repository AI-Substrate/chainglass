# FlowSpace Code Search

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from `research-dossier.md`.

FlowSpace (fs2) is a code intelligence tool that builds a hierarchical graph of every structural code element (files, classes, functions, types, sections) using tree-sitter. It provides 4 search modes (text, regex, semantic, auto), hierarchical tree navigation, and full node retrieval — all via CLI outputting clean JSON. The `fs2` CLI is installed locally and the codebase graph (`.fs2/graph.pickle`) is already indexed (~10,000+ nodes). The `#` prefix in the command palette is currently a stub handler showing "coming later".

## Summary

**WHAT**: Replace the `#` prefix stub in the command palette with live FlowSpace code search, using two modes: `#` for fast text/regex search (no API calls) and `$` for semantic/conceptual search (uses embedding API). When a user types `# <query>` or `$ <query>` in the explorer bar, the app calls the `fs2` CLI to search the codebase and displays scored results — functions, classes, types, files — with category icons, smart content summaries, file paths, and line numbers. Selecting a result navigates to that file at the specific line.

**WHY**: The file search (`no prefix`) finds files by path. The command palette (`>`) finds commands. The `#` mode fills the missing third pillar: finding code by name. The `$` mode adds a fourth: finding code by concept. This turns the explorer bar into a complete navigation tool — path, command, name, or concept. The split is important because text search is free and instant (~200ms), while semantic search costs API credits and is slower (~500-800ms). Users should choose consciously.

## Goals

- Users can find any function, class, type, or file by name using `# <query>` (text/regex, fast, free)
- Users can find code by concept using `$ <query>` (semantic search, uses embedding API)
- Results show rich context: category icon, name, file path, line range, and AI-generated summary
- FlowSpace availability is detected gracefully — if `fs2` isn't installed or the graph isn't built, the UI explains what's needed with an install/setup link
- Search is fast enough for interactive use (debounced, results appear as user types)
- Selecting a result navigates to the file at the relevant line
- The existing keyboard navigation pattern (ArrowUp/Down, Enter, Escape) works identically to file search and command palette modes

## Non-Goals

- Building or managing the FlowSpace graph from within the app (users run `fs2 scan` separately)
- Real-time graph updates as files change (the graph is a point-in-time snapshot)
- Exposing FlowSpace tree navigation or `get_node` full-source retrieval in this feature (future enhancement)
- Wormhole/LSP bridge integration (requires VS Code running — out of scope)
- Modifying FlowSpace itself — we consume its CLI output as-is
- Sub-prefix modes (#t, #r, #s for text/regex/semantic) — `#` is text/regex, `$` is semantic

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/panel-layout | existing | **modify** | Replace stub handler, enhance CommandPaletteDropdown `symbols` mode rendering, add FlowSpace result types |
| file-browser | existing | **modify** | Wire FlowSpace search hook through browser-client → ExplorerPanel (same pattern as file search) |

No new domains. FlowSpace search is a capability added to the existing panel-layout infrastructure and consumed by the file-browser page, following the exact pattern established by Plan 049 Feature 2 (file search).

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=1
- **Confidence**: 0.85
- **Assumptions**:
  - `fs2` CLI is installed and accessible on the PATH
  - `.fs2/graph.pickle` exists (user has run `fs2 scan`)
  - fs2 CLI JSON output format is stable
  - The existing `symbols` mode and dropdown architecture handles new result type cleanly
- **Dependencies**:
  - `fs2` CLI (external, installed separately)
  - `.fs2/graph.pickle` (built by `fs2 scan`)
- **Risks**:
  - CLI subprocess startup overhead (~150-200ms) may feel sluggish on slow machines
  - Large codebases may return many results — need sensible default limit
  - Graph can go stale if user doesn't re-run `fs2 scan` after code changes
- **Phases**:
  1. Server-side fs2 service + availability detection
  2. Hook + UI rendering in symbols mode
  3. Navigation on select + polish

## Acceptance Criteria

- **AC-01**: Typing `# useFileFilter` in the explorer bar shows FlowSpace text search results within 1 second
- **AC-02**: Each result displays: category icon (ƒ for functions, 📦 for types, 📄 for files), node name, file path (truncated), and line range
- **AC-03**: Results with `smart_content` show a one-line AI-generated summary below the name
- **AC-04**: Results are scored and sorted by relevance (highest score first)
- **AC-05**: Arrow keys navigate results, Enter selects (navigates to file at line), Escape exits
- **AC-06**: Search is debounced (300ms) — results update as the user types after the prefix
- **AC-07**: When `fs2` is not installed (not on PATH), the `#` or `$` mode shows a message: "FlowSpace not installed" with a link to `https://github.com/AI-Substrate/flow_squared`
- **AC-08**: When `fs2` is installed but `.fs2/graph.pickle` doesn't exist, the mode shows: "Run `fs2 scan` to index your codebase"
- **AC-09**: When FlowSpace is available, the Quick Access hints section updates: `#` shows "Code search (FlowSpace)" and `$` shows "Semantic search (FlowSpace)"
- **AC-10**: The `createSymbolSearchStub` handler is removed/replaced — typing `#` no longer shows a toast
- **AC-11**: A loading spinner shows while waiting for fs2 CLI results
- **AC-12**: If the fs2 process errors or times out (>5s), a user-friendly error message is shown in the dropdown
- **AC-13**: `#` prefix uses `fs2 search --mode text` (fast, no API calls). If query contains regex metacharacters (`*?[]^$|+{}()`), automatically upgrades to `--mode regex`.
- **AC-14**: Results are limited to 20 items per search
- **AC-15**: The folder distribution from the search envelope is displayed in the results header (e.g., "apps/: 4 · packages/: 2") — display-only, not clickable
- **AC-17**: The results header shows when the graph was last indexed as relative time (e.g., "indexed 19 mins ago", "indexed 2 hours ago", "indexed 1 day ago") — derived from `.fs2/graph.pickle` mtime, granularity adapts to age
- **AC-16**: Right-click context menu on results provides: Copy Full Path, Copy Relative Path, Copy Content, Download (same as file search)
- **AC-18**: `$` prefix uses `fs2 search --mode semantic` (conceptual search, uses embedding API). If embeddings are not configured, shows "Semantic search requires embeddings — run `fs2 scan --embed`"
- **AC-19**: `$` mode shows a subtle indicator that this search uses the embedding API (e.g., "🧠 semantic" badge in header)
- **AC-20**: When `#` is typed with no query, shows hint: "FlowSpace text search". When `$` is typed with no query, shows hint: "FlowSpace semantic search". When FlowSpace is not installed, both show the install URL (`https://github.com/AI-Substrate/flow_squared`) with a copy button.

## Risks & Assumptions

| Risk | Impact | Mitigation |
|------|--------|------------|
| fs2 CLI not installed on user's machine | Feature degrades gracefully | AC-07: detect and show install link |
| Graph not built | No search results | AC-08: detect and prompt `fs2 scan` |
| CLI startup overhead (~150-200ms per invocation) | Perceived sluggishness | Debounce at 300ms, show spinner, cache availability check |
| Graph staleness | Results don't match current code | Document that users should re-run `fs2 scan`; consider showing "last indexed" timestamp |
| Large result sets | Slow rendering | Limit to 20 results (AC-14), virtual scrolling if needed later |

**Assumptions**:
- The `fs2` CLI binary is at a stable path (discoverable via `which fs2`)
- JSON output format from `fs2 search` is stable across minor versions
- Server-side `execFile` is acceptable for calling CLI tools (same pattern as `git` calls throughout the codebase)

## Open Questions

_All resolved — see Clarifications below._

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| FlowSpace Result UX | CLI Flow | The result row layout (icon + name + path + line + summary) needs visual design thinking — how to show rich data without clutter | How much smart_content to show? Expand on hover? Truncation strategy? |

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: CS-2 feature following established file search pattern. Server-side fs2 service is a thin CLI wrapper; UI is a rendering variant of existing dropdown modes.
- **Focus Areas**: fs2 service JSON parsing, availability detection, hook debounce behavior
- **Mock Usage**: Avoid mocks — use real fs2 CLI output fixtures (captured JSON) for service tests. No vi.fn() per doctrine.
- **Excluded**: Exhaustive UI snapshot tests, E2E browser automation

## Documentation Strategy

- **Location**: None — feature is self-explanatory from the UI
- **Rationale**: The Quick Access hints (AC-09) serve as inline documentation. The `#` prefix pattern matches VS Code convention that developers already know.

## Clarifications

### Session 2026-02-26

| # | Question | Answer |
|---|----------|--------|
| Q1 | Workflow Mode | **Simple** — CS-2 feature, single phase, quick path |
| Q2 | Testing Strategy | **Lightweight** — verify key paths, no TDD ceremony |
| Q3 | Documentation Strategy | **None** — UI is self-explanatory via Quick Access hints |
| Q4 | Domain Review | **Confirmed** — panel-layout + file-browser, no boundary concerns |
| Q5 | Last indexed timestamp? | **Yes** — show relative time (e.g., "19 mins ago", "2 hours ago", "1 day ago") from graph.pickle mtime. Granularity adapts to age. |
| Q6 | Folder distribution clickable? | **Display-only** — informational counts, no interaction |
| Q7 | Context menu on results? | **Same as file search** — Copy Full Path, Copy Relative Path, Copy Content, Download |
