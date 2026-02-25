# Workshop: File Path Utility Bar

**Type**: UI Component / Integration Pattern
**Plan**: 041-file-browser
**Spec**: [file-browser-spec.md](../file-browser-spec.md)
**Created**: 2026-02-24
**Status**: Draft

**Related Documents**:
- [deep-linking-system.md](./deep-linking-system.md) — URL state management with nuqs
- [file-tree-context-menu.md](./file-tree-context-menu.md) — Context menu patterns

**Domain Context**:
- **Primary Domain**: file-browser
- **Related Domains**: _platform/workspace-url (deep link params)

---

## Purpose

Design a permanent file path bar at the top of the file browser that serves dual purpose: (1) always-visible display of the currently selected file path with one-click copy, and (2) a paste-to-navigate input that instantly navigates to a pasted path. This replaces the current path display embedded inside FileViewerPanel's toolbar.

## Key Questions Addressed

- Where does the path bar live in the component hierarchy?
- How does paste-to-navigate interact with the existing file tree and deep linking?
- What happens when you paste an invalid path or a path outside the worktree?
- Should the path bar be visible even when no file is selected?

---

## Current State

The file path is currently rendered **inside** `FileViewerPanel` as a secondary row beneath the mode buttons:

```
┌──────────────────────────────────────────────────────────────────┐
│ [Save] [Edit] [Preview] [Diff]                      [Refresh]   │  ← toolbar row
│ [📋]  src/lib/utils.ts                                          │  ← path row (inside panel)
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  (file content area)                                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Problems**:
1. Path disappears when no file is selected ("Select a file to view" placeholder)
2. Path is owned by `FileViewerPanel` — but navigation is a browser-level concern
3. Can't paste a path to navigate — it's just a `<span>`, not an input
4. The path bar visually competes with the mode buttons toolbar

---

## Proposed Design

### Layout

Move the path bar **above** the two-panel split — it becomes a browser-level utility bar owned by `BrowserClient`, always visible:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [📋]  src/lib/utils.ts                                                   │  ← PATH BAR (always visible)
├────────────────────┬─────────────────────────────────────────────────────┤
│  Files  [↻]        │ [Save] [Edit] [Preview] [Diff]          [↗] [↻]   │
│  ▸ src/            │                                                     │
│  ▸ test/           │  (file content)                                     │
│    README.md       │                                                     │
│    package.json    │                                                     │
└────────────────────┴─────────────────────────────────────────────────────┘
```

### Component Hierarchy Change

**Before**:
```
BrowserClient
  ├── FileTree (left panel)
  └── FileViewerPanel (right panel)
       ├── Toolbar (buttons + path row)  ← path lives here
       └── Content area
```

**After**:
```
BrowserClient
  ├── PathBar (full width, top)          ← NEW: path lives here
  ├── FileTree (left panel)
  └── FileViewerPanel (right panel)
       ├── Toolbar (buttons only)        ← path row REMOVED
       └── Content area
```

### PathBar States

