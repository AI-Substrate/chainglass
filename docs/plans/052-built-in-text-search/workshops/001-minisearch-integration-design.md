# Workshop: MiniSearch Integration Design

**Type**: Integration Pattern
**Plan**: 052-built-in-text-search
**Spec**: [built-in-text-search-spec.md](../built-in-text-search-spec.md)
**Created**: 2026-02-26
**Status**: Approved

**Related Documents**:
- [Research Dossier](../research-dossier.md) — library comparison
- [Workshop Script](../../../scratch/minisearch-workshop.ts) — runnable proof-of-concept

**Domain Context**:
- **Primary Domain**: file-browser (owns the search hook)
- **Related Domains**: _platform/panel-layout (renders results), _platform/events (SSE updates)

---

## Purpose

Define exactly how MiniSearch integrates into the existing architecture: what gets indexed, how the index is built/updated, the tokenization strategy, and the data flow from SSE events through to rendered results. All numbers come from running the actual workshop script against this codebase.

## Key Questions Addressed

- How do we tokenize file paths to support camelCase, snake_case, and kebab-case?
- What is the actual performance on this codebase (not theoretical)?
- How do incremental updates work via SSE?
- What fields are indexed vs stored?

---

## Benchmarks (Real — chainglass-048 monorepo, 2,703 files)

| Operation | Time | Notes |
|-----------|------|-------|
| `git ls-files` | **61ms** | 2,703 files |
| Build documents | **3ms** | Path splitting + token generation |
| Index all documents | **24ms** | MiniSearch.addAll() |
| **Total init** | **~90ms** | One-time on first `#` query |
| Search (typical) | **0.1-0.6ms** | Per query after debounce |
| Search (broad "test") | **1.6ms** | 1,373 results |
| Incremental add | **0.018ms** | Per file |
| Incremental remove | **0.19ms** | Per file |
| Batch add 50 files | **0.32ms** | 0.006ms each |
| Serialized index | **1,328 KB** | JSON.stringify |
| Process heap | **~18MB** | Includes Node.js baseline |

### Search Quality

| Query | Results | Top Hit | Score |
|-------|---------|---------|-------|
| `use-file-filter` | 332 | ✅ `use-file-filter.ts` | 579 |
| `useFilFltr` (fuzzy typo) | 406 | ✅ `use-file-filter.ts` | 197 |
| `ExplorerPanel` (camelCase) | 46 | ✅ `explorer-panel.tsx` | 338 |
| `command palette` | 112 | ✅ `command-palette-dropdown.tsx` | 264 |
| `panel-layout` | 61 | ✅ `panel-layout-plan.md` | 303 |

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│ INIT (first # query, one-time, ~90ms)                        │
│                                                              │
│  git ls-files ──→ FileDoc[] ──→ MiniSearch.addAll()          │
│     61ms            3ms              24ms                    │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ SEARCH (every debounced keystroke, <1ms)                      │
│                                                              │
│  User types "# expl" ──→ 300ms debounce ──→ index.search()  │
│                                                  0.2ms       │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ UPDATE (continuous via SSE, <0.2ms per event)                │
│                                                              │
│  SSE 'add'    ──→ index.add(buildDoc(path))     0.02ms      │
│  SSE 'unlink' ──→ index.remove({ id: path })   0.19ms      │
│  SSE 'change' ──→ no-op (path unchanged)                    │
│  SSE batch>50 ──→ full reindex                  ~90ms       │
└──────────────────────────────────────────────────────────────┘
```

### Document Schema

```typescript
interface FileDoc {
  id: string;        // Full path (unique key)
  path: string;      // Same as id — stored for display
  filename: string;  // "use-file-filter.ts" — boosted 5x
  tokens: string;    // "use file filter" — boosted 3x, camelCase/kebab split
  extension: string; // "ts" — stored, not indexed
  directory: string; // "apps/web/src/hooks" — stored + indexed 1x
}
```

### Index Configuration

```typescript
const index = new MiniSearch<FileDoc>({
  fields: ['filename', 'tokens', 'path', 'directory'],
  storeFields: ['path', 'filename', 'extension', 'directory'],
  searchOptions: {
    boost: { filename: 5, tokens: 3, path: 1 },
    fuzzy: 0.2,
    prefix: true,
  },
  tokenize: (text) => {
    const expanded = text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return expanded.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  },
});
```

### Tokenizer Examples

| Input | Tokens |
|-------|--------|
| `ExplorerPanel` | `explorer`, `panel` |
| `use-file-filter.ts` | `use`, `file`, `filter`, `ts` |
| `my_component` | `my`, `component` |
| `HTMLParser` | `html`, `parser` |
| `apps/web/src/hooks` | `apps`, `web`, `src`, `hooks` |

### Boost Rationale

| Field | Boost | Why |
|-------|-------|-----|
| `filename` | 5x | Users search by name — "Button" should rank `Button.tsx` highest |
| `tokens` | 3x | CamelCase fragments catch "Explorer" matching `ExplorerPanel` |
| `path` | 1x | Fallback — deep path matches are lower relevance |
| `directory` | 1x | "hooks" matches the directory, not boosted over filenames |

---

## Incremental Update Strategy

```typescript
function handleFileChange(change: FileChange) {
  switch (change.eventType) {
    case 'add':
      index.add(buildDoc(change.path));
      break;
    case 'unlink':
      index.remove({ id: change.path } as FileDoc);
      break;
    case 'change':
      // Path unchanged — no index update needed (we only index paths)
      break;
    case 'addDir':
    case 'unlinkDir':
      // Directories aren't indexed
      break;
  }
}

// Same threshold as use-file-filter.ts — branch switch → full reindex
const DELTA_THRESHOLD = 50;
```

**Why no-op on `change`?** We only index file paths. When content changes, the path stays the same.

**Why threshold 50?** Same as file-filter (Plan 049). Large batches are cheaper to reindex fully.

---

## Server-Side Singleton

The index lives as a **module-level singleton** — created once, reused across requests:

```typescript
let searchIndex: MiniSearch<FileDoc> | null = null;

async function ensureIndex(worktreePath: string): Promise<MiniSearch<FileDoc>> {
  if (searchIndex) return searchIndex;
  const { files } = await getFileList(worktreePath, false);
  searchIndex = new MiniSearch({ ...CONFIG });
  searchIndex.addAll(files.map(f => buildDoc(f.path)));
  return searchIndex;
}
```

**Why server-side?** SSE watcher runs server-side, `git ls-files` needs `execFile`, 10ms network overhead is negligible with 300ms debounce.

**Why not persist?** 90ms rebuild is fast enough. 1.3MB serialization isn't worth I/O complexity.

---

## What Changes from Plan 051

| Mode | Plan 051 | Plan 052 |
|------|----------|----------|
| `#` | FlowSpace CLI (`fs2 search --mode text`) | **MiniSearch built-in** |
| `$` | FlowSpace CLI (`fs2 search --mode semantic`) | FlowSpace CLI (unchanged) |

Plan 051's dropdown rendering, keyboard delegation, and prop threading are **reused as-is**. Only the `#` data source changes from FlowSpace CLI to MiniSearch.

---

## Resolved Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Index file content too? | **No** — path-only keeps memory low, init fast, updates trivial |
| Q2 | Persist index to disk? | **No** — 90ms rebuild is fast enough |
| Q3 | Include directory in tokens? | **No** — separate field at 1x, don't pollute 3x token boost |
| Q4 | Client-side or server-side? | **Server-side** — SSE and git are server-side |
