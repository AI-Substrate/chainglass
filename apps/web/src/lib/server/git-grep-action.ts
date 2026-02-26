'use server';

/**
 * Git Grep Content Search Server Action
 *
 * Calls `git grep` via execFile for file content search.
 * Uses --fixed-strings by default, auto-upgrades to regex when intentional.
 *
 * Plan 052: Built-in Content Search
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { GrepSearchResult } from '@/features/_platform/panel-layout/types';

const execFileAsync = promisify(execFile);

const LOG_PREFIX = '[git-grep]';
function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

// Intentional regex patterns — if query contains these, use regex mode
const REGEX_INTENT = /\.\*|\\\b|\^|\$|\\d|\\w|\[.*\]|\(.*\)/;

// Source file extensions to search
const SOURCE_GLOBS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.json',
  '*.md',
  '*.yaml',
  '*.yml',
  '*.css',
];

let gitAvailableCache: boolean | null = null;

/**
 * Check if git is available. Cached after first check.
 */
async function isGitAvailable(): Promise<boolean> {
  if (gitAvailableCache !== null) return gitAvailableCache;
  try {
    await execFileAsync('git', ['--version'], { timeout: 3000 });
    gitAvailableCache = true;
    return true;
  } catch {
    gitAvailableCache = false;
    return false;
  }
}

/**
 * Check if directory is a git repository.
 */
async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd, timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if query is an intentional regex pattern.
 */
function isRegexIntent(query: string): boolean {
  return REGEX_INTENT.test(query);
}

/**
 * Parse git grep output line: "filepath:lineNumber:content"
 */
function parseGrepLine(
  line: string
): { filePath: string; lineNumber: number; content: string } | null {
  // Format: filepath:lineNo:content
  // filepath can contain colons on Windows but not on Unix
  const firstColon = line.indexOf(':');
  if (firstColon === -1) return null;

  const rest = line.slice(firstColon + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) return null;

  const filePath = line.slice(0, firstColon);
  const lineNumber = Number.parseInt(rest.slice(0, secondColon), 10);
  const content = rest.slice(secondColon + 1);

  if (Number.isNaN(lineNumber)) return null;

  return { filePath, lineNumber, content };
}

/**
 * Search file content using git grep.
 */
export async function gitGrepSearch(
  query: string,
  cwd: string
): Promise<{ results: GrepSearchResult[] } | { error: string }> {
  if (!query.trim()) {
    return { results: [] };
  }

  if (!(await isGitAvailable())) {
    return { error: 'Git is not installed' };
  }

  if (!(await isGitRepo(cwd))) {
    return { error: 'Git repository required for content search' };
  }

  const useRegex = isRegexIntent(query);
  const args = [
    'grep',
    '-n', // line numbers
    '-i', // case insensitive
    ...(useRegex ? [] : ['-F']), // fixed strings unless intentional regex
    '--untracked', // include untracked files
    '--max-count=5', // limit per-file matches
    '-I', // skip binary files
    '-e',
    query, // -e ensures query starting with - isn't treated as option
    '--',
    ...SOURCE_GLOBS,
  ];

  log('search →', { query, useRegex, cwd });

  try {
    const startMs = Date.now();
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 3000,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (stderr) {
      log('stderr:', stderr.trim());
    }

    // Parse output and group by file
    const fileMap = new Map<string, { lines: { lineNumber: number; content: string }[] }>();

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const parsed = parseGrepLine(line);
      if (!parsed) continue;

      const existing = fileMap.get(parsed.filePath);
      if (existing) {
        existing.lines.push({ lineNumber: parsed.lineNumber, content: parsed.content });
      } else {
        fileMap.set(parsed.filePath, {
          lines: [{ lineNumber: parsed.lineNumber, content: parsed.content }],
        });
      }
    }

    // Build results — one per file, sorted by match count (most matches first)
    const fileEntries = [...fileMap.entries()]
      .sort((a, b) => b[1].lines.length - a[1].lines.length)
      .slice(0, 20);

    const results: GrepSearchResult[] = fileEntries.map(([filePath, data]) => {
      const firstMatch = data.lines[0];
      const parts = filePath.split('/');
      const filename = parts[parts.length - 1];

      return {
        kind: 'grep' as const,
        filePath,
        filename,
        lineNumber: firstMatch.lineNumber,
        matchContent: firstMatch.content.trim().slice(0, 200),
        matchCount: data.lines.length,
      };
    });

    const elapsedMs = Date.now() - startMs;
    log(`search ← ${results.length} files (${fileMap.size} total) in ${elapsedMs}ms`);

    return { results };
  } catch (err: unknown) {
    const error = err as { code?: number; stderr?: string; message?: string; killed?: boolean };

    log('search ERROR:', {
      code: error.code,
      killed: error.killed,
      stderr: error.stderr?.slice(0, 200),
    });

    // git grep exits 1 when no matches — this is normal
    if (error.code === 1 && !error.stderr?.trim()) {
      return { results: [] };
    }

    if (error.killed) {
      return { error: 'Search timed out. Try a more specific query.' };
    }

    if (error.stderr?.includes('invalid regexp')) {
      return { error: 'Invalid search pattern' };
    }

    const firstLine = error.stderr
      ?.split('\n')
      .find((l) => l.trim())
      ?.trim();
    return { error: firstLine || 'Search failed' };
  }
}
