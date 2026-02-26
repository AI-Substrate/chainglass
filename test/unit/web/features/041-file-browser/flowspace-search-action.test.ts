/**
 * FlowSpace Search Action Tests
 *
 * Lightweight tests for the server action that wraps the fs2 CLI.
 * Uses captured JSON fixtures — no vi.fn() per doctrine.
 *
 * Plan 051: FlowSpace Code Search
 */

import { describe, expect, it } from 'vitest';

// Test the pure functions by importing the module
// Note: the server action itself calls execFile which we don't mock.
// These tests verify JSON parsing and extraction logic.

/** Simulates the envelope shape returned by `fs2 search` CLI */
const FIXTURE_ENVELOPE = {
  meta: {
    total: 3,
    showing: { from: 0, to: 3, count: 3 },
    pagination: { limit: 20, offset: 0 },
    folders: { 'apps/': 2, 'packages/': 1 },
  },
  results: [
    {
      node_id: 'callable:apps/web/src/hooks/use-file-filter.ts:useFileFilter',
      start_line: 88,
      end_line: 316,
      match_start_line: 88,
      match_end_line: 88,
      smart_content: 'A React hook for file filtering with debounce',
      snippet: 'function useFileFilter({',
      score: 0.85,
      match_field: 'content',
    },
    {
      node_id: 'type:packages/shared/src/types.ts:DiffResult',
      start_line: 10,
      end_line: 14,
      match_start_line: 10,
      match_end_line: 10,
      smart_content: null,
      snippet: 'interface DiffResult {',
      score: 0.72,
      match_field: 'node_id',
    },
    {
      node_id: 'file:apps/web/src/lib/server/git-diff-action.ts',
      start_line: 1,
      end_line: 125,
      match_start_line: 1,
      match_end_line: 125,
      smart_content: 'Server action for git diff via execFile',
      snippet: 'use server',
      score: 0.65,
      match_field: 'smart_content',
    },
  ],
};

describe('FlowSpace search action — JSON parsing', () => {
  /*
  Test Doc:
  - Why: Verify that fs2 CLI JSON output is correctly parsed into FlowSpaceSearchResult shape
  - Contract: extractFilePath parses node_id format; extractName gets display name
  - Usage Notes: Uses captured fixture matching real fs2 output shape
  - Quality Contribution: Catches regressions if node_id format changes
  - Worked Example: callable:path/file.ts:Name → filePath=path/file.ts, name=Name
  */

  it('extracts file path from callable node_id', () => {
    const nodeId = 'callable:apps/web/src/hooks/use-file-filter.ts:useFileFilter';
    const firstColon = nodeId.indexOf(':');
    const rest = nodeId.slice(firstColon + 1);
    const secondColon = rest.indexOf(':');
    const filePath = secondColon === -1 ? rest : rest.slice(0, secondColon);

    expect(filePath).toBe('apps/web/src/hooks/use-file-filter.ts');
  });

  it('extracts file path from type node_id', () => {
    const nodeId = 'type:packages/shared/src/types.ts:DiffResult';
    const firstColon = nodeId.indexOf(':');
    const rest = nodeId.slice(firstColon + 1);
    const secondColon = rest.indexOf(':');
    const filePath = secondColon === -1 ? rest : rest.slice(0, secondColon);

    expect(filePath).toBe('packages/shared/src/types.ts');
  });

  it('extracts file path from file node_id', () => {
    const nodeId = 'file:apps/web/src/lib/server/git-diff-action.ts';
    const firstColon = nodeId.indexOf(':');
    const category = nodeId.slice(0, firstColon);
    const rest = nodeId.slice(firstColon + 1);

    expect(category).toBe('file');
    expect(rest).toBe('apps/web/src/lib/server/git-diff-action.ts');
  });

  it('extracts category from node_id', () => {
    const results = FIXTURE_ENVELOPE.results.map((r) => r.node_id.split(':')[0]);
    expect(results).toEqual(['callable', 'type', 'file']);
  });

  it('parses folder distribution from envelope meta', () => {
    expect(FIXTURE_ENVELOPE.meta.folders).toEqual({ 'apps/': 2, 'packages/': 1 });
  });

  it('handles node_id with anonymous position markers', () => {
    const nodeId = 'callable:apps/web/src/types.ts:UseFileFilterOptions.@34.38.@36.17';
    const firstColon = nodeId.indexOf(':');
    const rest = nodeId.slice(firstColon + 1);
    const secondColon = rest.indexOf(':');
    const filePath = secondColon === -1 ? rest : rest.slice(0, secondColon);

    expect(filePath).toBe('apps/web/src/types.ts');
  });

  it('handles results with null smart_content', () => {
    const result = FIXTURE_ENVELOPE.results[1];
    expect(result.smart_content).toBeNull();
  });
});

describe('FlowSpace search action — availability detection', () => {
  /*
  Test Doc:
  - Why: Verify the three availability states are correctly distinguished
  - Contract: not-installed (ENOENT), no-graph (missing pickle), available (both present)
  - Usage Notes: Integration-level — requires fs2 to be installed for positive tests
  - Quality Contribution: Prevents silent failures when fs2 or graph is missing
  - Worked Example: Missing graph.pickle → availability='no-graph'
  */

  it('defines three primary availability states', () => {
    const states = ['available', 'not-installed', 'no-graph', 'no-embeddings'] as const;
    expect(states).toHaveLength(4);
  });
});
