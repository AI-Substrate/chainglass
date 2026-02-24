# Global Toast System Implementation Plan 222

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [global-toast-system-spec.md](./global-toast-system-spec.md)
**Status**: COMPLETE

## Summary

Install sonner as the global toast library, create a theme-aware `<Toaster />` wrapper mounted in the Providers component, wire toast feedback into the file browser save/refresh flows, and migrate the workgraph inline toast pattern. After this, any component calls `import { toast } from 'sonner'` and gets stackable, coloured, icon-rich notifications with zero boilerplate.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/notifications | existing | modify | Add toast UI contract (Toaster wrapper, sonner dep) |
| file-browser | existing | modify | Wire toast into save/refresh/conflict flows |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/components/ui/toaster.tsx` | _platform/notifications | contract | Theme-aware Toaster wrapper — public component |
| `apps/web/src/components/providers.tsx` | _platform/notifications | internal | Mount point for Toaster |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Wire toast into save/refresh |
| `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` | (workgraph-ui) | internal | Migrate inline toast → sonner |
| `docs/domains/_platform/notifications/domain.md` | _platform/notifications | contract | Update source location table |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | `providers.tsx` is already `'use client'` with QueryClient + NuqsAdapter — ideal mount point for `<Toaster />` | Add as sibling inside Providers |
| 02 | High | Workgraph detail uses `useState<string\|null>` + `setTimeout` + inline `<div>` — 3 patterns to remove | Replace with `toast.info()` import |
| 03 | Medium | `next-themes` ThemeProvider is in root layout above Providers — sonner gets theme context for free | Use `useTheme()` in Toaster wrapper |
| 04 | Low | File browser `handleSave` currently has no user feedback on success/conflict | Add `toast.success()` / `toast.error()` |

## Implementation

**Objective**: Global toast callable from anywhere, first consumers wired, workgraph migrated.
**Testing Approach**: Full TDD with fakes. Mock sonner in vitest, assert `toast.success()`/`toast.error()` calls. Headless — no browser testing needed.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Install sonner | _platform/notifications | `apps/web/package.json` | `import { toast } from 'sonner'` resolves | CS-1 |
| [ ] | T002 | Create theme-aware Toaster wrapper | _platform/notifications | `apps/web/src/components/ui/toaster.tsx` | Component renders `<Toaster />` with theme from `useTheme()`, position bottom-right, richColors, closeButton | Finding 03 |
| [ ] | T003 | Mount Toaster in Providers | _platform/notifications | `apps/web/src/components/providers.tsx` | `<Toaster />` rendered inside Providers alongside QueryClient + NuqsAdapter. Inline comment: must be inside ThemeProvider for dark mode. | Finding 01, DYK-042-04 |
| [ ] | T004 | Wire toast into file browser save | file-browser | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Save success → `toast.promise()` for loading→success→error flow. Conflict → `toast.error('Save conflict', { description })` + keep existing conflictError banner. Refresh → `toast.info()` | Finding 04, AC-08, AC-09, DYK-042-01, DYK-042-03 |
| [ ] | T005 | Migrate workgraph inline toast to sonner | (workgraph-ui) | `apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx` | Remove `toast` state (line 40), `setTimeout`, inline toast `<div>`. PRESERVE `error` state (line 39) — different concern. Replace with `toast.info('Graph updated from external change')` | Finding 02, AC-10, AC-11, DYK-042-02 |
| [ ] | T006 | Add tests for toast integration | file-browser | `test/unit/web/features/042-global-toast/toast-integration.test.ts` | Tests verify `toast.success()` called on save, `toast.error()` on conflict, sonner mock pattern documented | AC-13 |
| [ ] | T007 | Update notifications domain doc | _platform/notifications | `docs/domains/_platform/notifications/domain.md` | Source location table includes toaster.tsx, sonner listed as dependency. Add gotcha: toast() is client-only, silent no-op on server. | DYK-042-05 |
| [ ] | T008 | Verify `just fft` passes | — | — | Lint, format, typecheck, build, all tests green | AC-14 |

### Acceptance Criteria

- [ ] AC-01: `toast.success('File saved')` renders green toast at bottom-right with check icon
- [ ] AC-02: `toast.error('Save failed')` renders red toast with error icon
- [ ] AC-03: `toast.warning()` and `toast.info()` render amber and blue toasts
- [ ] AC-04: Multiple `toast()` calls stack visually
- [ ] AC-05: Toasts auto-dismiss after ~4 seconds
- [ ] AC-06: Each toast has close button
- [ ] AC-07: Toasts render correctly in dark mode
- [ ] AC-08: File browser save success shows success toast
- [ ] AC-09: File browser save conflict shows error toast with description
- [ ] AC-10: Workgraph external change uses toast instead of inline banner
- [ ] AC-11: Workgraph inline toast useState + setTimeout + div removed
- [ ] AC-12: `toast()` callable from hooks and utility functions
- [ ] AC-13: Tests verify toast calls without rendering Toaster
- [ ] AC-14: `just fft` passes

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sonner incompatible with React 19 | Very Low | High | Verify on install; sonner 2.x supports React 19 |
| Toast z-index conflicts with sidebar/modals | Low | Low | Sonner uses high z-index by default; test visually |

## Change Footnotes Ledger

| Footnote | Phase | Date | Description |
|----------|-------|------|-------------|
| *(empty — populated during implementation)* | | | |

## Deviation Ledger

| ID | Phase | Deviation | Justification |
|----|-------|-----------|---------------|
| DEV-001 | Simple | vi.mock('sonner') in tests | Sonner uses module-level event emitter + DOM portal that doesn't work in jsdom. Same pattern as CodeMirror mock. 3rd-party library, not our code. |
