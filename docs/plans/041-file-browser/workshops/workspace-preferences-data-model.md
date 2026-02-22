# Workshop: Workspace Preferences Data Model

**Type**: Data Model
**Plan**: 041-file-browser
**Spec**: docs/plans/041-file-browser/research.md
**Created**: 2026-02-22
**Status**: Draft

**Related Documents**:
- [UX Vision Workshop](./ux-vision-workspace-experience.md) — emoji + color design decisions
- [Deep Linking Workshop](./deep-linking-system.md) — URL state, starred workspaces
- [Exploration Research Dossier](../research.md)

---

## Purpose

Design the data model for workspace preferences (emoji, accent color, starred/favorite status, and future extensible properties). Decide WHERE this data lives (global registry vs per-worktree), HOW it's stored (extend existing entity vs new adapter), and how to keep it extensible for future needs without over-engineering.

## Key Questions Addressed

- Where should workspace preferences live — global registry or per-worktree storage?
- Should the Workspace entity be extended, or should preferences be a separate domain?
- How do we handle schema migration when adding fields to the registry?
- What's the pattern for future custom workspace data (not just preferences)?

---

## 1. The Two Storage Systems

The codebase has two distinct storage patterns:

### Global Registry (`~/.config/chainglass/workspaces.json`)

```json
{
  "version": 1,
  "workspaces": [
    {
      "slug": "substrate",
      "name": "Substrate",
      "path": "/home/jak/substrate",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

- **Managed by**: `WorkspaceRegistryAdapter` (implements `IWorkspaceRegistryAdapter`)
- **Scope**: Global — survives project deletion, shared across all worktrees
- **Pattern**: Single JSON file, read-modify-write, `version` field for migrations
- **Entity**: `Workspace` (slug, name, path, createdAt)

### Per-Worktree Domain Data (`<worktree>/.chainglass/data/<domain>/`)

```
~/substrate/.chainglass/data/
├── samples/
│   ├── hello-world.json
│   └── auth-flow.json
├── agents/
│   └── abc123/
│       ├── session.json
│       └── events.ndjson
```

- **Managed by**: Domain-specific adapters extending `WorkspaceDataAdapterBase`
- **Scope**: Per-worktree — lives inside the project, travels with the code
- **Pattern**: One JSON file per entity, domain subdirectory
- **Exemplars**: `SampleAdapter` (domain = `'samples'`), `AgentSessionAdapter` (domain = `'agents'`)

---

## 2. Where Do Preferences Belong?

### Analysis

| Property | Scope | Changes with worktree? | Survives workspace deletion? |
|----------|-------|----------------------|------------------------------|
| Emoji | Per workspace | No — same emoji regardless of worktree | Must survive |
| Accent color | Per workspace | No | Must survive |
| Starred/favorite | Per workspace | No | Must survive |
| Display order | Per workspace | No | Must survive |
| Custom name override | Per workspace | No | Must survive |

All preference properties are:
- **Global to the workspace** (not per-worktree)
- **Must survive workspace deletion** (if you remove and re-add, preferences should ideally persist — but not required for v1)
- **Not code-related** (don't belong in the project directory)

### Decision: Extend the Global Registry

**Preferences belong in the global registry** (`~/.config/chainglass/workspaces.json`), not in per-worktree storage.

**Why not per-worktree?**
- Emoji/color are workspace-level identity, not worktree-level
- Per-worktree data would require syncing preferences across worktrees
- Per-worktree data lives inside the project — preferences are user-local, not project-level
- If you `rm -rf` a project and re-clone, you'd lose your emoji. The registry survives.

**Why not a separate preferences file?**
- It would add a second global file to manage and keep in sync
- The registry already has a `version` field for schema evolution
- The data is tiny (a few extra fields per workspace)
- Simpler is better

---

## 3. Schema Evolution

### Current Schema (version 1)

```typescript
interface WorkspaceRegistryFile {
  version: 1;
  workspaces: WorkspaceJSON[];
}

interface WorkspaceJSON {
  slug: string;
  name: string;
  path: string;
  createdAt: string;
}
```

### Proposed Schema (version 2)

```typescript
interface WorkspaceRegistryFileV2 {
  version: 2;
  workspaces: WorkspaceJSONV2[];
}

interface WorkspaceJSONV2 {
  // Existing fields (unchanged)
  slug: string;
  name: string;
  path: string;
  createdAt: string;

  // New: Preferences
  preferences: WorkspacePreferences;
}

