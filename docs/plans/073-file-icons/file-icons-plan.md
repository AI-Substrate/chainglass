# File Type Icons Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-09
**Spec**: [file-icons-spec.md](./file-icons-spec.md)
**Status**: DRAFT

## Summary

The app renders identical generic grey file icons across all surfaces — tree view, changes view, command palette search, and binary viewers. This plan adds file-type-specific icons using the Material Icon Theme npm package (MIT, 1,205 SVGs, `generateManifest()` API) through a new `_platform/themes` infrastructure domain that provides a manifest-driven icon resolver. The resolver maps filenames to icon paths by checking `fileNames` → `fileExtensions` → `languageIds` (in that priority order, matching VSCode behavior). Icons are served as static SVGs from `public/icons/`, rendered via `<img>` tags, and cached with immutable headers. The architecture supports future icon themes — adding a new theme is just a manifest JSON + SVG directory.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/themes` | **new** | **create** | Icon theme resolver, manifest parsing, SDK setting, icon asset management |
| `file-browser` | existing | **modify** | Consume resolver in FileTree, ChangesView; wire `<img>` icons into 4 surfaces |
| `_platform/panel-layout` | existing | **modify** | Consume resolver in CommandPaletteDropdown file search results |
| `_platform/viewer` | existing | **consume** | Unchanged — `detectLanguage()`, `detectContentType()` remain. Themes is a peer domain |
| `_platform/sdk` | existing | **consume** | Provides setting infrastructure for `themes.iconTheme` |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/domains/_platform/themes/domain.md` | `_platform/themes` | contract | New domain definition |
| `docs/domains/registry.md` | cross-domain | cross-domain | Add `_platform/themes` row |
| `docs/domains/domain-map.md` | cross-domain | cross-domain | Add themes node + edges |
| `apps/web/src/features/_platform/themes/index.ts` | `_platform/themes` | contract | Barrel exports |
| `apps/web/src/features/_platform/themes/lib/icon-resolver.ts` | `_platform/themes` | contract | `resolveFileIcon()`, `resolveFolderIcon()` — manifest-driven resolver |
| `apps/web/src/features/_platform/themes/lib/manifest-loader.ts` | `_platform/themes` | internal | Load + normalize VSCode icon theme manifests |
| `apps/web/src/features/_platform/themes/types.ts` | `_platform/themes` | contract | `IconThemeManifest`, `IconResolution`, `IconThemeId` types |
| `apps/web/src/features/_platform/themes/constants.ts` | `_platform/themes` | internal | Theme registry, default theme ID, fallback icon paths |
| `apps/web/src/features/_platform/themes/components/file-icon.tsx` | `_platform/themes` | contract | `<FileIcon filename={...} />` React component |
| `apps/web/src/features/_platform/themes/components/folder-icon.tsx` | `_platform/themes` | contract | `<FolderIcon name={...} expanded={...} />` React component |
| `apps/web/src/features/_platform/themes/sdk/contribution.ts` | `_platform/themes` | internal | SDK setting: `themes.iconTheme` |
| `apps/web/src/features/_platform/themes/sdk/register.ts` | `_platform/themes` | internal | SDK registration entry point |
| `scripts/generate-icon-assets.ts` | `_platform/themes` | internal | Build-time: curate, optimize, copy SVGs to public/ |
| `apps/web/public/icons/material-icon-theme/*.svg` | `_platform/themes` | internal | Curated SVG icon assets (~300 files + ~60 folders) |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Replace `<File>` with `<FileIcon>`, `<Folder>`/`<FolderOpen>` with `<FolderIcon>` |
| `apps/web/src/features/041-file-browser/components/changes-view.tsx` | `file-browser` | internal | Replace `<File>` with `<FileIcon>` |
| `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | `_platform/panel-layout` | internal | Replace `<File>`/`<FileText>` in search results with `<FileIcon>` |
| `apps/web/src/features/041-file-browser/components/binary-placeholder.tsx` | `file-browser` | internal | Replace `<FileQuestion>` with `<FileIcon>` |
| `apps/web/src/features/041-file-browser/components/audio-viewer.tsx` | `file-browser` | internal | Replace `<Music>` with `<FileIcon>` |
| `apps/web/src/features/041-file-browser/components/pdf-viewer.tsx` | `file-browser` | internal | Replace `<ExternalLink>` with `<FileIcon>` |
| `test/unit/web/features/_platform/themes/icon-resolver.test.ts` | `_platform/themes` | internal | TDD tests for resolver |
| `test/unit/web/features/041-file-browser/file-tree.test.tsx` | `file-browser` | internal | Update SVG count assertions |
| `apps/web/next.config.mjs` | cross-domain | cross-domain | Add `Cache-Control: immutable` headers for `/icons/*` |
| `docs/how/extending-icon-themes.md` | `_platform/themes` | contract | How-to guide for adding new themes |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `material-icon-theme` API verified: `generateManifest()` returns `fileNames` (2,050), `fileExtensions` (1,164), `languageIds` (198), `folderNames`/`folderNamesExpanded` (4,518 each), `iconDefinitions` (1,205). **`.ts` is NOT in `fileExtensions`** — it's only in `languageIds`. Resolver must check all three sources. | Resolver priority: `fileNames` → `fileExtensions` → `languageIds` → default |
| 02 | Critical | Manifest includes `light` theme overrides (31 file extensions, plus folder/filename overrides). Some icons have `_light.svg` variants in the icons/ directory. | Resolver must check `manifest.light.*` when app is in light mode, falling back to base if no override |
| 03 | High | `iconDefinitions` paths use `"./../icons/typescript.svg"` relative format. SVG files are in `node_modules/material-icon-theme/icons/`. Icon names match definition keys. | Build script extracts icon name from `iconPath`, copies `icons/{name}.svg` to `public/icons/material-icon-theme/{name}.svg` |
| 04 | High | Existing `file-tree.test.tsx` has 6 assertions checking `querySelectorAll('svg').length === 1`. Switching from Lucide `<File>` (inline SVG) to `<img src="...svg">` will break these — `<img>` doesn't have SVG DOM nodes. | Update test assertions before wiring icons. Check for `img[alt]` or data attribute instead of SVG DOM count |
| 05 | High | `turbo.json` has no pre-build hook. Build script must integrate via `prebuild` script in `apps/web/package.json` or a new turbo task. | Add `"prebuild": "tsx ../../scripts/generate-icon-assets.ts"` to `apps/web/package.json` scripts |
| 06 | High | `output: 'standalone'` in next.config.mjs excludes `public/` from standalone build. Icons must be copied separately in CLI build pipeline. | Document in plan; update `packages/cli/package.json` build step to copy `public/icons/` |
| 07 | High | SDK setting pattern clear: use `editor.wordWrap` template (select UI + string schema). File-browser contribution.ts has 5 working examples. | Follow existing pattern for `themes.iconTheme` setting |
| 08 | Medium | `_platform/viewer` owns "dual themes" for Shiki but this is syntax highlighting only, not icon theming. New `_platform/themes` domain boundary must clarify non-ownership of syntax themes. | Document in themes domain.md: "Does NOT own: Syntax highlighting themes (Shiki, CodeMirror)" |

## Harness Strategy

- **Current Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
- **Harness**: Available but not required for this plan
- **Rationale**: This plan is primarily about static asset pipeline + pure function resolver + UI wiring. The resolver is tested via unit tests (TDD). UI wiring is verified by existing test updates + manual dev server inspection. Harness screenshots are optional polish.

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Domain Setup & Icon Resolver | `_platform/themes` | Create the themes domain, manifest-driven icon resolver (TDD), and type definitions | None |
| 2 | Icon Asset Pipeline | `_platform/themes` | Build script to curate, optimize, and deploy SVG icons to `public/icons/` | Phase 1 |
| 3 | FileIcon Components & SDK Setting | `_platform/themes` | `<FileIcon>` and `<FolderIcon>` React components + `themes.iconTheme` SDK setting | Phase 2 |
| 4 | Tree & Surface Integration | `file-browser`, `_platform/panel-layout` | Wire icons into all 6 file-presenting surfaces + fix existing tests | Phase 3 |
| 5 | Theme Adaptation & Polish | `_platform/themes` | Light mode contrast testing, CSS filter fixes, cache headers, documentation | Phase 4 |

---

### Phase 1: Domain Setup & Icon Resolver

**Objective**: Create the `_platform/themes` infrastructure domain and the manifest-driven icon resolver with comprehensive TDD tests.
**Domain**: `_platform/themes` (new)
**Delivers**:
- Domain definition (`domain.md`, registry update, domain-map update)
- Feature folder scaffold (`apps/web/src/features/_platform/themes/`)
- Type definitions (`IconThemeManifest`, `IconResolution`, `IconThemeId`)
- `resolveFileIcon(filename, manifest, theme?)` — pure function, TDD
- `resolveFolderIcon(folderName, expanded, manifest, theme?)` — pure function, TDD
- `loadManifest(themeId)` — manifest loader
- Comprehensive unit tests (extension mapping, special filenames, `languageIds` fallback, unknown extensions, light-mode overrides, edge cases)
**Depends on**: None
**Key risks**: `.ts` not in `fileExtensions` (must check `languageIds`) — covered by Finding 01

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `docs/domains/_platform/themes/domain.md` with Purpose, Boundary, Contracts, Composition sections | `_platform/themes` | Domain file exists with complete boundary definition including "Does NOT own: syntax highlighting themes" | Per Finding 08 |
| 1.2 | Update `docs/domains/registry.md` — add `_platform/themes` row | cross-domain | Row visible in registry table |  |
| 1.3 | Update `docs/domains/domain-map.md` — add themes node with `resolveFileIcon` / `resolveFolderIcon` contracts, edges from `file-browser` → `themes` | cross-domain | Domain map renders correctly in Mermaid | Use `<br/>` for newlines |
| 1.4 | Create feature folder scaffold: `apps/web/src/features/_platform/themes/{index.ts, types.ts, constants.ts, lib/, components/, sdk/}` | `_platform/themes` | Directory structure exists, `index.ts` barrel compiles |  |
| 1.5 | Define types: `IconThemeManifest` (normalized manifest shape), `IconResolution` (`{iconPath, iconName, themeId}`), `IconThemeId` (string literal union) | `_platform/themes` | Types compile, exported from barrel |  |
| 1.6 | TDD (RED→GREEN→REFACTOR): Write failing tests for `resolveFileIcon(filename, manifest, theme?)` FIRST, then implement. Resolver checks `fileNames` → `fileExtensions` → `languageIds` → default `file` icon | `_platform/themes` | Tests pass for: `.ts`→typescript (via languageIds), `.py`→python, `package.json`→nodejs, `Dockerfile`→docker, `.xyz`→file (fallback), `.gitignore`→git, case-insensitive, no-extension files | Per Finding 01: `.ts` only in `languageIds` |
| 1.7 | TDD (RED→GREEN→REFACTOR): Write failing tests for `resolveFolderIcon(folderName, expanded, manifest, theme?)` FIRST, then implement. Resolver checks `folderNames`/`folderNamesExpanded` → default `folder`/`folder-open` | `_platform/themes` | Tests pass for: `src`→folder-src, `node_modules`→folder-node, `test`→folder-test, expanded variants, unknown→default folder |  |
| 1.8 | TDD (RED→GREEN→REFACTOR): Write failing tests for light-mode override FIRST, then implement. Resolver checks `manifest.light.*` sources when `theme='light'` | `_platform/themes` | Tests pass for light-mode overrides returning different icon paths where manifest.light has entries | Per Finding 02 |
| 1.9 | Implement `loadManifest(themeId)` — loads manifest from static import or JSON file, normalizes to internal `IconThemeManifest` shape | `_platform/themes` | Manifest loads successfully, shape validated |  |

### Phase 2: Icon Asset Pipeline

**Objective**: Build a script that curates ~300 file + ~60 folder SVG icons from `material-icon-theme`, optimizes them with SVGO, and copies to `public/icons/`.
**Domain**: `_platform/themes`
**Delivers**:
- `scripts/generate-icon-assets.ts` — build-time icon processing script
- `apps/web/public/icons/material-icon-theme/*.svg` — curated, optimized icon set
- Updated `scripts/scripts.md` index
- Integration with build pipeline (`prebuild` script or turbo task)
**Depends on**: Phase 1 (needs manifest types)
**Key risks**: Must handle light-mode variants (`_light.svg` files); must stay under 500KB compressed budget

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Install `material-icon-theme@5.32.0` as devDependency + `svgo` as devDependency | `_platform/themes` | Packages in `package.json`, lockfile updated |  |
| 2.2 | Create `scripts/generate-icon-assets.ts`: read manifest via `generateManifest()`, collect all referenced icon names from `fileNames` + `fileExtensions` + `languageIds` + `folderNames` + `folderNamesExpanded` + defaults, deduplicate | `_platform/themes` | Script runs, outputs list of unique icon names needed | Per Finding 03: extract name from `iconPath` |
| 2.3 | Add icon curation: filter to most-referenced icons (~300 file + ~60 folder), include all `_light.svg` variants for curated icons, include `file.svg`, `folder.svg`, `folder-open.svg` defaults | `_platform/themes` | Curated set identified, logged to console |  |
| 2.4 | Add SVGO optimization: process each SVG through SVGO with preset-default, copy optimized files to `apps/web/public/icons/material-icon-theme/` | `_platform/themes` | SVGs exist in public/, optimized (40-65% smaller) |  |
| 2.5 | Generate a static manifest JSON at `apps/web/public/icons/material-icon-theme/manifest.json` — normalized mapping from the resolver's perspective | `_platform/themes` | JSON file exists with `fileNames`, `fileExtensions`, `languageIds`, `folderNames`, `folderNamesExpanded`, `light` sections |  |
| 2.6 | Wire into build pipeline: add `"prebuild": "tsx ../../scripts/generate-icon-assets.ts"` to `apps/web/package.json` | `_platform/themes` | `pnpm build` in apps/web runs icon generation before `next build` | Per Finding 05 |
| 2.7 | Update `scripts/scripts.md` with new script entry | cross-domain | Index entry visible |  |
| 2.8 | Verify total asset size: all SVGs in `public/icons/` under 500KB when gzipped | `_platform/themes` | `du -sh` + gzip measurement passes budget |  |

### Phase 3: FileIcon Components & SDK Setting

**Objective**: Create `<FileIcon>` and `<FolderIcon>` React components that use the resolver + manifest, and register the `themes.iconTheme` SDK setting.
**Domain**: `_platform/themes`
**Delivers**:
- `<FileIcon filename={...} className={...} />` component
- `<FolderIcon name={...} expanded={...} className={...} />` component
- `themes.iconTheme` SDK setting (select dropdown, default: `material-icon-theme`)
- SDK registration
**Depends on**: Phase 2 (needs icon assets in public/)
**Key risks**: None significant — components are thin wrappers over the resolver

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `<FileIcon filename={...} className={...} />` — renders `<img src="/icons/{themeId}/{iconName}.svg" alt="" className={...} />`, uses `resolveFileIcon()` internally, respects current theme (light/dark) via `useTheme()` | `_platform/themes` | Component renders correct icon for `.ts`, `.py`, `.json` filenames; fallback for unknown extensions |  |
| 3.2 | Create `<FolderIcon name={...} expanded={...} className={...} />` — renders folder icon with expanded/collapsed variants | `_platform/themes` | Component renders `folder-src` for `src/`, `folder-open` for expanded default, etc. |  |
| 3.3 | Add `themes.iconTheme` SDK setting contribution: select UI, string schema, default `material-icon-theme` | `_platform/themes` | Setting appears in SDK settings panel, value persists | Per Finding 07: use editor.wordWrap as template |
| 3.4 | Create SDK registration entry point (`sdk/register.ts`) and wire into app SDK initialization | `_platform/themes` | SDK contribution loads at app startup |  |
| 3.5 | Export `FileIcon`, `FolderIcon`, `resolveFileIcon`, `resolveFolderIcon` from barrel `index.ts` | `_platform/themes` | Imports work from consumer domains |  |

### Phase 4: Tree & Surface Integration

**Objective**: Wire `<FileIcon>` and `<FolderIcon>` into all 6 file-presenting surfaces and fix broken test assertions.
**Domain**: `file-browser`, `_platform/panel-layout`
**Delivers**:
- File-type icons in: FileTree, ChangesView, CommandPaletteDropdown, BinaryPlaceholder, AudioViewer, PdfViewer
- Updated existing tests
**Depends on**: Phase 3 (needs FileIcon/FolderIcon components)
**Key risks**: Test assertions checking SVG DOM count will break (Finding 04) — fix FIRST

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Update `file-tree.test.tsx`: change SVG count assertions to check for `img[src*=".svg"]` OR `svg` elements | `file-browser` | All existing tests pass with updated assertions | Per Finding 04: fix BEFORE wiring icons |
| 4.2 | FileTree (file-tree.tsx): replace `<File className="h-4 w-4 shrink-0 text-muted-foreground" />` with `<FileIcon filename={entry.name} className="h-4 w-4 shrink-0" />` for file entries | `file-browser` | File entries show type-specific icons |  |
| 4.3 | FileTree (file-tree.tsx): replace `<Folder>`/`<FolderOpen>` with `<FolderIcon name={entry.name} expanded={isExpanded} className="h-4 w-4 shrink-0" />` for directory entries | `file-browser` | Folder entries show themed folder icons (src, test, node_modules, etc.) |  |
| 4.4 | ChangesView (changes-view.tsx): replace generic `<File>` icons with `<FileIcon filename={...} />` | `file-browser` | Changed files show type-specific icons |  |
| 4.5 | CommandPaletteDropdown (command-palette-dropdown.tsx): replace `<File>`/`<FileText>` in file search results with `<FileIcon filename={...} />` | `_platform/panel-layout` | Search results show type-specific file icons |  |
| 4.6 | BinaryPlaceholder (binary-placeholder.tsx): replace `<FileQuestion>` with `<FileIcon filename={...} />` | `file-browser` | Binary files show type-specific icons |  |
| 4.7 | AudioViewer (audio-viewer.tsx): replace `<Music>` with `<FileIcon filename={...} />` | `file-browser` | Audio files show audio-type icon |  |
| 4.8 | PdfViewer (pdf-viewer.tsx): replace generic icon with `<FileIcon filename={...} />` | `file-browser` | PDF files show PDF icon |  |
| 4.9 | Run `just fft` — all tests, lint, typecheck pass | cross-domain | Zero failures |  |

### Phase 5: Theme Adaptation & Polish

**Objective**: Test icon contrast in both themes, apply light-mode CSS filters where needed, add cache headers, and write documentation.
**Domain**: `_platform/themes`, cross-domain
**Delivers**:
- Contrast-tested icons in light and dark mode
- CSS filter adaptation for low-contrast icons (if needed)
- Immutable cache headers for `/icons/*` paths
- `docs/how/extending-icon-themes.md` how-to guide
- Standalone build pipeline update for icon assets
**Depends on**: Phase 4
**Key risks**: Some icons may need CSS filter adjustment for light mode (Finding 02)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Contrast test: inspect the 20 most common file-type icons against light and dark sidebar backgrounds. Identify any with WCAG < 3:1 contrast ratio | `_platform/themes` | List of problem icons documented (if any) |  |
| 5.2 | If problem icons found: add a CSS class `.light-mode-icon-fix` with appropriate CSS filter values, apply conditionally via `useTheme()` in `<FileIcon>` | `_platform/themes` | All icons meet 3:1 contrast in both themes | Per Finding 02: `manifest.light` has 31 overrides already |
| 5.3 | Add cache headers to `next.config.mjs`: `Cache-Control: public, immutable, max-age=31536000` for `/icons/*` path pattern | cross-domain | Icons served with immutable cache headers | Per Finding 06 |
| 5.4 | Update standalone build: ensure `packages/cli/package.json` build copies `public/icons/` to standalone output | cross-domain | Production standalone build includes icons | Per Finding 06 |
| 5.5 | Write `docs/how/extending-icon-themes.md`: how to add a new VSCode-compatible icon theme (manifest format, asset directory, SDK registration) | `_platform/themes` | Guide exists, covers complete workflow |  |
| 5.6 | Update `docs/domains/file-browser/domain.md` Dependencies section: add `_platform/themes` dependency | `file-browser` | Domain docs reflect new dependency |  |
| 5.7 | Harness visual verification: start harness, navigate to file browser, expand a directory with mixed file types, capture screenshots in light and dark mode, verify icons render correctly | cross-domain | Screenshots show distinct file-type icons in both themes | Per ADR-0014: visual features require harness coverage |
| 5.8 | Run `just fft` — final quality gate | cross-domain | Zero failures, all acceptance criteria met |  |

---

## Acceptance Criteria

- [ ] AC-1: File type icons render in tree view (`.ts`, `.py`, `.json`, `.md`, `.html`, `.css`, `.go`, `.rs`, `.java` all distinct)
- [ ] AC-2: Folder-specific icons render (`src`, `test`, `node_modules`, `.git`, `docs`, `public`, `build`, `dist`)
- [ ] AC-3: Unknown extensions fall back gracefully (`.xyz` → generic file icon)
- [ ] AC-4: Special filenames recognized (`Dockerfile`, `Makefile`, `.gitignore`, `.env`, `package.json`, `tsconfig.json`, `README.md`)
- [ ] AC-5: Dark mode icons clear (WCAG 3:1 contrast)
- [ ] AC-6: Light mode icons clear (WCAG 3:1 contrast)
- [ ] AC-7: No performance regression (200 files renders < 100ms)
- [ ] AC-8: ChangesView shows file icons
- [ ] AC-9: Command palette search shows file icons
- [ ] AC-10: Binary file viewers show file icons
- [ ] AC-11: Existing tests pass (updated assertions)
- [ ] AC-12: New icon resolver tests exist (TDD)
- [ ] AC-13: Asset size under 500KB compressed
- [ ] AC-14: Manifest-driven resolver (not hardcoded)
- [ ] AC-15: `themes.iconTheme` SDK setting exists

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `.ts` extension missing from `fileExtensions` | Certain | High | Resolver checks `languageIds` as third source (Finding 01, verified) |
| Light-mode contrast issues | Medium | Medium | Material Icon Theme provides `light` overrides for 31 extensions; selective CSS filters for remainder (Finding 02) |
| Bundle size > 500KB | Low | Medium | Curation script filters to ~300 most-referenced icons; SVGO optimization 40-65% reduction |
| Standalone build missing icons | Medium | High | Phase 5 adds CLI build copy step (Finding 06) |
| `material-icon-theme` API breaking change | Low | High | Pin v5.32.0; internal manifest wrapper absorbs changes |
| FileTree test breakage | Certain | Medium | Fix assertions before wiring icons (Finding 04, Phase 4 Task 1) |

## Deviation Ledger

| Principle | Deviation | Rationale |
|-----------|-----------|-----------|
| Principle 2: Interface-First | Icon resolver implemented as pure stateless functions (`resolveFileIcon`, `resolveFolderIcon`), not as `IIconThemeResolver` interface + fake + adapter | The resolver is a **pure function** taking `(filename, manifest, theme?) → IconResolution`. It has no side effects, no state, no I/O. Interface-first + DI is designed for services with side effects (file I/O, network, state). Pure functions are directly testable with real data — no fake needed. If a service wrapper is needed later (e.g., caching, dynamic manifest loading), it can be added without changing the pure function signatures. |
| Principle 7: Shared by Default | `_platform/themes` domain lives in `apps/web/`, not `packages/shared/` | Icon theming is web-only infrastructure: it depends on React components (`<FileIcon>`), `next-themes` for dark/light mode, and SVG assets in `public/`. CLI has no use for visual icons. If CLI needs icon metadata (e.g., terminal nerd-font icons), a separate shared interface can be extracted then. Moving to shared now would force shared to depend on React. |
