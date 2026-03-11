import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveFileIcon, resolveFolderIcon } from '@/features/_platform/themes/lib/icon-resolver';
import { clearManifestCache, loadManifest } from '@/features/_platform/themes/lib/manifest-loader';
import type { IconThemeManifest } from '@/features/_platform/themes/types';
import { generateManifest } from 'material-icon-theme';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Icon resolver tests using REAL material-icon-theme manifest data.
 * No mocks — per spec Testing Strategy.
 */

const GENERATED_MANIFEST_EXISTS = existsSync(
  join(process.cwd(), 'apps/web/public/icons/material-icon-theme/manifest.json')
);

let manifest: IconThemeManifest;

beforeAll(() => {
  const raw = generateManifest();
  manifest = {
    fileNames: raw.fileNames ?? {},
    fileExtensions: raw.fileExtensions ?? {},
    languageIds: raw.languageIds ?? {},
    folderNames: raw.folderNames ?? {},
    folderNamesExpanded: raw.folderNamesExpanded ?? {},
    iconDefinitions: raw.iconDefinitions ?? {},
    light: {
      fileNames: raw.light?.fileNames,
      fileExtensions: raw.light?.fileExtensions,
      languageIds: raw.light?.languageIds,
      folderNames: raw.light?.folderNames,
      folderNamesExpanded: raw.light?.folderNamesExpanded,
    },
    file: raw.file ?? 'file',
    folder: raw.folder ?? 'folder',
    folderExpanded: raw.folderExpanded ?? 'folder-open',
  };
});

