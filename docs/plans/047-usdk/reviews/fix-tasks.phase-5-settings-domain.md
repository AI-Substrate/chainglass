# Fix Tasks: Phase 5 — Settings Domain & Page

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Guard number input against empty/NaN/out-of-range values
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/settings/components/setting-control.tsx`
- **Issue**: Number input `onChange` calls `Number(e.target.value)`. Empty input → `Number('')` → `0` → passed to `sdk.settings.set()` → `schema.parse(0)` → throws `ZodError` if 0 violates a min constraint (e.g., `z.number().min(8)`). Unhandled error crashes the component.
- **Fix**: Guard the conversion and wrap in try/catch:
- **Patch hint**:
  ```diff
       case 'number':
         return (
           <Input
             type="number"
             value={String(value ?? '')}
  -          onChange={(e) => setValue(Number(e.target.value))}
  +          onChange={(e) => {
  +            const raw = e.target.value;
  +            if (raw === '') return;
  +            const num = Number(raw);
  +            if (!Number.isNaN(num)) {
  +              try { setValue(num); } catch { /* validation — value out of range */ }
  +            }
  +          }}
             className="w-24"
             aria-label={setting.label}
           />
         );
  ```

### FT-002: Add `_platform/settings` node to domain-map mermaid diagram
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
- **Issue**: `_platform/settings` domain is registered in `registry.md` and has `domain.md`, but is completely absent from the architecture diagram — no node, no edges.
- **Fix**: Add a settings node to the mermaid flowchart, after the sdk node:
- **Patch hint**:
  ```diff
       sdk["🧩 _platform/sdk<br/>IUSDK · ICommandRegistry<br/>ISDKSettings · IContextKeyService<br/>SDKCommand · SDKSetting"]:::infra
  +    settings["⚙️ _platform/settings<br/>Settings Page<br/>SettingControl · SettingsSearch"]:::infra
  ```

### FT-003: Add settings → sdk dependency edge to domain-map
- **Severity**: HIGH
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
- **Issue**: No edge shows `_platform/settings` consuming `_platform/sdk` contracts.
- **Fix**: Add edge after the SDK consumption edges:
- **Patch hint**:
  ```diff
       panels -.->|"ICommandRegistry<br/>(hosts palette)"| sdk
  +    settings -->|"ISDKSettings<br/>useSDKSetting<br/>useSDK"| sdk
  ```

## Medium Fixes

### FT-004: Add settings row to health summary table
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
- **Issue**: Domain Health Summary table has no row for `_platform/settings`. SDK row still says "settings (future)".
- **Fix**: Add row and update SDK row:
- **Patch hint**:
  ```diff
   | _platform/sdk | IUSDK, ICommandRegistry, ISDKSettings, IContextKeyService, SDKCommand, SDKSetting, FakeUSDK | file-browser, events, panel-layout, settings (future) | — | — | ✅ |
  +| _platform/settings | Settings Page, sdk.openSettings | — | ISDKSettings, useSDKSetting, useSDK | sdk | ✅ |
  ```
  Also update the SDK row to change `settings (future)` → `settings`.

### FT-005: Replace window.location.href with SPA navigation
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/sdk-bootstrap.ts`
- **Issue**: `sdk.openSettings` uses `window.location.href` for navigation, causing full page reload that discards React state and SDK in-memory data.
- **Fix**: Dispatch a custom event that a React component listens to, or accept a navigate callback. Example:
- **Patch hint**:
  ```diff
       handler: async () => {
         const match = window.location.pathname.match(/\/workspaces\/([^/]+)/);
         if (match) {
  -        window.location.href = `/workspaces/${match[1]}/settings`;
  +        window.dispatchEvent(new CustomEvent('sdk:navigate', {
  +          detail: { path: `/workspaces/${match[1]}/settings` },
  +        }));
         } else {
           toast.info('Open a workspace first');
         }
       },
  ```
  Then listen for `sdk:navigate` events in `SDKProvider` or `KeyboardShortcutListener` and call `router.push()`.

### FT-006: Scope debounce timer to provider lifecycle
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/lib/sdk/use-sdk-setting.ts`
- **Issue**: Module-level `persistTimer` is shared across all hook instances and never cleaned up. If workspace context is cleared while a timer is pending, the callback fires with stale `persistFnRef.current` (null), silently dropping the last change.
- **Fix**: Move the timer to a ref in the hook or expose a `flush()` method on the SDK instance. Add cleanup via `useEffect` return.

### FT-007: Add null guard on description in filterSettings
- **Severity**: MEDIUM
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/settings/components/settings-page.tsx`
- **Issue**: `s.description.toLowerCase()` crashes if `description` is undefined at runtime.
- **Fix**: Add optional chaining:
- **Patch hint**:
  ```diff
   return settings.filter(
  -  (s) => s.label.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
  +  (s) => s.label.toLowerCase().includes(lower) || (s.description?.toLowerCase().includes(lower) ?? false)
   );
  ```

## Low Fixes

### FT-008: Prefix or remove unused slug prop
- **Severity**: LOW
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/features/settings/components/settings-page.tsx`
- **Issue**: `slug` prop is accepted but never used in the component body.
- **Fix**: Prefix with `_slug` to signal intentional non-use, or add a comment explaining it's reserved for future workspace-scoped settings.

### FT-009: Narrow isActive check in sidebar
- **Severity**: LOW
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/src/components/dashboard-sidebar.tsx`
- **Issue**: `pathname.endsWith('/settings')` matches any path ending in `/settings`.
- **Fix**: Use a more specific check.

## Re-Review Checklist

- [ ] FT-001: Number input guarded against empty/NaN
- [ ] FT-002: Settings node in domain-map diagram
- [ ] FT-003: Settings → sdk edge in domain-map diagram
- [ ] FT-004: Settings row in health summary table
- [ ] FT-005: SPA navigation for openSettings command
- [ ] FT-006: Debounce timer scoped to provider lifecycle
- [ ] FT-007: Description null guard in filterSettings
- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
