# Fix Tasks: Phase 2 — SDK Provider & Bootstrap

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix stale `persistFn` ref — settings persistence silently fails
- **Severity**: HIGH
- **Finding**: F001
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-provider.tsx
- **Issue**: `persistFn` is stored in `useRef` but read into the context value at render-time. When `SDKWorkspaceConnector` calls `setPersistFn(fn)`, the ref mutates but SDKProvider doesn't re-render. All consumers see `persistFn: null` forever, so `useSDKSetting` `setValue` silently skips persistence.
- **Fix**: Replace `useRef` with `useState` for `persistFn`. This triggers a re-render when set, propagating the function through context. The one-time re-render on workspace mount is negligible.
- **Patch hint**:
  ```diff
  - const persistFnRef = useRef<((sdkSettings: Record<string, unknown>) => Promise<void>) | null>(
  -   null
  - );
  + const [persistFn, setPersistFnState] = useState<
  +   ((sdkSettings: Record<string, unknown>) => Promise<void>) | null
  + >(null);

  - const setPersistFn = useCallback(
  -   (fn: ((sdkSettings: Record<string, unknown>) => Promise<void>) | null) => {
  -     persistFnRef.current = fn;
  -   },
  -   []
  - );
  + const setPersistFn = useCallback(
  +   (fn: ((sdkSettings: Record<string, unknown>) => Promise<void>) | null) => {
  +     setPersistFnState(() => fn);
  +   },
  +   []
  + );

    const contextValue: SDKContextValue = {
      sdk,
      setWorkspaceContext,
      clearWorkspaceContext,
  -   persistFn: persistFnRef.current,
  +   persistFn,
      setPersistFn,
    };
  ```
- **Note**: Use `setPersistFnState(() => fn)` (functional updater) because `fn` is itself a function — passing it directly to `setState` would be interpreted as a state updater.

## Medium Fixes

### FT-002: Fix lib/ → app/ layer inversion in SDKWorkspaceConnector
- **Severity**: MEDIUM
- **Finding**: F004
- **File(s)**:
  - /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-workspace-connector.tsx
  - /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
- **Issue**: `sdk-workspace-connector.tsx` (in `src/lib/`) imports `updateSDKSettings` from `app/actions/`. This inverts the expected dependency direction — utility layer should not depend on framework/routing layer.
- **Fix**: Accept a `persistSettings` callback prop on `SDKWorkspaceConnector`. The workspace layout (which IS in `app/`) imports the server action and passes it as a prop.
- **Patch hint** (sdk-workspace-connector.tsx):
  ```diff
  - import { updateSDKSettings } from '../../../app/actions/sdk-settings-actions';

    interface SDKWorkspaceConnectorProps {
      slug: string;
      sdkSettings: Record<string, unknown>;
  +   persistSettings: (slug: string, record: Record<string, unknown>) => Promise<{ success: boolean }>;
    }

  - export function SDKWorkspaceConnector({ slug, sdkSettings }: SDKWorkspaceConnectorProps) {
  + export function SDKWorkspaceConnector({ slug, sdkSettings, persistSettings }: SDKWorkspaceConnectorProps) {
      ...
  -     setPersistFn((record: Record<string, unknown>) =>
  -       updateSDKSettings(slug, record).then(() => {})
  -     );
  +     setPersistFn((record: Record<string, unknown>) =>
  +       persistSettings(slug, record).then(() => {})
  +     );
  ```
- **Patch hint** (layout.tsx):
  ```diff
  + import { updateSDKSettings } from '../../../../app/actions/sdk-settings-actions';
    ...
  - <SDKWorkspaceConnector slug={slug} sdkSettings={sdkSettings} />
  + <SDKWorkspaceConnector slug={slug} sdkSettings={sdkSettings} persistSettings={updateSDKSettings} />
  ```
- **Note**: Wait — layout.tsx is a Server Component and already imports from `app/actions/` — the import is fine there since `app/` layout importing `app/` action is same-layer. BUT passing a server action as a prop to a client component requires that the function is a real server action (which it is — it has `'use server'`). This should work correctly with Next.js Server Actions.