interface WorkspacePreferences {
  /** Workspace emoji for visual identification */
  emoji: string;
  /** Accent color name from curated palette */
  color: string;
  /** Whether workspace is starred/pinned to top */
  starred: boolean;
  /** Display order within starred/unstarred group (lower = first) */
  sortOrder: number;
}
```

### Migration Strategy

The registry already has `version: 1`. When we read a v1 file, we migrate in-memory and write back as v2 on next save.

```typescript
function migrateV1toV2(v1: WorkspaceRegistryFileV1): WorkspaceRegistryFileV2 {
  return {
    version: 2,
    workspaces: v1.workspaces.map((ws, index) => ({
      ...ws,
      preferences: {
        emoji: randomEmoji(),  // Auto-assign from palette
        color: randomColor(),  // Auto-assign from palette
        starred: false,
        sortOrder: index,      // Preserve current order
      },
    })),
  };
}
```

**Migration is:**
- **Automatic** — happens on first read after upgrade
- **Non-destructive** — all existing fields preserved
- **Lazy** — only writes v2 when next save occurs
- **Testable** — pure function, easy to unit test

### Reading Both Versions

```typescript
private async readRegistry(): Promise<WorkspaceRegistryFileV2> {
  // ... read file ...
  const raw = JSON.parse(content);

  if (raw.version === 1) {
    return migrateV1toV2(raw as WorkspaceRegistryFileV1);
  }

  return raw as WorkspaceRegistryFileV2;
}
```

---

## 4. Entity Changes

### Workspace Entity

Add preferences to the entity:

```typescript
// packages/workflow/src/entities/workspace.ts

export interface WorkspacePreferences {
  emoji: string;
  color: string;
  starred: boolean;
  sortOrder: number;
}

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  emoji: '',   // Empty = needs assignment
  color: '',   // Empty = needs assignment
  starred: false,
  sortOrder: 0,
};

export interface WorkspaceInput {
  readonly name: string;
  readonly path: string;
  readonly slug?: string;
  readonly createdAt?: Date;
  readonly preferences?: Partial<WorkspacePreferences>;  // NEW
}

export interface WorkspaceJSON {
  slug: string;
  name: string;
  path: string;
  createdAt: string;
  preferences: WorkspacePreferences;  // NEW
}

export class Workspace {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly createdAt: Date;
  readonly preferences: WorkspacePreferences;  // NEW

  private constructor(
    slug: string,
    name: string,
    path: string,
    createdAt: Date,
    preferences: WorkspacePreferences,
  ) {
    this.slug = slug;
    this.name = name;
    this.path = path;
    this.createdAt = createdAt;
    this.preferences = preferences;
  }

  static create(input: WorkspaceInput): Workspace {
    const slug = input.slug ?? Workspace.generateSlug(input.name);
    const createdAt = input.createdAt ?? new Date();
    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...input.preferences,
    };
    return new Workspace(slug, input.name, input.path, createdAt, preferences);
  }

  /** Create a new Workspace with updated preferences */
  withPreferences(prefs: Partial<WorkspacePreferences>): Workspace {
    return Workspace.create({
      slug: this.slug,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt,
      preferences: { ...this.preferences, ...prefs },
    });
  }

  toJSON(): WorkspaceJSON {
    return {
      slug: this.slug,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt.toISOString(),
      preferences: { ...this.preferences },
    };
  }
}
```

Key patterns:
- **`withPreferences()`** — immutable update, returns new entity (matches existing entity patterns)
- **`DEFAULT_PREFERENCES`** — exported for use in migration and tests
- **`Partial<WorkspacePreferences>`** in input — allows partial overrides during creation

---

## 5. Service Layer Changes

### IWorkspaceService — New Method

```typescript
export interface IWorkspaceService {
  // ... existing methods ...

  /**
   * Update workspace preferences (emoji, color, starred, sortOrder).
   * Partial update — only provided fields are changed.
   */
  updatePreferences(
    slug: string,
    prefs: Partial<WorkspacePreferences>,
  ): Promise<WorkspaceOperationResult>;
}
```

### IWorkspaceRegistryAdapter — New Method

```typescript
export interface IWorkspaceRegistryAdapter {
  // ... existing methods ...

  /**
   * Update a workspace in the registry.
   * Replaces the workspace entry matching the slug.
   */
  update(workspace: Workspace): Promise<WorkspaceSaveResult>;
}
```

Currently the adapter only has `save` (create) and `remove` (delete). We need `update` for modifying preferences without removing and re-adding.

---

## 6. API & Server Action Changes

### New Server Action

```typescript
// apps/web/app/actions/workspace-actions.ts

