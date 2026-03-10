# Design Patterns & Conventions for PR View & File Notes

## PS-01: Overlay Panel Pattern (Provider + Hook + Panel)
**File Paths**: 
- `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` (Reference: TerminalOverlayProvider)
- `apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx` (Reference: ActivityLogOverlayProvider)
- `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` (Reference: TerminalOverlayPanel)
- `apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx` (Reference: ActivityLogOverlayPanel)

**Pattern Structure**:
1. **Provider** (`use-*-overlay.tsx`):
   - Context with state interface (isOpen, sessionName/worktreePath, etc.)
   - Provider component that manages state via `useState`
   - Hook (`useXxxOverlay()`) to access context safely with error check
   - Custom events for dispatch: `overlay:open`, `overlay:close-all`, `xxx:toggle`
   - Mutual exclusion: dispatches `overlay:close-all` before opening (prevents sibling overlays)
   - Self-guard: uses `isOpeningRef` to prevent self-closing when dispatching `overlay:close-all`

2. **Panel Component** (`*-overlay-panel.tsx`):
   - Positioned `fixed` with z-index 44 (overlay layer)
   - Anchors to `[data-terminal-overlay-anchor]` via `ResizeObserver`
   - Lazy mounts child components only on first open (prevents WebSocket connections on load)
   - Listens for Escape key to close (`closeTerminal()` / `closeActivityLog()`)
   - Header with icon, title, action buttons (copy, status badge, close)
   - Measures anchor element dimensions using ResizeObserver + window.resize
   - Re-measures when overlay opens (agent top bar may shift anchor)

3. **Integration**:
   - Buttons dispatch `xxx:toggle` events (e.g., `terminal:toggle`, `activity-log:toggle`)
   - ExplorerPanel (explorer-panel.tsx) has buttons to dispatch events
   - Provider listens for `xxx:toggle` events and calls `toggleXxx(detail?.param)`
   - Overlay auto-closes when navigating to `/terminal` page (popstate + interval check)

**Key Constants**:
- z-index: 44 (overlays), 45 (agent), 50 (CRT effect)
- Cache staleness: 10,000 ms (matches sidecar poll interval)
- DEDUP_LOOKBACK: 50 lines for JSONL file dedup

---

## PS-02: Feature Folder Convention
**Folder Pattern**: `apps/web/src/features/{NNN}-{name}/`
- `019-agent-manager-refactor`
- `027-central-notify-events`
- `041-file-browser`
- `045-live-file-events`
- `050-workflow-page`
- `058-workunit-editor`
- `063-login`
- `064-terminal`
- `065-activity-log`

**Standard Folder Structure**:
```
{NNN}-feature-name/
├── components/          # React components (UI, dialogs, panels)
├── hooks/              # React hooks (state, context, custom logic)
├── lib/                # Pure functions, utilities (server & client)
├── params/             # URL parameter type definitions
├── services/           # Business logic (data fetching, transformation)
├── sdk/                # SDK contribution & registration
├── state/              # Complex state management (rarely used)
├── server/             # Server-only code
├── types.ts            # Domain type definitions
├── index.ts            # Barrel export (public API)
└── domain.md           # Optional: domain documentation
```

**Barrel Export Pattern** (`index.ts`):
```typescript
// Types
export type { TerminalSession } from './types';
export { TerminalView } from './components/terminal-view';
export { TerminalOverlayPanel } from './components/terminal-overlay-panel';
export { TerminalOverlayProvider, useTerminalOverlay } from './hooks/use-terminal-overlay';
```

**Special Folder**: `_platform/`
- Contains cross-cutting infrastructure (panel-layout, viewer, dev-tools)
- Not numbered; prefixed with underscore to sort first

---

## PS-03: Server Action Pattern
**File Path**: `apps/web/app/actions/file-actions.ts`

**Structure**:
1. `'use server'` pragma at top
2. Import security layer: `requireAuth()`
3. Resolve DI container: `getContainer()`
4. Delegate to service layer functions
5. Return strongly-typed result

