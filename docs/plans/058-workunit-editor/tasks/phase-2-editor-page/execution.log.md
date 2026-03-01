# Phase 2: Editor Page — Execution Log

**Started**: 2026-02-28
**Status**: Complete

---

## T001: Extract CodeEditor to _platform/viewer
- Moved `code-editor.tsx` to `apps/web/src/features/_platform/viewer/components/code-editor.tsx`
- Created barrel export at `_platform/viewer/index.ts`
- Replaced original with re-export for backward compatibility
- `file-viewer-panel.tsx` continues to work via re-export (lazy import path unchanged)

## T002: Install shell language support
- `@codemirror/lang-shell` doesn't exist in npm (finding 06 fallback triggered)
- Installed `@codemirror/legacy-modes@6.5.2` which includes `mode/shell`
- Added `bash`, `shell`, `sh` entries to `LANGUAGE_EXTENSIONS` map using `StreamLanguage.define(shell)`

## T003: Create server actions
- Created `apps/web/app/actions/workunit-actions.ts` with 8 server actions
- Unified save path: `saveUnitContent(slug, type, content)` routes internally
- Agent → `setPrompt()`, Code → `setScript()`, User-input → `update(type_config)`
- Follows workflow-actions.ts DI pattern exactly
- Exhaustive type checks on unit type (TypeScript `never` pattern)

## T004: Add sidebar navigation
- Added "Work Units" entry to `WORKSPACE_NAV_ITEMS` in `navigation-utils.ts`
- Position: between Agents and Workflows (per clarification Q8)
- Icon: `Puzzle` from lucide-react

## T005: Create list page
- Server Component at `/workspaces/[slug]/work-units/page.tsx`
- Calls `listUnits()`, renders `UnitList` client component
- Units grouped by type (agent/code/user-input) with colored badges
- "Create Unit" button opens creation modal
- Empty state with helpful message

## T006: Create editor page shell
- Server Component at `/workspaces/[slug]/work-units/[unitSlug]/page.tsx`
- Custom `WorkUnitEditorLayout` with 3 panels (left catalog, main editor, right metadata)
- Loads unit data + content + all units in parallel via `Promise.all()`
- Type-dispatched editor rendering via `WorkUnitEditor` client component

## T007: Build agent editor + useAutoSave hook
- Created `useAutoSave` hook in `_platform/hooks/use-auto-save.ts`
  - Returns `{ status, error, trigger, flush }`
  - Status transitions: idle → saving → saved (auto-clear 2s) | error
  - Debounce configurable, request deduplication, cleanup on unmount
- Agent editor: CodeMirror with `language="markdown"`, 500ms auto-save
- `SaveIndicator` component: persistent inline error banner (not toast)

## T008: Build code editor
- CodeMirror with language detection from script filename extension
- Maps: `.sh`→bash, `.py`→python, `.js`→javascript, `.ts`→typescript
- Reuses `useAutoSave` and `SaveIndicator` from T007
- Shows detected language badge in header

## T009: Build user-input editor
- Form builder: question_type dropdown, prompt textarea, options list, default value
- Conditional sections: options only shown for single/multi types
- Options seeded with 2 items when switching to choice types
- Min 2 options enforced (remove button hidden when at 2)
- Confirm type gets yes/no default selector
- All changes auto-save via unified `saveUnitContent` → `update(type_config)`

## T010: Unit creation flow
- Modal with type picker (3 cards: Agent, Code, User Input)
- Slug input with kebab-case validation (`/^[a-z][a-z0-9-]*$/`)
- Error display for duplicate slugs
- On success: navigates to editor page, triggers `router.refresh()`

## T011: Metadata editing panel
- Right panel with type badge, slug (read-only), version input, description textarea
- Uses `useAutoSave` with `delay: 0` (immediate save)
- Saves via `updateUnit()` server action

## Discoveries
- `@codemirror/lang-shell` doesn't exist in npm; used `@codemirror/legacy-modes` + `StreamLanguage` instead
- `code-editor.test.tsx` doesn't exist (DYK #4 was a false alarm — no test to move)
- Next.js build enforces exhaustive type checks via `never` type narrowing
- Import paths from `app/` route pages to `app/actions/` need exact `../` counting (route groups don't add nesting)

## Evidence
- `just fft`: 333 test files, 4720 tests passing, zero regressions
- All lint, format, typecheck, build clean