### FT-003: Add lightweight useSDKSetting hook test
- **Severity**: MEDIUM
- **Finding**: F002
- **File(s)**: test/unit/web/lib/sdk/use-sdk-setting.test.tsx (create)
- **Issue**: AC-19 (useSDKSetting re-render on change) has zero test coverage. This is a React-specific concern that cannot be verified through SettingsStore contract tests alone.
- **Fix**: Add a ~30-line renderHook test using FakeUSDK:
  1. Create provider wrapper with SDKProvider
  2. Contribute a test setting
  3. renderHook useSDKSetting
  4. Assert initial value
  5. Call set() on the store
  6. Assert hook returns updated value (re-render happened)
- **Note**: This is "Lightweight" tier — one test file with 2-3 test cases is sufficient.

### FT-004: Update domain.md for Phase 2
- **Severity**: MEDIUM
- **Finding**: F005, F006, F009
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/_platform/sdk/domain.md
- **Issue**: § History, § Source Location, and § Composition don't reflect Phase 2 deliverables.
- **Fix**:
  - § History: Add `| 047-usdk Phase 2 | SDKProvider, bootstrapSDK, React hooks (useSDK, useSDKSetting, useSDKContext), SDKWorkspaceConnector, settings server action | 2026-02-24 |`
  - § Source Location: Add `sdk-bootstrap.ts`, `sdk-provider.tsx`, `use-sdk-setting.ts`, `use-sdk-context.ts`, `sdk-workspace-connector.tsx`
  - § Composition: Add `bootstrapSDK` (factory), `useSDKSetting` (hook), `useSDKContext` (hook), `SDKWorkspaceConnector` (React component)

### FT-005: Resolve _platform/settings domain status
- **Severity**: MEDIUM
- **Finding**: F003
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/registry.md
- **Issue**: `_platform/settings` is referenced in the plan manifest as owning `sdk-settings-actions.ts`, but no registry entry, domain.md, or docs/domains/_platform/settings/ directory exists.
- **Fix**: Either:
  - (a) Add `_platform/settings` to registry.md now (with status "active") and create a minimal domain.md — consistent with the plan's target domains
  - (b) Reclassify `sdk-settings-actions.ts` as `_platform/sdk` in the plan manifest and defer _platform/settings domain creation to Phase 5 (settings page)
  - Recommendation: Option (b) — the settings domain is better formalized when its main deliverable (settings page) is built.

## Low / Optional Fixes

### FT-006: Stabilize sdkSettings prop reference
- **Severity**: LOW
- **Finding**: F007
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-workspace-connector.tsx
- **Issue**: `sdkSettings` prop is a fresh object on every workspace layout render → effect fires unnecessarily.
- **Fix**: Use `JSON.stringify(sdkSettings)` as a stable dependency key:
  ```diff
  + const settingsKey = JSON.stringify(sdkSettings);
    useEffect(() => {
      setWorkspaceContext(slug, sdkSettings);
      ...
  - }, [slug, sdkSettings, setWorkspaceContext, clearWorkspaceContext, setPersistFn]);
  + }, [slug, settingsKey, setWorkspaceContext, clearWorkspaceContext, setPersistFn]);
  ```

### FT-007: Document manual verification in execution log
- **Severity**: LOW
- **Finding**: F010
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/047-usdk/tasks/phase-2-sdk-provider-bootstrap/execution.log.md
- **Issue**: Execution log only shows "tests pass" — no manual verification evidence.
- **Fix**: After fixing F001, add a "Manual Verification" section documenting the settings roundtrip test.

## Re-Review Checklist

- [ ] FT-001: persistFn changed from useRef to useState
- [ ] FT-002: SDKWorkspaceConnector no longer imports from app/actions/
- [ ] FT-003: useSDKSetting.test.tsx exists with at least 2 test cases
- [ ] FT-004: domain.md updated with Phase 2 history, source, composition
- [ ] FT-005: _platform/settings domain status resolved (registered or reclassified)
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