**Example**:
```typescript
'use server';

import { requireAuth } from '@/features/063-login/lib/require-auth';
import { getContainer } from '../../src/lib/bootstrap-singleton';
import { readFileAction as readFileService } from '../../src/features/041-file-browser/services/file-actions';

export async function readFile(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<ReadFileResult> {
  await requireAuth();
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  return readFileService({ worktreePath, filePath, fileSystem, ... });
}
```

**Security Patterns**:
- Path validation: `!worktree.startsWith('/')`, `worktree.includes('..')` checks
- Auth checks: `await requireAuth()` before any operation
- Container resolution: DI tokens for dependency injection
- Error handling: try/catch with logging

---

## PS-04: JSONL Persistence Pattern (Activity Log)
**File Paths**:
- `apps/web/src/features/065-activity-log/lib/activity-log-reader.ts` (Read)
- `apps/web/src/features/065-activity-log/lib/activity-log-writer.ts` (Write)
- `apps/web/src/features/065-activity-log/types.ts` (Schema)

**Persistence Details**:
- File: `.chainglass/data/activity-log.jsonl` (per worktree)
- Format: One JSON object per line (JSONL)
- No database, pure file I/O

**Write Strategy** (`appendActivityLogEntry`):
```typescript
export function appendActivityLogEntry(worktreePath: string, entry: ActivityLogEntry): void {
  const filePath = path.join(worktreePath, ACTIVITY_LOG_DIR, ACTIVITY_LOG_FILE);
  fs.mkdirSync(dir, { recursive: true });
  
  // Dedup: check last 50 lines for same id + label
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').slice(-50);
    for (let i = lines.length - 1; i >= 0; i--) {
      const existing = JSON.parse(lines[i]);
      if (existing.id === entry.id && existing.label === entry.label) return; // skip
    }
  }
  
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
}
```

**Read Strategy** (`readActivityLog`):
```typescript
export function readActivityLog(worktreePath: string, options?: ReadActivityLogOptions) {
  // Filter by:
  // - since: ISO timestamp (entryTime > since)
  // - source: type filter (e.g., "tmux", "agent")
  // - limit: max entries (default 200, most recent)
  
  // Returns entries in chronological order (oldest first)
  // Consumers that need reverse chronological must .reverse()
}
```

**Entry Schema**:
```typescript
interface ActivityLogEntry {
  id: string;              // Dedup key: "{source}:{identifier}"
  source: string;          // "tmux", "agent", "workflow", "build", etc.
  label: string;           // Human-readable status (primary display)
  timestamp: string;       // ISO-8601
  meta?: Record<string, unknown>; // Source-specific metadata
}
```

---

## PS-05: SDK Contribution Pattern
**File Paths**:
- `apps/web/src/features/041-file-browser/sdk/contribution.ts` (Manifest)
- `apps/web/src/features/041-file-browser/sdk/register.ts` (Registration)

**Contribution Manifest** (`contribution.ts`):
```typescript
export const fileBrowserContribution: SDKContribution = {
  domain: 'file-browser',
  domainLabel: 'File Browser',
  commands: [
    {
      id: 'file-browser.goToFile',
      title: 'Go to File',
      category: 'Navigation',
      params: z.object({ /* ... */ }),
      icon: 'file-search',
    },
  ],
  settings: [
    {
      key: 'file-browser.showHiddenFiles',
      label: 'Show Hidden Files',
      schema: z.boolean().default(false),
      ui: 'toggle',
      section: 'File Browser',
    },
  ],
  keybindings: [],
};
```

**Registration** (`register.ts`):
```typescript
export function registerFileBrowserSDK(sdk: IUSDK): void {
  // Register settings (no handlers needed)
  for (const setting of fileBrowserContribution.settings) {
    sdk.settings.contribute(setting);
  }
  
  // Register commands that don't need refs (bootstrap-safe)
  const copyPathCmd = fileBrowserContribution.commands.find(c => c.id === 'file-browser.copyPath');
  if (copyPathCmd) {
    sdk.commands.register({
      ...copyPathCmd,
      handler: async () => {
        const file = new URL(window.location.href).searchParams.get('file');
        await navigator.clipboard.writeText(file);
        sdk.toast.success(`Copied: ${file}`);
      },
    });
  }
}
```

