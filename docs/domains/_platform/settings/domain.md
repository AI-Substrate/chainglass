# Domain: Settings (`_platform/settings`)

**Type**: infrastructure
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/settings.md)
**Created By**: Plan 047 — USDK Phase 5
**Parent**: `_platform`

---

## Purpose

The settings domain provides a user-facing settings page that auto-generates controls from SDK setting contributions. Domains publish `SDKSetting` definitions to the SDK settings store; this domain renders them as a searchable, section-grouped settings UI. First dogfood of the USDK publish/consume pattern.

**This is NOT a configuration system** — it's a UI surface for SDK settings. The underlying data lives in `_platform/sdk` (SettingsStore + WorkspacePreferences).

---

## Contracts (Public API)

| Contract | Type | Description |
|----------|------|-------------|
| Settings Page | route | `/workspaces/[slug]/settings` — workspace-scoped settings UI |
| `sdk.openSettings` | SDK command | Navigates to settings page from palette/shortcut |

---

## Composition (Internal)

| Component | Type | Description |
|-----------|------|-------------|
| SettingsPage | client component | Groups settings by section, renders controls |
| SettingControl | client component | Generic control renderer (toggle/select/text/number) |
| SettingsSearch | client component | Filter settings by label/description |

---

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/sdk` | `ISDKSettings.list()`, `useSDKSetting()`, `useSDK()` | Read setting definitions, reactive values |
| shadcn/ui (npm) | Switch, Select, Input, Label | UI control components |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| (none yet) | — | Settings page is a leaf consumer |

---

## Source Location

```
apps/web/app/(dashboard)/workspaces/[slug]/settings/page.tsx   # Route entry
apps/web/src/features/settings/components/settings-page.tsx    # Main page component
apps/web/src/features/settings/components/setting-control.tsx  # Generic control renderer
apps/web/src/features/settings/components/settings-search.tsx  # Search/filter
```

---

## History

| Plan | Change | Date |
|------|--------|------|
| 047-usdk Phase 5 | Domain created — settings page, setting controls, search, openSettings command | 2026-02-25 |
