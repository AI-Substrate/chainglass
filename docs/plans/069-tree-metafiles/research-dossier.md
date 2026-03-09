# Research Report: Tree View Metafile Detection & Styling

**Generated**: 2026-03-07T05:50:00Z
**Research Query**: "Detect sidecar/metadata files (e.g., `photo.png.summary.md`) in tree view, indent them under parent with arrow indicator"
**Mode**: Pre-Plan
**Location**: `docs/plans/069-tree-metafiles/research-dossier.md`
**FlowSpace**: Available (default + fs2 graphs)
**Findings**: 48 across 8 subagents

## Executive Summary

### What It Does
The file tree currently renders a flat list of `FileEntry { name, type, path }` objects per directory level, with depth-based indentation (16px/level), lazy expansion, and glow/selection/changed styling. There is **no existing concept** of file relationships, sidecar files, or companion grouping.

### Business Purpose
Users create `.md` metadata files alongside source files (e.g., `photo.png.summary.md` alongside `photo.png`). These should be visually subordinate to their parent file — slightly indented with an arrow — so the tree communicates the relationship without hiding or folding them.

### Key Insights
1. **VS Code's `explorer.fileNesting`** is the closest industry pattern: disclosure arrow, indentation, full file behavior preserved
2. **Indentation is trivial** — the tree already uses `depth * 16 + 8 (+14 for files)` inline padding; adding ~12px for metafiles is a one-line formula change
3. **Detection is regex-based** — match `<basename>.<tag>.md` against sibling entries; no filesystem changes needed since data is already in `FileEntry[]`
4. **No data model changes required** — detection can happen at render time by scanning sibling entries

### Quick Stats
- **Components affected**: 1 file (`file-tree.tsx`) + 1 CSS addition + sort logic tweak
- **Dependencies**: None new — pure rendering/styling change
- **Test Coverage**: `file-tree.test.tsx` exists with tree rendering tests
- **Complexity**: Low — styling change with sibling-scan detection logic
- **Prior Learnings**: 12 relevant (see below)
- **Domains**: file-browser (041) owns this entirely

## How It Currently Works

### Tree Entry Rendering

Each file renders as a button with dynamic padding:
```tsx
// file-tree.tsx line 311
style={{ paddingLeft: `${depth * 16 + 8 + 14}px` }}
```

**Directory formula**: `depth * 16 + 8`
**File formula**: `depth * 16 + 8 + 14` (extra 14px aligns past chevron)

### FileEntry Data Model
```typescript
// directory-listing.ts
export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}
```
Minimal — no extension, size, or relationship fields.

### Sorting Order
Directories first, then files, alphabetical case-insensitive:
```typescript
entries.sort((a, b) => {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
});
```

### Visual States
| State | Visual | Class/Style |
|-------|--------|-------------|
| Normal | Muted `File` icon, truncated name | `text-muted-foreground` |
| Selected | Amber ▶ arrow, bold, bg-accent | `bg-accent font-medium` |
| Changed | Amber text | `text-amber-600 dark:text-amber-400` |
| Glowing | 5s green fade | `tree-entry-glow` animation |
| Navigated | 15s green fade | `tree-entry-navigated` animation |

All states stack — a metafile can be selected + changed + glowing simultaneously.

## Industry Research: How Other UIs Handle This

### VS Code `explorer.fileNesting` (Best Reference)
- **Pattern**: `"*.ts": "$(capture).test.ts, $(capture).stories.ts"`
- **Visual**: Disclosure triangle on parent, children indented ~16px beneath
- **Behavior**: Nested files retain full functionality (right-click, drag, rename)
- **Collapse**: Optional — can be always-expanded or user-collapsible
- **Key insight**: Nesting is purely visual, not structural

### JetBrains IDEs
- Group by naming convention in Project view
- Subtle indentation with matching icons
- No explicit arrow — uses proximity and indentation

### Our Approach (Simpler Than VS Code)
- **No folding** — metafiles always visible
- **Small arrow** (↳ or similar) as prefix indicator
- **Extra indentation** (~12px) to visually subordinate
- **Same behavior** as regular files in all other respects

## Metafile Detection Algorithm

### Pattern: `<parentname>.<tag>.md`

Given a file `photo.png`, metafiles would be:
- `photo.png.summary.md` (tag = "summary")
- `photo.png.analysis.md` (tag = "analysis")
- `photo.png.notes.md` (tag = "notes")

### Detection at Render Time