**Key Patterns**:
- Static manifest (`contribution.ts`) is decoupled from component tree
- Commands needing React refs are registered in useEffect (not here)
- Settings are purely declarative (schema + UI metadata)
- Called from `bootstrapSDK()` early in app initialization

---

## PS-06: Sidebar Navigation Pattern
**File Paths**:
- `apps/web/src/components/dashboard-sidebar.tsx` (Main sidebar)
- `apps/web/src/components/workspaces/workspace-nav.tsx` (Workspace/worktree list)
- `apps/web/src/components/ui/sidebar.tsx` (shadcn Sidebar components)

**Hierarchy**:
1. **DashboardSidebar**: Root sidebar with sections (header, content, footer)
   - Context-aware: shows workspace list vs. worktree list depending on route
   - Tools section: workspace-scoped tools (Browser, Agents, Workflows)
   - Worktree section: for switching context (not parent of tools)

2. **WorkspaceNav**: Nested component handling expansion/selection
   - Fetches from `/api/workspaces?include=worktrees`
   - Expandable workspaces with worktree sub-items
   - Star/unstar functionality (toggleWorktreeStar server action)
   - Activity dots (useWorktreeActivity hook for cross-worktree polling)

3. **Activity Dots** (ActivityDot component):
   - Shows badge on worktree items indicating background activity
   - Polling via `/api/worktree-activity?paths=...`
   - States: hasQuestions, hasErrors, hasWorking, agentCount

**Sidebar State**:
- Stored in cookie: `SIDEBAR_COOKIE_NAME = 'sidebar_state'`
- Toggle shortcut: Ctrl+B
- Mobile-aware: Sheet component for mobile, full sidebar for desktop

**Integration with Overlays**:
- Buttons in toolbar (not in sidebar) dispatch overlay events
- ExplorerPanel has "Toggle Activity Log" and "Toggle Terminal" buttons
- Buttons dispatch `CustomEvent('activity-log:toggle')` and `CustomEvent('terminal:toggle')`

---

## PS-07: Dialog/Modal Pattern (shadcn/ui)
**File Paths**:
- `apps/web/src/components/ui/dialog.tsx` (Base components from Radix UI)
- `apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx` (Example)

**Component Stack**:
```typescript
<Dialog open={isOpen} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    
    {/* Content */}
    
    <DialogFooter>
      <DialogClose asChild><Button>Cancel</Button></DialogClose>
      <Button variant="destructive" onClick={onConfirm}>Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Styling**:
- DialogOverlay: `fixed inset-0 z-50 bg-black/80` with fade-in animation
- DialogContent: centered, `max-w-lg`, with slide-in animation
- Uses Radix UI Dialog primitives (open/close state via props)

**DeleteConfirmationDialog Pattern**:
```typescript
export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  itemName,
  itemType,    // 'file' | 'directory'
  onConfirm,
  tooLargeCount?,  // Shows error when folder is too large
}) { /* ... */ }
```

---

## PS-08: API Route Pattern (Worktree/Workspace Scoping)
**File Paths**:
- `apps/web/app/api/activity-log/route.ts` (Activity log endpoint)
- `apps/web/app/api/worktree-activity/route.ts` (Cross-worktree activity summary)

**General Pattern**:
1. Auth check: `const session = await auth()`
2. Parse query params: `request.nextUrl.searchParams.get('param')`
3. Validate paths: check `startsWith('/')`, no `..` traversal
4. Resolve dependencies: DI container
5. Call service/reader function
6. Return JSON response

**Activity Log Endpoint** (`/api/activity-log`):
```typescript
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const worktree = searchParams.get('worktree');
  // Validation: startsWith('/'), no '..'
  
  const entries = readActivityLog(worktree, {
    limit: searchParams.get('limit') ? Number.parseInt(...) : undefined,
    since: searchParams.get('since') ?? undefined,
    source: searchParams.get('source') ?? undefined,
  });
  
  return NextResponse.json(entries);
}
```

**Worktree Activity Endpoint** (`/api/worktree-activity`):
```typescript
export async function GET(request: NextRequest) {
  const pathsParam = request.nextUrl.searchParams.get('paths');
  const requestedPaths = pathsParam.split(',').filter(Boolean);
  
  // Validate paths against known workspace worktrees (DYK-P4-05)
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(...);
  const workspaces = await workspaceService.list();
  
  const knownWorktreePaths = new Set<string>();
  // Collect all worktree paths from workspaces
  
  const safePaths = requestedPaths.filter(p => knownWorktreePaths.has(p));
  // Process only safe paths
}
```

**Security Patterns**:
- Auth guard first
- Path validation (absolute, no traversal)
- Known-paths whitelist (validate against workspace registry)
- Error handling with logging

---

## PS-09: Component Composition & Data Flow
**File Paths**:
- `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`
- `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`

**PanelShell Layout** (Root compositor):
```
┌─ Explorer (ExplorerPanel) ─────────────────────────────┐
│ Path input | Command palette | Activity Log | Terminal  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Left (sidebar) │  Main Content (data-terminal-overlay-anchor)
│                │  ├── File editor/viewer
│ Worktree list  │  ├── Terminal overlay (fixed, z-44)
│ Navigation     │  ├── Activity log overlay (fixed, z-44)
│                │  └── Agent overlay (fixed, z-45)
└──────────────────────────────────────────────────────────┘
```

**Anchor Point**:
- `<div className="flex-1 flex flex-col overflow-hidden" data-terminal-overlay-anchor>`
- Overlay panels query this element to get dimensions
- Used by both terminal and activity-log overlays (shared anchor)

**Component Hierarchy**:
- Workspace pages wrap content in WorkspaceProvider (file-browser hook)
- PanelShell contains ExplorerPanel + LeftPanel + MainPanel
- Overlays are rendered at root level (above PanelShell in z-index)
- Providers: TerminalOverlayProvider + ActivityLogOverlayProvider at root

---

## PS-10: Integration Hook Pattern (useWorkspaceContext)
**File Path**: `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx`

**Context Provider**:
```typescript
interface WorkspaceContextValue {
  slug?: string;
  name?: string;
  emoji?: string;
  worktreeIdentity?: WorktreeIdentity;
}

