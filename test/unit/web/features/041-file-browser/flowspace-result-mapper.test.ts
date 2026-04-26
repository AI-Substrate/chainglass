/**
 * Flowspace Result Mapper Tests
 *
 * Plan 084: tests the pure helpers extracted from the legacy CLI server action
 * into `apps/web/src/lib/server/flowspace-result-mapper.ts`. These translate
 * the fs2 search envelope shape into the wire FlowSpaceSearchResult shape
 * consumed by the explorer-bar dropdown.
 *
 * Predecessor: `flowspace-search-action.test.ts` (Plan 051) — same fixtures,
 * now exercising the actual exported helpers rather than inline reimplementations.
 */

import { describe, expect, it } from 'vitest';

import {
  type RawFlowspaceEnvelope,
  extractFilePath,
  extractName,
  mapEnvelope,
  mapResultRow,
  sanitizeSmartContent,
} from '../../../../../apps/web/src/lib/server/flowspace-result-mapper';

const FIXTURE_ENVELOPE: RawFlowspaceEnvelope = {
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

describe('extractFilePath', () => {
  it('extracts the path from a callable node_id', () => {
    expect(extractFilePath('callable:apps/web/src/hooks/use-file-filter.ts:useFileFilter')).toBe(
      'apps/web/src/hooks/use-file-filter.ts'
    );
  });

  it('extracts the path from a type node_id', () => {
    expect(extractFilePath('type:packages/shared/src/types.ts:DiffResult')).toBe(
      'packages/shared/src/types.ts'
    );
  });

  it('returns the rest unchanged for file: node_ids', () => {
    expect(extractFilePath('file:apps/web/src/lib/server/git-diff-action.ts')).toBe(
      'apps/web/src/lib/server/git-diff-action.ts'
    );
  });

  it('strips anonymous position suffixes implicitly', () => {
    expect(
      extractFilePath('callable:apps/web/src/types.ts:UseFileFilterOptions.@34.38.@36.17')
    ).toBe('apps/web/src/types.ts');
  });

  it('returns the input unchanged when no colon is present', () => {
    expect(extractFilePath('not-a-node-id')).toBe('not-a-node-id');
  });
});

describe('extractName', () => {
  it('uses the qualified name last segment for callable nodes', () => {
    expect(extractName('callable:apps/web/src/hooks/use-file-filter.ts:useFileFilter')).toBe(
      'useFileFilter'
    );
  });

  it('uses the filename for file nodes', () => {
    expect(extractName('file:apps/web/src/lib/server/git-diff-action.ts')).toBe(
      'git-diff-action.ts'
    );
  });

  it('strips trailing anonymous position markers', () => {
    expect(extractName('callable:apps/web/src/types.ts:UseFileFilterOptions.@34.38.@36.17')).toBe(
      'UseFileFilterOptions'
    );
  });

  it('falls back to smart_content for purely anonymous nodes', () => {
    expect(
      extractName('callable:apps/web/src/x.ts:@43.10', 'A useful summary that is long enough')
    ).toBe('A useful summary that is long enough');
  });

  it('falls back to filename when smart_content is unhelpful for anonymous nodes', () => {
    expect(extractName('callable:apps/web/src/x.ts:@43.10', null)).toBe('x.ts');
  });
});

describe('sanitizeSmartContent', () => {
  it('returns null for null/undefined/empty', () => {
    expect(sanitizeSmartContent(null)).toBeNull();
    expect(sanitizeSmartContent(undefined)).toBeNull();
    expect(sanitizeSmartContent('')).toBeNull();
  });

  it('returns null for placeholders', () => {
    expect(sanitizeSmartContent('[Empty content]')).toBeNull();
    expect(sanitizeSmartContent('[No summary available]')).toBeNull();
    expect(sanitizeSmartContent('[Placeholder]')).toBeNull();
  });

  it('returns null for too-short content', () => {
    expect(sanitizeSmartContent('short')).toBeNull();
  });

  it('returns trimmed content within length cap', () => {
    expect(sanitizeSmartContent('  A useful summary  ')).toBe('A useful summary');
  });

  it('truncates content over 200 chars with ellipsis', () => {
    const long = 'a'.repeat(250);
    const out = sanitizeSmartContent(long);
    expect(out).not.toBeNull();
    expect((out as string).length).toBe(201);
    expect((out as string).endsWith('…')).toBe(true);
  });
});

describe('mapResultRow', () => {
  it('maps a callable row into the wire shape', () => {
    const row = mapResultRow((FIXTURE_ENVELOPE.results ?? [])[0]);
    expect(row.kind).toBe('flowspace');
    expect(row.nodeId).toBe('callable:apps/web/src/hooks/use-file-filter.ts:useFileFilter');
    expect(row.name).toBe('useFileFilter');
    expect(row.category).toBe('callable');
    expect(row.filePath).toBe('apps/web/src/hooks/use-file-filter.ts');
    expect(row.startLine).toBe(88);
    expect(row.endLine).toBe(316);
    expect(row.smartContent).toBe('A React hook for file filtering with debounce');
    expect(row.matchField).toBe('content');
    expect(row.score).toBe(0.85);
  });

  it('handles null smart_content gracefully', () => {
    const row = mapResultRow((FIXTURE_ENVELOPE.results ?? [])[1]);
    expect(row.smartContent).toBeNull();
    expect(row.name).toBe('DiffResult');
  });
});

describe('mapEnvelope', () => {
  it('maps results and folders together', () => {
    const out = mapEnvelope(FIXTURE_ENVELOPE);
    expect(out.results).toHaveLength(3);
    expect(out.folders).toEqual({ 'apps/': 2, 'packages/': 1 });
    expect(out.results.map((r) => r.category)).toEqual(['callable', 'type', 'file']);
  });

  it('returns empty results for an empty envelope', () => {
    const out = mapEnvelope({});
    expect(out.results).toEqual([]);
    expect(out.folders).toEqual({});
  });
});
