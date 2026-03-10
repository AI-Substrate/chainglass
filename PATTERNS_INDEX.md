# Design Patterns Index — Quick Navigation

## 📋 Full Documentation
👉 **[DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md)** — 471 lines, 10 complete patterns

---

## 🎯 Pattern Quick Links

### PS-01: Overlay Panel (Provider + Hook + Panel)
- **When to use**: Side panels that slide out from the edge (PR View, File Notes)
- **Pattern**: Context → Hook → Component (fixed position, z-44)
- **Key feature**: CustomEvent-driven, mutual exclusion via overlay:close-all
- **Reference file**: `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-01

### PS-02: Feature Folder Convention
- **When to use**: Creating any new feature
- **Pattern**: `{NNN}-{name}/` with standard subdirectories
- **Structure**: components/, hooks/, lib/, services/, sdk/, types.ts, index.ts
- **Example**: `041-file-browser`, `064-terminal`, `065-activity-log`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-02

### PS-03: Server Action Pattern
- **When to use**: Data mutations, auth-protected operations
- **Pattern**: 'use server' → requireAuth() → DI → service layer
- **Security**: No direct filesystem access, path validation in service
- **Reference file**: `apps/web/app/actions/file-actions.ts`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-03

### PS-04: JSONL Persistence
- **When to use**: Append-only logging, per-worktree data
- **Pattern**: Pure functions (reader/writer), no class, no DI
- **File location**: `{worktree}/.chainglass/data/{name}.jsonl`
- **Dedup strategy**: Read last 50 lines, skip if (id + label) match
- **Reference files**: 
  - `apps/web/src/features/065-activity-log/lib/activity-log-reader.ts`
  - `apps/web/src/features/065-activity-log/lib/activity-log-writer.ts`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-04

### PS-05: SDK Contribution
- **When to use**: Adding discoverable commands, settings, keybindings
- **Pattern**: Two files — contribution.ts (manifest) + register.ts (handler)
- **Reference files**:
  - `apps/web/src/features/041-file-browser/sdk/contribution.ts`
  - `apps/web/src/features/041-file-browser/sdk/register.ts`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-05

### PS-06: Sidebar Navigation
- **When to use**: Workspace/worktree switching, activity badges
- **Pattern**: Expandable workspaces → worktrees → star/unstar + activity dots
- **Reference files**:
  - `apps/web/src/components/dashboard-sidebar.tsx`
  - `apps/web/src/components/workspaces/workspace-nav.tsx`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-06

### PS-07: Dialog/Modal
- **When to use**: Confirmations, user input, comments
- **Pattern**: Radix UI Dialog + shadcn/ui styling
- **Reference file**: `apps/web/src/components/ui/dialog.tsx`
- **Example**: `apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-07

### PS-08: API Route Pattern
- **When to use**: Data fetching, CRUD operations
- **Pattern**: Auth → Validate → DI → Service → JSON
- **Security**: Path validation (startsWith('/'), no '..')
- **Reference files**:
  - `apps/web/app/api/activity-log/route.ts`
  - `apps/web/app/api/worktree-activity/route.ts`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-08

### PS-09: Panel Layout & Anchor
- **When to use**: Positioning overlays relative to content area
- **Pattern**: [data-terminal-overlay-anchor] measured via ResizeObserver
- **Z-index management**: 44 (overlays), 45 (agent), 50 (CRT)
- **Reference file**: `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-09

### PS-10: Workspace Context
- **When to use**: Accessing workspace/worktree metadata in nested components
- **Pattern**: Provider + Hook (no prop drilling)
- **Provides**: slug, name, emoji, worktreeIdentity (branch, theme, gitState)
- **Reference file**: `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx`
- **Documentation**: [DESIGN_PATTERNS.md](./DESIGN_PATTERNS.md) — PS-10

---

## 🚀 Implementation Guides

### PR View (073-pr-view)
- Use **PS-01** (Overlay Panel) for diff viewer
- Use **PS-03** (Server Actions) for diff fetching
- Use **PS-05** (SDK Contribution) for PR navigation commands
- Use **PS-07** (Dialog) for review comments
- Use **PS-08** (API Routes) for PR data endpoints
- Use **PS-09** (Panel Layout) for anchor positioning

**See**: [DESIGN_PATTERNS.md — Recommendations for PR View](./DESIGN_PATTERNS.md)

### File Notes (074-file-notes)
- Use **PS-01** (Overlay Panel) for notes sidebar
- Use **PS-02** (Feature Folder) for 074-file-notes/ structure
- Use **PS-04** (JSONL Persistence) for note storage
- Use **PS-05** (SDK Contribution) for note commands
- Use **PS-08** (API Routes) for note CRUD operations

**See**: [DESIGN_PATTERNS.md — Recommendations for File Notes](./DESIGN_PATTERNS.md)

---

## 🔐 Security Checklist

Apply these patterns to any new feature:
- ☑ **PS-03**: requireAuth() in server actions
- ☑ **PS-08**: auth check in API routes
- ☑ **PS-08**: Path validation (startsWith('/'), no '..')
- ☑ **PS-08**: Whitelist known paths from workspace registry
- ☑ **PS-04**: Pure persistence functions (no direct FS access)
- ☑ **PS-02**: Use DI container for all services

---

## 📞 Quick Reference Templates

| Pattern | File | Lines | Adapt From |
|---------|------|-------|-----------|
| Overlay Provider | `use-*-overlay.tsx` | ~150 | 064-terminal |
| Overlay Panel | `*-overlay-panel.tsx` | ~160 | 065-activity-log |
| JSONL Reader | `*-reader.ts` | ~70 | 065-activity-log |
| JSONL Writer | `*-writer.ts` | ~50 | 065-activity-log |
| SDK Contribution | `contribution.ts` | ~100 | 041-file-browser |
| SDK Register | `register.ts` | ~50 | 041-file-browser |
| API Route | `app/api/.../route.ts` | ~50 | activity-log |

---

## 📌 Key Takeaways

1. **Convention matters**: Numbered folders follow strict structure
2. **Event-driven UI**: Overlays use CustomEvent for communication
3. **Lazy loading**: Defer expensive mounts until needed
4. **JSONL is enough**: No database needed for per-worktree data
5. **Security first**: Auth checks, path validation, DI container
6. **Pure functions**: Persistence layer doesn't depend on DI
7. **Z-index discipline**: 44/45/50 reserved for overlays/agent/CRT

---

Last Updated: March 8, 2024