export const { WorkspaceProvider, useWorkspaceContext } = createContext<...>();
```

**Usage**:
```typescript
// In workspace page layout:
<WorkspaceProvider slug={slug} worktreePath={searchParams.get('worktree')}>
  <PanelShell explorer={...} left={...} main={...} />
</WorkspaceProvider>

// In nested components:
const wsCtx = useWorkspaceContext();
const terminalTheme = wsCtx?.worktreeIdentity?.terminalTheme || 'dark';
```

**Populated Data**:
- `slug`: workspace slug from URL
- `worktreeIdentity`: branch, emoji, terminal theme, git state
- Used by overlays (TerminalOverlayPanel accesses terminalTheme)
- Used by sidebar (DashboardSidebar shows branch + emoji)

**Key Pattern**: Wraps workspace-scoped content, provides context to all descendants for accessing current workspace/worktree metadata without prop drilling.

---

## Summary: For PR View & File Notes

**Recommended Patterns**:

1. **PR View Features**:
   - Use **Overlay Pattern (PS-01)** for diff panel
   - Create feature folder `073-pr-view/` with components/, hooks/, services/
   - Add buttons to ExplorerPanel dispatcher for `pr-view:toggle` event
   - Use Dialog (PS-07) for review comments (not overlay)
   - Server actions in `app/actions/` for file fetching

2. **File Notes Features**:
   - Use **Overlay Pattern (PS-01)** for notes panel or Dialog (PS-07)
   - Create feature folder `074-file-notes/` with lib/, hooks/, services/
   - Use **JSONL Pattern (PS-04)** for per-file note storage (`.chainglass/notes.jsonl`)
   - Implement **API Routes (PS-08)** for `/api/file-notes` endpoint
   - Register **SDK Contribution (PS-05)** for note-taking commands
   - Use **Server Actions (PS-03)** for save/delete operations

3. **Shared Patterns**:
   - **Sidebar Nav (PS-06)**: Notes/PR buttons in ExplorerPanel toolbar
   - **z-index**: 44 for overlays, 45 for agent, 50 for CRT
   - **Auth**: `requireAuth()` in server actions and API routes
   - **Path validation**: Check startsWith('/'), no '..' in API routes
   - **Barrel exports**: Public API via `index.ts`
