# Research Report: Built-in Text Search (No FlowSpace Dependency)

**Generated**: 2026-02-26T13:10:00Z
**Research Query**: "Fast built-in codebase text search — always available, syncs on changes, no external tools"
**Mode**: Pre-Plan
**Plan**: 051-flowspace-search

## Executive Summary

The `#` prefix should NOT depend on FlowSpace. It should use a built-in, zero-dependency text search that works out of the box on any workspace — no `fs2 scan`, no Python, no graph pickle. FlowSpace (`$` prefix) becomes the premium upgrade with semantic/AI capabilities.

## Library Comparison (Hard Data from GitHub — Feb 2026)

| Library | ⭐ Stars | Last Commit | Language | Bundle Size | Incremental Updates | Fuzzy | TS Native |
|---------|---------|-------------|----------|-------------|--------------------|----|-----------|
| **Fuse.js** | **19,991** | 2025-03-08 | JavaScript | ~25KB | ❌ Re-index | ✅ | ✅ via @types |
| **FlexSearch** | **13,608** | 2025-09-07 | JavaScript | ~20KB | ✅ add/remove | ✅ | ⚠️ Partial |
| **Orama** | **10,176** | 2025-12-19 | **TypeScript** | ~15KB | ✅ insert/remove/update | ✅ | ✅ Native |
| **MiniSearch** | **5,818** | 2025-09-16 | **TypeScript** | ~10KB | ✅ add/remove/replace | ✅ | ✅ Native |
| **fuzzysort** | **4,282** | Recent | JavaScript | ~5KB | ❌ Array input | ✅ Sublime-like | ✅ |

### Recommendations

**🏆 Top Pick: MiniSearch** — Best balance of:
- TypeScript-native (written in TS, not @types bolted on)
- Smallest bundle (10KB)
- Incremental updates (`add`, `remove`, `replace` — no full reindex)
- Fuzzy + prefix + field boosting
- Simple API, well-documented
- Active maintenance (v7.2.0, Sept 2025)
- MIT licensed

**Runner-up: Orama** — More features (vector search, RAG), but:
- Larger ecosystem (cloud service push)
- More complex API
- 10K stars but heavier
- Non-standard license ("Other")

**Why not Fuse.js?** Most stars but: no incremental updates (must re-index on every change), slower on large datasets, not designed for full-text (it's a fuzzy matcher, not an inverted index).

**Why not FlexSearch?** Fast benchmarks but: partial TypeScript support, less active maintenance, API is more complex.

## Architecture: Built-in `#` Search

### Option A: MiniSearch Server-Side Index (Recommended)

```
File System → git ls-files → MiniSearch index (server memory)
                                    ↑ SSE file changes update incrementally
                                    ↓
Browser → # query → Server Action → MiniSearch.search() → results
```

**How it works**:
1. On first `#` query, build MiniSearch index from `git ls-files` (file paths + optionally first N lines of content)
2. SSE file change events (`useFileChanges('*')`) trigger `add`/`remove`/`replace` on the index
3. Search is pure in-memory — no subprocess, no CLI, instant (~1ms for 10K docs)

**Pros**: Zero external dependencies, instant search, always in sync
**Cons**: Memory usage (10K files × ~200 bytes = ~2MB), initial index build (~500ms)

### Option B: MiniSearch Client-Side Index

```
Browser → fetch file list → build MiniSearch in browser → search locally
                  ↑ SSE file changes update incrementally
```

**Pros**: No server round-trip for search, works offline
**Cons**: Initial payload, browser memory, can't read file content (only paths)

### Option C: git grep Subprocess (Simplest)

```
Browser → # query → Server Action → execFile('git', ['grep', ...]) → results
```

**Pros**: Zero libraries, always available, searches file CONTENT not just paths
**Cons**: 50-200ms per query (subprocess overhead), can't do fuzzy matching, harder to debounce

### Recommended: Option A (Server-Side MiniSearch)

| Feature | MiniSearch (Option A) | git grep (Option C) |
|---------|----------------------|---------------------|
| Speed | ~1ms search | ~50-200ms |
| Fuzzy | ✅ Built-in | ❌ Exact only |
| File content search | ✅ If indexed | ✅ Always |
| Incremental updates | ✅ SSE-driven | ✅ Always fresh |
| Memory | ~2MB for 10K files | 0 (stateless) |
| Dependencies | `minisearch` npm | 0 (git) |
| Works without git | ❌ Needs file list | ❌ |

## MiniSearch Integration Design

### What Gets Indexed

```typescript
import MiniSearch from 'minisearch';

const index = new MiniSearch({
  fields: ['path', 'filename', 'extension'],
  storeFields: ['path', 'filename', 'extension', 'directory'],
  searchOptions: {
    fuzzy: 0.2,
    prefix: true,
    boost: { filename: 3, path: 1 },
  },
});

// Index each file from git ls-files
for (const filePath of files) {
  const parts = filePath.split('/');
  index.add({
    id: filePath,
    path: filePath,
    filename: parts[parts.length - 1],
    extension: filePath.split('.').pop() || '',
    directory: parts.slice(0, -1).join('/'),
  });
}
```

### Incremental Updates via SSE

```typescript
// On file change events:
function handleFileChange(change: FileChange) {
  switch (change.eventType) {
    case 'add':
    case 'addDir':
      index.add(fileToDoc(change.path));
      break;
    case 'unlink':
      index.remove({ id: change.path });
      break;
    case 'change':
      // Content change — path stays same, no index update needed for path-only index
      break;
  }
}
```

### Search Result Shape

```typescript
interface BuiltInSearchResult {
  path: string;
  filename: string;
  directory: string;
  score: number;
  // MiniSearch provides these:
  match: Record<string, string[]>;  // which fields matched
  terms: string[];                   // matched terms
}
```

## Existing Infrastructure We Reuse

| Component | What It Provides | How We Use It |
|-----------|-----------------|---------------|
| `file-list.ts` | `git ls-files` → `{path, mtime}[]` | Initial file list to seed index |
| `useFileChanges('*')` | Real-time SSE file events | Incremental index updates |
| `use-file-filter.ts` | Debounce pattern, loading/error state | Follow same hook pattern |
| `command-palette-dropdown.tsx` | `symbols` mode rendering | Render built-in search results |

## Migration Path

| Prefix | Before (Plan 051 current) | After (Built-in) |
|--------|--------------------------|-------------------|
| `#` | FlowSpace text search (requires fs2) | **MiniSearch built-in** (always available) |
| `$` | FlowSpace semantic search (requires fs2) | FlowSpace semantic search (unchanged) |
| `#` + FlowSpace available | — | Could show enhanced results (smart_content) alongside path results |

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Initial index build (10K files) | ~200-500ms | One-time on first `#` query |
| Search (fuzzy, 10K docs) | ~1-5ms | In-memory, no I/O |
| Incremental add/remove | ~0.1ms | Per file change |
| Memory footprint | ~2-5MB | For 10K file path index |

## Next Steps

1. **Install MiniSearch**: `pnpm add minisearch` (in `apps/web`)
2. **Build server-side index service**: Lazy-init on first `#` query, SSE-driven updates
3. **Update `#` mode**: Use built-in search (always available), FlowSpace text search becomes bonus
4. **Keep `$` mode**: FlowSpace semantic search (optional, requires fs2)

---

**Research Complete**: 2026-02-26T13:15:00Z
