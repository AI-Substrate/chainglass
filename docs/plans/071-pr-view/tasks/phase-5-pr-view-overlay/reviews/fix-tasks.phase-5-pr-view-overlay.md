# Fix Tasks: Phase 5: PR View Overlay

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add lightweight validation for the Phase 5 overlay behaviors
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-5-pr-view-overlay/execution.log.md, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/
- **Issue**: Phase 5 added 14 overlay/UI source changes, but the current evidence is still aggregate pass counts plus Phase 4 data-layer tests. There is no direct automated or concrete manual proof for the new overlay interactions.
- **Fix**: Add focused lightweight UI validation for the critical Phase 5 flows (open/toggle, mutual exclusion, Escape close, click-to-scroll, viewed-collapse/dim, expand/collapse all, worktree gating). If some of this remains manual, record exact steps and observed outcomes in `execution.log.md` instead of summary claims.
- **Patch hint**:
  ```diff
  + // test/unit/web/features/071-pr-view/pr-view-overlay.test.tsx
  + it('closes other overlays before opening PR View', async () => {
  +   // Arrange PRViewOverlayProvider + a dispatched overlay:close-all listener
  +   // Act: dispatch pr-view:toggle
  +   // Assert: PR view opens and competing overlays receive the close event
  + });
  +
  + it('collapses a file when it is marked viewed', async () => {
  +   // Render panel with fixture data, toggle the checkbox, assert dimmed row + collapsed section
  + });
  +
  + ## Execution evidence
  + - Command: pnpm exec vitest run test/unit/web/features/071-pr-view/pr-view-overlay.test.tsx
  + - Observed: 7 passed, 0 failed
  + - Manual: Escape closes the overlay while focus is inside the diff area
  ```

### FT-002: Move SDK domain-registration composition out of the `_platform/sdk` source tree
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-domain-registrations.ts, /Users/jordanknight/substrate/071-pr-view/apps/web/src/lib/sdk/sdk-provider.tsx
- **Issue**: `sdk-domain-registrations.ts` still lives under the `_platform/sdk` path while importing `file-browser`, `file-notes`, and `pr-view` business-domain registrations, so infrastructure bootstrap still depends on business domains.
- **Fix**: Relocate the composition function to an app-level composition root (outside the SDK domain path) and have `sdk-provider.tsx` import it from there. If the file truly belongs at app composition, reflect that in the plan/domain docs as well.
- **Patch hint**:
  ```diff
  - import { registerAllDomains } from './sdk-domain-registrations';
  + import { registerAllDomains } from '@/app-composition/sdk-domain-registrations';

  - // apps/web/src/lib/sdk/sdk-domain-registrations.ts
  + // apps/web/src/app-composition/sdk-domain-registrations.ts
    import { registerFileBrowserSDK } from '@/features/041-file-browser/sdk/register';
    import { registerFileNotesSDK } from '@/features/071-file-notes/sdk/register';
    import { registerPRViewSDK } from '@/features/071-pr-view/sdk/register';
  ```

## Medium / Low Fixes

### FT-003: Ship the Phase 5 placeholder Working/Branch toggle described by T004
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-header.tsx
- **Issue**: The header only renders a mode badge, but Phase 5 Task T004 explicitly called for a visible disabled Working/Branch toggle placeholder.
- **Fix**: Replace the badge with a two-option control that makes the future Branch mode discoverable while staying disabled / labeled as coming in Phase 6.
- **Patch hint**:
  ```diff
  - <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
  -   {mode === 'working' ? 'Working' : 'Branch'}
  - </span>
  + <div className="inline-flex rounded border text-[10px] overflow-hidden">
  +   <span className="px-2 py-0.5 bg-accent text-foreground">Working</span>
  +   <span className="px-2 py-0.5 text-muted-foreground opacity-60" title="Coming in Phase 6">
  +     Branch
  +   </span>
  + </div>
  ```

### FT-004: Consume `DiffViewer` through the viewer public barrel
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-diff-section.tsx
- **Issue**: `pr-view` currently reaches into `@/components/viewers/diff-viewer` directly instead of using the viewer domain's public barrel.
- **Fix**: Change the lazy import to `@/components/viewers` so the dependency stays on the documented public surface.
- **Patch hint**:
  ```diff
  - const DiffViewer = lazy(() =>
  -   import('@/components/viewers/diff-viewer').then((m) => ({ default: m.DiffViewer }))
  - );
  + const DiffViewer = lazy(() =>
  +   import('@/components/viewers').then((m) => ({ default: m.DiffViewer }))
  + );
  ```

### FT-005: Synchronize the Phase 5 domain artifacts with the shipped code
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/sdk/domain.md
- **Issue**: The Domain Manifest omits two changed files, the domain map omits the Phase 5 `pr-view` UI/SDK surface and new provider edges, and the SDK domain doc still claims no domain dependencies.
- **Fix**: Add the missing manifest rows, update the `prView` node/health summary and labeled edges, and either move `sdk-domain-registrations.ts` or update the SDK doc's source/dependency/history sections to reflect the chosen arrangement.
- **Patch hint**:
  ```diff
  + | `apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts` | pr-view | internal | Data hook for fetch/cache/reviewed-state/collapsed-state management |
  + | `apps/web/src/lib/sdk/sdk-domain-registrations.ts` | app-composition | cross-domain | App-level SDK composition wiring |

  - prView["🔍 pr-view<br/>PRViewFile · PRViewData<br/>ComparisonMode · PRViewFileState<br/>aggregatePRViewData · getAllDiffs<br/>gitBranchService · perFileDiffStats<br/>contentHash · prViewState<br/>GET/POST/DELETE<br/>/api/pr-view"]
  + prView["🔍 pr-view<br/>PRViewFile · PRViewData<br/>ComparisonMode · PRViewFileState<br/>PRViewOverlayProvider · usePRViewOverlay<br/>usePRViewData · registerPRViewSDK<br/>aggregatePRViewData · getAllDiffs<br/>GET/POST/DELETE<br/>/api/pr-view"]
  + prView -->|"DiffViewer"| viewer
  + prView -->|"overlay anchor"| panels
  + prView -->|"registerPRViewSDK()"| sdk
  ```

### FT-006: Clear the phase-scoped Biome failure
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx
- **Issue**: `pnpm exec biome check ...` fails on the wrapper file, so the phase is not actually clean for the claimed quality gate.
- **Fix**: Run Biome on the Phase 5 file set (or apply the equivalent formatting) before committing.
- **Patch hint**:
  ```diff
  - class PRViewOverlayErrorBoundary extends Component<
  -   { children: ReactNode },
  -   { hasError: boolean }
  - > {
  + class PRViewOverlayErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {

  - export function PRViewOverlayWrapper({
  -   children,
  -   defaultWorktreePath,
  - }: PRViewOverlayWrapperProps) {
  + export function PRViewOverlayWrapper({ children, defaultWorktreePath }: PRViewOverlayWrapperProps) {
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
