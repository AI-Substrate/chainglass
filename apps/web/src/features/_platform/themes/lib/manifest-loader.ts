import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IconThemeManifest } from '../types';

const manifestCache = new Map<string, IconThemeManifest>();

/**
 * Candidate paths for finding the generated manifest.
 * - From monorepo root (vitest, turbo): apps/web/public/icons/{themeId}/manifest.json
 * - From apps/web (Next.js dev/build): public/icons/{themeId}/manifest.json
 */
function getManifestCandidates(themeId: string): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, 'apps/web/public/icons', themeId, 'manifest.json'),
    join(cwd, 'public/icons', themeId, 'manifest.json'),
  ];
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * Load an icon theme manifest by theme ID.
 * Reads the generated manifest.json from public/icons/{themeId}/.
 * Caches per themeId — call clearManifestCache() to force reload.
 *
 * NOTE: Uses node:fs — this is server-only. Client components should
 * receive the manifest via props or React context (Phase 3).
 */
export async function loadManifest(themeId: string): Promise<IconThemeManifest> {
  const cached = manifestCache.get(themeId);
  if (cached) return cached;

  const candidates = getManifestCandidates(themeId);

  for (const manifestPath of candidates) {
    try {
      const data = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(data) as IconThemeManifest;
      manifestCache.set(themeId, manifest);
      return manifest;
    } catch (error) {
      if (isFileNotFound(error)) continue;
      throw new Error(`Failed to load icon manifest from ${manifestPath}: ${error}`);
    }
  }

  throw new Error('Icon assets not generated. Run: npx tsx scripts/generate-icon-assets.ts');
}

/** Clear cached manifest (for testing or theme switching) */
export function clearManifestCache(): void {
  manifestCache.clear();
}