export async function updateWorkspacePreferences(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const slug = formData.get('slug') as string;
  const emoji = formData.get('emoji') as string | null;
  const color = formData.get('color') as string | null;
  const starred = formData.get('starred');

  const prefs: Partial<WorkspacePreferences> = {};
  if (emoji !== null) prefs.emoji = emoji;
  if (color !== null) prefs.color = color;
  if (starred !== null) prefs.starred = starred === 'true';

  const result = await workspaceService.updatePreferences(slug, prefs);
  // ...
}
```

### API Route Enhancement

The existing `GET /api/workspaces` already returns workspace data. The `preferences` field will be included automatically since `Workspace.toJSON()` serializes it.

```json
{
  "workspaces": [
    {
      "slug": "substrate",
      "name": "Substrate",
      "path": "/home/jak/substrate",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "preferences": {
        "emoji": "🔮",
        "color": "purple",
        "starred": true,
        "sortOrder": 0
      }
    }
  ]
}
```

---

## 7. Emoji & Color Assignment

### On Workspace Creation

When `workspaceService.add()` creates a workspace, it auto-assigns random emoji + color:

```typescript
// In WorkspaceService.add()
const preferences: WorkspacePreferences = {
  emoji: pickRandomEmoji(existingEmojis),  // Avoid duplicates
  color: pickRandomColor(existingColors),  // Avoid duplicates
  starred: false,
  sortOrder: existingWorkspaces.length,
};
```

**Duplicate avoidance**: When picking random emoji/color, exclude ones already used by other workspaces. If all are taken (30 emojis, 10 colors), allow duplicates. This maximizes visual distinction without strict uniqueness constraints.

### Palettes (from UX workshop)

```typescript
// packages/workflow/src/constants/workspace-palettes.ts

export const WORKSPACE_EMOJI_PALETTE = [
  '🔮', '💎', '🔥', '⚡', '🌊', '🌿', '🎯', '🚀', '⭐', '🌸',
  '🦊', '🐙', '🦋', '🐝', '🦅', '🐺',
  '🔷', '🔶', '🟣', '🟢', '🔴', '🟡',
  '🎲', '🎪', '🧊', '🌈', '🍊', '🌺', '🎸', '🏔️',
] as const;

export const WORKSPACE_COLOR_PALETTE = [
  { name: 'purple', light: '#8B5CF6', dark: '#A78BFA' },
  { name: 'blue',   light: '#3B82F6', dark: '#60A5FA' },
  { name: 'cyan',   light: '#06B6D4', dark: '#22D3EE' },
  { name: 'green',  light: '#10B981', dark: '#34D399' },
  { name: 'yellow', light: '#F59E0B', dark: '#FBBF24' },
  { name: 'orange', light: '#F97316', dark: '#FB923C' },
  { name: 'red',    light: '#EF4444', dark: '#F87171' },
  { name: 'pink',   light: '#EC4899', dark: '#F472B6' },
  { name: 'indigo', light: '#6366F1', dark: '#818CF8' },
  { name: 'teal',   light: '#14B8A6', dark: '#2DD4BF' },
] as const;

