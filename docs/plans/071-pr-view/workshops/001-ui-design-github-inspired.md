# Workshop: UI Design — PR View & File Notes (GitHub-Inspired)

**Type**: Integration Pattern
**Plan**: 071-pr-view
**Research Dossier**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-03-08
**Status**: Draft

**Related Documents**:
- GitHub PR "Files Changed" screenshots: `scratch/paste/20260307T235001*.jpg`
- Research dossier: `docs/plans/071-pr-view/research-dossier.md`

**Domain Context**:
- **Primary Domains**: `pr-view` (new business), `file-notes` (new business)
- **Related Domains**: `_platform/viewer` (DiffViewer), `_platform/panel-layout` (overlay anchor, PanelShell), `_platform/events` (file changes SSE), `file-browser` (ChangesView, FileTree), `terminal` (overlay pattern exemplar), `activity-log` (overlay + JSONL exemplar)

---

## Purpose

Define the concrete UI structure, component hierarchy, interaction flows, and visual design for the PR View overlay and File Notes system. This document maps GitHub's PR "Files Changed" interface onto our existing overlay-based architecture so developers can implement without design ambiguity.

## Key Questions Addressed

- How does the PR View overlay lay out its two-panel structure within the existing overlay anchor?
- How do File Notes appear inline in diffs and in the file tree?
- What is the exact component hierarchy and data flow?
- How do the "mark as reviewed" and "note indicator" features work visually?
- How does the Notes overlay differ from the PR View overlay?
- What are the modal/dialog patterns for adding and managing notes?

---

## 1. Layout Overview

### The Overlay System

All overlays share the same viewport anchor (`[data-terminal-overlay-anchor]`) and are mutually exclusive via `overlay:close-all`. PR View and Notes join this group alongside Terminal and Activity Log.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Dashboard Sidebar │ Workspace Content                                │
│                   │                                                  │
│  [Browser]        │  ┌──────────────────────────────────────────┐   │
│  [Agents]         │  │ ExplorerPanel (top bar)           [🔍][▶][📋]│
│  [Work Units]     │  ├────────────┬─────────────────────────────┤   │
│  [Workflows]      │  │ LeftPanel  │ MainPanel                   │   │
│  [Terminal]        │  │            │                             │   │
│  ─────────        │  │ FileTree   │ FileViewerPanel             │   │
│  [🖥 Terminal]    │  │   or       │   or                        │   │
│  [📋 Activity]   │  │ ChangesView│ CodeEditor                  │   │
│  [📝 PR View] ←  │  │            │   or                        │   │
│  [🗒 Notes]   ←  │  │            │ ┌─────────────────────────┐ │   │
│                   │  │            │ │ OVERLAY (z-44)          │ │   │
│                   │  │            │ │ Terminal / Activity Log │ │   │
│                   │  │            │ │ / PR View / Notes       │ │   │
│                   │  │            │ └─────────────────────────┘ │   │
│                   │  └────────────┴─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘

← New sidebar buttons
```

**Key constraint**: The overlay covers the MainPanel area only. It does NOT cover the LeftPanel or ExplorerPanel. This is the existing pattern — terminal and activity log both anchor to the same rect.

### PR View Overlay — Internal Layout

The PR View overlay contains its own two-column layout within the single overlay panel:

```
┌─ PR View Overlay (z-44, anchored to MainPanel) ──────────────────┐
│ ┌─ Header ─────────────────────────────────────────────────────┐ │
│ │ 📝 PR View: feature-branch → main    [Expand All] [×]       │ │
│ │ 7 files changed · +140 -23 · 3 of 7 viewed                  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌─ File List ─┬─ Diff Area ───────────────────────────────────┐ │
│ │ (220px)     │ (flex-1)                                      │ │
│ │             │                                               │ │
│ │ ✓ M file1   │ ┌─ browser-client.tsx ──── +140 -2 ☐ ──────┐ │ │
│ │ ☐ A file2   │ │ @@ -17,6 +17,7 @@                       │ │ │
│ │ ☐ M file3   │ │  17 │ 17 │  import { ... }               │ │ │
│ │ ☐ D file4   │ │     │ 20 │+ import { useMutations }      │ │ │
│ │             │ │  18 │ 21 │  import { useNav }             │ │ │
│ │             │ │ ─── 38 lines hidden ───                   │ │ │
│ │             │ │  45 │ 46 │  import { toast }              │ │ │
│ │             │ │     │ 49 │+ createFile,                   │ │ │
│ │             │ │     │ 50 │+ createFolder,                 │ │ │
│ │             │ └────────────────────────────────────────────┘ │ │
│ │             │                                               │ │
│ │             │ ┌─ delete-dialog.tsx ─────── +90 ☐ ─────────┐ │ │
│ │             │ │ @@ -0,0 +1,90 @@                         │ │ │
│ │             │ │  1 │+ 'use client';                       │ │ │
│ │             │ │  2 │+                                     │ │ │
│ │             │ │  3 │+ import { Button }                   │ │ │
│ │             │ └────────────────────────────────────────────┘ │ │
│ └─────────────┴───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Notes Overlay — Layout

The Notes overlay shows all notes across the worktree in a collated view, grouped by file:

```
┌─ Notes Overlay (z-44, anchored to MainPanel) ────────────────────┐
│ ┌─ Header ─────────────────────────────────────────────────────┐ │
│ │ 🗒 Notes (12 open · 3 complete)     [Filter ▾] [⚠ Clear] [×]│ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌─ Notes List (scrollable) ───────────────────────────────────┐ │
│ │                                                             │ │
│ │ ▼ src/features/041-file-browser/components/file-tree.tsx    │ │
│ │   ┌────────────────────────────────────────────────────┐    │ │
│ │   │ 🧑 Human · Line 45 · 2 min ago         → Agent    │    │ │
│ │   │ Consider extracting this into a shared hook.       │    │ │
│ │   │ The pattern duplicates what we have in...          │    │ │
│ │   │                                          [Go to ↗] │    │ │
│ │   ├────────────────────────────────────────────────────┤    │ │
│ │   │ 🤖 Agent · Reply · 1 min ago                      │    │ │
│ │   │ Agreed. Created `useTreeExpansion` hook in         │    │ │
│ │   │ `hooks/use-tree-expansion.ts` to share this.       │    │ │
│ │   │                                     [✓ Complete]   │    │ │
│ │   └────────────────────────────────────────────────────┘    │ │
│ │                                                             │ │
│ │ ▼ src/components/viewers/diff-viewer.tsx                    │ │
│ │   ┌────────────────────────────────────────────────────┐    │ │
│ │   │ 🧑 Human · File-level · 5 min ago      → Human    │    │ │
│ │   │ Needs split/unified toggle persistence.            │    │ │
│ │   │                                          [Go to ↗] │    │ │
│ │   └────────────────────────────────────────────────────┘    │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Hierarchy

### PR View Component Tree

```
PRViewOverlayProvider                          // Context + event listeners
├── PRViewOverlayPanel                         // Fixed overlay (z-44, anchor-positioned)
│   ├── PRViewHeader                           // Branch info, stats, progress, close button
│   ├── div.flex.flex-1.overflow-hidden.min-h-0
│   │   ├── PRViewFileList                     // Left column (220px, border-r, overflow-y-auto)
│   │   │   ├── PRViewFileItem[]               // One per changed file
│   │   │   │   ├── StatusBadge               // M/A/D/R with color
│   │   │   │   ├── FilePath                  // Truncated, click to scroll
│   │   │   │   └── ViewedCheckbox            // ☐/✓ toggle
│   │   │   └── PRViewFileListEmpty            // "No changes" state
│   │   └── PRViewDiffArea                     // Right column (flex-1, overflow-y-auto)
│   │       └── PRViewDiffSection[]            // One per changed file
│   │           ├── PRViewDiffHeader           // File path, stats, viewed toggle, collapse
│   │           ├── DiffViewer                 // Re-used from _platform/viewer
│   │           └── PRViewCollapsedIndicator   // "Previously viewed" or collapsed state
│   └── PRViewFooter                           // Optional: keyboard shortcut hints
└── PRViewSidebarButton                        // In dashboard-sidebar, dispatches event
```

### File Notes Component Tree

```
FileNotesProvider                              // Context for note state + API
├── NoteModal                                  // Add/edit note (Dialog)
│   ├── NoteTargetHeader                       // "Note on file-tree.tsx:45"
│   ├── NoteEditor                             // Markdown textarea
│   │   ├── NoteEditorToolbar                  // B I code link (minimal)
│   │   └── textarea                           // Content input
│   ├── NoteToSelector                         // "To: Human / Agent" toggle
│   └── NoteModalFooter                        // Cancel / Save
│
├── NotesOverlayPanel                          // All-notes view (z-44, anchor-positioned)
│   ├── NotesOverlayHeader                     // Title, stats, filter, clear-all, close
│   ├── NotesGroupedList                       // Scrollable, grouped by file
│   │   └── NoteFileGroup[]                    // Collapsible per-file section
│   │       ├── NoteFileGroupHeader            // File path + note count + collapse toggle
│   │       └── NoteCard[]                     // Individual note
│   │           ├── NoteCardHeader             // Author, line, time, addressee
│   │           ├── NoteCardContent            // Rendered markdown
│   │           ├── NoteCardActions            // Go to, Complete, Reply
│   │           └── NoteReply[]                // Thread replies (same NoteCard shape)
│   └── NotesEmptyState                        // "No notes in this worktree"
│
├── NoteIndicatorDot                           // Consumed by FileTree + ChangesView
│
├── BulkDeleteDialog                           // "Type YEES to confirm" dialog
│   ├── DialogHeader                           // Warning title
│   ├── input[type=text]                       // Confirmation input
│   └── DialogFooter                           // Cancel / Delete (disabled until match)
│
└── NotesSidebarButton                         // In dashboard-sidebar, dispatches event
```

### Integration Points (Where Notes Touch Other Domains)

```
file-browser/FileTree
├── TreeItem
│   ├── [existing content]
│   └── NoteIndicatorDot ← from file-notes     // Small dot if file has notes

file-browser/ChangesView
├── ChangeFileItem
│   ├── [existing content]
│   └── NoteIndicatorDot ← from file-notes     // Same indicator

_platform/viewer/FileViewer (future)
├── LineNumberGutter
│   └── NoteLineIcon ← from file-notes         // Click to add note on line

