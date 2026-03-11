/**
 * generate-icon-assets.ts
 *
 * Build-time script that extracts, optimizes, and deploys SVG icon assets
 * from the material-icon-theme npm package into apps/web/public/icons/.
 *
 * Usage:
 *   npx tsx scripts/generate-icon-assets.ts [--force]
 *
 * The script:
 * 1. Reads the icon theme manifest via generateManifest()
 * 2. Collects all unique icon names referenced across all manifest sections
 * 3. Copies corresponding SVGs from node_modules/material-icon-theme/icons/
 * 4. Optimizes each SVG with SVGO
 * 5. Generates a normalized manifest.json for the runtime resolver
 *
 * Freshness check: compares material-icon-theme package version with a
 * sentinel file. Skips regeneration if icons are up to date (use --force to override).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { generateManifest } from 'material-icon-theme';
import { optimize } from 'svgo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT_DIR = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SOURCE_ICONS_DIR = join(ROOT_DIR, 'node_modules/material-icon-theme/icons');
const OUTPUT_DIR = join(ROOT_DIR, 'apps/web/public/icons/material-icon-theme');
const VERSION_SENTINEL = join(OUTPUT_DIR, '.version');
const MANIFEST_OUTPUT = join(OUTPUT_DIR, 'manifest.json');

const FORCE = process.argv.includes('--force');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[icon-assets] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[icon-assets] WARN: ${msg}`);
}

function getPackageVersion(): string {
  const pkgPath = join(ROOT_DIR, 'node_modules/material-icon-theme/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version as string;
}

function isFresh(version: string): boolean {
  if (!existsSync(VERSION_SENTINEL)) return false;
  if (!existsSync(MANIFEST_OUTPUT)) return false;
  const cached = readFileSync(VERSION_SENTINEL, 'utf-8').trim();
  return cached === version;
}

function ensureCleanDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Step 1: Collect icon names from manifest
// ---------------------------------------------------------------------------

interface ManifestData {
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  languageIds: Record<string, string>;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  iconDefinitions: Record<string, { iconPath: string }>;
  light: {
    fileNames?: Record<string, string>;
    fileExtensions?: Record<string, string>;
    languageIds?: Record<string, string>;
    folderNames?: Record<string, string>;
    folderNamesExpanded?: Record<string, string>;
  };
  file: string;
  folder: string;
  folderExpanded: string;
  rootFolder: string;
  rootFolderExpanded: string;
  hidesExplorerArrows: boolean;
}

function collectIconNames(manifest: ManifestData): Set<string> {
  const names = new Set<string>();

  // Collect from all mapping sections
  const sections: Record<string, string>[] = [
    manifest.fileNames,
    manifest.fileExtensions,
    manifest.languageIds,
    manifest.folderNames,
    manifest.folderNamesExpanded,
  ];

  for (const section of sections) {
    for (const iconName of Object.values(section)) {
      names.add(iconName);
    }
  }

  // Collect from light overrides
  const lightSections: (Record<string, string> | undefined)[] = [
    manifest.light.fileNames,
    manifest.light.fileExtensions,
    manifest.light.languageIds,
    manifest.light.folderNames,
    manifest.light.folderNamesExpanded,
  ];

  for (const section of lightSections) {
    if (section) {
      for (const iconName of Object.values(section)) {
        names.add(iconName);
      }
    }
  }

  // Collect defaults
  names.add(manifest.file);
  names.add(manifest.folder);
  names.add(manifest.folderExpanded);
  if (manifest.rootFolder) names.add(manifest.rootFolder);
  if (manifest.rootFolderExpanded) names.add(manifest.rootFolderExpanded);

  return names;
}

// ---------------------------------------------------------------------------
// Step 2: Copy + optimize SVGs
// ---------------------------------------------------------------------------

interface CopyResult {
  copied: Set<string>;
  skipped: number;
  totalRawBytes: number;
  totalOptBytes: number;
}

function copySvgs(iconNames: Set<string>): CopyResult {
  const result: CopyResult = {
    copied: new Set<string>(),
    skipped: 0,
    totalRawBytes: 0,
    totalOptBytes: 0,
  };

  for (const name of iconNames) {
    const srcPath = join(SOURCE_ICONS_DIR, `${name}.svg`);

    if (!existsSync(srcPath)) {
      warn(`Missing SVG for icon "${name}" — skipping`);
      result.skipped++;
      continue;
    }

    const raw = readFileSync(srcPath, 'utf-8');
    result.totalRawBytes += Buffer.byteLength(raw, 'utf-8');

    const optimized = optimize(raw, {
      multipass: true,
    });

    const outPath = join(OUTPUT_DIR, `${name}.svg`);
    writeFileSync(outPath, optimized.data, 'utf-8');
    result.totalOptBytes += Buffer.byteLength(optimized.data, 'utf-8');
    result.copied.add(name);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 3: Generate manifest.json
// ---------------------------------------------------------------------------

function generateManifestJson(manifest: ManifestData, copiedNames: Set<string>): void {
  // Build iconDefinitions with only the icons we actually copied
  const iconDefinitions: Record<string, { iconPath: string }> = {};
  for (const name of copiedNames) {
    if (manifest.iconDefinitions[name]) {
      iconDefinitions[name] = { iconPath: `${name}.svg` };
    }
  }

  // Filter mapping sections to only include icons that were copied
  function filterSection(section: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(section)) {
      if (copiedNames.has(value)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  const output = {
    fileNames: filterSection(manifest.fileNames),
    fileExtensions: filterSection(manifest.fileExtensions),
    languageIds: filterSection(manifest.languageIds),
    folderNames: filterSection(manifest.folderNames),
    folderNamesExpanded: filterSection(manifest.folderNamesExpanded),
    iconDefinitions,
    light: {
      fileNames: manifest.light.fileNames ? filterSection(manifest.light.fileNames) : undefined,
      fileExtensions: manifest.light.fileExtensions
        ? filterSection(manifest.light.fileExtensions)
        : undefined,
      languageIds: manifest.light.languageIds
        ? filterSection(manifest.light.languageIds)
        : undefined,
      folderNames: manifest.light.folderNames
        ? filterSection(manifest.light.folderNames)
        : undefined,
      folderNamesExpanded: manifest.light.folderNamesExpanded
        ? filterSection(manifest.light.folderNamesExpanded)
        : undefined,
    },
    file: manifest.file,
    folder: manifest.folder,
    folderExpanded: manifest.folderExpanded,
    rootFolder: manifest.rootFolder,
    rootFolderExpanded: manifest.rootFolderExpanded,
  };

  writeFileSync(MANIFEST_OUTPUT, JSON.stringify(output), 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  log('Starting icon asset generation...');

  const version = getPackageVersion();
  log(`material-icon-theme version: ${version}`);

  // Freshness check
  if (!FORCE && isFresh(version)) {
    log('Icons up to date — skipping (use --force to regenerate)');
    return;
  }

  if (FORCE) {
    log('--force flag set, regenerating all icons');
  }

  // Clean output directory
  ensureCleanDir(OUTPUT_DIR);

  // Generate manifest from material-icon-theme
  const manifest = generateManifest() as unknown as ManifestData;

  // Inject Chainglass plan artifact mappings (custom fileNames + folderNames)
  // These give first-class icon treatment to plan documents in docs/plans/
  // Note: fileExtensions uses compound dot-separated suffixes (e.g., "spec.md"
  // matches "foo.spec.md" but NOT "foo-spec.md"). For hyphenated names, use
  // fileNames for exact matches or add a suffix-scanning step.
  const customFileNames: Record<string, string> = {
    'tasks.md': 'todo',
    'tasks.fltplan.md': 'rocket',
    'execution.log.md': 'log',
  };
  const customFileExtensions: Record<string, string> = {
    'spec.md': 'document',
    'plan.md': 'roadmap',
    'fltplan.md': 'rocket',
    'log.md': 'log',
  };
  const customFolderNames: Record<string, string> = {
    plans: 'folder-project',
    tasks: 'folder-tasks',
  };
  const customFolderNamesExpanded: Record<string, string> = {
    plans: 'folder-project-open',
    tasks: 'folder-tasks-open',
  };

  Object.assign(manifest.fileNames, customFileNames);
  Object.assign(manifest.fileExtensions, customFileExtensions);
  Object.assign(manifest.folderNames, customFolderNames);
  Object.assign(manifest.folderNamesExpanded, customFolderNamesExpanded);
  log(`Injected ${Object.keys(customFileNames).length + Object.keys(customFileExtensions).length} custom file mappings, ${Object.keys(customFolderNames).length} custom folder mappings`);

  // Collect icon names
  const iconNames = collectIconNames(manifest);
  log(`Collected ${iconNames.size} unique icon names from manifest`);

  // Copy + optimize SVGs
  const copyResult = copySvgs(iconNames);
  const rawKB = (copyResult.totalRawBytes / 1024).toFixed(0);
  const optKB = (copyResult.totalOptBytes / 1024).toFixed(0);
  const savings = (
    ((copyResult.totalRawBytes - copyResult.totalOptBytes) / copyResult.totalRawBytes) *
    100
  ).toFixed(1);
  log(
    `Copied ${copyResult.copied.size} SVGs (${copyResult.skipped} skipped): ${rawKB}KB → ${optKB}KB (${savings}% reduction)`,
  );

  // Generate manifest.json (only includes icons that were actually copied)
  generateManifestJson(manifest, copyResult.copied);
  log(`Generated manifest.json`);

  // Write version sentinel
  writeFileSync(VERSION_SENTINEL, version, 'utf-8');
  log(`Wrote version sentinel (${version})`);

  log('Done!');
}

main();
