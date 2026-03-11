# Research Report: File Icons for Tree View

**Generated**: 2026-03-09T11:27:00Z
**Research Query**: "Add file icons to the tree view, leveraging VSCode file icon themes"
**Mode**: Pre-Plan (branch: 073-file-icons)
**Location**: docs/plans/073-file-icons/research-dossier.md
**FlowSpace**: Available
**Findings**: 68 across 8 subagents + external research

## Executive Summary

### What It Does
The FileTree component currently renders a generic `<File>` Lucide icon for every file regardless of type, and `<Folder>`/`<FolderOpen>` icons for directories. There is no file-type-specific visual differentiation — a TypeScript file looks identical to a Python file, a JSON config, or an image.

### Business Purpose
File type icons provide instant visual recognition in the tree view, reducing cognitive load when scanning directories. This is a table-stakes feature in modern code editors and file browsers (VSCode, JetBrains, GitHub).

### Key Insights
1. **`material-icon-theme` is available as an MIT-licensed npm package** with `generateManifest()` function and SVG icons — no need to extract from VSCode extensions manually
2. **Existing infrastructure** (`detectLanguage()` with 50+ extensions, `detectContentType()` with 30+ binary types) already maps filenames to types — icon mapping follows the same pattern
3. **The current icon rendering slot** in `file-tree.tsx` line 667 is a single `<File>` component that can be surgically replaced with a type-aware icon resolver

### Quick Stats
- **Components affected**: 1 primary (FileTree), 1 secondary (ChangesView)
- **Existing extension mappings**: 80+ (detectLanguage + detectContentType combined)
- **Material Icon Theme**: ~1,200 file/folder icons, MIT license, npm package
- **Test impact**: 1 test file needs SVG count assertion update
- **Prior learnings surfaced**: 15 relevant from Plans 041, 043, 046, 068
- **Domains**: 2 relevant (`file-browser`, `_platform/viewer`)

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| FileTree component | React component | `apps/web/src/features/041-file-browser/components/file-tree.tsx` | Tree navigation UI |
| TreeItem sub-component | Internal render | Same file, lines 357-709 | Per-item rendering with icons |
| Files API route | GET handler | `apps/web/app/api/workspaces/[slug]/files/route.ts` | Returns FileEntry[] |
| directory-listing service | Server function | `apps/web/src/features/041-file-browser/services/directory-listing.ts` | `git ls-files` per directory |

### Core Data Flow

```
directory-listing service
  → FileEntry { name, type: 'file'|'directory', path }
    → FileTree component (props: entries[])
      → TreeItem (recursive, depth-based)
        → Icon rendering:
            Directory: <ChevronDown/Right> + <Folder/FolderOpen> (text-blue-500)
            File: <File> (text-muted-foreground)  ← ALL files identical
        → <span>{entry.name}</span>
```

### Current Icon Rendering (file-tree.tsx)

**Directories (lines 404-460):**
```tsx
{isExpanded ? (
  <>
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
  </>
) : (
  <>
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <Folder className="h-4 w-4 shrink-0 text-blue-500" />
  </>
)}
```

**Files (line 667):**
```tsx
<File className="h-4 w-4 shrink-0 text-muted-foreground" />
<span className={`truncate ${isSelected ? 'text-base' : ''}`}>
  {entry.name}
</span>
```

### FileEntry Interface

```typescript
// apps/web/src/features/041-file-browser/services/directory-listing.ts:19-23
export interface FileEntry {
  name: string;          // "App.tsx", "package.json"
  type: 'file' | 'directory';
  path: string;          // relative from workspace root
}
```

No language, content type, or icon field — icon must be derived from `name` at render time.

---

## Architecture & Design

### Existing Extension-to-Type Mapping Infrastructure

**1. detectLanguage() — 50+ extensions**
```
Location: apps/web/src/lib/language-detection.ts (also packages/shared/)
Returns: Shiki language ID string
Examples: .ts → 'typescript', .py → 'python', .go → 'go', .rs → 'rust'
Special filenames: Dockerfile, Makefile, .gitignore, .env, etc.
```

**2. detectContentType() — 30+ binary types**
```
Location: apps/web/src/lib/content-type-detection.ts
Returns: { category: 'image'|'pdf'|'video'|'audio'|'binary', mimeType: string }
Examples: .png → image, .mp4 → video, .pdf → pdf
```

