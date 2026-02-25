# Workshop: File Tree Context Menu

**Type**: Integration Pattern
**Plan**: 041-file-browser
**Spec**: [file-browser-spec.md](../file-browser-spec.md)
**Created**: 2026-02-24
**Status**: Draft

**Domain Context**:
- **Primary Domain**: `file-browser` — owns FileTree component
- **Related Domains**: `_platform/notifications` — toast for "Copied!" feedback

---

## Purpose

Design a right-click context menu for the file tree that provides clipboard operations (copy path, copy content, copy tree). This is built on shadcn's ContextMenu (Radix) — a reusable UI primitive that any future component can use for right-click menus.

## Key Questions Addressed

- What menu items appear for files vs folders?
- How do we get file content and tree structure without blocking the UI?
- How does the context menu wrap existing TreeItem buttons without breaking layout?
- How do we make this reusable for other right-click contexts?

---

## Menu Items

### File Menu

| Item | Action | Needs Server? |
|------|--------|---------------|
| Copy Full Path | `navigator.clipboard.writeText(worktreePath + '/' + entry.path)` | No |
| Copy Relative Path | `navigator.clipboard.writeText(entry.path)` | No |
| Copy Content | Fetch file content via `readFile()`, then copy to clipboard | Yes (server action) |

### Folder Menu

| Item | Action | Needs Server? |
|------|--------|---------------|
| Copy Full Path | `navigator.clipboard.writeText(worktreePath + '/' + entry.path)` | No |
| Copy Relative Path | `navigator.clipboard.writeText(entry.path)` | No |
| Copy Tree From Here | Fetch recursive tree via API, format as text, copy | Yes (API call) |

---

## Implementation

### 1. Install shadcn ContextMenu

```bash
npx shadcn@latest add context-menu
```

This adds `apps/web/src/components/ui/context-menu.tsx` — a Radix-based component with keyboard nav, accessibility, and Tailwind styling.

### 2. Wrap TreeItem with ContextMenu

The existing `TreeItem` renders a `<button>` for each file/folder. We wrap it with `<ContextMenu>` + `<ContextMenuTrigger asChild>`:

```tsx
// In TreeItem for files:
<ContextMenu>
  <ContextMenuTrigger asChild>
    <button onClick={() => onSelect(entry.path)} ...>
      <File /> {entry.name}
    </button>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => copyFullPath(entry.path)}>
      Copy Full Path
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => copyRelativePath(entry.path)}>
      Copy Relative Path
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => copyContent(entry.path)}>
      Copy Content
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>

// In TreeItem for directories:
<ContextMenu>
  <ContextMenuTrigger asChild>
    <button onClick={() => onDirClick(entry.path)} ...>
      <Folder /> {entry.name}
    </button>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem onSelect={() => copyFullPath(entry.path)}>
      Copy Full Path
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => copyRelativePath(entry.path)}>
      Copy Relative Path
    </ContextMenuItem>
    <ContextMenuItem onSelect={() => copyTree(entry.path)}>
      Copy Tree From Here
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
```

### 3. Clipboard Helpers

```tsx
// Path operations — pure client, no server call
async function copyFullPath(relativePath: string) {
  await navigator.clipboard.writeText(`${worktreePath}/${relativePath}`);
  toast.success('Full path copied');
}

async function copyRelativePath(relativePath: string) {
  await navigator.clipboard.writeText(relativePath);
  toast.success('Relative path copied');
}

// Content — needs server action
async function copyContent(filePath: string) {
  const result = await readFile(slug, worktreePath, filePath);
  if (result.ok) {
    await navigator.clipboard.writeText(result.content);
    toast.success('Content copied');
  } else {
    toast.error('Could not copy content');
  }
}

// Tree — needs API call for recursive listing
async function copyTree(dirPath: string) {
  const res = await fetch(
    `/api/workspaces/${slug}/files?worktree=${encodeURIComponent(worktreePath)}&dir=${encodeURIComponent(dirPath)}&tree=true`
  );
  if (res.ok) {
    const data = await res.json();
    const treeText = formatTree(data.tree, dirPath);
    await navigator.clipboard.writeText(treeText);
    toast.success('Tree copied');
  } else {
    toast.error('Could not copy tree');
  }
}
```

### 4. Tree Formatting