describe('resolveFileIcon', () => {
  describe('fileNames lookup (highest priority)', () => {
    it('resolves package.json to nodejs', () => {
      /*
      Test Doc:
      - Why: package.json is one of the most common special filenames.
      - Contract: Exact filename match takes highest priority via manifest.fileNames.
      - Usage Notes: Uses real material-icon-theme manifest data.
      - Quality Contribution: Validates fileNames source is checked before extensions.
      - Worked Example: 'package.json' → {iconName: 'nodejs', source: 'fileName'}.
      */
      const result = resolveFileIcon('package.json', manifest);
      expect(result.iconName).toBe('nodejs');
      expect(result.source).toBe('fileName');
      expect(result.iconPath).toContain('nodejs.svg');
    });

    it('resolves dockerfile (case-insensitive) to docker', () => {
      /*
      Test Doc:
      - Why: Dockerfile has mixed-case convention; resolver must be case-insensitive.
      - Contract: fileNames lookup lowercases input for matching.
      - Usage Notes: Real manifest has 'dockerfile' key (lowercase).
      - Quality Contribution: Catches case-sensitivity regressions.
      - Worked Example: 'Dockerfile' → {iconName: 'docker', source: 'fileName'}.
      */
      const result = resolveFileIcon('Dockerfile', manifest);
      expect(result.iconName).toBe('docker');
      expect(result.source).toBe('fileName');
    });

    it('resolves .gitignore to git', () => {
      const result = resolveFileIcon('.gitignore', manifest);
      expect(result.iconName).toBe('git');
      expect(result.source).toBe('fileName');
    });

    it('resolves tsconfig.json to tsconfig', () => {
      const result = resolveFileIcon('tsconfig.json', manifest);
      expect(result.iconName).toBe('tsconfig');
      expect(result.source).toBe('fileName');
    });

    it('resolves justfile to just', () => {
      const result = resolveFileIcon('justfile', manifest);
      expect(result.iconName).toBe('just');
      expect(result.source).toBe('fileName');
    });
  });

  describe('fileExtensions lookup with compound suffix support', () => {
    it('resolves .py to python via simple extension', () => {
      const result = resolveFileIcon('app.py', manifest);
      expect(result.iconName).toBe('python');
      expect(result.source).toBe('fileExtension');
      expect(result.iconPath).toContain('python.svg');
    });

    it('resolves .json to json', () => {
      const result = resolveFileIcon('data.json', manifest);
      expect(result.iconName).toBe('json');
      expect(result.source).toBe('fileExtension');
    });

    it('resolves .tsx to react_ts', () => {
      const result = resolveFileIcon('component.tsx', manifest);
      expect(result.iconName).toBe('react_ts');
      expect(result.source).toBe('fileExtension');
    });

    it('handles case-insensitive extensions', () => {
      const result = resolveFileIcon('data.JSON', manifest);
      expect(result.iconName).toBe('json');
    });

    it('resolves compound d.ts to typescript-def', () => {
      /*
      Test Doc:
      - Why: .d.ts is a common TypeScript declaration file with compound extension.
      - Contract: Longest extension match wins (d.ts before ts).
      - Usage Notes: manifest.fileExtensions has 'd.ts' → 'typescript-def'.
      - Quality Contribution: Catches compound suffix regression that returns generic ts.
      - Worked Example: 'index.d.ts' → {iconName: 'typescript-def', source: 'fileExtension'}.
      */
      const result = resolveFileIcon('index.d.ts', manifest);
      expect(result.iconName).toBe('typescript-def');
      expect(result.source).toBe('fileExtension');
    });

    it('resolves compound spec.ts to test-ts', () => {
      const result = resolveFileIcon('button.spec.ts', manifest);
      expect(result.iconName).toBe('test-ts');
      expect(result.source).toBe('fileExtension');
    });

    it('resolves compound route.tsx to routing', () => {
      const result = resolveFileIcon('app.route.tsx', manifest);
      expect(result.iconName).toBe('routing');
      expect(result.source).toBe('fileExtension');
    });

    it('resolves compound stories.tsx to storybook', () => {
      const result = resolveFileIcon('Button.stories.tsx', manifest);
      expect(result.iconName).toBe('storybook');
      expect(result.source).toBe('fileExtension');
    });

    it('resolves .env via fileExtensions', () => {
      /*
      Test Doc:
      - Why: .env is a leading-dot file that should match via fileExtensions['env'].
      - Contract: After fileNames check fails for '.env.local', extension 'env' matches.
      - Usage Notes: manifest.fileExtensions['env'] → 'tune'.
      - Quality Contribution: Catches leading-dot extension extraction bugs.
      - Worked Example: '.env.local' → {iconName via extension match}.
      */
      // .env itself might be in fileNames; .env.local tests extension fallback
      const result = resolveFileIcon('.env.local', manifest);
      expect(result.iconName).toBeDefined();
      expect(result.source).not.toBe('default');
    });

    it('resolves hyphen-suffixed filenames via extension candidates', () => {
      // Inject custom extensions for plan artifacts (simulating what generate-icon-assets does)
      const customManifest = {
        ...manifest,
        fileExtensions: { ...manifest.fileExtensions, 'spec.md': 'document', 'plan.md': 'roadmap' },
      };
      // file-icons-spec.md → candidates include "spec.md" via hyphen-suffix scanning
      const specResult = resolveFileIcon('file-icons-spec.md', customManifest);
      expect(specResult.iconName).toBe('document');
      expect(specResult.source).toBe('fileExtension');

      const planResult = resolveFileIcon('file-icons-plan.md', customManifest);
      expect(planResult.iconName).toBe('roadmap');
      expect(planResult.source).toBe('fileExtension');
    });
  });

  describe('languageIds lookup via detectLanguage() bridge', () => {
    it('resolves .ts via languageIds (NOT in fileExtensions)', () => {
      /*
      Test Doc:
      - Why: .ts is NOT in manifest.fileExtensions — only in languageIds as 'typescript'.
      - Contract: When fileExtensions has no match, resolver bridges via detectLanguage().
      - Usage Notes: Uses real manifest where fileExtensions['ts'] is undefined.
      - Quality Contribution: Critical regression guard — .ts is the most common missed case.
      - Worked Example: 'app.ts' → {iconName: 'typescript', source: 'languageId'}.
      */
      const result = resolveFileIcon('app.ts', manifest);
      expect(result.iconName).toBe('typescript');
      expect(result.source).toBe('languageId');
      expect(result.iconPath).toContain('typescript.svg');
    });

    it('resolves .js via languageIds or fileExtensions', () => {
      const result = resolveFileIcon('index.js', manifest);
      expect(result.iconName).toBe('javascript');
    });
  });

  describe('fallback to default', () => {
    it('returns default file icon for unknown extension', () => {
      const result = resolveFileIcon('data.xyz', manifest);
      expect(result.iconName).toBe('file');
      expect(result.source).toBe('default');
      expect(result.iconPath).toContain('file.svg');
    });

    it('returns default file icon for file with no extension', () => {
      const result = resolveFileIcon('RANDOMFILE', manifest);
      expect(result.iconName).toBe('file');
      expect(result.source).toBe('default');
    });

    it('returns default file icon for unknown dotfile', () => {
      const result = resolveFileIcon('.unknowndotfile', manifest);
      expect(result.source).toBe('default');
    });
  });

  describe('iconPath derivation', () => {
    it('includes iconPath from manifest.iconDefinitions', () => {
      const result = resolveFileIcon('package.json', manifest);
      expect(result.iconPath).toBeTruthy();
      expect(result.iconPath).toContain('.svg');
    });

    it('includes iconPath for folder resolution', () => {
      const result = resolveFolderIcon('src', false, manifest);
      expect(result.iconPath).toBeTruthy();
      expect(result.iconPath).toContain('.svg');
    });

    it('includes iconPath for default fallback', () => {
      const result = resolveFileIcon('unknown.xyz', manifest);
      expect(result.iconPath).toContain('file.svg');
    });
  });

  describe('light-mode overrides', () => {
    it('returns light-mode override when available', () => {
      const lightExts = Object.keys(manifest.light.fileExtensions ?? {});
      if (lightExts.length > 0) {
        const ext = lightExts[0];
        const filename = `test.${ext}`;
        const lightResult = resolveFileIcon(filename, manifest, 'light');
        expect(lightResult.iconName).toBeDefined();
      }
    });

    it('falls back to base manifest when no light override exists', () => {
      const result = resolveFileIcon('app.py', manifest, 'light');
      expect(result.iconName).toBe('python');
    });

    it('uses base manifest when theme is undefined or dark', () => {
      const result1 = resolveFileIcon('app.py', manifest);
      const result2 = resolveFileIcon('app.py', manifest, 'dark');
      expect(result1.iconName).toBe(result2.iconName);
    });
  });
});