**3. Icon library — Lucide React v0.562.0**
```
Location: apps/web/package.json
Currently used: File, Folder, FolderOpen, ChevronDown, ChevronRight + action icons
Available file-type icons: FileJson, FileCode, FileText, FileImage, etc.
```

### Design Patterns to Follow

| Pattern | Example | Location |
|---------|---------|----------|
| Extension mapping utility | `detectLanguage(filename)` | `src/lib/language-detection.ts` |
| Data-driven styling | `STATUS_BADGE` record | `changes-view.tsx` |
| Icon as component prop | `NavItem.icon: LucideIcon` | `navigation-utils.ts` |
| cn() class composition | `cn('flex', isSelected && 'bg-accent')` | All components |
| Consistent sizing | `h-4 w-4 shrink-0` | All tree icons |

### Color Semantic System

| Color | Usage | Tailwind |
|-------|-------|----------|
| Blue | Folders | `text-blue-500` |
| Muted | Generic files | `text-muted-foreground` |
| Amber | Modified/changed | `text-amber-500` / `text-amber-600 dark:text-amber-400` |
| Green | Added/new | `text-green-500` |
| Red | Deleted | `text-red-500` |

### Theme Infrastructure
- `next-themes` (v0.4.6) manages light/dark mode
- CSS custom properties in oklch color space (`globals.css`)
- `@custom-variant dark (&:is(.dark *))` for dark mode
- Lucide SVG icons inherit `currentColor` — naturally theme-aware

---

## External Research: VSCode File Icon Themes

### The Answer: `material-icon-theme` npm Package

**This is the key finding from external research.** The Material Icon Theme — the most popular VSCode icon theme with 20M+ installs — is **available as an npm package** under MIT license.

| Property | Value |
|----------|-------|
| **npm package** | `material-icon-theme` |
| **License** | MIT |
| **Icons** | ~1,200 SVGs in `node_modules/material-icon-theme/icons/` |
| **API** | `generateManifest()` returns JSON mapping |
| **GitHub** | `material-extensions/vscode-material-icon-theme` |
| **Installs** | 20M+ on VSCode Marketplace |

**Key API:**
```typescript
import { generateManifest } from 'material-icon-theme';
const manifest = generateManifest();
// Returns: { fileExtensions, fileNames, folderNames, iconDefinitions, ... }
// Maps filename patterns → icon names
// Icons available at: node_modules/material-icon-theme/icons/{name}.svg
```

### VSCode Icon Theme Format
A VSCode icon theme is a JSON manifest with:
- `iconDefinitions`: Map of icon-id → SVG path
- `fileExtensions`: Map of extension → icon-id (e.g., `"ts" → "typescript"`)
- `fileNames`: Map of exact filename → icon-id (e.g., `"package.json" → "npm"`)
- `folderNames`: Map of folder name → icon-id (e.g., `"src" → "folder-src"`)
- `folderNamesExpanded`: Expanded state variants

### Other Themes Assessed

| Theme | License | npm Package | Recommendation |
|-------|---------|-------------|----------------|
| **Material Icon Theme** | **MIT** | **Yes** (`material-icon-theme`) | **Primary choice** |
| Material Theme Icons | Apache 2.0 | No | Skip — less popular, no npm |
| Seti UI (VSCode built-in) | MIT (jesseweed/seti-ui) | No standalone | Possible fallback |
| JetBrains Icon Theme | Apache 2.0 | No | Skip |
| microsoft/vscode-icons | CC BY 4.0 | No | Skip — attribution required |

### Practical Integration Strategy

**Recommended approach for Next.js:**
1. Install `material-icon-theme` as dependency
2. At build time: use `generateManifest()` to create a static extension→icon-name map
3. Copy SVG icons to `public/` or import as React components via SVGR
4. At render time: O(1) lookup from filename → icon-name → SVG component
5. Lazy-load icon sets per-category to manage bundle size

**Alternative (simpler, Phase 1):**
1. Install `material-icon-theme`
2. Reference SVGs via `<img src>` tags pointing to icons in public/
3. Map extensions using the manifest data
4. No build-time processing needed

---

## Dependencies & Integration

### What This Feature Depends On

| Dependency | Type | Purpose | Risk if Changed |
|------------|------|---------|-----------------|
| `lucide-react` | npm (existing) | Fallback icons, action icons | Low — only adding, not replacing |
| `material-icon-theme` | npm (**new**) | SVG icons + manifest data | Medium — external dependency |
| `detectLanguage()` | Internal | Extension mapping reference | Low — read-only usage |
| `detectContentType()` | Internal | Binary file categorization | Low — read-only usage |
| `next-themes` | npm (existing) | Dark/light mode support | Low — natural integration |

