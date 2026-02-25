# Global Toast Notification System

**Mode**: Simple

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md)
📐 Design decisions documented in [global-toast-system workshop](../041-file-browser/workshops/global-toast-system.md)

## Research Context

Research identified 6 components with ad-hoc inline feedback patterns (`useState<string>` + inline divs) that should migrate to a shared toast system. The existing `Providers` component (`apps/web/src/components/providers.tsx`) is the ideal mount point — already `'use client'`, already wraps all children. `next-themes` is already installed for dark mode support.

The `_platform/notifications` domain was extracted to own this infrastructure alongside the existing SSE event pipeline (Plans 019, 023, 027).

## Summary

Add a global toast notification system so any component can show user feedback (success, error, warning, info) with a single function call — no hook, no context, no prop drilling. Replace the workgraph inline toast and wire file browser save/refresh feedback as the first consumers.

**WHY**: Every feature reinvents user feedback with `useState` + inline banners. This wastes developer time, creates visual inconsistency, and produces hard-to-test feedback patterns. A shared toast function eliminates all of this.

## Goals

- Any component/hook can call `toast.success('msg')` with zero setup
- Toasts stack when multiple fire simultaneously
- Auto-dismiss after configurable duration (default 4s)
- Manual dismiss via close button
- Rich colour coding: green (success), red (error), amber (warning), blue (info)
- Built-in icons per toast type
- Dark mode support (follows system theme)
- File browser save/refresh shows toast feedback
- Workgraph inline toast migrated to shared system
- Testable without rendering the Toaster component

## Non-Goals

- Persistent notification centre / notification history (future)
- SSE-triggered toasts (SSE infrastructure exists but wiring to toast is future work)
- Migrating ALL inline errors (form validation errors stay inline — contextual)
- Custom toast animations or positioning beyond library defaults
- Server-side toast rendering
- Toast for agent chat errors (future migration, not this plan)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/notifications | existing | **modify** | Add toast UI contract (Toaster component + sonner dependency) |
| file-browser | existing | **modify** | Wire toast into save/refresh/conflict flows |

No new domains — `_platform/notifications` was extracted earlier today and already lists toast as a planned contract.

## Complexity

- **Score**: CS-1 (trivial)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=0 (Total P=2)
- **Confidence**: 0.95
- **Assumptions**: Sonner works with Next.js 16 + React 19 (widely adopted, no known issues)
- **Dependencies**: sonner npm package
- **Risks**: None material — library is stable, scope is small
- **Phases**: Single phase (install, wire, migrate, test)

## Acceptance Criteria

1. **AC-01**: Calling `toast.success('File saved')` from a client component renders a green toast at bottom-right with a check icon
2. **AC-02**: Calling `toast.error('Save failed')` renders a red toast with an error icon
3. **AC-03**: Calling `toast.warning('msg')` and `toast.info('msg')` render amber and blue toasts respectively
4. **AC-04**: Multiple simultaneous `toast()` calls stack visually (all visible, not replacing each other)
5. **AC-05**: Toasts auto-dismiss after ~4 seconds
6. **AC-06**: Each toast has a close button for manual dismiss
7. **AC-07**: Toasts render correctly in dark mode (follow system theme)
8. **AC-08**: File browser save success shows a success toast
9. **AC-09**: File browser save conflict shows an error toast with description
10. **AC-10**: Workgraph external change notification uses toast instead of inline banner
11. **AC-11**: Workgraph inline toast `useState` + `setTimeout` + inline `<div>` removed
12. **AC-12**: `toast()` callable from hooks and utility functions (not just components)
13. **AC-13**: Tests can verify `toast.success()` was called without rendering `<Toaster />`
14. **AC-14**: `just fft` passes (lint, format, typecheck, build, tests)

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sonner doesn't support React 19 | Very Low | High | Sonner 2.x supports React 19; verify on install |
| Toast blocks interactive elements | Low | Low | bottom-right position away from content |

**Assumptions**:
- Sonner's module-level `toast()` function works in Next.js App Router (widely confirmed)
- `next-themes` `resolvedTheme` is available in the Providers component (already used elsewhere)

## Open Questions

None — all design decisions resolved in workshop.

## Workshop Opportunities

None — workshop already completed at `docs/plans/041-file-browser/workshops/global-toast-system.md`. All key decisions (library choice, mount point, API surface, testing strategy, migration plan) are resolved.

## Testing Approach

**Full TDD with fakes**. Headless build (no browser testing needed for toast wiring — verify via function call assertions).

- Mock `sonner` in vitest: `vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), ... }) }))`
- Assert `toast.success()` called with expected message after save
- Assert `toast.error()` called with expected message on conflict
- No rendering of `<Toaster />` in tests — it's a portal, testing the call is sufficient
- Workgraph migration verified by absence of inline toast state and presence of sonner calls