```
┌─ No file selected ──────────────────────────────────────────────┐
│ [📋]  Type or paste a file path...               (placeholder)  │
└─────────────────────────────────────────────────────────────────┘

┌─ File selected ─────────────────────────────────────────────────┐
│ [📋]  src/features/041-file-browser/services/attention.ts       │
└─────────────────────────────────────────────────────────────────┘

┌─ User is editing path (focused) ────────────────────────────────┐
│ [📋]  src/lib/new-path.ts|                         (cursor)     │
└─────────────────────────────────────────────────────────────────┘

┌─ Invalid path pasted ───────────────────────────────────────────┐
│ [📋]  does/not/exist.ts                     ⚠ File not found    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Behaviour Specification

### Display Mode (Default)

- Shows relative file path (relative to worktree root)
- Monospace font, `text-sm`, muted foreground
- Copy button on left — copies relative path to clipboard
- Click anywhere on the text → enters **edit mode** (selects all text)
- When no file selected: shows placeholder "Type or paste a file path..."

### Edit Mode (Focused)

Triggered by: clicking the path text, or pressing `/` or `Ctrl+L` when browser is focused (like a browser address bar).

- Input becomes editable `<input>` field
- Text is selected-all on focus (easy to replace)
- **Enter** → navigate to the typed/pasted path
- **Escape** → revert to current file path, exit edit mode
- **Blur** (click away) → revert, exit edit mode
- No debounced search/autocomplete (keep simple for now — just navigate on Enter)

### Navigate Action (Enter)

When the user presses Enter:

1. **Trim** the input value
2. **Normalize** — strip leading `/` or `./` (we work with worktree-relative paths)
3. **Call `handleSelect(normalizedPath)`** — the same function used by file tree clicks
4. This triggers:
   - `setParams({ file: normalizedPath })` (deep link update)
   - `readFile(slug, worktreePath, normalizedPath)` (fetch content)
   - File tree auto-expands parent directories
5. **If file not found** — `readFile` returns `{ ok: false, error: 'not-found' }`:
   - Show brief inline error "File not found" (red text, replaces path for 2s)
   - Revert to previous path
   - Toast: `toast.error('File not found: <path>')`
6. **If file is valid** — update display, exit edit mode

### Paste Behaviour

Pasting is just typing — it fills the input. User presses Enter to navigate. This avoids accidental navigation on paste (you might paste and then edit before hitting Enter).

**Why not navigate-on-paste?** — Sometimes you paste a full absolute path and need to trim it to relative. Or paste a path with trailing whitespace. Requiring Enter gives the user a chance to review.

### Copy Button

- Uses the same `copyToClipboard` helper from BrowserClient (handles non-HTTPS fallback)
- Copies the **current file path** (relative), not the input value during editing
- Shows brief checkmark animation on success

### Keyboard Shortcut

- **`Ctrl+P`** (or `Cmd+P` on Mac) — focus the path bar and select all (mirrors VS Code "Go to File" convention)
- Must call `e.preventDefault()` to suppress browser's print dialog
- Only active when focus is within the browser page (not when CodeMirror has focus in edit mode — CodeMirror captures its own keybindings)

---

## TypeScript Interface

```typescript
interface PathBarProps {
  /** Current file path (relative to worktree), empty string if none */
  filePath: string;
  /** Callback when user navigates to a new path (Enter pressed) */
  onNavigate: (path: string) => void;
  /** Callback to copy current path */
  onCopy: () => void;
  /** Optional placeholder text */
  placeholder?: string;
}
```

### Integration in BrowserClient

```typescript
// In BrowserClient, the PathBar sits above the flex split:
return (
  <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
    {/* Path utility bar — always visible */}
    <PathBar
      filePath={selectedFile ?? ''}
      onNavigate={handlePathNavigate}
      onCopy={() => copyToClipboard(selectedFile ?? '')}
    />

    {/* Two-panel split below */}
    <div className="flex flex-1 overflow-hidden">
      <div className="w-64 shrink-0 border-r overflow-y-auto lg:w-72">
        <FileTree ... />
      </div>
      <div className="flex-1 overflow-hidden">
        <FileViewerPanel ... />  {/* path row removed from here */}
      </div>
    </div>
  </div>
);
```

### handlePathNavigate

```typescript
const handlePathNavigate = useCallback(
  async (rawPath: string) => {
    // Normalize: strip leading ./ or /
    let normalized = rawPath.trim();
    if (normalized.startsWith('./')) normalized = normalized.slice(2);
    if (normalized.startsWith('/')) normalized = normalized.slice(1);
    
    if (!normalized) return;
    
    // Navigate same as file tree click
    await handleSelect(normalized);
    
    // After handleSelect, if fileData shows not-found, toast was already shown
  },
  [handleSelect]
);
```

---

## Edge Cases

### Absolute paths pasted

User pastes `/home/jak/substrate/041-file-browser/apps/web/src/lib/utils.ts`. This won't match because we use worktree-relative paths. Options:

1. **Strip worktree prefix if present** — if the pasted path starts with `worktreePath`, strip it. This is the friendliest option.
2. **Show error** — "Use relative paths only"

**Decision**: Option 1 — strip worktree prefix. Users will copy absolute paths from terminals and expect it to just work.

```typescript
// In handlePathNavigate:
if (normalized.startsWith(worktreePath)) {
  normalized = normalized.slice(worktreePath.length);
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
}
```

### Path with worktree prefix from a DIFFERENT worktree

The path won't exist in the current worktree. The `readFile` call fails with `not-found`. Standard error handling applies — "File not found" toast. This is correct behaviour.

### Empty input + Enter

Do nothing. Guard: `if (!normalized) return`.

### Path to a directory (not a file)

`readFile` will fail (it reads file content). We could alternatively expand that directory in the tree. But keep it simple: show "File not found" for now. Directories are navigated via the tree.

### Path with `..` traversal

The server-side `IPathResolver` rejects these with `PathSecurityError`. The readFile action returns an error, which triggers the not-found toast. Security is handled server-side — the path bar doesn't need its own validation.

---

## Styling

```
┌─────────────────────────────────────────────────────────────────┐
│  PathBar: border-b, bg-muted/30, px-3, py-1.5                  │
│  height: ~32px (compact, utility-bar feel)                      │
│                                                                  │
│  [📋 button]  [input / span — font-mono, text-sm, flex-1]      │
│  shrink-0 (never collapses)                                     │
└─────────────────────────────────────────────────────────────────┘
```

- **Background**: `bg-muted/30` — subtle background matching current path row
- **Font**: `font-mono text-sm` — code-like, matches terminal feel
- **Border**: `border-b` — separates from panels below
- **Height**: compact, single-line, `shrink-0` so it never scrolls
- **Copy button**: `ClipboardCopy` icon, same style as current
- **Input field**: transparent background when editing, no visible border change — just the cursor appearing signals edit mode
- **Error state**: `text-destructive` for brief "File not found" flash

---

## Accessibility

- `<input>` with `aria-label="File path"` and `role="combobox"` (since it navigates)
- Copy button with `aria-label="Copy file path"`
- Error announced via `aria-live="polite"` region
- Keyboard: Tab reaches copy button → input. Enter navigates. Escape cancels.

---

## What Changes in FileViewerPanel

The path row (lines 137-168 in current `file-viewer-panel.tsx`) gets **removed**. The toolbar simplifies to just the mode buttons + refresh:

```
Before:
  ┌──────────────────────────────────────────────────────┐
  │ [Save] [Edit] [Preview] [Diff]           [Refresh]   │
  │ [📋] src/lib/utils.ts                                │
  └──────────────────────────────────────────────────────┘