### What Depends on This (Consumers)

| Consumer | How It Uses Icons | Breaking Change Risk |
|----------|-------------------|---------------------|
| FileTree | Primary consumer — renders per-file icon | N/A (new feature) |
| ChangesView | Could show file type icons in change list | Optional enhancement |
| ExplorerPanel search | Could show icons in search results | Optional enhancement |
| FlowSpace search results | Category icons already exist separately | No conflict |

---

## Quality & Testing

### Test Impact Assessment

| Test File | Lines | Impact | Action |
|-----------|-------|--------|--------|
| `test/unit/web/features/041-file-browser/file-tree.test.tsx` | 139 | **WILL BREAK** — SVG count assertions (line 102-111) | Update SVG count expectations |
| `test/unit/shared/lib/language-detection.test.ts` | 365 | No impact | Reference for icon test data |
| `test/unit/web/lib/content-type-detection.test.ts` | 124 | No impact | Reference for icon test data |
| `test/unit/web/features/041-file-browser/format-tree.test.ts` | 70 | No impact | Text-only formatting |
| `test/unit/web/features/041-file-browser/directory-listing.test.ts` | 108 | No impact | Server-side data |

**No snapshot tests exist** — safe to add visual changes.

### Performance Requirements
- Icon lookup: **O(1)** synchronous (Record/Map lookup)
- Must handle 10,000+ files in expanded directories
- FileTree uses lazy per-directory loading — icons render only for visible items
- No virtualization currently — lightweight icon resolution critical
- TreeItem is NOT memoized — avoid expensive computations in render path

### New Tests Needed
- `test/unit/web/lib/file-icon-detection.test.ts` — extension→icon mapping
- Edge cases: no extension, `.hidden`, `UPPERCASE.EXT`, unknown extensions, special filenames

---

## Prior Learnings (From Previous Implementations)

### PL-02: detectLanguage() Pattern is the Template
**Source**: Plan 041 Phase 4, DYK-P4-05
**What**: Shared utility maps extensions to language IDs for Shiki/CodeMirror
**Action**: Create `detectFileIcon()` as companion utility following identical pattern

### PL-03: Reuse detectContentType() Categories
**Source**: Plan 046, Binary File Viewers
**What**: Groups files by category (image/video/audio/pdf/binary) — reduces 100+ extensions to ~15 icon categories
**Action**: Use category grouping as first-pass icon selection, refine with specific extension overrides

### PL-04: SVG Security — Use Components, Not Raw SVG
**Source**: Plan 046, Finding 05
**What**: SVG files can contain malicious JS. Use `<img>` tags or React components, never `dangerouslySetInnerHTML`
**Action**: Render Material Icons via `<img>` tag or SVGR React components only

### PL-05: Lazy Tree Loading Means Icon Cost is O(visible)
**Source**: Plan 041, Phase 4, DYK-P4-01
**What**: FileTree fetches entries on demand per directory. Only visible items need icons
**Action**: Simple extension lookup is sufficient — no pre-loading needed

### PL-08: Handle Unknown Extensions Gracefully
**Source**: Plan 046, Tasks T001 & T004
**What**: Edge cases documented: `.exe`, `.bin`, zero-length extensions, symlinks. Tests cover case sensitivity, trailing dots
**Action**: Default fallback icon (generic File) for unmapped extensions. Test edge cases

### PL-11: Icons Must Work in Both Themes
**Source**: Plan 041, Phase 4, Task T018
**What**: Components adapt to light/dark mode via CSS classes
**Action**: Material Icon Theme SVGs use fixed colors — may need theme-aware variants or CSS filter approach

### Prior Learnings Summary

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-02 | pattern | Plan 041 P4 | detectLanguage() is the template | Create detectFileIcon() same way |
| PL-03 | reuse | Plan 046 | Content type categories reduce mapping | Use category grouping |
| PL-04 | security | Plan 046 | No raw SVG strings | Use `<img>` or React components |
| PL-05 | performance | Plan 041 P4 | Lazy tree = O(visible) icons | Simple lookup sufficient |
| PL-08 | edge-case | Plan 046 | Unknown extensions exist | Fallback icon required |
| PL-11 | theme | Plan 041 P4 | Dark/light mode required | Test both themes |

---

## Domain Context

### Relevant Domains