export type WorkspaceColorName = typeof WORKSPACE_COLOR_PALETTE[number]['name'];
```

**Where the palette constants live**: In `packages/workflow/` because the assignment logic runs server-side (WorkspaceService). The web app imports these for the picker UI.

---

## 8. File on Disk — Before & After

### Before (v1)

```json
{
  "version": 1,
  "workspaces": [
    {
      "slug": "substrate",
      "name": "Substrate",
      "path": "/home/jak/substrate",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### After (v2) — auto-migrated

```json
{
  "version": 2,
  "workspaces": [
    {
      "slug": "substrate",
      "name": "Substrate",
      "path": "/home/jak/substrate",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "preferences": {
        "emoji": "🔮",
        "color": "purple",
        "starred": true,
        "sortOrder": 0
      }
    }
  ]
}
```

---

## 9. Extensibility — Future Custom Data

The `preferences` object is the right place for workspace-level UI/UX state. Future additions:

```typescript
interface WorkspacePreferences {
  // Current (this plan)
  emoji: string;
  color: string;
  starred: boolean;
  sortOrder: number;

  // Future examples (NOT implemented now, just showing the pattern)
  // defaultWorktree?: string;       // Which worktree to select by default
  // sidebarCollapsed?: boolean;     // Per-workspace sidebar state
  // lastVisitedPage?: string;       // Resume where you left off
  // customLabel?: string;           // Override display name
}
```

Adding a new preference field:
1. Add to `WorkspacePreferences` interface with a default value
2. Add to `DEFAULT_PREFERENCES` constant
3. Migration handles old data (missing fields get defaults via `{ ...DEFAULT_PREFERENCES, ...stored }`)
4. No version bump needed — the spread-with-defaults pattern is forward-compatible

**When would we need version 3?** Only if we change the STRUCTURE (rename/remove fields, change nesting). Adding optional fields with defaults doesn't require a version bump.

### What about per-worktree custom data?

If a future feature needs per-worktree storage (e.g., worktree-specific agent config, cached file tree state), it follows the existing `WorkspaceDataAdapterBase` pattern:

```typescript
export class WorktreePrefsAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'prefs';
  // → stores at <worktree>/.chainglass/data/prefs/config.json
}
```

This is NOT needed for this plan — just documenting the escape hatch.

---

## 10. Testing Strategy

### Unit Tests

```typescript
// test/unit/workflow/workspace-entity.test.ts (extend existing)
describe('Workspace preferences', () => {
  it('creates with default preferences', () => {
    const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
    expect(ws.preferences.emoji).toBe('');
    expect(ws.preferences.starred).toBe(false);
  });

  it('creates with custom preferences', () => {
    const ws = Workspace.create({
      name: 'Test',
      path: '/tmp/test',
      preferences: { emoji: '🔮', color: 'purple' },
    });
    expect(ws.preferences.emoji).toBe('🔮');
    expect(ws.preferences.color).toBe('purple');
    expect(ws.preferences.starred).toBe(false); // default
  });

  it('withPreferences returns new entity', () => {
    const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
    const updated = ws.withPreferences({ starred: true });
    expect(updated.starred).toBe(true);
    expect(ws.starred).toBe(false); // original unchanged
  });

  it('serializes preferences in toJSON', () => {
    const ws = Workspace.create({
      name: 'Test',
      path: '/tmp/test',
      preferences: { emoji: '🔮', color: 'purple' },
    });
    const json = ws.toJSON();
    expect(json.preferences.emoji).toBe('🔮');
  });
});
```

### Migration Tests

```typescript
// test/unit/workflow/registry-migration.test.ts
describe('registry v1 → v2 migration', () => {
  it('adds default preferences to v1 workspaces', () => {
    const v1 = { version: 1, workspaces: [{ slug: 'test', name: 'Test', path: '/tmp', createdAt: '...' }] };
    const v2 = migrateV1toV2(v1);
    expect(v2.version).toBe(2);
    expect(v2.workspaces[0].preferences).toBeDefined();
    expect(v2.workspaces[0].preferences.emoji).toBeTruthy(); // auto-assigned
  });
});
```

### Contract Tests

The existing `workspace-registry-adapter.contract.test.ts` will need extension for the `update()` method.

---

## 11. Files Changed

| File | Change |
|------|--------|
| `packages/workflow/src/entities/workspace.ts` | Add `preferences` field, `withPreferences()`, update `toJSON()` |
| `packages/workflow/src/adapters/workspace-registry.adapter.ts` | Add `update()`, add v1→v2 migration in `readRegistry()` |
| `packages/workflow/src/interfaces/workspace-registry-adapter.interface.ts` | Add `update()` to interface |
| `packages/workflow/src/interfaces/workspace-service.interface.ts` | Add `updatePreferences()` |
| `packages/workflow/src/services/workspace.service.ts` | Implement `updatePreferences()` |
| `packages/workflow/src/fakes/fake-workspace-registry-adapter.ts` | Add `update()` fake |
| `packages/workflow/src/constants/workspace-palettes.ts` | **NEW** — emoji + color palettes |
| `apps/web/app/actions/workspace-actions.ts` | Add `updateWorkspacePreferences()` server action |
| `test/unit/workflow/workspace-entity.test.ts` | Extend with preferences tests |
| `test/unit/workflow/registry-migration.test.ts` | **NEW** — migration tests |
| `test/contracts/workspace-registry-adapter.contract.test.ts` | Add `update()` contract |

---

## 12. Open Questions

### Q1: Should we validate emoji against the palette?

**RESOLVED: Yes, soft validation.** The `updatePreferences()` method validates emoji is in the palette. If not, it rejects with an error. This prevents garbage data. The palette is the source of truth.

### Q2: Should `sortOrder` be explicit or implicit?

**RESOLVED: Explicit.** Store `sortOrder` as an integer. The landing page sorts: starred first (by sortOrder), then unstarred (by sortOrder). Default sortOrder = array index at creation time. Reordering updates sortOrder for affected workspaces.

### Q3: Do we need a "reset to defaults" for preferences?

**RESOLVED: No.** Users can pick a new emoji/color. There's no meaningful "default" to reset to since the original was random. Keep it simple.
