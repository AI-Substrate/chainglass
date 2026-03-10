# How to Add a New Icon Theme

This guide explains how to add a VSCode-compatible icon theme to Chainglass. The architecture supports multiple icon themes — adding a new one requires an npm package, a build pipeline update, and an SDK setting registration.

## Prerequisites

- The icon theme must be published as an npm package with SVG icon files
- The theme must provide a manifest (or a way to generate one) mapping filenames, extensions, and language IDs to icon names
- The theme should be MIT or similarly licensed

## Steps

### 1. Install the npm package

Add the icon theme as a dev dependency (icons are build-time assets, not runtime):

```bash
pnpm add -D your-icon-theme -w
```

### 2. Update the icon generation script

Edit `scripts/generate-icon-assets.ts` to include the new theme. The script already handles the `material-icon-theme` — add a parallel section for your theme.

Key functions to update:

```typescript
// Add a new theme configuration
const THEMES = [
  {
    id: 'material-icon-theme',
    packageName: 'material-icon-theme',
    generateManifest: () => require('material-icon-theme').generateManifest(),
    iconsDir: 'node_modules/material-icon-theme/icons',
  },
  {
    id: 'your-theme-id',
    packageName: 'your-icon-theme',
    generateManifest: () => /* theme-specific manifest generation */,
    iconsDir: 'node_modules/your-icon-theme/icons',
  },
];
```

The script will:
- Generate a manifest from the theme's API
- Copy and optimize SVGs with SVGO
- Output to `apps/web/public/icons/{theme-id}/`
- Write `manifest.json` for client-side consumption

### 3. Verify the manifest shape

The manifest must conform to `IconThemeManifest` (defined in `apps/web/src/features/_platform/themes/types.ts`):

```typescript
interface IconThemeManifest {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  languageIds: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  file: string;           // default file icon name
  folder: string;         // default folder icon name
  folderExpanded: string; // default expanded folder icon name
  rootFolder?: string;
  rootFolderExpanded?: string;
  light?: {
    fileNames?: Record<string, string>;
    fileExtensions?: Record<string, string>;
    languageIds?: Record<string, string>;
    folderNames?: Record<string, string>;
    folderNamesExpanded?: Record<string, string>;
  };
}
```

### 4. Register the theme in SDK settings

Add the new theme as an option in `apps/web/src/features/_platform/themes/sdk/contribution.ts`:

```typescript
export const iconThemeSetting = {
  key: 'themes.iconTheme',
  schema: z.string().default('material-icon-theme'),
  ui: 'select' as const,
  label: 'Icon Theme',
  description: 'Choose which file icon theme to display',
  options: [
    { label: 'Material Icon Theme', value: 'material-icon-theme' },
    { label: 'Your Theme Name', value: 'your-theme-id' },  // ← add here
  ],
  section: 'Appearance',
};
```

### 5. Run the generation script

```bash
npx tsx scripts/generate-icon-assets.ts --force
```

This generates the icon assets and manifest. The `--force` flag bypasses the freshness check.

### 6. Test locally

```bash
pnpm dev
```

The `predev` hook automatically runs the generation script. Open the file browser and verify icons render correctly.

### 7. Verify the output

Check that the generated assets are correct:

```
apps/web/public/icons/your-theme-id/
├── manifest.json        # Runtime manifest
├── *.svg                # Icon files
└── .version             # Freshness sentinel
```

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│ scripts/generate-icon-assets.ts              │
│  └─ Reads npm package → generates manifest   │
│  └─ Copies + optimizes SVGs with SVGO        │
│  └─ Outputs to public/icons/{theme-id}/      │
└──────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│ apps/web/public/icons/{theme-id}/            │
│  └─ manifest.json (runtime manifest)         │
│  └─ *.svg (optimized icon files)             │
└──────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│ IconThemeProvider (client-side)               │
│  └─ Fetches /icons/{themeId}/manifest.json   │
│  └─ Provides manifest via React context      │
└──────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────┐
│ FileIcon / FolderIcon components             │
│  └─ resolveFileIcon(filename, manifest)      │
│  └─ Renders <img src="/icons/.../{name}.svg">│
└──────────────────────────────────────────────┘
```

## Resolution Priority

The icon resolver checks these sources in order:

1. **fileNames** — exact filename match (e.g., `package.json` → `nodejs`)
2. **fileExtensions** — extension match with compound suffix support (e.g., `.d.ts` → `typescript-def`)
3. **languageIds** — language detection bridge (e.g., `.ts` → `typescript` via language ID)
4. **default** — falls back to generic `file` icon

For folders: `folderNames` / `folderNamesExpanded` → default `folder` / `folder-open`.

## Light Mode Support

If your theme provides light-mode icon variants:

1. Include `_light.svg` files in the SVG directory
2. Populate `manifest.light.*` sections with light-mode overrides
3. The resolver automatically checks `manifest.light.*` when `resolvedTheme === 'light'`

## Notes

- Icons are **build-time generated** and gitignored (`apps/web/public/icons/`)
- `just kill-cache` and `just clean` remove generated icons
- Cache headers serve icons with `Cache-Control: public, immutable, max-age=31536000`
- The freshness check uses a `.version` sentinel file — delete it or use `--force` to regenerate
