# Workshop: ExplorerPanel Integration (Plan 043)

**Type**: Integration Pattern
**Plan**: 044-paste-upload
**Research**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-24T07:00:54Z
**Status**: Draft

**Related Documents**:
- [Plan 043 Spec](../../043-panel-layout/panel-layout-spec.md)
- [Plan 043 File Path Utility Bar Workshop](../../043-panel-layout/workshops/file-path-utility-bar.md)
- [Upload Modal UX Flow](./02-upload-modal-ux-flow.md)
- [Panel Layout domain](../../../../docs/domains/_platform/panel-layout/domain.md)

**Domain Context**:
- **Primary Domain**: file-browser (owns the upload button as a feature)
- **Related Domains**: _platform/panel-layout (owns ExplorerPanel infrastructure)

---

## Purpose

Define how the paste/upload button integrates with plan 043's ExplorerPanel — the full-width top utility bar with composable handler chain. Also establish a temporary placement strategy for when plan 043 isn't ready yet.

## Key Questions Addressed

- Where exactly does the upload button sit in the ExplorerPanel?
- How does the BarHandler chain interact with paste events?
- What's the temporary placement before plan 043 lands?
- How do we avoid coupling to 043's implementation details?

---

## Plan 043 Architecture (Summary)

Plan 043 introduces a three-panel layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  ExplorerPanel — full-width top bar                              │
│  ┌─────────────────────────────────┐ ┌─────────────────────────┐ │
│  │ /path/to/file.ts          [📋] │ │ [Actions area]     [⬆]  │ │
│  └─────────────────────────────────┘ └─────────────────────────┘ │
├────────────────────┬─────────────────────────────────────────────┤
│  LeftPanel         │  MainPanel                                  │
│  (FileTree /       │  (FileViewerPanel)                          │
│   ChangesView)     │                                             │
│                    │                                             │
└────────────────────┴─────────────────────────────────────────────┘
```

### ExplorerPanel Contract (from 043 spec)

```typescript
// _platform/panel-layout/types.ts
type BarHandler = (input: string, context: BarContext) => Promise<boolean>;

interface BarContext {
  slug: string;
  worktreePath: string;
  fileExists: (relativePath: string) => Promise<boolean>;
  navigateToFile: (relativePath: string) => void;
  showError: (message: string) => void;
}

// ExplorerPanel accepts:
interface ExplorerPanelProps {
  filePath: string;
  onNavigate: (path: string) => void;
  onCopy: () => void;
  handlers: BarHandler[];           // Composable handler chain
  actions?: React.ReactNode;        // ← Right-side action buttons
  placeholder?: string;
}
```

**Key**: The `actions` prop is where our upload button goes.

---

## Upload Button Placement

### In ExplorerPanel (When 043 Lands)

```
┌──────────────────────────────────────────────────────────────────┐
│  /src/components/MyComponent.tsx          [📋]    [⬆ Upload]   │
│                                                                  │
│  ← Path display + edit area →             ← Actions area →     │
└──────────────────────────────────────────────────────────────────┘
```

The upload button is passed as a child to ExplorerPanel's `actions` slot:

```typescript
// In BrowserClient or PanelShell composition
<ExplorerPanel
  filePath={currentFile}
  onNavigate={handleNavigate}
  onCopy={handleCopy}
  handlers={[filePathHandler]}
  actions={
    worktreePath ? (
      <PasteUploadButton slug={slug} worktreePath={worktreePath} />
    ) : null
  }
/>
```

**Why actions slot**: The ExplorerPanel owns the layout but doesn't know about upload — it provides a generic actions area. File-browser domain owns the upload button and passes it in.

### Temporary Placement (Before 043 Lands)

If implementing before ExplorerPanel exists, place the button in the existing file browser header area:

```
┌──────────────────────────────────────────────────────────────────┐
│  File Browser                                        [⬆]       │
├────────────────────┬─────────────────────────────────────────────┤
│  FileTree          │  FileViewerPanel                            │
```

**Implementation**: Add to `BrowserClient` component in a temporary header row. When 043 lands, the button component moves to ExplorerPanel's actions slot — the component itself doesn't change, only its mount point.

```typescript
// Temporary — in browser-client.tsx
<div className="flex items-center justify-between border-b px-3 py-2">
  <span className="text-sm font-medium">File Browser</span>
  {worktreePath && (
    <PasteUploadButton slug={slug} worktreePath={worktreePath} />
  )}
