/**
 * FlowSpace Result Mapper
 *
 * Pure helpers for translating fs2 search envelope shapes into the wire
 * FlowSpaceSearchResult shape consumed by the explorer-bar dropdown.
 *
 * Plan 084 Phase 1: extracted from flowspace-search-action.ts so both the
 * legacy CLI path (now retired) and the MCP path share the same translation.
 *
 * Pure: no I/O, no file-existence checks. Callers do staleness filtering.
 */

import type { FlowSpaceSearchResult } from '@/features/_platform/panel-layout/types';

export interface RawFlowspaceResult {
  node_id: string;
  start_line: number;
  end_line: number;
  match_start_line?: number;
  match_end_line?: number;
  smart_content: string | null;
  snippet?: string;
  score: number;
  match_field?: string;
}

export interface RawFlowspaceEnvelope {
  meta?: {
    total?: number;
    showing?: { from: number; to: number; count: number };
    pagination?: { limit: number; offset: number };
    folders?: Record<string, number>;
  };
  results?: RawFlowspaceResult[];
}

export interface MappedEnvelope {
  results: FlowSpaceSearchResult[];
  folders: Record<string, number>;
}

/**
 * Extract file path from a fs2 node_id.
 * Format: `{category}:{filepath}:{qualname}` or `file:{filepath}`.
 */
export function extractFilePath(nodeId: string): string {
  const firstColon = nodeId.indexOf(':');
  if (firstColon === -1) return nodeId;

  const rest = nodeId.slice(firstColon + 1);
  const category = nodeId.slice(0, firstColon);

  if (category === 'file') return rest;

  const secondColon = rest.indexOf(':');
  return secondColon === -1 ? rest : rest.slice(0, secondColon);
}

/**
 * Extract a display name from a fs2 node_id.
 * For named nodes: uses the qualified name's last segment.
 * For anonymous nodes (`@line.col`): uses smart_content summary or filename.
 */
export function extractName(nodeId: string, smartContent?: string | null): string {
  const parts = nodeId.split(':');
  if (parts.length < 3) {
    const path = parts[1] || nodeId;
    const slash = path.lastIndexOf('/');
    return slash === -1 ? path : path.slice(slash + 1);
  }
  const qualName = parts.slice(2).join(':');

  if (/^@[\d.@]+$/.test(qualName)) {
    if (smartContent && smartContent.length > 10 && !smartContent.startsWith('[')) {
      return smartContent.slice(0, 60);
    }
    const filePath = parts[1] || '';
    const slash = filePath.lastIndexOf('/');
    return slash === -1 ? filePath : filePath.slice(slash + 1);
  }

  const cleaned = qualName.replace(/\.@[\d.@]+$/g, '');
  const dot = cleaned.lastIndexOf('.');
  return dot === -1 ? cleaned : cleaned.slice(dot + 1);
}

/**
 * Sanitize LLM-generated smart_content before sending to client.
 * Returns null if content is empty, placeholder, or too short to be useful.
 */
export function sanitizeSmartContent(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 10) return null;
  if (trimmed.startsWith('[Empty content')) return null;
  if (trimmed.startsWith('[No ')) return null;
  if (trimmed.startsWith('[Placeholder')) return null;
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

/**
 * Map a single raw fs2 result row to the wire FlowSpaceSearchResult shape.
 */
export function mapResultRow(r: RawFlowspaceResult): FlowSpaceSearchResult {
  return {
    kind: 'flowspace',
    nodeId: r.node_id,
    name: extractName(r.node_id, r.smart_content),
    category: r.node_id.split(':')[0] || 'other',
    filePath: extractFilePath(r.node_id),
    startLine: r.start_line,
    endLine: r.end_line,
    smartContent: sanitizeSmartContent(r.smart_content),
    snippet: r.snippet || '',
    score: r.score,
    matchField: r.match_field || 'content',
  };
}

/**
 * Map a raw fs2 search envelope to the wire shape.
 * Pure — no I/O, no file-existence checks. Callers filter stale results.
 */
export function mapEnvelope(env: RawFlowspaceEnvelope): MappedEnvelope {
  const rawResults = env.results ?? [];
  const folders = env.meta?.folders ?? {};
  return {
    results: rawResults.map(mapResultRow),
    folders,
  };
}