```typescript
// Pseudo-code — scan siblings to detect metafile relationships
function isMetafile(entry: FileEntry, siblings: FileEntry[]): { isMetafile: boolean; parentName?: string; tag?: string } {
  if (!entry.name.endsWith('.md')) return { isMetafile: false };

  // Try to match: <something>.<tag>.md
  // Remove trailing .md, then check if remainder matches a sibling name
  const withoutMd = entry.name.slice(0, -3); // "photo.png.summary"
  const lastDot = withoutMd.lastIndexOf('.');
  if (lastDot <= 0) return { isMetafile: false };

  const candidateParent = withoutMd.slice(0, lastDot); // "photo.png"
  const tag = withoutMd.slice(lastDot + 1); // "summary"

  const parentExists = siblings.some(s => s.name === candidateParent && s !== entry);
  if (parentExists) {
    return { isMetafile: true, parentName: candidateParent, tag };
  }
  return { isMetafile: false };
}
```

### Sorting: Metafiles Immediately After Parent

After standard sort (dirs first, alpha), reorder so metafiles appear directly after their parent:
```
photo.png           ← parent
photo.png.summary.md  ← metafile (indented, arrow)
photo.png.notes.md    ← metafile (indented, arrow)
readme.md           ← normal file
```

## Architecture & Design

### Component Changes

**file-tree.tsx** — The `TreeItem` component needs:
1. **Metafile detection**: Scan siblings to determine if current entry is a metafile
2. **Extra indentation**: Add ~12px padding for metafile entries
3. **Arrow indicator**: Render `↳` or small `CornerDownRight` icon before file icon
4. **Pass siblings**: `TreeItem` needs access to sibling entries (already available in parent's `entries.map()`)

### CSS Changes
**globals.css** — Optional: a subtle opacity or color tint for the arrow indicator

### No Data Model Changes
- `FileEntry` stays unchanged
- Detection is purely render-time based on sibling names
- No API changes, no new hooks, no new services

### Modification Points

| File | Change | Risk |
|------|--------|------|
| `file-tree.tsx` | Add metafile detection + styling in `TreeItem` | Low — isolated render logic |
| `directory-listing.ts` | Adjust sort to place metafiles after parent | Low — pure sort tweak |
| `globals.css` | Optional: metafile arrow color | Trivial |
| `file-tree.test.tsx` | Add test for metafile rendering | Required |

## Domain Context

### Owning Domain: file-browser (041)
- All changes are within `apps/web/src/features/041-file-browser/`
- No cross-domain contracts needed
- No new domain required

### Integration Points
- **SSE events** (045-live-file-events): Metafiles trigger same `add`/`change`/`unlink` events → glow works automatically
- **Context menus**: Metafiles get same right-click options (copy path, download, etc.)
- **File viewer**: Clicking a metafile opens it in the markdown viewer as normal

## Prior Learnings

### PL-03: Lazy Directory Expansion
**Action**: Metafile detection must work with lazy-loaded single-level entries. Since we scan siblings within a single directory level, this works naturally.

### PL-05: Shared Language Detection
**Action**: Metafile `.md` extension will be detected as markdown by existing `detectLanguage()`. No changes needed for viewer.

### PL-11: FileEntry is Single-Level
**Action**: Confirms we can detect metafiles by scanning sibling `FileEntry[]` within one directory — no recursive tree walk needed.

### PL-12: No Existing Companion/Sidecar Concept
**Action**: This is greenfield within the file-browser domain. No existing patterns to conflict with.

## Recommendations

### If Implementing This Feature
1. **Start with detection utility** — pure function `detectMetafile(entry, siblings)` for testability
2. **Modify sort** — place metafiles immediately after their parent in sort order
3. **Add indentation** — ~12px extra padding in file entry formula
4. **Add arrow** — `↳` character or `CornerDownRight` lucide icon (h-3 w-3, muted)
5. **Write tests** — metafile detection + sort order + rendering

### What NOT to Do
- Don't modify `FileEntry` type — detection is render-time
- Don't create a new hook — this is stateless sibling scanning
- Don't fold/collapse — user explicitly wants always-visible
- Don't change API responses — data is already sufficient

## Extension Points
- **Tag display**: Could show the tag (e.g., "summary") as a badge after the filename
- **Custom icons**: Could map tags to specific icons (📝 for summary, 🔍 for analysis)
- **Metafile creation**: Future feature could add "Create Summary" to right-click context menu

---

**Research Complete**: 2026-03-07T05:50:00Z
**Report Location**: `docs/plans/069-tree-metafiles/research-dossier.md`