After:
  ┌──────────────────────────────────────────────────────┐
  │ [Save] [Edit] [Preview] [Diff]           [Refresh]   │
  └──────────────────────────────────────────────────────┘
```

The `filePath` prop stays on FileViewerPanel (needed for diff viewer etc.) but it no longer renders it.

---

## Extensibility: Composed Input Handlers

The path bar will grow into a **command bar** over time (search, go-to-line, commands). The input handler must be composable — a chain of handlers that each get a chance to claim the input.

### Handler Chain Pattern

```typescript
/** A handler that tries to process the input. Returns true if it handled it. */
type BarHandler = (input: string, context: BarContext) => Promise<boolean>;

interface BarContext {
  slug: string;
  worktreePath: string;
  /** Check if a file exists at this relative path (server call) */
  fileExists: (relativePath: string) => Promise<boolean>;
  /** Navigate to a file */
  navigateToFile: (relativePath: string) => void;
  /** Show an error in the bar */
  showError: (message: string) => void;
}
```

### Handler Execution Order

When the user presses Enter, handlers run in sequence. First one to return `true` wins:

```typescript
const handlers: BarHandler[] = [
  handleFilePath,     // Check if input is a real file path → navigate
  // Future:
  // handleSearch,    // If prefixed with `?` or `#` → search files
  // handleGoToLine,  // If `:123` → go to line in current file
  // handleCommand,   // If `>` → command palette
];

async function processInput(input: string, ctx: BarContext): Promise<void> {
  for (const handler of handlers) {
    if (await handler(input, ctx)) return;
  }
  // No handler matched — default: treat as file path attempt
  ctx.showError('Not found');
}
```

### File Path Handler (v1 — this workshop)

```typescript
const handleFilePath: BarHandler = async (input, ctx) => {
  let normalized = input.trim();
  if (!normalized) return false;

  // Strip absolute worktree prefix if present
  if (normalized.startsWith(ctx.worktreePath)) {
    normalized = normalized.slice(ctx.worktreePath.length).replace(/^\//, '');
  }
  // Strip leading ./ or /
  normalized = normalized.replace(/^\.\//, '').replace(/^\//, '');

  if (!normalized) return false;

  // Actually check the file exists before navigating
  const exists = await ctx.fileExists(normalized);
  if (exists) {
    ctx.navigateToFile(normalized);
    return true;
  }

  return false; // Let next handler try
};
```

### Key Design Principle: Verify First

The handler **checks the file exists server-side** before navigating. This avoids loading a broken viewer state with a not-found error. The `fileExists` check is a lightweight HEAD-style call (stat the file, don't read content). This also enables future handlers — if the file doesn't exist, the search handler can try interpreting the input as a search query instead.

### Future Handler Examples (Not Implemented Now)

| Prefix | Handler | Behaviour |
|--------|---------|-----------|
| (none) | `handleFilePath` | Check file exists → navigate |
| `?` or `#` | `handleSearch` | Search file names/content |
| `:N` | `handleGoToLine` | Jump to line N in current file |
| `>` | `handleCommand` | Command palette (VS Code `>` convention) |

---



### Q1: Should we add autocomplete/suggestions from the file tree?

**DEFERRED**: Keep it simple — just type and Enter. Autocomplete is a future enhancement once we see how often the paste-to-navigate is used. The file tree already provides browsing.

### Q2: Should Ctrl+P work globally or only when browser page is focused?

**RESOLVED**: Only when the browser route is active. Register the keyboard shortcut in `BrowserClient` via `useEffect` + `keydown` listener. Check `e.target` is not inside CodeMirror before capturing. Must `preventDefault()` to suppress browser print dialog.

### Q3: Should the copy button copy relative or absolute path?

**RESOLVED**: Copy relative path (matching what's displayed). The context menu already offers both "Copy Full Path" and "Copy Relative Path" for when users need the absolute one.

---

## Implementation Checklist

1. Create `PathBar` component (`features/041-file-browser/components/path-bar.tsx`)
2. Write tests for PathBar (render, edit mode, navigate callback, escape revert, copy)
3. Remove path row from `FileViewerPanel` (lines 137-168)
4. Add `PathBar` to `BrowserClient` layout above the two-panel split
5. Add `handlePathNavigate` with worktree prefix stripping
6. Add `Ctrl+P` / `Cmd+P` keyboard shortcut in BrowserClient
7. Verify deep linking still works (path bar reflects URL state changes)
