# File Type Icons for Tree View

**Mode**: Full

## Research Context

📚 This specification incorporates findings from:
- `research-dossier.md` — 8 parallel subagent exploration (68 findings) covering: implementation archaeology, dependency mapping, pattern conventions, quality/testing, interface contracts, documentation history, prior learnings, and domain boundaries
- `deep-research-bundle-optimization.md` — Perplexity deep research on SVG loading strategies for ~1,200 icons in Next.js 16 (SVG sprites recommended, static files as pragmatic alternative)
- `deep-research-theme-adaptation.md` — Perplexity deep research on dark/light theme adaptation for fixed-color Material Icon Theme SVGs (incremental approach: test contrast first, selective CSS filters, plan for CSS custom properties)

## Summary

The app currently renders an identical generic file icon everywhere files appear — tree view, changes view, command palette search results, and file viewers. A TypeScript file, a Python script, a JSON config, and an image all look the same across every surface. Users cannot visually distinguish file types when scanning any file listing.

This feature adds file-type-specific icons across all file-presenting surfaces using the Material Icon Theme — the most popular VSCode icon theme (20M+ installs, MIT license) — which is available as an npm package with ~1,200 SVG icons and a programmatic manifest API. Users get instant visual recognition of file types through distinctive, color-coded icons they already know from VSCode.

## Goals

- **Instant file type recognition**: Users can identify TypeScript, Python, JSON, markdown, images, etc. at a glance wherever files appear — tree view, changes view, command palette search, file viewers
- **Consistent across all surfaces**: Every place a file is represented uses the same themed icon, not just the tree view
- **Familiar visual language**: Default icons match what developers already know from VSCode's Material Icon Theme
- **Folder-aware icons**: Special folders (src/, test/, node_modules/, .git/, docs/) get distinctive folder icons, not just generic folder icons
- **Dark and light mode support**: Icons are visually clear and maintain contrast in both themes
- **Zero performance regression**: Icon rendering adds no perceptible delay to tree expansion or scrolling
- **Theme-aware architecture**: The icon resolver is built against the generic VSCode icon theme manifest format (`fileExtensions`, `fileNames`, `folderNames` → icon definitions), not hardcoded to a single theme. Material Icon Theme ships as the default, but the architecture supports loading additional VSCode-compatible icon themes in the future
- **Theme switching via SDK settings**: Users can select which icon theme to use (ships with Material Icon Theme as default; additional themes can be added without code changes)

## Non-Goals

