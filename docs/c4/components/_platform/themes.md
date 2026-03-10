# C4 L3 Component: Themes (`_platform/themes`)

> **Domain Definition**: [domain.md](../../../domains/_platform/themes/domain.md)
> **Source**: `apps/web/src/features/_platform/themes/`
> **Registry**: [registry.md](../../../domains/registry.md) — Row: Themes

## Component Diagram

```mermaid
C4Component
    title Component Diagram — _platform/themes

    Boundary(themes, "Themes Domain", "_platform/themes") {
        Component(resolver, "Icon Resolver", "Pure Functions", "Resolves filenames to icon paths<br/>via fileNames → fileExtensions<br/>→ languageIds → default")
        Component(manifestLoader, "Manifest Loader", "Async Cache", "Server-only: loads manifests<br/>from generated JSON via node:fs")
        Component(provider, "IconThemeProvider", "React Context", "Client-side: fetches manifest<br/>via browser fetch(), provides<br/>to all icon components")
        Component(fileIcon, "FileIcon", "React Component", "Renders themed file icon<br/>as img tag via resolver")
        Component(folderIcon, "FolderIcon", "React Component", "Renders themed folder icon<br/>with expanded/collapsed variants")
        Component(sdkContrib, "SDK Contribution", "Settings", "themes.iconTheme select setting<br/>registered in Appearance section")
        Component(types, "Type Definitions", "TypeScript", "IconThemeManifest,<br/>IconResolution, IconThemeId")
        Component(constants, "Constants", "Config", "DEFAULT_ICON_THEME,<br/>ICON_BASE_PATH")
        Component(extCandidates, "Extension Candidates", "Internal", "Generates longest-match<br/>compound suffix candidates<br/>(d.ts, spec.ts, route.tsx)")
        Component(langBridge, "Language Bridge", "Internal", "Maps detectLanguage() output<br/>to VSCode languageIds<br/>via SHIKI_TO_VSCODE map")

        Rel(fileIcon, provider, "useIconManifest()")
        Rel(folderIcon, provider, "useIconManifest()")
        Rel(fileIcon, resolver, "resolveFileIcon()")
        Rel(folderIcon, resolver, "resolveFolderIcon()")
        Rel(provider, constants, "DEFAULT_ICON_THEME")
        Rel(resolver, extCandidates, "Generates candidates")
        Rel(resolver, langBridge, "Falls back to languageIds")
        Rel(resolver, types, "Returns IconResolution")
        Rel(manifestLoader, types, "Returns IconThemeManifest")
    }
```

## Internal Data Flow

```mermaid
flowchart TD
    A["filename"] --> B["lowercase"]
    B --> C{"manifest.fileNames<br/>match?"}
    C -->|yes| Z["IconResolution"]
    C -->|no| D["getExtensionCandidates()<br/>longest-match"]
    D --> E{"manifest.fileExtensions<br/>match?"}
    E -->|yes| Z
    E -->|no| F["detectLanguage() →<br/>SHIKI_TO_VSCODE map"]
    F --> G{"manifest.languageIds<br/>match?"}
    G -->|yes| Z
    G -->|no| H["default 'file' icon"]
    H --> Z
```

Depends on `_platform/viewer` for `detectLanguage()` utility (consumed, not owned).

---

## Navigation

- **Zoom Out**: [Web App Container](../../containers/web-app.md)
- **Domain**: [domain.md](../../../domains/_platform/themes/domain.md)
- **Hub**: [C4 Overview](../../README.md)