describe('resolveFolderIcon', () => {
  describe('named folder resolution', () => {
    it('resolves src folder (collapsed)', () => {
      const result = resolveFolderIcon('src', false, manifest);
      expect(result.iconName).toBe('folder-src');
      expect(result.source).toBe('fileName');
      expect(result.iconPath).toContain('folder-src.svg');
    });

    it('resolves src folder (expanded)', () => {
      const result = resolveFolderIcon('src', true, manifest);
      expect(result.iconName).toBe('folder-src-open');
      expect(result.source).toBe('fileName');
    });

    it('resolves node_modules folder', () => {
      const result = resolveFolderIcon('node_modules', false, manifest);
      expect(result.iconName).toBe('folder-node');
      expect(result.source).toBe('fileName');
    });

    it('resolves test folder', () => {
      const result = resolveFolderIcon('test', false, manifest);
      expect(result.iconName).toBe('folder-test');
      expect(result.source).toBe('fileName');
    });

    it('resolves .git folder', () => {
      const result = resolveFolderIcon('.git', false, manifest);
      expect(result.iconName).toBe('folder-git');
      expect(result.source).toBe('fileName');
    });
  });

  describe('default folder fallback', () => {
    it('returns default folder for unknown name (collapsed)', () => {
      const result = resolveFolderIcon('random-folder-xyz', false, manifest);
      expect(result.iconName).toBe('folder');
      expect(result.source).toBe('default');
    });

    it('returns default folder-open for unknown name (expanded)', () => {
      const result = resolveFolderIcon('random-folder-xyz', true, manifest);
      expect(result.iconName).toBe('folder-open');
      expect(result.source).toBe('default');
    });
  });
});

describe('loadManifest', () => {
  beforeAll(() => {
    clearManifestCache();
  });

  // These tests require generated assets (run: npx tsx scripts/generate-icon-assets.ts)
  // They skip gracefully on clean checkouts where assets haven't been generated yet.

  it.skipIf(!GENERATED_MANIFEST_EXISTS)('returns a valid IconThemeManifest shape', async () => {
    const m = await loadManifest('material-icon-theme');
    expect(m.fileNames).toBeDefined();
    expect(m.fileExtensions).toBeDefined();
    expect(m.languageIds).toBeDefined();
    expect(m.folderNames).toBeDefined();
    expect(m.folderNamesExpanded).toBeDefined();
    expect(m.iconDefinitions).toBeDefined();
    expect(m.light).toBeDefined();
    expect(m.file).toBe('file');
    expect(m.folder).toBe('folder');
    expect(m.folderExpanded).toBe('folder-open');
  });

  it.skipIf(!GENERATED_MANIFEST_EXISTS)(
    'caches the manifest and returns same reference',
    async () => {
      const first = await loadManifest('material-icon-theme');
      const second = await loadManifest('material-icon-theme');
      expect(second).toBe(first);
    }
  );

  it.skipIf(!GENERATED_MANIFEST_EXISTS)(
    'clears cache when clearManifestCache is called',
    async () => {
      const first = await loadManifest('material-icon-theme');
      clearManifestCache();
      const second = await loadManifest('material-icon-theme');
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    }
  );

  it.skipIf(!GENERATED_MANIFEST_EXISTS)(
    'loads real manifest with correct entry counts',
    async () => {
      /*
      Test Doc:
      - Why: Verify the generated manifest has substantial data, not the Phase 1 placeholder.
      - Contract: loadManifest returns manifest with real icon theme data.
      - Usage Notes: Requires generated icons in public/icons/ (run generate-icon-assets.ts first).
      - Quality Contribution: Catches regression to placeholder manifest.
      - Worked Example: loadManifest('material-icon-theme') returns manifest with 1000+ fileNames.
      */
      const m = await loadManifest('material-icon-theme');
      expect(Object.keys(m.fileNames).length).toBeGreaterThan(1000);
      expect(Object.keys(m.fileExtensions).length).toBeGreaterThan(500);
      expect(Object.keys(m.iconDefinitions).length).toBeGreaterThan(1000);
    }
  );

  it('throws actionable error for unknown theme', async () => {
    clearManifestCache();
    await expect(loadManifest('nonexistent-theme')).rejects.toThrow('Icon assets not generated');
  });
});
