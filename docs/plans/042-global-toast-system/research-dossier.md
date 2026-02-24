# Research Report: Global Toast System

**Generated**: 2026-02-24T03:58:00Z
**Research Query**: "toast notification system for user feedback"
**Mode**: Pre-Plan
**Location**: docs/plans/042-global-toast-system/research-dossier.md
**FlowSpace**: Available
**Findings**: 18

## Executive Summary

### What It Does
A global toast notification system replaces ad-hoc inline error/success banners with a single, consistent `toast()` function callable from anywhere — components, hooks, server action callbacks. Sonner provides stackable, icon-rich, colour-coded toasts with zero boilerplate.

### Business Purpose
Every feature needs user feedback (save succeeded, error occurred, file changed externally). Currently each feature reinvents this with `useState<string>` + inline divs. A shared toast system eliminates this duplication, improves consistency, and is the first deliverable of the `_platform/notifications` domain.

### Key Insights
1. **6 components** currently have inline error/success banners that should migrate to toast
2. The `Providers` component at `apps/web/src/components/providers.tsx` is the ideal mount point — already `'use client'`, already wraps all children
3. Sonner auto-detects theme from `next-themes` (already installed) — no extra wiring needed

### Quick Stats
- **Migration targets**: 6 components with inline feedback patterns
- **Install**: 1 npm package (sonner, ~5KB gzipped)
- **New files**: 1 (Toaster wrapper)
- **Modified files**: ~3-4 (providers, file browser, workgraph)
- **Prior learnings**: 0 directly relevant (novel addition)

## Current State: Inline Feedback Patterns

### High Priority Migration Targets

| Component | File | Pattern | Message | Priority |
|-----------|------|---------|---------|----------|
| WorkGraph detail | `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` | `useState<string\|null>` + setTimeout + inline div | "Graph updated from external change" | High |
| File browser save | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | No feedback currently | Save success/conflict | High |
| AgentChatView | `apps/web/src/components/agents/agent-chat-view.tsx` | `useState` + inline banner | Agent error messages | High |
| CreateSessionForm | `apps/web/src/components/agents/create-session-form.tsx` | `useState` + inline box | "Failed to create agent" | High |
| WorkUnitToolbox | `apps/web/src/features/022-workgraph-ui/workunit-toolbox.tsx` | `useState` + inline div | "Failed to load units" | High |

### Keep Inline (Not Migrated)

| Component | File | Reason |
|-----------|------|--------|
| QuestionInput | `apps/web/src/components/phases/question-input.tsx` | Form validation — better inline |
| AgentChatInput | `apps/web/src/components/agents/agent-chat-input.tsx` | "Please enter a message" — stays at input |
| MermaidRenderer | `apps/web/src/components/viewers/mermaid-renderer.tsx` | Diagram-specific error — contextual |
| FileViewerPanel | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | "File too large" / "Binary file" — content area |

## Architecture Decision

### Sonner (Selected)

```
Any component/hook:                Root layout:
  import { toast } from 'sonner'     <Toaster />  ← portal
  toast.success('Saved')
```

- `toast()` is a plain function — no hook, no context, works anywhere
- Built-in types: `success`, `error`, `warning`, `info` with auto icons + colours
- `richColors` prop enables coloured backgrounds
- `toast.promise()` for async operations (loading → success/error)
- Stacking built-in, auto-dismiss (4s default)
- Theme-aware via next-themes (already installed)
- ~5KB gzipped

### Mount Point

`apps/web/src/components/providers.tsx` — already `'use client'`, already wraps all children. Add `<Toaster />` as sibling to existing providers.

## Dependencies

### What Toast Depends On
- `sonner` (npm) — core library
- `next-themes` (npm, already installed) — theme detection
- Root provider mount point (already exists)

### What Will Depend On Toast
- `file-browser` domain — save/refresh/conflict feedback
- `022-workgraph-ui` — external change notification (migrated from inline)
- Agent UI — session creation, chat errors (future migration)
- Any future feature needing user feedback

## Domain Context

This plan delivers the **toast UI** contract of the `_platform/notifications` domain (extracted earlier today). The domain also owns SSE transport infrastructure (Plans 019, 023, 027) which is already implemented.

- Domain doc: `docs/domains/_platform/notifications/domain.md`
- Workshop: `docs/plans/041-file-browser/workshops/global-toast-system.md`

## Implementation Scope

### Phase 1: Install + Wire (Core)
1. Install sonner
2. Create Toaster wrapper with theme support
3. Mount in providers.tsx
4. Wire into file browser save/refresh

### Phase 2: Migrate Existing (Optional, can be separate)
1. Migrate workgraph inline toast → sonner
2. Migrate agent error patterns → sonner (lower priority)

### Acceptance Criteria
- [ ] `toast.success('msg')` works from any client component
- [ ] Toasts stack, auto-dismiss, have close button
- [ ] Rich colours: green success, red error, blue info, amber warning
- [ ] Dark mode support
- [ ] File browser save shows toast feedback
- [ ] `just fft` passes

## Workshop Reference

Full design decisions documented in:
`docs/plans/041-file-browser/workshops/global-toast-system.md`

Key decisions: Sonner over shadcn toast, bottom-right position, no wrapper around `toast()`, root layout mount.

## Next Steps

1. Run `/plan-1b-v2-specify` to create specification
2. Run `/plan-3-v2-architect` to create implementation plan
3. Implement (small enough for 1-2 phases)

---

**Research Complete**: 2026-02-24T03:58:00Z
**Report Location**: docs/plans/042-global-toast-system/research-dossier.md
