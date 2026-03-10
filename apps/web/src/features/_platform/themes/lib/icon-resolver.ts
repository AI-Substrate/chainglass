import { detectLanguage } from '@/lib/language-detection';
import type { IconResolution, IconThemeManifest } from '../types';

// VSCode language IDs used by material-icon-theme differ from Shiki IDs.
// This maps detectLanguage() output → manifest.languageIds keys.
const SHIKI_TO_VSCODE_LANGUAGE_ID: Record<string, string> = {
  typescript: 'typescript',
  tsx: 'typescriptreact',
  javascript: 'javascript',
  jsx: 'javascriptreact',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  c: 'c',
  ruby: 'ruby',
  php: 'php',
  swift: 'swift',
  kotlin: 'kotlin',
  scala: 'scala',
  r: 'r',
  lua: 'lua',
  perl: 'perl',
  haskell: 'haskell',
  elixir: 'elixir',
  erlang: 'erlang',
  clojure: 'clojure',
  dart: 'dart',
  sql: 'sql',
  graphql: 'graphql',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  jsonc: 'jsonc',
  markdown: 'markdown',
  vue: 'vue',
  svelte: 'svelte',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  shellscript: 'shellscript',
  bash: 'shellscript',
  powershell: 'powershell',
  bat: 'bat',
};

function toResolution(
  iconName: string,
  source: IconResolution['source'],
  manifest: IconThemeManifest
): IconResolution {
  const def = manifest.iconDefinitions[iconName];
  const iconPath = def?.iconPath ?? '';
  return { iconName, iconPath, source };
}

/**
 * Generate extension candidates from longest to shortest for compound suffix matching.
 * e.g., "index.d.ts" → ["d.ts", "ts"]
 *        ".env" → ["env"]
 *        "app.spec.tsx" → ["spec.tsx", "tsx"]
 */
function getExtensionCandidates(lowerFilename: string): string[] {
  const candidates: string[] = [];
  const basename = lowerFilename.includes('/')
    ? lowerFilename.slice(lowerFilename.lastIndexOf('/') + 1)
    : lowerFilename;

  let idx = 0;
  while (idx < basename.length) {
    const dotPos = basename.indexOf('.', idx);
    if (dotPos === -1) break;
    const suffix = basename.slice(dotPos + 1);
    if (suffix.length > 0) {
      candidates.push(suffix);
    }
    idx = dotPos + 1;
  }
  return candidates;
}

/**
 * Resolve a filename to an icon using the VSCode icon theme manifest format.
 * Priority: fileNames → fileExtensions (longest match) → languageIds → default.
 * When theme is 'light', checks manifest.light.* first for each source.
 */
export function resolveFileIcon(
  filename: string,
  manifest: IconThemeManifest,
  theme?: 'light' | 'dark'
): IconResolution {
  const lowerFilename = filename.toLowerCase();

  // 1. Check fileNames (exact filename match)
  if (theme === 'light' && manifest.light.fileNames) {
    const lightMatch = manifest.light.fileNames[lowerFilename];
    if (lightMatch) return toResolution(lightMatch, 'fileName', manifest);
  }
  const fileNameMatch = manifest.fileNames[lowerFilename];
  if (fileNameMatch) return toResolution(fileNameMatch, 'fileName', manifest);

  // 2. Check fileExtensions with longest-match (supports compound: d.ts, spec.ts, route.tsx)
  const candidates = getExtensionCandidates(lowerFilename);
  for (const candidate of candidates) {
    if (theme === 'light' && manifest.light.fileExtensions) {
      const lightMatch = manifest.light.fileExtensions[candidate];
      if (lightMatch) return toResolution(lightMatch, 'fileExtension', manifest);
    }
    const extMatch = manifest.fileExtensions[candidate];
    if (extMatch) return toResolution(extMatch, 'fileExtension', manifest);
  }

  // 3. Check languageIds via detectLanguage() bridge
  const shikiLang = detectLanguage(filename);
  if (shikiLang !== 'text') {
    const vscodeLang = SHIKI_TO_VSCODE_LANGUAGE_ID[shikiLang] ?? shikiLang;
    if (theme === 'light' && manifest.light.languageIds) {
      const lightMatch = manifest.light.languageIds[vscodeLang];
      if (lightMatch) return toResolution(lightMatch, 'languageId', manifest);
    }
    const langMatch = manifest.languageIds[vscodeLang];
    if (langMatch) return toResolution(langMatch, 'languageId', manifest);
  }

  // 4. Default
  return toResolution(manifest.file, 'default', manifest);
}

/**
 * Resolve a folder name to a folder icon.
 * Checks folderNames/folderNamesExpanded → default folder/folder-open.
 */
export function resolveFolderIcon(
  folderName: string,
  expanded: boolean,
  manifest: IconThemeManifest,
  theme?: 'light' | 'dark'
): IconResolution {
  const lowerName = folderName.toLowerCase();
  const source = expanded ? manifest.folderNamesExpanded : manifest.folderNames;

  if (theme === 'light') {
    const lightSource = expanded ? manifest.light.folderNamesExpanded : manifest.light.folderNames;
    if (lightSource) {
      const lightMatch = lightSource[lowerName];
      if (lightMatch) return toResolution(lightMatch, 'fileName', manifest);
    }
  }

  const match = source[lowerName];
  if (match) return toResolution(match, 'fileName', manifest);

  // Default
  const defaultIcon = expanded ? manifest.folderExpanded : manifest.folder;
  return toResolution(defaultIcon, 'default', manifest);
}