</div>
```

---

## BarHandler Chain: Paste Disambiguation

### The Problem

Plan 043's ExplorerPanel handles paste in the path bar for **paste-to-navigate** (paste a file path, press Enter to navigate). Plan 044 introduces **paste-to-upload** (paste a file/image from clipboard).

These are different operations triggered by the same key combo (Ctrl+V):

| Paste Source | Contains | Desired Action |
|-------------|----------|----------------|
| Terminal `pwd` output | Text (path string) | Navigate to path |
| Screenshot tool | Image File | Upload to scratch/paste/ |
| OS file manager Copy | File | Upload to scratch/paste/ |
| Text editor Copy | Text | Navigate to path (if valid) |

### Resolution: Context-Based Disambiguation

Paste events carry type information via `ClipboardEvent.clipboardData`:

```typescript
function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return;

  // Check for files first (screenshots, copied files)
  const fileItems = Array.from(items).filter(item => item.kind === 'file');

  if (fileItems.length > 0) {
    // This is a FILE paste → upload flow
    // Only intercept if upload modal is open or global paste handler is active
    return 'upload';
  }

  // No files → this is TEXT paste → let ExplorerPanel handle for navigation
  return 'navigate';
}
```

### Where Each Handler Lives

```
┌─────────────────────────────────────────────────────────────┐
│ ExplorerPanel (plan 043)                                     │
│                                                             │
│  Path input [onPaste] ──→ Text paste → BarHandler chain    │
│                           (paste-to-navigate)               │
│                                                             │
│  Actions area:                                              │
│    [Upload Button] → opens PasteUploadModal                │
│                       ↓                                     │
│              Modal [onPaste] ──→ File paste → upload flow  │
│                                  (paste-to-upload)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key insight**: No disambiguation needed in the handler chain. The paste contexts are naturally separated:
- **Path input focused** → ExplorerPanel receives paste → text handling (navigate)
- **Upload modal open** → Modal receives paste → file handling (upload)
- **Neither focused** → Paste is ignored (no global handler in MVP)

The BarHandler chain (`type BarHandler = (input: string, context: BarContext) => Promise<boolean>`) operates on **text input** from the path bar, not clipboard events. Upload paste operates on **file content** from the modal's clipboard listener. These don't overlap.

---

## Conditional Visibility

The upload button should only appear when a worktree context is present (user is browsing a workspace with a worktree selected).

```typescript
// Condition check
const showUploadButton = Boolean(worktreePath);

// In ExplorerPanel actions slot (or temporary header)
{showUploadButton && (
  <PasteUploadButton slug={slug} worktreePath={worktreePath} />
)}
```

**Where worktreePath comes from**: URL search params via `nuqs`:
```typescript
const { worktree } = useQueryStates(workspaceParams);
// worktree is the filesystem path like "/home/jak/substrate/041-file-browser"
```

---

## Migration Path: Temporary → ExplorerPanel

### Step 1: Build the Button Component (Plan 044)

```typescript
// apps/web/src/features/041-file-browser/components/paste-upload-button.tsx
// This component is self-contained — it owns the button + modal
export function PasteUploadButton({ slug, worktreePath }: PasteUploadButtonProps) {
  // ... button + modal logic
}
```

### Step 2: Mount Temporarily (Plan 044)

Place in `browser-client.tsx` header area.

### Step 3: Move to ExplorerPanel (Plan 043 Phase 3)

When plan 043 wires `PanelShell` into `BrowserClient`, the upload button moves to the `actions` prop:

```diff
- // In browser-client.tsx temporary header
- <PasteUploadButton slug={slug} worktreePath={worktreePath} />

+ // In PanelShell composition
+ <ExplorerPanel
+   actions={<PasteUploadButton slug={slug} worktreePath={worktreePath} />}
+ />
```

**Zero changes to PasteUploadButton itself** — only its mount point changes. This is why the component should be self-contained (owns its own Dialog state, doesn't depend on parent layout).

---

## Open Questions

### Q1: Should other pages (not just browser) show the upload button?

**RESOLVED**: Yes — the button lives in the **left sidebar header** (next to theme toggle, `DashboardSidebar` lines 70-81). This is visible on ALL workspace pages when a worktree is selected. No per-page mount points needed. The sidebar already has `currentWorktree` from URL search params — the upload button conditionally renders when this is non-null.

### Q2: Should ExplorerPanel's actions prop be a render prop or ReactNode?

**RESOLVED**: `ReactNode` — simpler, follows Radix conventions. The upload button doesn't need ExplorerPanel's internal state. Just `actions={<PasteUploadButton ... />}`.

### Q3: What if plan 043 changes its ExplorerPanel API?

**MITIGATED**: The upload button is a self-contained component with no knowledge of ExplorerPanel internals. The only integration point is "render me somewhere in the top-right." Even if ExplorerPanel's API changes, the button component stays the same — only the mount-point wiring changes.