The "Copy Tree From Here" needs a text representation like `tree` command output:

```
docs/plans/041-file-browser/
├── file-browser-plan.md
├── file-browser-spec.md
├── fixes/
│   ├── FX001-wire-browser-e2e.fltplan.md
│   └── FX001-wire-browser-e2e.md
├── tasks/
│   └── phase-4-file-browser/
│       └── tasks.md
└── workshops/
    ├── file-viewer-integration.md
    └── global-toast-system.md
```

```tsx
function formatTree(entries: TreeEntry[], rootPath: string, prefix = ''): string {
  const lines: string[] = [];
  if (!prefix) lines.push(`${rootPath}/`);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.type === 'directory') {
      lines.push(`${prefix}${connector}${entry.name}/`);
      if (entry.children) {
        lines.push(formatTree(entry.children, '', prefix + childPrefix));
      }
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }
  return lines.join('\n');
}
```

### 5. API: Recursive Tree Endpoint

The existing `/api/workspaces/[slug]/files` returns flat entries for one directory. For "Copy Tree", we need a `?tree=true` param that returns the full recursive structure:

```tsx
// In route.ts — add tree mode
if (searchParams.get('tree') === 'true') {
  const tree = await listDirectoryRecursive({
    worktreePath: worktree,
    dirPath: dir,
    fileSystem,
    maxDepth: 10, // safety limit
  });
  return Response.json({ tree });
}
```

This is a new `listDirectoryRecursive` function in the directory-listing service. It walks the tree using `git ls-files` scoped to the directory, or `readDir` recursively with the same depth limit.

---

## Props Threading

The context menu needs `worktreePath` and `slug` for server calls. These aren't currently in TreeItem props. Two options:

**A) Pass through props** — add `worktreePath` and `slug` to FileTreeProps, thread to TreeItem.

**B) Callback pattern** — add `onCopyPath`, `onCopyContent`, `onCopyTree` callbacks to FileTreeProps, handle in BrowserClient where the data is already available.

**Decision**: **B) Callback pattern**. Keeps TreeItem presentational. BrowserClient already has `slug`, `worktreePath`, and `readFile` access. TreeItem just fires callbacks with the entry path.

```tsx
// FileTreeProps additions:
onCopyFullPath?: (path: string) => void;
onCopyRelativePath?: (path: string) => void;
onCopyContent?: (path: string) => void;
onCopyTree?: (dirPath: string) => void;
```

---

## Decisions

### D1: Use shadcn ContextMenu (Radix) — reusable UI primitive

**Context**: Need right-click menus. Could use a custom implementation or a library.
**Decision**: Install shadcn ContextMenu. It becomes a reusable `components/ui/context-menu.tsx` component that any future feature can use (workgraph nodes, agent list, etc).
**Rationale**: Radix handles keyboard nav, focus management, accessibility, portal rendering. We get it for free via shadcn install.

### D2: Callback pattern, not prop drilling

**Context**: Context menu actions need `worktreePath`, `slug`, and server action access.
**Decision**: FileTree fires callbacks (`onCopyFullPath`, `onCopyContent`, etc). BrowserClient implements them.
**Rationale**: Keeps TreeItem presentational. Same pattern as `onSelect` and `onExpand`.

### D3: Toast feedback on all clipboard operations

**Context**: User right-clicks, selects "Copy Full Path" — how do they know it worked?
**Decision**: Every clipboard operation calls `toast.success('Copied')` on success, `toast.error('Failed')` on failure.
**Rationale**: Clipboard operations are invisible — user needs confirmation. Toast system (Plan 042) already wired.

### D4: Recursive tree API is a new `?tree=true` param, not a separate route

**Context**: Need recursive directory listing for "Copy Tree From Here".
**Decision**: Extend existing `/api/workspaces/[slug]/files` with `?tree=true` param.
**Rationale**: One route, two modes. Keeps routing simple.

---

## Implementation Checklist

1. Install shadcn context-menu (`npx shadcn@latest add context-menu`)
2. Add clipboard callback props to FileTree/TreeItem
3. Wrap TreeItem buttons with ContextMenu + ContextMenuTrigger
4. Implement clipboard handlers in BrowserClient
5. Add `?tree=true` recursive listing to files API route
6. Add `formatTree()` utility for tree text output
7. Toast feedback on all operations
