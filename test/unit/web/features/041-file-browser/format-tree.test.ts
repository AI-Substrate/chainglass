/**
 * formatTree Tests
 *
 * @purpose Verify tree-style text formatting for clipboard "Copy Tree" feature
 * @domain file-browser
 * @acceptance Subtask 001 ST005
 * @approach Unit test formatTree with known input, assert exact text output
 * @evidence String comparison
 */

import { type TreeEntry, formatTree } from '@/features/041-file-browser/services/format-tree';
import { describe, expect, it } from 'vitest';

describe('formatTree', () => {
  it('formats a flat list of files', () => {
    const entries: TreeEntry[] = [
      { name: 'README.md', type: 'file', path: 'README.md' },
      { name: 'package.json', type: 'file', path: 'package.json' },
    ];

    const result = formatTree(entries, 'project');
    expect(result).toBe('project/\n' + '├── README.md\n' + '└── package.json');
  });

  it('formats directories with children', () => {
    const entries: TreeEntry[] = [
      {
        name: 'src',
        type: 'directory',
        path: 'src',
        children: [
          { name: 'index.ts', type: 'file', path: 'src/index.ts' },
          { name: 'utils.ts', type: 'file', path: 'src/utils.ts' },
        ],
      },
      { name: 'README.md', type: 'file', path: 'README.md' },
    ];

    const result = formatTree(entries, 'project');
    expect(result).toBe(
      'project/\n' + '├── src/\n' + '│   ├── index.ts\n' + '│   └── utils.ts\n' + '└── README.md'
    );
  });

  it('handles nested directories', () => {
    const entries: TreeEntry[] = [
      {
        name: 'docs',
        type: 'directory',
        path: 'docs',
        children: [
          {
            name: 'plans',
            type: 'directory',
            path: 'docs/plans',
            children: [{ name: 'plan.md', type: 'file', path: 'docs/plans/plan.md' }],
          },
        ],
      },
    ];

    const result = formatTree(entries, 'root');
    expect(result).toBe('root/\n' + '└── docs/\n' + '    └── plans/\n' + '        └── plan.md');
  });

  it('handles empty entries', () => {
    const result = formatTree([], 'empty');
    expect(result).toBe('empty/');
  });
});