| Domain | Slug | Relationship | Key Contracts |
|--------|------|-------------|---------------|
| File Browser | `file-browser` | **Primary consumer** — renders icons in FileTree | FileTree, FileEntry, ChangesView |
| Viewer | `_platform/viewer` | **Logical owner** — file type visual representation | detectLanguage(), detectContentType(), detectContentType() |
| Panel Layout | `_platform/panel-layout` | Tangential — has own category icons for FlowSpace | FLOWSPACE_CATEGORY_ICONS |
| SDK | `_platform/sdk` | Future — icon theme as SDK setting | SDKSetting, useSDKSetting |

### Domain Ownership Recommendation

**Icon detection utility** → `_platform/viewer` (infrastructure domain)
- Follows the pattern: detectLanguage(), detectContentType(), **detectFileIcon()**
- Reusable across domains (FileTree, search results, future features)
- New contract: `detectFileIcon(filename) → FileIconInfo`

**Icon theme data** → `packages/shared` (if CLI needs it) or `apps/web/src/lib/` (web-only)

**Icon rendering** → `file-browser` (business domain)
- Calls detectFileIcon() in FileTree component
- Manages icon theme preference as SDK setting

### Domain Map Update Needed

```
file-browser -->|"detectFileIcon"| viewer
```

---

## Critical Discoveries

### Discovery 1: material-icon-theme npm Package Exists
**Impact**: Critical — eliminates the "extract from VSCode" problem entirely
**Source**: External research (Perplexity)
**What**: MIT-licensed npm package with `generateManifest()` API and ~1,200 SVG icons
**Why It Matters**: We can `npm install material-icon-theme` and get both the mapping data AND the icons. No manual extraction, no licensing concerns, maintained by community.
**Required Action**: Evaluate package size, API surface, and integration approach

### Discovery 2: Current Icon Rendering is Surgically Replaceable
**Impact**: Critical — low risk implementation
**Source**: Implementation Archaeologist (IA-02, IA-09)
**What**: Line 667 of file-tree.tsx is a single `<File>` component. Replace with `getFileIcon(entry.name)` call.
**Why It Matters**: Minimal code change surface. No architectural refactoring needed.

### Discovery 3: SVG Count Test Assertions Will Break
**Impact**: High — must update before merge
**Source**: Quality Investigator (QT-01)
**What**: `file-tree.test.tsx` lines 102-111 assert exactly 1 SVG per entry. If icons are `<img>` tags instead of inline SVGs, count changes.
**Required Action**: Update test assertions to account for new icon rendering

### Discovery 4: Material Icon SVGs Use Fixed Colors
**Impact**: High — dark mode consideration
**Source**: Prior Learning PL-11 + external research
**What**: Material Icon Theme SVGs have baked-in colors (not currentColor). They look great on dark backgrounds but may need contrast adjustments for light mode.
**Required Action**: Test both themes. Consider CSS `filter` or separate light/dark icon sets if needed. Or use icons as-is since most code editors use dark themes.

---

## Modification Considerations

### Safe to Modify
1. **file-tree.tsx line 667** — Replace `<File>` with dynamic icon (well-tested, clear slot)
2. **New utility file** — `src/lib/file-icon-detection.ts` (additive, no existing code touched)
3. **New test file** — `test/unit/web/lib/file-icon-detection.test.ts` (additive)

### Modify with Caution
1. **file-tree.test.tsx** — Update SVG count assertions (fragile test)
2. **FileEntry interface** — Adding optional fields is safe but affects all consumers
3. **Bundle size** — ~1,200 SVGs need careful loading strategy

### Danger Zones
1. **TreeItem render performance** — Do NOT add async operations or complex computations
2. **SVG inline rendering** — Security risk per PL-04; use `<img>` or safe components only

---

## Recommendations

### Approach A: material-icon-theme npm Package (Recommended)

**Pros:**
- MIT licensed, 20M+ users, actively maintained
- npm package with programmatic API (`generateManifest()`)
- ~1,200 icons covering virtually all file types
- Community-maintained mapping of extensions → icons
- Supports folder icons too (src/, test/, node_modules/, etc.)

**Cons:**
- Fixed-color SVGs (not CSS-themeable via currentColor)
- Large icon set (~1,200 SVGs) needs loading strategy
- External dependency to maintain

