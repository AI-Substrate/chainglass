'use server';

/**
 * FlowSpace Search Server Action
 *
 * Calls the `fs2` CLI via execFile to search the codebase graph.
 * Provides availability detection and JSON result parsing.
 *
 * Plan 051: FlowSpace Code Search
 */

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type {
  FlowSpaceAvailability,
  FlowSpaceSearchMode,
  FlowSpaceSearchResult,
} from '@/features/_platform/panel-layout/types';

const execFileAsync = promisify(execFile);

const LOG_PREFIX = '[flowspace]';
function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

// Regex metacharacters that trigger regex mode upgrade
const REGEX_METACHARS = /[*?[\]^$|+{}()]/;

let fs2AvailableCache: boolean | null = null;

/**
 * Check if fs2 CLI is installed and the codebase graph exists.
 */
export async function checkFlowspaceAvailability(
  cwd: string
): Promise<{ availability: FlowSpaceAvailability; graphMtime?: number }> {
  log('availability check', { cwd });

  // Check fs2 binary
  if (fs2AvailableCache === null) {
    try {
      const { stdout } = await execFileAsync('fs2', ['--version'], { timeout: 3000 });
      fs2AvailableCache = true;
      log('fs2 found:', stdout.trim());
    } catch (err) {
      fs2AvailableCache = false;
      log('fs2 not found:', (err as Error).message);
    }
  }

  if (!fs2AvailableCache) {
    log('availability → not-installed');
    return { availability: 'not-installed' };
  }

  // Check graph exists
  const graphPath = join(cwd, '.fs2', 'graph.pickle');
  try {
    const stats = await stat(graphPath);
    log('availability → available, graph mtime:', new Date(stats.mtimeMs).toISOString());
    return { availability: 'available', graphMtime: stats.mtimeMs };
  } catch {
    log('availability → no-graph, path:', graphPath);
    return { availability: 'no-graph' };
  }
}

/**
 * Extract file path from a FlowSpace node_id.
 * Format: {category}:{filepath}:{qualname} or file:{filepath}
 */
function extractFilePath(nodeId: string): string {
  const firstColon = nodeId.indexOf(':');
  if (firstColon === -1) return nodeId;

  const rest = nodeId.slice(firstColon + 1);
  const category = nodeId.slice(0, firstColon);

  if (category === 'file') return rest;

  // For non-file nodes: filepath is between first and second colon
  const secondColon = rest.indexOf(':');
  return secondColon === -1 ? rest : rest.slice(0, secondColon);
}

/**
 * Extract a display name from a FlowSpace node_id.
 * For named nodes: uses the qualified name's last segment.
 * For anonymous nodes (@line.col): uses smart_content summary or filename.
 */
function extractName(nodeId: string, smartContent?: string | null): string {
  const parts = nodeId.split(':');
  if (parts.length < 3) {
    // file node — use filename
    const path = parts[1] || nodeId;
    const slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.slice(slash + 1);
  }
  // callable/type node — qualified name
  const qualName = parts.slice(2).join(':');

  // Anonymous nodes are purely positional markers like @43.10 or @37.11.@40.30
  if (/^@[\d.@]+$/.test(qualName)) {
    // Use first ~60 chars of smart_content as a descriptive name
    if (smartContent && smartContent.length > 10 && !smartContent.startsWith('[')) {
      return smartContent.slice(0, 60);
    }
    // Final fallback: filename
    const filePath = parts[1] || '';
    const slash = filePath.lastIndexOf('/');
    return slash === -1 ? filePath : filePath.slice(slash + 1);
  }

  // Strip anonymous suffixes like .@34.38.@36.17
  const cleaned = qualName.replace(/\.@[\d.@]+$/g, '');
  // Take last meaningful segment (ClassName.methodName → methodName)
  const dot = cleaned.lastIndexOf('.');
  return dot === -1 ? cleaned : cleaned.slice(dot + 1);
}

/**
 * Sanitize LLM-generated smart_content before sending to client.
 * Returns null if content is empty, placeholder, or too short to be useful.
 */
function sanitizeSmartContent(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 10) return null;
  if (trimmed.startsWith('[Empty content')) return null;
  if (trimmed.startsWith('[No ')) return null;
  if (trimmed.startsWith('[Placeholder')) return null;
  // Truncate to a reasonable display length
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

/**
 * Search the codebase using FlowSpace (fs2 CLI).
 */
export async function flowspaceSearch(
  query: string,
  mode: FlowSpaceSearchMode,
  cwd: string
): Promise<
  { results: FlowSpaceSearchResult[]; folders: Record<string, number> } | { error: string }
> {
  if (!query.trim()) {
    return { results: [], folders: {} };
  }

  // Determine CLI mode flag
  let cliMode: string;
  if (mode === 'semantic') {
    cliMode = 'semantic';
  } else {
    cliMode = REGEX_METACHARS.test(query) ? 'regex' : 'text';
  }

  const args = ['search', query, '--mode', cliMode, '--limit', '20'];
  log('search →', { query, mode, cliMode, cwd, args });

  try {
    const startMs = Date.now();
    const { stdout, stderr } = await execFileAsync('fs2', args, {
      cwd,
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (stderr) {
      log('search stderr:', stderr.trim());
    }

    const envelope = JSON.parse(stdout);
    const rawResults = envelope.results || [];
    const folders: Record<string, number> = envelope.meta?.folders || {};

    // Map and filter results
    const results: FlowSpaceSearchResult[] = [];
    for (const r of rawResults) {
      const filePath = extractFilePath(r.node_id);

      // Verify file still exists (graph may be stale)
      try {
        await access(join(cwd, filePath));
      } catch {
        continue; // Skip deleted files
      }

      const category = r.node_id.split(':')[0] || 'other';

      results.push({
        nodeId: r.node_id,
        name: extractName(r.node_id, r.smart_content),
        category,
        filePath,
        startLine: r.start_line,
        endLine: r.end_line,
        smartContent: sanitizeSmartContent(r.smart_content),
        snippet: r.snippet || '',
        score: r.score,
        matchField: r.match_field || 'content',
      });
    }

    const elapsedMs = Date.now() - startMs;
    log(`search ← ${results.length}/${rawResults.length} results in ${elapsedMs}ms`, {
      folders: Object.keys(folders),
    });

    return { results, folders };
  } catch (err: unknown) {
    const error = err as { code?: string; stderr?: string; message?: string; killed?: boolean };

    log('search ERROR:', {
      code: error.code,
      killed: error.killed,
      message: error.message?.slice(0, 200),
      stderr: error.stderr?.slice(0, 500),
    });

    if (error.code === 'ENOENT') {
      fs2AvailableCache = null;
      return { error: 'FlowSpace (fs2) is not installed' };
    }

    const stderr = error.stderr || '';

    if (stderr.includes('SEMANTIC search requires') || stderr.includes('embedding adapter')) {
      return { error: 'Semantic search requires embeddings. Run: fs2 scan --embed' };
    }

    if (stderr.includes('No nodes have embeddings')) {
      return { error: 'No embeddings found. Run: fs2 scan --embed' };
    }

    if (stderr.includes('Graph not found') || stderr.includes('No graph found')) {
      return { error: 'No graph found. Run: fs2 scan' };
    }

    if (error.killed || error.code === 'ETIMEDOUT') {
      return { error: 'Search timed out. Try a simpler query.' };
    }

    // User-friendly: show first line of stderr, or a generic message
    const firstStderrLine = stderr
      .split('\n')
      .find((l) => l.trim())
      ?.trim();
    return { error: firstStderrLine || 'Search failed. Check fs2 configuration.' };
  }
}
