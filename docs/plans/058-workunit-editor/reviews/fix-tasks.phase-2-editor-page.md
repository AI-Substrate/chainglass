# Fix Tasks: Phase 2: Editor Page — Routes, Layout, Type-Specific Editors

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Guard failed content loads before rendering editor
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx
- **Issue**: `contentResult.errors` is ignored; invalid content can flow into user-input parse path and crash.
- **Fix**: Add explicit error check after `Promise.all` and before rendering `WorkUnitEditor`.
- **Patch hint**:
  ```diff
   const [unitResult, contentResult, unitsResult] = await Promise.all([...]);
  +if (contentResult.errors.length > 0) {
  +  return <div className="flex items-center justify-center p-8 text-muted-foreground">{contentResult.errors[0]?.message ?? 'Failed to load unit content'}</div>;
  +}
  ```

### FT-002: Safe parse user-input payload in render path
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx
- **Issue**: Inline `JSON.parse(content)` can throw and hard-fail rendering.
- **Fix**: Parse through a guarded helper, render fallback/error state when payload is invalid.
- **Patch hint**:
  ```diff
  -initialConfig={JSON.parse(content)}
  +initialConfig={safeParseUserInputConfig(content)}
  ```

### FT-003: Bring domain governance artifacts up to date for Phase 2
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/registry.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md
- **Issue**: New domain and dependency topology are not reflected in registry/map/domain docs.
- **Fix**: Register `058-workunit-editor`, create domain.md with required sections (including Concepts), and add node/edges/health-summary updates in domain-map.
- **Patch hint**:
  ```diff
  +| Work Unit Editor | 058-workunit-editor | business | — | Plan 058 Phase 2 | active |
  ```

### FT-004: Add Full-TDD evidence for Phase-2 implementation
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/test/unit/... (new)
  - /Users/jordanknight/substrate/058-workunit-editor/test/integration/... (new/updated)
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/execution.log.md
- **Issue**: No phase-specific tests in diff; execution evidence is aggregate-only and not AC-mapped.
- **Fix**: Add tests for key Phase-2 behaviors, then append per-AC command/output evidence in execution log.
- **Patch hint**:
  ```diff
  +## Test Evidence
  +- AC-7: pnpm vitest test/unit/web/features/058-workunit-editor/agent-editor.test.tsx ✅
  +- AC-8: pnpm vitest test/unit/web/features/058-workunit-editor/code-unit-editor.test.tsx ✅
  ```

## Medium / Low Fixes

### FT-005: Use viewer public contract imports
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/041-file-browser/components/code-editor.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx
- **Issue**: Cross-domain imports use internal component path instead of domain barrel export.
- **Fix**: Import `CodeEditor` from `@/features/_platform/viewer` contract surface.
- **Patch hint**:
  ```diff
  -import { CodeEditor } from '@/features/_platform/viewer/components/code-editor';
  +import { CodeEditor } from '@/features/_platform/viewer';
  ```

### FT-006: Remove language-detection duplication
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/lib/language-detection.ts
- **Issue**: Local map duplicates existing utility logic, increasing drift risk.
- **Fix**: Reuse shared detection helper or extract editor-safe adapter from existing utility.
- **Patch hint**:
  ```diff
  -const EXTENSION_TO_LANGUAGE = { ... };
  -function detectLanguage(filename?: string): string { ... }
  +import { detectLanguage } from '@/src/lib/language-detection';
  ```

### FT-007: Synchronize plan domain manifest with actual changed files
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
- **Issue**: Several phase-created files are not listed in `## Domain Manifest`.
- **Fix**: Add missing file rows and classifications for all phase-created files.
- **Patch hint**:
  ```diff
  +| `apps/web/src/features/058-workunit-editor/components/metadata-panel.tsx` | `058-workunit-editor` | internal | Metadata editing panel |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