**Implementation sketch:**
```typescript
// 1. Build-time: generate static mapping
import { generateManifest } from 'material-icon-theme';
const manifest = generateManifest();
// Extract: fileExtensions, fileNames, folderNames → icon name

// 2. Copy needed SVGs to public/icons/ at build time

// 3. Runtime: O(1) lookup
function getFileIconUrl(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconName = manifest.fileExtensions[ext] || 'file';
  return `/icons/${iconName}.svg`;
}

// 4. Render: <img> tag in TreeItem
<img src={getFileIconUrl(entry.name)} className="h-4 w-4 shrink-0" alt="" />
```

### Approach B: Lucide React Icons Only (Simpler, Less Visual)

**Pros:**
- Zero new dependencies
- Already in the project, tree-shakeable
- CSS-themeable (inherits currentColor)

**Cons:**
- Only ~20 file-type icons (FileJson, FileCode, FileText, etc.)
- No language-specific icons (no TypeScript, Python, Rust logos)
- Less visually distinctive than Material Icons

### Approach C: Hybrid (Pragmatic Middle Ground)

Use Material Icon Theme SVGs for file icons but keep Lucide for folder icons and action icons. This preserves the existing folder styling while adding rich file type differentiation.

### Recommendation

**Start with Approach A (material-icon-theme)** — it's the most impactful for users and the npm package makes integration straightforward. If bundle size or theming proves problematic, fall back to Approach C.

---

## External Research Opportunities

### Research Opportunity 1: Material Icon Theme Bundle Optimization

**Why Needed**: The npm package contains ~1,200 SVGs. Need to understand actual bundle impact and optimization strategies (tree-shaking, dynamic import, build-time copying).
**Impact on Plan**: Determines whether we ship all icons or a curated subset.

**Ready-to-use prompt:**
```
/deepresearch "How to optimize loading ~1,200 SVG icons from material-icon-theme npm package in a Next.js 16 app with Turbopack. Specifically: (1) Can SVGs be tree-shaken if imported as React components via SVGR? (2) What's the bundle size impact of different approaches: inline SVG components vs <img> tags vs CSS sprites vs dynamic imports? (3) How do StackBlitz, CodeSandbox, and GitHub Codespaces handle file icon loading in their web-based editors? (4) Is there a build-time approach to generate a single optimized sprite sheet from the material-icon-theme package?"
```

### Research Opportunity 2: Dark/Light Theme Adaptation for Fixed-Color SVGs

**Why Needed**: Material Icon Theme SVGs have baked-in colors. Need to know if they work acceptably in both light and dark modes, or if CSS filter tricks are needed.
**Impact on Plan**: May require theme-conditional icon loading or CSS post-processing.

**Ready-to-use prompt:**
```
/deepresearch "How to handle fixed-color SVG icons (like Material Icon Theme for VSCode) in a web app that supports both light and dark modes. Approaches to evaluate: (1) CSS filter: invert/brightness/contrast on <img> SVGs (2) Separate light/dark icon variants (3) SVG currentColor injection at build time (4) Opacity/background contrast techniques. Which approach do web-based code editors like GitHub, VSCode Web, and StackBlitz use?"
```

---

## Appendix: File Inventory

### Core Files to Modify

| File | Purpose | Lines | Action |
|------|---------|-------|--------|
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | FileTree + TreeItem | 709 | Replace generic File icon with type-aware icon |
| `apps/web/src/lib/language-detection.ts` | Extension→language map | 114 | Reference (may extend) |
| `apps/web/src/lib/content-type-detection.ts` | Extension→content type | 75 | Reference (may extend) |

### New Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/lib/file-icon-detection.ts` | Icon detection utility (detectFileIcon) |
| `test/unit/web/lib/file-icon-detection.test.ts` | Tests for icon detection |
| `apps/web/scripts/generate-icon-manifest.ts` | Build-time icon processing (if needed) |

### Test Files to Update

| File | Lines | Change Needed |
|------|-------|---------------|
| `test/unit/web/features/041-file-browser/file-tree.test.tsx` | 139 | Update SVG count assertions |

---

## Harness Status

**Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
**Validation available**: Browser automation via Playwright/CDP can visually verify icon rendering
**Recommendation**: Use harness screenshot tests to validate icons appear correctly in both themes

---

## Next Steps

**External research is optional but recommended** for bundle optimization (Opportunity 1). The core approach is clear:

1. Run `/plan-1b-specify "Add file type icons to the tree view using material-icon-theme npm package"` to create the feature specification
2. Optionally run `/deepresearch` prompts above for bundle optimization and theming strategies

---

**Research Complete**: 2026-03-09T11:35:00Z
**Report Location**: docs/plans/073-file-icons/research-dossier.md
