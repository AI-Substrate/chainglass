# Domain: Themes

**Slug**: _platform/themes
**Type**: infrastructure
**Created**: 2026-03-09
**Created By**: Plan 073 — File Type Icons
**Status**: active

## Purpose

Visual identity infrastructure for icon themes. Provides a manifest-driven icon resolver that maps filenames and folder names to icon assets using the VSCode icon theme manifest format. Designed to grow into color themes, editor themes, and UI density settings in future plans.

## Boundary

### Owns
- Icon theme manifest parsing — reads VSCode-format icon theme manifests (JSON with `fileExtensions`, `fileNames`, `folderNames`, `languageIds`, `iconDefinitions`)
- Icon resolution logic — `resolveFileIcon(filename, manifest, theme?)` and `resolveFolderIcon(folderName, expanded, manifest, theme?)`
- Icon React components — `<FileIcon>` and `<FolderIcon>` for rendering themed icons
- Icon theme SDK setting — `themes.iconTheme` select setting for choosing active theme
- Icon asset management — build-time curation, optimization, and deployment of SVG icon assets
- Theme registration — constant registry of available icon themes

### Does NOT Own
- Syntax highlighting themes (Shiki dual themes, CodeMirror themes) — owned by `_platform/viewer`
- Color themes / dark-light mode toggle — owned by `next-themes` integration in root layout
- Editor appearance settings (fontSize, wordWrap, tabSize) — owned by `file-browser` SDK contribution
- File type detection for rendering (`detectLanguage`, `detectContentType`) — owned by `_platform/viewer`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `resolveFileIcon` | Function | file-browser, _platform/panel-layout | `(filename, manifest, theme?) → IconResolution` — resolves filename to icon via fileNames → fileExtensions (longest match) → languageIds → default |
| `resolveFolderIcon` | Function | file-browser | `(folderName, expanded, manifest, theme?) → IconResolution` — resolves folder name to folder icon with expanded/collapsed variants |
| `loadManifest` | Function | internal | Loads and caches the icon theme manifest from generated `manifest.json` in `public/icons/{themeId}/`. Server-only (uses node:fs). Throws actionable error if assets not generated. |
| `FileIcon` | Component | file-browser, _platform/panel-layout | `<FileIcon filename={...} className={...} />` — renders themed file icon via `<img>` tag. Returns null while manifest loads. |
| `FolderIcon` | Component | file-browser | `<FolderIcon name={...} expanded={...} className={...} />` — renders themed folder icon with expanded/collapsed variants. |
| `IconThemeProvider` | Component | app (providers.tsx) | React context provider that fetches and distributes the icon theme manifest to all icon components. Accepts optional `themeId` prop. |
| `useIconManifest` | Hook | internal | Access icon theme manifest from context. Returns `{ manifest, isLoading, themeId }`. |
| `registerThemesSDK` | Function | _platform/sdk | Registers `themes.iconTheme` SDK setting into the global settings store. |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Resolve file icon | `resolveFileIcon(filename, manifest, theme?)` | Maps a filename to an icon by checking manifest.fileNames, then manifest.fileExtensions, then manifest.languageIds, falling back to default. Supports light-mode overrides via manifest.light.* |
| Resolve folder icon | `resolveFolderIcon(name, expanded, manifest, theme?)` | Maps a folder name to a folder icon, with separate expanded/collapsed variants. Falls back to generic folder/folder-open |
| Render file icon | `<FileIcon filename={...} />` | React component that calls resolveFileIcon internally and renders an `<img>` tag pointing to the themed SVG asset |
| Generate icon assets | `npx tsx scripts/generate-icon-assets.ts` | Build-time script that extracts SVGs from material-icon-theme, optimizes with SVGO, and generates manifest.json for the runtime resolver. Includes freshness check. |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `icon-resolver.ts` | Pure resolver functions (resolveFileIcon, resolveFolderIcon) | IconThemeManifest type |
| `manifest-loader.ts` | Load and normalize theme manifests from generated JSON | node:fs, static JSON in public/ |
| `generate-icon-assets.ts` | Build-time script: extract, optimize, deploy SVG icons | material-icon-theme, svgo |
| `types.ts` | Type definitions (IconThemeManifest, IconResolution, IconThemeId) | Nothing (pure types) |
| `constants.ts` | Theme registry, default theme ID, icon base path | Nothing (pure constants) |
| `FileIcon` component | Renders themed file icon via `<img>` | resolveFileIcon, manifest-loader, useTheme |
| `FolderIcon` component | Renders themed folder icon via `<img>` | resolveFolderIcon, manifest-loader, useTheme |
| `contribution.ts` | SDK setting: themes.iconTheme | _platform/sdk |
| `register.ts` | SDK registration entry point | contribution.ts |

## Source Location

Primary: `apps/web/src/features/_platform/themes/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/features/_platform/themes/index.ts` | Barrel exports | Phase 1 |
| `apps/web/src/features/_platform/themes/types.ts` | Type definitions | Phase 1 |
| `apps/web/src/features/_platform/themes/constants.ts` | Constants | Phase 1 |
| `apps/web/src/features/_platform/themes/lib/icon-resolver.ts` | Resolver functions | Phase 1 |
| `apps/web/src/features/_platform/themes/lib/manifest-loader.ts` | Manifest loader | Phase 1 (placeholder), Phase 2 (real fs-based loader) |
| `apps/web/src/features/_platform/themes/components/icon-theme-provider.tsx` | Manifest context provider | Phase 3 |
| `apps/web/src/features/_platform/themes/components/file-icon.tsx` | FileIcon component | Phase 3 |
| `apps/web/src/features/_platform/themes/components/folder-icon.tsx` | FolderIcon component | Phase 3 |
| `apps/web/src/features/_platform/themes/sdk/contribution.ts` | SDK setting definition | Phase 3 |
| `apps/web/src/features/_platform/themes/sdk/register.ts` | SDK registration | Phase 3 |
| `scripts/generate-icon-assets.ts` | Build-time icon asset pipeline | Phase 2 |
| `apps/web/public/icons/material-icon-theme/` | Generated SVG icons + manifest.json | Phase 2 (build artifact, gitignored) |

## Dependencies

### This Domain Depends On
- `_platform/sdk` — IUSDK for publishing `themes.iconTheme` setting (Phase 3)
- `next-themes` (npm) — `useTheme()` for light/dark mode detection in components (Phase 3)
- `material-icon-theme` (npm, devDependency) — `generateManifest()` for build-time manifest extraction (Phase 2)
- `svgo` (npm, devDependency) — SVG optimization in build-time asset pipeline (Phase 2)

### Domains That Depend On This
- `file-browser` — consumes resolveFileIcon, resolveFolderIcon, FileIcon, FolderIcon in FileTree and ChangesView (Phase 4)
- `_platform/panel-layout` — consumes FileIcon in CommandPaletteDropdown file search results (Phase 4)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 073 Phase 1 | Domain created: types, icon resolver (TDD), manifest loader | 2026-03-09 |
| Plan 073 Phase 2 | Icon asset pipeline: generate-icon-assets.ts build script, SVGO optimization, real manifest.json, updated manifest-loader with fs-based loading | 2026-03-10 |
| Plan 073 Phase 3 | FileIcon/FolderIcon React components, IconThemeProvider context, themes.iconTheme SDK setting, wired into app providers | 2026-03-10 |
