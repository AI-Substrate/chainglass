# Fix Tasks: Phase 4: L3 Business Domains & Navigation Polish

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix broken domain/registry links in `file-browser.md`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/c4/components/file-browser.md
- **Issue**: Cross-reference and footer links use `../../../domains/...` from `docs/c4/components/`, which resolves outside `docs/`.
- **Fix**: Replace all business-domain references in this file to `../../domains/...`.
- **Patch hint**:
  ```diff
  - > **Domain Definition**: [file-browser/domain.md](../../../domains/file-browser/domain.md)
  + > **Domain Definition**: [file-browser/domain.md](../../domains/file-browser/domain.md)
  - > **Registry**: [registry.md](../../../domains/registry.md) — Row: File Browser
  + > **Registry**: [registry.md](../../domains/registry.md) — Row: File Browser
  - - **Domain**: [file-browser/domain.md](../../../domains/file-browser/domain.md)
  + - **Domain**: [file-browser/domain.md](../../domains/file-browser/domain.md)
  ```

### FT-002: Fix broken domain/registry links in `workflow-ui.md`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workflow-ui.md
- **Issue**: Cross-reference and footer links use `../../../domains/...` from `docs/c4/components/`, which resolves outside `docs/`.
- **Fix**: Replace all business-domain references in this file to `../../domains/...`.
- **Patch hint**:
  ```diff
  - > **Domain Definition**: [workflow-ui/domain.md](../../../domains/workflow-ui/domain.md)
  + > **Domain Definition**: [workflow-ui/domain.md](../../domains/workflow-ui/domain.md)
  - > **Registry**: [registry.md](../../../domains/registry.md) — Row: Workflow UI
  + > **Registry**: [registry.md](../../domains/registry.md) — Row: Workflow UI
  - - **Domain**: [workflow-ui/domain.md](../../../domains/workflow-ui/domain.md)
  + - **Domain**: [workflow-ui/domain.md](../../domains/workflow-ui/domain.md)
  ```

### FT-003: Fix broken domain/registry links in `workunit-editor.md`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md
- **Issue**: Cross-reference and footer links use `../../../domains/...` from `docs/c4/components/`, which resolves outside `docs/`.
- **Fix**: Replace all business-domain references in this file to `../../domains/...`.
- **Patch hint**:
  ```diff
  - > **Domain Definition**: [058-workunit-editor/domain.md](../../../domains/058-workunit-editor/domain.md)
  + > **Domain Definition**: [058-workunit-editor/domain.md](../../domains/058-workunit-editor/domain.md)
  - > **Registry**: [registry.md](../../../domains/registry.md) — Row: Work Unit Editor
  + > **Registry**: [registry.md](../../domains/registry.md) — Row: Work Unit Editor
  - - **Domain**: [058-workunit-editor/domain.md](../../../domains/058-workunit-editor/domain.md)
  + - **Domain**: [058-workunit-editor/domain.md](../../domains/058-workunit-editor/domain.md)
  ```

## Medium / Low Fixes

### FT-004: Reconcile viewer contract naming in workunit-editor external dependencies
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/c4/components/workunit-editor.md, /Users/jordanknight/substrate/063-c4-models/docs/domains/_platform/viewer/domain.md
- **Issue**: Work Unit Editor dependency prose references `_platform/viewer (CodeEditor)` but viewer domain Contracts table does not expose `CodeEditor`.
- **Fix**: Either (A) adjust workunit-editor dependency wording to documented viewer contracts, or (B) add `CodeEditor` to viewer public contract documentation if intended.
- **Patch hint**:
  ```diff
  - Depends on: _platform/positional-graph (IWorkUnitService), _platform/viewer (CodeEditor), _platform/workspace-url (workspaceHref).
  + Depends on: _platform/positional-graph (IWorkUnitService), _platform/viewer (documented viewer contracts), _platform/workspace-url (workspaceHref).
  ```

### FT-005: Sync workflow-ui dependency table with domain map
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/domains/workflow-ui/domain.md
- **Issue**: Dependencies table omits `_platform/state` / `useGlobalState`, while domain-map includes it.
- **Fix**: Add `_platform/state` dependency entry with consumed contract details.
- **Patch hint**:
  ```diff
   | `_platform/sdk` | `IUSDK` | Commands and keybindings |
  +| `_platform/state` | `useGlobalState` | Subscribe to execution/state updates |
   | `@chainglass/shared` | `IYamlParser`, Result types | Foundation utilities |
  ```

### FT-006: Improve manual evidence specificity for AC-06
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/063-c4-models/docs/plans/063-c4-models/tasks/phase-4-l3-business-domains-and-navigation/execution.log.md
- **Issue**: AC-06 marked PASS without explicit command/output proving cross-reference link target resolution for all new business L3 files.
- **Fix**: Add a concrete verification command and captured output in execution log.
- **Patch hint**:
  ```diff
  + **Evidence (link resolution)**:
  + - `python scripts/check-md-links.py docs/c4/components/file-browser.md docs/c4/components/workflow-ui.md docs/c4/components/workunit-editor.md`
  + - Output: `0 broken links`
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