_platform/panel-layout/ExplorerPanel
├── [existing buttons]
├── PRViewToggleButton                          // New: PR View toggle
└── NotesToggleButton                           // New: Notes toggle
```

---

## 3. PR View — Detailed Component Specs

### 3.1 PRViewOverlayPanel

Follows the exact same anchor-positioning pattern as Terminal and Activity Log overlays.

```tsx
// Positioning — identical to terminal-overlay-panel.tsx
<div
  ref={panelRef}
  className="fixed flex flex-col border-l bg-background shadow-2xl"
  style={{
    zIndex: 44,
    top: `${anchorRect.top}px`,
    left: `${anchorRect.left}px`,
    width: `${anchorRect.width}px`,
    height: `${anchorRect.height}px`,
    display: isOpen ? 'flex' : 'none',
  }}
  data-testid="pr-view-overlay-panel"
>
```

### 3.2 PRViewHeader

```
┌─────────────────────────────────────────────────────────────────┐
│ 📝  PR View: feature/071-pr-view              [↕ All] [↕ None] [×] │
│ 7 files changed · +140 -23 · ■■■■■□□ 3 of 7 viewed            │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
<div className="flex flex-col border-b shrink-0">
  {/* Top row: title + actions */}
  <div className="flex items-center justify-between px-3 py-2">
    <div className="flex items-center gap-2">
      <GitPullRequest className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium truncate">
        PR View: {branchName}
      </span>
    </div>
    <div className="flex items-center gap-1">
      <button
        onClick={expandAll}
        className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
        title="Expand all files"
      >
        <ChevronsDownUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={collapseAll}
        className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
        title="Collapse all files"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={closePRView}
        className="rounded-sm p-1 hover:bg-accent"
        aria-label="Close PR view"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>
  {/* Bottom row: stats */}
  <div className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
    <span>{fileCount} files changed</span>
    <span>·</span>
    {insertions > 0 && <span className="text-green-500">+{insertions}</span>}
    {deletions > 0 && <span className="text-red-500">−{deletions}</span>}
    <span>·</span>
    <span>{viewedCount} of {fileCount} viewed</span>
    {/* Mini progress blocks */}
    <div className="flex gap-px">
      {files.map((f) => (
        <div
          key={f.path}
          className={`w-2 h-2 rounded-sm ${
            f.reviewed ? 'bg-green-500' : 'bg-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  </div>
</div>
```

### 3.3 PRViewFileList (Left Column)

Reuses the visual pattern from ChangesView but adapted for PR review context. Per the user's direction: "exists already, but is not tree form — that is fine for now, just use what we have already."

```tsx
<div className="w-[220px] shrink-0 border-r flex flex-col overflow-y-auto">
  {files.map((file) => (
    <button
      key={file.path}
      type="button"
      onClick={() => scrollToFile(file.path)}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 text-left text-sm hover:bg-accent/50',
        activeFile === file.path && 'bg-accent font-medium',
        file.reviewed && 'opacity-50',
      )}
    >
      {/* Status badge */}
      <span className={cn(
        'shrink-0 w-4 text-center font-mono text-xs font-bold',
        STATUS_COLORS[file.status],
      )}>
        {STATUS_LETTERS[file.status]}
      </span>

      {/* File path (just filename, dir in muted) */}
      <span className="truncate flex-1">
        <span className="text-muted-foreground">{file.dir}/</span>
        <span>{file.name}</span>
      </span>

      {/* Note indicator (from file-notes domain) */}
      {file.hasNotes && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
      )}

      {/* Viewed checkbox */}
      <input
        type="checkbox"
        checked={file.reviewed}
        onChange={(e) => {
          e.stopPropagation();
          toggleReviewed(file.path);
        }}
        className="shrink-0 h-3.5 w-3.5 rounded border-muted-foreground/50"
        title="Mark as viewed"
      />
    </button>
  ))}
</div>
```

**Status colors** (matching existing ChangesView):
```tsx
const STATUS_COLORS = {
  modified: 'text-amber-500',
  added:    'text-green-500',
  deleted:  'text-red-500',
  renamed:  'text-blue-500',
  untracked:'text-muted-foreground',
} as const;

const STATUS_LETTERS = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: '?',
} as const;
```

### 3.4 PRViewDiffSection (One Per File)

Each changed file renders as a collapsible section in the right diff area.

```
┌─ File Header ──────────────────────────────────────────────────┐
│ ▼ apps/web/src/features/.../browser-client.tsx  +140 -2 ☐ [···]│
├────────────────────────────────────────────────────────────────┤
│ @@ -17,6 +17,7 @@ import {                                     │
│  17 │ 17 │  } from '.../file-viewer-panel';                    │
│  18 │ 18 │  import { useClipboard } ...                        │
│     │ 20 │+ import { useFileMutations } ...          ← green   │
│  20 │ 21 │  import { useFileNavigation } ...                   │
├─── ↕ 24 lines hidden ─────────────────────────────────────────┤
│  45 │ 46 │  import { toast } from 'sonner';                    │
│  46 │ 47 │  import { z } from 'zod';                           │
│     │ 49 │+ createFile,                              ← green   │
│     │ 50 │+ createFolder,                            ← green   │
│     │ 51 │+ deleteItem,                              ← green   │
│  48 │ 52 │  fetchChangedFiles,                                 │
└────────────────────────────────────────────────────────────────┘
```

```tsx
<div
  ref={sectionRef}
  data-file-path={file.path}
  className="border-b"
>
  {/* File header — always visible, clickable to collapse */}
  <button
    type="button"
    onClick={() => toggleCollapsed(file.path)}
    className="flex items-center w-full gap-2 px-3 py-1.5 text-sm
               hover:bg-accent/30 sticky top-0 bg-background z-10 border-b"
  >
    {/* Collapse toggle */}
    {collapsed ? (
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    )}

    {/* File path */}
    <span className="truncate flex-1 text-left font-mono text-xs">
      {file.path}
    </span>

    {/* Change stats */}
    <span className="shrink-0 flex items-center gap-1 text-xs">
      {file.insertions > 0 && (
        <span className="text-green-500">+{file.insertions}</span>
      )}
      {file.deletions > 0 && (
        <span className="text-red-500">−{file.deletions}</span>
      )}
      {/* Colored blocks (GitHub style) */}
      <span className="flex gap-px ml-1">
        {Array.from({ length: Math.min(file.insertions, 5) }).map((_, i) => (
          <span key={`ins-${i}`} className="w-1.5 h-1.5 bg-green-500 rounded-sm" />
        ))}
        {Array.from({ length: Math.min(file.deletions, 5) }).map((_, i) => (
          <span key={`del-${i}`} className="w-1.5 h-1.5 bg-red-500 rounded-sm" />
        ))}
      </span>
    </span>

    {/* Viewed checkbox */}
    <input
      type="checkbox"
      checked={file.reviewed}
      onChange={(e) => {
        e.stopPropagation();
        toggleReviewed(file.path);
      }}
      className="shrink-0 h-3.5 w-3.5 rounded border-muted-foreground/50"
      onClick={(e) => e.stopPropagation()}
    />
  </button>

  {/* "Previously viewed" indicator */}
  {file.previouslyReviewed && !file.reviewed && (
    <div className="px-3 py-1 text-xs text-amber-500 bg-amber-500/5 border-b">
      Previously viewed — file has changed since last review
    </div>
  )}

  {/* Diff content — collapsed when reviewed or manually collapsed */}
  {!collapsed && (
    <div className="overflow-hidden">
      <DiffViewer
        file={{ path: file.path, filename: file.name, content: '' }}
        diffData={file.diffData}
        error={file.diffError}
        isLoading={file.isLoading}
      />
    </div>
  )}

  {/* Collapsed indicator */}
  {collapsed && (
    <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
      File collapsed — click header to expand
    </div>
  )}
</div>
```

### 3.5 PRViewDiffArea (Scrollable Right Column)

```tsx
<div
  ref={diffAreaRef}
  className="flex-1 overflow-y-auto"
  onScroll={handleScroll}  // Sync active file in file list
>
  {files.map((file) => (
    <PRViewDiffSection
      key={file.path}
      file={file}
      collapsed={collapsedFiles.has(file.path)}
      toggleCollapsed={toggleCollapsed}
      toggleReviewed={toggleReviewed}
    />
  ))}
</div>
```

**Scroll sync**: As user scrolls the diff area, the active file in the file list highlights. Uses `IntersectionObserver` on each `PRViewDiffSection` to determine which file is currently visible.

---

## 4. File Notes — Detailed Component Specs

### 4.1 NoteModal (Add/Edit Note)

A simple Dialog for creating or editing a note. Triggered from:
- File tree context menu → "Add Note"
- PR View diff line click (future)
- Existing note "Edit" action

```
┌─ Add Note ─────────────────────────────────────────────────┐
│                                                            │
│  📄 src/features/041-file-browser/components/file-tree.tsx │
│  Line 45 (optional — blank for file-level note)            │
│                                                            │
│  ┌─ Content ─────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │ Consider extracting this into a shared hook.          │ │
│  │ The pattern duplicates what we have in panel-layout.  │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│  To: [○ Anyone] [○ Human] [○ Agent]                        │
│                                                            │
│                              [Cancel]  [Save Note]         │
└────────────────────────────────────────────────────────────┘
```

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>{isEditing ? 'Edit Note' : 'Add Note'}</DialogTitle>
      <DialogDescription>
        <span className="font-mono text-xs">{targetPath}</span>
        {line && <span className="text-muted-foreground"> · Line {line}</span>}
      </DialogDescription>
    </DialogHeader>

    {/* Content editor */}
    <div className="space-y-3">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Leave a note... (markdown supported)"
        className="w-full min-h-[120px] rounded-md border bg-transparent px-3 py-2
                   text-sm placeholder:text-muted-foreground resize-y
                   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        autoFocus
      />

      {/* "To" selector */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">To:</span>
        <div className="flex gap-1">
          {(['anyone', 'human', 'agent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTo(option === 'anyone' ? undefined : option)}
              className={cn(
                'px-2 py-0.5 rounded-full text-xs border',
                to === (option === 'anyone' ? undefined : option)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground border-muted hover:border-foreground/30',
              )}
            >
              {option === 'anyone' ? 'Anyone' : option === 'human' ? '🧑 Human' : '🤖 Agent'}
            </button>
          ))}
        </div>
      </div>
    </div>

    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline">Cancel</Button>
      </DialogClose>
      <Button onClick={handleSave} disabled={!content.trim()}>
        {isEditing ? 'Update' : 'Save Note'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 4.2 NoteIndicatorDot (Tree Decoration)

A tiny dot that appears next to files in both the regular FileTree and the PR View file list when a file has notes.

```tsx
/**
 * Consumed by file-browser FileTree and PR View file list.
 * Positioned to the left of the file name, before the status badge.
 */
export function NoteIndicatorDot({ hasNotes }: { hasNotes: boolean }) {
  if (!hasNotes) return null;
  return (
    <span
      className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500"
      title="Has notes"
      aria-label="File has notes"
    />
  );
}
```

**Integration in FileTree** (minimal change):

```tsx
// In file-tree.tsx TreeItem, after the file name span:
<span className="truncate flex-1">{entry.name}</span>

{/* Note indicator — from file-notes domain */}
{noteFiles?.has(entry.path) && (
  <NoteIndicatorDot hasNotes />
)}

{/* Existing status badge */}
{isChanged && (
  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700">
    {statusLetter}
  </span>
)}
```

### 4.3 NotesOverlayPanel

Follows overlay pattern (Terminal/Activity Log). Shows all notes grouped by file.

```tsx
<div
  ref={panelRef}
  className="fixed flex flex-col border-l bg-background shadow-2xl"
  style={{
    zIndex: 44,
    top: `${anchorRect.top}px`,
    left: `${anchorRect.left}px`,
    width: `${anchorRect.width}px`,
    height: `${anchorRect.height}px`,
    display: isOpen ? 'flex' : 'none',
  }}
  data-testid="notes-overlay-panel"
>
  {/* Header */}
  <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
    <div className="flex items-center gap-2">
      <StickyNote className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">Notes</span>
      <span className="text-xs text-muted-foreground">
        {openCount} open · {completeCount} complete
      </span>
    </div>
    <div className="flex items-center gap-1">
      {/* Filter dropdown */}
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="text-xs bg-transparent border rounded px-1.5 py-0.5"
      >
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="complete">Complete</option>
        <option value="to-human">To Human</option>
        <option value="to-agent">To Agent</option>
      </select>
      {/* Clear all button */}
      <button
        onClick={() => setShowBulkDelete(true)}
        className="rounded-sm p-1 text-muted-foreground hover:text-red-500 hover:bg-accent"
        title="Clear all notes..."
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={closeNotes}
        className="rounded-sm p-1 hover:bg-accent"
        aria-label="Close notes"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </div>

  {/* Notes content — grouped by file */}
  <div className="flex-1 overflow-y-auto min-h-0">
    {/* ... NoteFileGroup components ... */}
  </div>
</div>
```

### 4.4 NoteCard

Individual note rendering within a file group:

```tsx
<div className={cn(
  'border rounded-md mx-3 mb-2',
  note.status === 'complete' && 'opacity-50',
)}>
  {/* Card header */}
  <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b bg-muted/30">
    <span>{note.author === 'human' ? '🧑' : '🤖'}</span>
    <span className="font-medium">
      {note.author === 'human' ? 'Human' : 'Agent'}
    </span>
    {note.targetMeta?.line && (
      <>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Line {note.targetMeta.line}</span>
      </>
    )}
    <span className="text-muted-foreground">·</span>
    <span className="text-muted-foreground">{relativeTime(note.createdAt)}</span>

    {/* Addressee tag */}
    {note.to && (
      <span className={cn(
        'ml-auto px-1.5 py-0.5 rounded-full text-[10px] border',
        note.to === 'human'
          ? 'border-blue-300 text-blue-600 dark:text-blue-400'
          : 'border-purple-300 text-purple-600 dark:text-purple-400',
      )}>
        → {note.to === 'human' ? 'Human' : 'Agent'}
      </span>
    )}
  </div>

  {/* Card content — rendered markdown */}
  <div className="px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none">
    {renderMarkdown(note.content)}
  </div>

  {/* Card actions */}
  <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-t">
    <button
      onClick={() => navigateToFile(note.target, note.targetMeta?.line)}
      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
    >
      Go to <ExternalLink className="h-3 w-3" />
    </button>
    {note.status === 'open' ? (
      <button
        onClick={() => completeNote(note.id)}
        className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
      >
        <Check className="h-3 w-3" /> Complete
      </button>
    ) : (
      <span className="text-xs text-green-600 flex items-center gap-1">
        <Check className="h-3 w-3" /> {note.completedBy === 'agent' ? 'Agent' : 'Human'}
      </span>
    )}
  </div>

  {/* Thread replies */}
  {note.replies?.map((reply) => (
    <div key={reply.id} className="border-t">
      {/* Same card header/content/actions pattern, slightly indented */}
      <div className="ml-4 border-l-2 border-muted">
        {/* ... reply content ... */}
      </div>
    </div>
  ))}
</div>
```

### 4.5 BulkDeleteDialog (Type-to-Confirm)

For "Delete all notes for file" and "Delete all notes" — requires typing YEES to confirm.

```
┌─ Delete All Notes ─────────────────────────────────────────┐
│                                                            │
│  ⚠️  This will permanently delete all 12 notes in this     │
│  worktree. This action cannot be undone.                   │
│                                                            │
│  Type YEES to confirm:                                     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ YEE                                                   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                            │
│                        [Cancel]  [Delete All] (disabled)   │
└────────────────────────────────────────────────────────────┘
```

```tsx
export function BulkDeleteDialog({
  open,
  onOpenChange,
  scope,          // 'file' | 'all'
  fileName,       // Only when scope === 'file'
  noteCount,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const CONFIRMATION_WORD = 'YEES';
  const isConfirmed = confirmation === CONFIRMATION_WORD;

  return (
    <Dialog open={open} onOpenChange={(v) => { setConfirmation(''); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {scope === 'all' ? 'All Notes' : `Notes for ${fileName}`}
          </DialogTitle>
          <DialogDescription>
            This will permanently delete {noteCount} note{noteCount !== 1 ? 's' : ''}
            {scope === 'file' ? ` for ${fileName}` : ' in this worktree'}.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Type <code className="px-1 py-0.5 rounded bg-muted font-mono">
            {CONFIRMATION_WORD}</code> to confirm:
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION_WORD}
            className="w-full rounded-md border px-3 py-2 text-sm
                       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            autoFocus
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!isConfirmed}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            Delete {scope === 'all' ? 'All' : 'File'} Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. Sidebar & ExplorerPanel Buttons

### Sidebar Additions

Two new buttons in the dashboard sidebar footer, following the Terminal/Activity Log pattern:

```tsx
// In dashboard-sidebar.tsx footer section:

{/* PR View toggle (only when in worktree with git) */}
{currentWorktree && isGit && (
  <SidebarMenuItem>
    <SidebarMenuButton
      onClick={() => window.dispatchEvent(new CustomEvent('pr-view:toggle'))}
      tooltip="Toggle PR View"
    >
      <GitPullRequest className="h-5 w-5" />
      {!isCollapsed && <span>PR View</span>}
    </SidebarMenuButton>
  </SidebarMenuItem>
)}

{/* Notes toggle (always when in worktree) */}
{currentWorktree && (
  <SidebarMenuItem>
    <SidebarMenuButton
      onClick={() => window.dispatchEvent(new CustomEvent('notes:toggle'))}
      tooltip="Toggle Notes"
    >
      <StickyNote className="h-5 w-5" />
      {!isCollapsed && <span>Notes</span>}
    </SidebarMenuButton>
  </SidebarMenuItem>
)}
```

### ExplorerPanel Additions

Two new buttons at the right end of the explorer bar:

```tsx
// In explorer-panel.tsx, alongside existing terminal/activity-log buttons:

<button
  type="button"
  onClick={() => window.dispatchEvent(new CustomEvent('pr-view:toggle'))}
  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
  title="Toggle PR View"
>
  <GitPullRequest className="h-4 w-4" />
</button>

<button
  type="button"
  onClick={() => window.dispatchEvent(new CustomEvent('notes:toggle'))}
  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
  title="Toggle Notes"
>
  <StickyNote className="h-4 w-4" />
</button>
```

---

## 6. Interaction Flows

### Flow 1: Open PR View and Review Files

```
User clicks [📝 PR View] sidebar button
  → window.dispatchEvent('pr-view:toggle')
  → PRViewOverlayProvider receives event
  → Dispatches overlay:close-all (closes terminal/activity-log/notes)
  → Sets isOpen = true
  → PRViewOverlayPanel renders
  → Fetches changed files (git status --porcelain + git diff per file)
  → Renders file list (left) + diff sections (right)

User clicks file in file list
  → diffAreaRef.querySelector('[data-file-path="..."]').scrollIntoView()
  → Active file highlights in file list

User checks "Viewed" on a file
  → File collapses in diff area
  → File dims in file list
  → Progress counter updates
  → State saved to .chainglass/data/pr-view-state.jsonl
  → Content hash stored for change detection

File changes on disk (SSE via useFileChanges)
  → Compare new content hash with stored reviewedContentHash
  → If different: uncheck reviewed, show "Previously viewed" banner
  → User sees file re-expanded with changes highlighted
```

### Flow 2: Add a Note to a File

```
User right-clicks file in FileTree → "Add Note"
  OR
User clicks [+] icon on line number in FileViewer (future)
  OR
User uses Ctrl+Shift+N keyboard shortcut

  → NoteModal opens
  → User types markdown content
  → User optionally selects "To: Human" or "To: Agent"
  → User clicks "Save Note"

  → Server action: addNote(worktreePath, { linkType: 'file', target, line?, content, to? })
  → Appends to .chainglass/data/notes.jsonl
  → SSE notifies UI of data change
  → NoteIndicatorDot appears in FileTree next to file
  → Toast: "Note added to file-tree.tsx"
```

### Flow 3: Review Notes from Overlay

```
User clicks [🗒 Notes] sidebar button
  → NotesOverlayPanel opens (mutual exclusion with others)
  → Fetches GET /api/file-notes?worktree=...
  → Renders grouped-by-file list

User clicks "Go to" on a note
  → Closes notes overlay
  → Navigates to file in browser: ?file=path&mode=edit
  → If line specified: scrolls to line offset (existing URL param support)

User clicks "Complete" on a note
  → Server action: completeNote(worktreePath, noteId, completedBy: 'human')
  → Note card shows ✓ Complete indicator
  → Open count decrements in header
```

### Flow 4: Bulk Delete Notes

```
User clicks trash icon in Notes overlay header
  → BulkDeleteDialog opens
  → Shows warning: "Delete all 12 notes in this worktree"
  → User must type "YEES" in input
  → Delete button enables when input matches

User types "YEES" and clicks "Delete All Notes"
  → Server action: deleteAllNotes(worktreePath)
  → JSONL file cleared
  → All NoteIndicatorDots disappear from tree
  → Notes overlay shows empty state
  → Toast: "12 notes deleted"
```

### Flow 5: CLI Note Interactions

```bash
# List all notes in worktree
$ cg notes list
┌────────────────────────────────────────────────────────────┐
│  src/features/041-file-browser/components/file-tree.tsx    │
│    Line 45 · 🧑 Human → Agent · open                      │
│    "Consider extracting this into a shared hook."          │
│                                                            │
│  src/components/viewers/diff-viewer.tsx                     │
│    File-level · 🧑 Human · open                            │
│    "Needs split/unified toggle persistence."               │
└────────────────────────────────────────────────────────────┘
2 notes (2 open, 0 complete)

# List notes for a specific file
$ cg notes list --file src/features/041-file-browser/components/file-tree.tsx
1 note (1 open)

# List files that have notes
$ cg notes files
src/features/041-file-browser/components/file-tree.tsx  (1 note)
src/components/viewers/diff-viewer.tsx                   (1 note)

# Add a note
$ cg notes add src/features/file-tree.tsx --line 45 --to agent \
    --content "Consider extracting this into a shared hook."
✓ Note added to file-tree.tsx:45

# Complete a note
$ cg notes complete <note-id>
✓ Note marked complete (by agent)

# JSON output for agent consumption
$ cg notes list --json
[
  {
    "id": "abc-123",
    "linkType": "file",
    "target": "src/features/.../file-tree.tsx",
    "targetMeta": { "line": 45 },
    "content": "Consider extracting...",
    "to": "agent",
    "status": "open",
    "author": "human",
    "createdAt": "2026-03-08T00:05:00Z"
  }
]
```

---

## 7. State Management

### PR View State

```typescript
// In-memory UI state (React context)
interface PRViewUIState {
  isOpen: boolean;
  files: PRViewFile[];           // Changed files with diff data
  collapsedFiles: Set<string>;   // Manually collapsed file paths
  activeFile: string | null;     // Currently visible file (scroll sync)
  loading: boolean;
}

// Persisted state (JSONL in .chainglass/data/pr-view-state.jsonl)
interface PRViewFileState {
  filePath: string;
  reviewed: boolean;
  reviewedAt: string;            // ISO-8601
  reviewedContentHash: string;   // git blob hash for change detection
}
```

**Change detection**: When a file change is detected via SSE/useFileChanges:
1. Compute new content hash (use `git hash-object <file>` or similar)
2. Compare with `reviewedContentHash` from persisted state
3. If different: set `reviewed = false`, add `previouslyReviewed = true` flag

### File Notes State

```typescript
// In-memory UI state (React context)
interface FileNotesUIState {
  isOverlayOpen: boolean;
  isModalOpen: boolean;
  modalTarget: NoteTarget | null;   // What we're adding a note to
  notes: Note[];                    // All notes for current worktree
  filter: NoteFilter;
  loading: boolean;
}

// Persisted state (JSONL in .chainglass/data/notes.jsonl)
// Each line is a Note object (see data model in research dossier)
```

### Note Indicator State

For tree decoration, the FileNotesProvider exposes a `Set<string>` of file paths that have notes. This is consumed by FileTree and ChangesView without them needing to know about the notes domain internals.

```typescript
// From FileNotesProvider context:
const { noteFilePaths } = useFileNotes();
// noteFilePaths: Set<string> — e.g., Set { "src/file-tree.tsx", "src/diff-viewer.tsx" }

// Consumed in FileTree:
{noteFilePaths.has(entry.path) && <NoteIndicatorDot hasNotes />}
```

---

## 8. Visual Design Tokens

### Colors (Consistent with Existing Codebase)

| Element | Light | Dark | Tailwind Class |
|---------|-------|------|----------------|
| Added line bg | #dcfce7 | #052e16/30 | `bg-green-100 dark:bg-green-950/30` |
| Deleted line bg | #fee2e2 | #450a0a/30 | `bg-red-100 dark:bg-red-950/30` |
| Modified badge | amber | amber | `text-amber-500` |
| Added badge | green | green | `text-green-500` |
| Deleted badge | red | red | `text-red-500` |
| Renamed badge | blue | blue | `text-blue-500` |
| Note indicator | blue dot | blue dot | `bg-blue-500` |
| Note to human | blue | blue | `border-blue-300 text-blue-600` |
| Note to agent | purple | purple | `border-purple-300 text-purple-600` |
| Viewed file | dimmed | dimmed | `opacity-50` |
| Previously viewed | amber | amber | `text-amber-500 bg-amber-500/5` |
| Overlay border | left only | left only | `border-l` |
| Overlay shadow | 2xl | 2xl | `shadow-2xl` |
| Overlay z-index | 44 | 44 | `z-[44]` (inline style) |

### Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Overlay title | text-sm | font-medium | sans |
| File path (diff header) | text-xs | font-mono | mono |
| File path (file list) | text-sm | normal | sans |
| Status badge | text-xs | font-bold font-mono | mono |
| Line numbers | text-xs | normal font-mono | mono |
| Diff content | (set by @git-diff-view) | mono | mono |
| Note content | text-sm prose | normal | sans |
| Note metadata | text-xs | normal | sans |
| Stats | text-xs | normal | sans |

### Spacing

| Element | Value | Tailwind |
|---------|-------|----------|
| Overlay header padding | 12px horiz, 8px vert | `px-3 py-2` |
| File list item padding | 8px horiz, 4px vert | `px-2 py-1` |
| Diff section header | 12px horiz, 6px vert | `px-3 py-1.5` |
| Note card margin | 12px horiz, 8px bottom | `mx-3 mb-2` |
| Note card padding | 12px horiz, 8px vert | `px-3 py-2` |
| File list width | 220px fixed | `w-[220px]` |
| Note indicator dot | 6px × 6px | `w-1.5 h-1.5` |
| Gap between elements | 8px | `gap-2` |
| Icon size (small) | 14px | `h-3.5 w-3.5` |
| Icon size (header) | 16px | `h-4 w-4` |

---

## 9. Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Shift+P` | Toggle PR View | Global (SDK command) |
| `Ctrl+Shift+N` | Add Note to current file | When file is open |
| `Ctrl+Shift+L` | Toggle Notes overlay | Global (SDK command) |
| `Escape` | Close current overlay | Any overlay open |
| `j` / `k` | Next/prev file in PR View | PR View overlay focused |

---

## 10. Responsive Behavior

The overlay system inherits the MainPanel dimensions. No special responsive handling needed beyond what the anchor provides. However:

- **File list width**: Fixed at 220px. If overlay width < 500px, hide file list and show only diff area with a tab bar at top.
- **Note modal**: `sm:max-w-[500px]` — centered, responsive by default via Dialog.
- **Bulk delete dialog**: Same Dialog pattern, responsive by default.

---

## Open Questions

### Q1: Should PR View show split or unified diffs?

**RESOLVED**: Use the existing DiffViewer which supports both modes with a toggle. Default to split (matches GitHub screenshots). User can toggle per-session.

### Q2: Should the file list in PR View be a tree or flat list?

**RESOLVED**: Flat list for v1 (user said "exists already, but is not tree form — but that is fine for now"). Reuse ChangesView's visual pattern (status badge + file path). Tree form can be added later.

### Q3: How do notes persist across worktrees?

**RESOLVED**: Notes are per-worktree in `.chainglass/data/notes.jsonl`. When worktrees merge, JSONL files merge too (append-only). Duplicate IDs (UUIDs) won't conflict. "Viewed" status is NOT shared (per-worktree by design).

### Q4: Where does "Add Note" appear in the UI?

**RESOLVED**: Multiple entry points:
1. File tree context menu → "Add Note"
2. Notes overlay → "Add Note" button (opens modal with file picker)
3. Keyboard shortcut `Ctrl+Shift+N` (when file is open, pre-fills target)
4. CLI: `cg notes add <file> --content "..."`
5. (Future) Line number gutter click in FileViewer/CodeEditor

### Q5: How are note threads rendered?

**RESOLVED**: Flat thread — replies are NoteCards with `threadId` matching the parent note's `id`. Replies render indented with a left border-l-2 under the parent card. No nested replies (max depth = 1).

### Q6: What icons from lucide-react?

**RESOLVED**: 
- PR View: `GitPullRequest` (sidebar/header), `ChevronDown`/`ChevronRight` (collapse), `ChevronsDownUp`/`ChevronsUpDown` (expand/collapse all)
- Notes: `StickyNote` (sidebar/header), `Check` (complete), `ExternalLink` (go to), `Trash2` (delete), `AlertTriangle` (bulk delete warning), `MessageSquare` (reply)

---

## Implementation Checklist

| # | Component | Adapts From | Priority |
|---|-----------|-------------|----------|
| 1 | `usePRViewOverlay` hook | `use-terminal-overlay.tsx` | P0 |
| 2 | `PRViewOverlayPanel` shell | `terminal-overlay-panel.tsx` | P0 |
| 3 | `PRViewHeader` | New (stats pattern from LeftPanel subtitle) | P0 |
| 4 | `PRViewFileList` | `changes-view.tsx` visual pattern | P0 |
| 5 | `PRViewDiffSection` | New (wraps existing DiffViewer) | P0 |
| 6 | `PRViewDiffArea` with scroll sync | New | P1 |
| 7 | Reviewed state persistence | `activity-log-writer.ts` pattern | P1 |
| 8 | Change detection (hash invalidation) | New | P1 |
| 9 | `useNotesOverlay` hook | `use-activity-log-overlay.tsx` | P0 |
| 10 | `NotesOverlayPanel` | `activity-log-overlay-panel.tsx` | P0 |
| 11 | `NoteModal` (add/edit) | `delete-confirmation-dialog.tsx` pattern | P0 |
| 12 | `NoteCard` | New | P0 |
| 13 | `NoteIndicatorDot` | New (tiny component) | P1 |
| 14 | `BulkDeleteDialog` | `delete-confirmation-dialog.tsx` + type-to-confirm | P1 |
| 15 | Note JSONL writer/reader | `activity-log-writer.ts` / `reader.ts` | P0 |
| 16 | API routes | `app/api/activity-log/route.ts` | P0 |
| 17 | Sidebar buttons | Existing pattern in `dashboard-sidebar.tsx` | P0 |
| 18 | ExplorerPanel buttons | Existing pattern in `explorer-panel.tsx` | P1 |
| 19 | SDK commands | `file-browser/sdk/contribution.ts` | P1 |
| 20 | CLI `cg notes` commands | `workflow.command.ts` pattern | P2 |
| 21 | FileTree note indicator wiring | Prop addition to FileTree | P1 |
| 22 | Note thread/reply rendering | New | P2 |