- **UI/navigation icon changes** — Sidebar nav, agent system, command palette controls, terminal, settings, and toolbar action icons stay as Lucide. Only file-type representations get Material Icon Theme treatment
- **Bundling multiple icon themes in Phase 1** — Only Material Icon Theme ships initially; additional themes are a follow-up that the architecture explicitly supports
- **Custom user-uploaded icon themes** — No mechanism for users to provide their own icon theme packages
- **Animated icons** — No animation on icon state changes
- **Icon badges/overlays** — No git status badges overlaid on icons (existing status coloring remains)
- **CLI icon support** — Terminal/CLI does not get icons in this plan
- **Editor tab icons** — Icons are for the tree view only, not file tabs or breadcrumbs
- **Full 1,200-icon coverage** — Ship a curated set of ~150-300 most common icons per theme; the rest fall back to generic icons

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/themes` | **new** | **create** | New infrastructure domain owning visual theming: icon theme manifest parsing, filename → icon resolution, theme registration, icon asset management. Scoped to icon themes in this plan; designed to grow into color themes, editor themes, etc. |
| `file-browser` | existing | **modify** | Consume icon resolver in FileTree and ChangesView components to render type-specific icons |
| `_platform/viewer` | existing | **consume** | No changes — `detectLanguage()` and `detectContentType()` stay in viewer. Themes domain is a peer, not a child |
| `_platform/panel-layout` | existing | **consume** | No changes — ExplorerPanel search results may consume icons in a future plan |
| `_platform/sdk` | existing | **consume** | Provides setting infrastructure for `themes.iconTheme` selection |

### Domain Boundary Notes

**Why a new `_platform/themes` domain instead of extending `_platform/viewer`:**
1. **Separation of concerns**: Viewer owns *rendering* (syntax highlighting, markdown, diffs). Themes owns *visual identity* (which icon, which color palette, which editor theme). These are different responsibilities.
2. **Future scope**: `_platform/themes` can grow to own color themes (`next-themes` integration), editor themes (CodeMirror themes), and UI density settings — none of which belong in viewer.
3. **Clean dependency graph**: Viewer doesn't need to know about icon themes. File-browser depends on themes for icons and viewer for rendering — two separate concerns.
4. The resolver is **manifest-driven** — it reads a VSCode-format icon theme manifest (JSON with `fileExtensions`, `fileNames`, `folderNames`, `iconDefinitions`) and resolves filenames to icon paths. Adding a new theme is just adding a new manifest + icon assets, no code changes.

**`file-browser` consumes** the resolver but does NOT own it. This ensures other domains (search results, activity log, workflow nodes) can use file icons without depending on file-browser.

**`_platform/viewer` is unchanged** — `detectLanguage()` and `detectContentType()` remain there. The themes domain may *consume* these utilities internally but does not subsume them.

## Surfaces Inventory

All locations where files are represented with generic icons → to be replaced with themed file-type icons:

| # | Surface | Component | File Path | Current Icon | Priority |
|---|---------|-----------|-----------|-------------|----------|
| 1 | **File tree** | FileTree / TreeItem | `file-tree.tsx` | `<File>` (generic grey) | Highest |
| 2 | **Changes view** | ChangesView | `changes-view.tsx` | `<File>` / `<FileText>` | High |
| 3 | **Command palette search** | CommandPaletteDropdown | `command-palette-dropdown.tsx` | `<File>` / `<FileText>` in results | Medium |
| 4 | **Binary placeholder** | BinaryPlaceholder | `binary-placeholder.tsx` | `<FileQuestion>` | Medium |
| 5 | **Audio viewer** | AudioViewer | `audio-viewer.tsx` | `<Music>` | Low |
| 6 | **PDF viewer** | PdfViewer | `pdf-viewer.tsx` | `<ExternalLink>` | Low |

**NOT in scope** (UI/navigation icons — stay as Lucide):
- Sidebar navigation (20 icons: Bot, TerminalSquare, Settings, etc.)
- Agent system (30+ icons: status, chat, interaction)
- Command palette controls (mode toggles, sort, filters)
- File action buttons (rename, delete, copy, download, expand/collapse)
- Terminal, workflow, settings page controls

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=0, N=1, F=1, T=1 (Total P=5)
  - **Surface Area (S=1)**: Multiple files — new utility, modify FileTree, modify ChangesView, new tests, build script
  - **Integration (I=1)**: One external dependency (`material-icon-theme` npm package)
  - **Data/State (D=0)**: No schema or state changes — icons are pure functions of filename
  - **Novelty (N=1)**: Some ambiguity around theme adaptation strategy and bundle optimization
  - **Non-Functional (F=1)**: Moderate — must maintain tree rendering performance, handle dark/light mode
  - **Testing/Rollout (T=1)**: Integration tests needed — existing file-tree test has SVG count assertions that break
- **Confidence**: 0.85
- **Assumptions**:
  - `material-icon-theme` npm package API is stable and works as documented
  - Static files in `public/` approach is sufficient for initial delivery (sprite optimization can come later)
  - Material Icon Theme SVGs have acceptable contrast in both light and dark modes for the majority of common file types (deep research confirms most saturated colors work in both)
- **Dependencies**:
  - `material-icon-theme` npm package (MIT license, actively maintained)
  - Build script tooling (`svgo` for SVG optimization)
- **Risks**:
  - Bundle/asset size — mitigated by curating to ~150-300 icons, not shipping all 1,200
  - Some icons may have poor contrast in light mode — mitigated by contrast testing and selective CSS filter fallback
  - Turbopack compatibility for SVG handling — mitigated by using static files approach (no bundler SVG processing needed)
- **Phases**:
  1. Icon infrastructure — utility function, build script, curated icon set
  2. Tree integration — wire icons into FileTree and ChangesView
  3. Theme adaptation — contrast testing, light mode fixes, polish

## Acceptance Criteria

1. **File type icons render in tree view**: When a user expands a directory containing `.ts`, `.py`, `.json`, `.md`, `.html`, `.css`, `.go`, `.rs`, `.java` files, each file shows a distinct, recognizable icon matching the active icon theme
2. **Folder-specific icons render**: Folders named `src`, `test`, `node_modules`, `.git`, `docs`, `public`, `build`, `dist` show distinctive folder icons instead of the generic blue folder
3. **Unknown extensions fall back gracefully**: Files with unrecognized extensions (e.g., `.xyz`, `.custom`) show a clean generic file icon, not a broken image or error
4. **Special filenames are recognized**: `Dockerfile`, `Makefile`, `.gitignore`, `.env`, `package.json`, `tsconfig.json`, `README.md` show their specific icons based on filename, not just extension
5. **Dark mode icons are clear**: All icons maintain a WCAG 3:1 minimum contrast ratio against the dark sidebar background
6. **Light mode icons are clear**: All icons maintain a WCAG 3:1 minimum contrast ratio against the light sidebar background (with CSS filter adaptation if needed)
7. **No performance regression**: Expanding a directory with 200 files renders icons within 100ms (no perceptible delay vs current generic icons)
8. **ChangesView shows file icons**: The changes/git status view shows file-type icons alongside file paths
9. **Command palette search shows file icons**: File search results in the command palette dropdown show file-type icons
10. **Binary file viewers show file icons**: Audio, PDF, and binary placeholder viewers show appropriate file-type icons
11. **Existing tests pass**: All existing file-tree tests pass (updated for new icon rendering)
12. **New icon detection tests exist**: Unit tests cover extension mapping, special filenames, unknown extensions, and edge cases
13. **Asset size is reasonable**: Total icon assets shipped to client are under 500KB compressed for the curated set
14. **Manifest-driven resolver**: The icon resolver reads a VSCode-format icon theme manifest, not a hardcoded extension map. Adding a new theme requires only a new manifest JSON + SVG asset directory
15. **Theme selection setting exists**: An SDK setting (`themes.iconTheme`) allows selecting the active icon theme. Ships with Material Icon Theme as the only option, but the setting infrastructure supports additional themes

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Material Icon Theme npm package API changes | Low | High | Pin version, wrap in internal utility |
| Poor contrast for some icons in light mode | Medium | Medium | Contrast test during implementation; apply selective CSS filters |
| Bundle size bloat from SVG assets | Medium | Medium | Curate to ~150-300 icons; use SVGO optimization (40-65% reduction) |
| Turbopack SVG processing issues | Low | Low | Use static files approach (no bundler SVG processing) |
| Tree rendering performance degradation | Low | High | O(1) icon lookup; use `<img>` tags with browser caching |

### Assumptions

- Developers using this tool are familiar with Material Icon Theme from VSCode and will find the icons intuitive
- The `<img>` tag approach for serving SVGs from `public/` is sufficient for Phase 1 (sprite optimization can be a follow-up)
- The `material-icon-theme` npm package's `generateManifest()` function provides complete extension → icon mappings
- Dark sidebar background (~#252525) is similar enough to VSCode's that icons work without modification in dark mode

## Open Questions

*All resolved — see Clarifications section above.*

## Clarifications (Resolved)

1. **Folder expanded/collapsed icons**: Yes — themed folder icons have separate expanded and collapsed variants (e.g., `folder-src.svg` / `folder-src-open.svg`), matching VSCode behavior. Doubles folder icon count (~30 types × 2 states = ~60 folder SVGs).
2. **Icon asset processing**: Build-time script in `scripts/` — runs during `pnpm build` to read `generateManifest()`, curate icons, run SVGO, and copy to `public/icons/`. Reliable and reproducible; no dev-server startup cost.
3. **Asset size budget**: 500KB compressed — room for ~300 file icons + ~60 folder variants after SVGO optimization.
4. **Workflow mode**: Full (multi-phase plan, required dossiers, all gates).
5. **Testing strategy**: Hybrid — TDD for resolver logic (pure functions, edge cases), lightweight for UI wiring. No mocks; use real `material-icon-theme` manifest data.
6. **Documentation**: `docs/how/extending-icon-themes.md` guide for adding new themes.
7. **Domain ownership**: New `_platform/themes` infrastructure domain owns icon resolution. `file-browser` consumes. `_platform/viewer` unchanged.
8. **SDK setting namespace**: `themes.iconTheme` (owned by `_platform/themes` domain, not `file-browser`).

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Icon Asset Pipeline | Integration Pattern | The build-time script that reads `generateManifest()`, curates icons, runs SVGO, and copies to `public/` is a non-trivial integration with multiple approaches (static copy vs sprite sheet vs dynamic import). Worth designing before coding. | How to structure the build script? What curated subset? How to handle updates to material-icon-theme? |
| Theme Adaptation Strategy | Other | Deep research identified 5+ approaches to handling fixed-color SVGs in light mode. Need to decide on approach before implementation. Testing a sample set against both backgrounds would inform the decision. | Which icons actually need adaptation? CSS filter values? Should we preprocess SVGs at build time? |
| Manifest-Driven Theme Resolver | Architecture Pattern | The resolver must parse VSCode icon theme manifests (with `fileExtensions`, `fileNames`, `folderNames`, `languageIds`, and `iconDefinitions` sections) and resolve filenames to icon paths. The resolution priority order (exact filename > extension > language > default) and the manifest schema need to be designed. | What subset of the VSCode manifest format do we support? How do we handle theme-specific folder icons (expanded vs collapsed)? Where do manifest files live in the project structure? |

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: The manifest-driven icon resolver is pure logic with many edge cases (extension mapping, special filenames, fallbacks, unknown types) — ideal for TDD. The UI wiring (replacing `<File>` with `<img>` in FileTree/ChangesView) is straightforward integration — lightweight tests sufficient.
- **Focus Areas**:
  - **TDD**: Icon resolver — extension→icon mapping, special filename detection, folder icon resolution, fallback behavior, manifest parsing, theme switching
  - **Lightweight**: FileTree icon rendering, ChangesView icon rendering, existing test updates
- **Mock Usage**: No mocks — use real `material-icon-theme` manifest data and real SVG files in tests
- **Excluded**: Visual regression testing (harness screenshots are nice-to-have, not required)

## Documentation Strategy

- **Location**: `docs/how/` only
- **Deliverable**: `docs/how/extending-icon-themes.md` — guide for adding new VSCode-compatible icon themes (manifest format, asset directory structure, registration)
- **Rationale**: The theme resolver architecture is the main thing future developers need to understand. Inline JSDoc covers the API surface; the how-to guide covers the extension workflow.
