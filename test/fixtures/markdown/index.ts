/**
 * Pinned markdown corpus for round-trip fidelity tests (Phase 6 / T001).
 *
 * Three real docs from the plan tree + three synthetic edge-case fixtures.
 * Each entry tags which edge cases it exercises so the T002 test matrix
 * can assert coverage explicitly.
 */

import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../../../');
const FIXTURES_DIR = resolve(import.meta.dirname);

export interface CorpusFile {
  readonly label: string;
  readonly path: string;
  readonly edgeCases: readonly string[];
}

/**
 * The full pinned corpus. Paths are absolute so tests can `readFileSync`
 * without worrying about cwd.
 */
export const CORPUS_FILES: readonly CorpusFile[] = [
  // --- Real docs (exercising normal markdown + front-matter) ---
  {
    label: 'md-editor-spec',
    path: resolve(REPO_ROOT, 'docs/plans/083-md-editor/md-editor-spec.md'),
    edgeCases: ['headings', 'lists', 'inline-code', 'links', 'tables'],
  },
  {
    label: 'research-dossier',
    path: resolve(REPO_ROOT, 'docs/plans/083-md-editor/research-dossier.md'),
    edgeCases: ['tables', 'code-blocks', 'nested-lists'],
  },
  {
    label: 'adr-0001',
    path: resolve(REPO_ROOT, 'docs/adr/adr-0001-mcp-tool-design-patterns.md'),
    edgeCases: ['front-matter', 'headings', 'code-blocks'],
  },

  // --- Synthetic fixtures (targeted edge cases) ---
  {
    label: 'tables-only',
    path: resolve(FIXTURES_DIR, 'tables-only.md'),
    edgeCases: ['tables', 'alignment-markers', 'no-front-matter'],
  },
  {
    label: 'frontmatter-weird',
    path: resolve(FIXTURES_DIR, 'frontmatter-weird.md'),
    edgeCases: [
      'bom',
      'crlf',
      'nested-yaml-dashes',
      'multiline-scalars',
      'yaml-floats',
      'inline-hr-after-frontmatter',
    ],
  },
  {
    label: 'references-and-images',
    path: resolve(FIXTURES_DIR, 'references-and-images.md'),
    edgeCases: ['reference-links', 'relative-images', 'link-definitions'],
  },
] as const;
