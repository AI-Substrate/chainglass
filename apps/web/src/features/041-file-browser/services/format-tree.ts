/**
 * Tree Formatting Utility
 *
 * Pure function for formatting tree structures as text (like the `tree` command).
 * Safe to import from both client and server components.
 *
 * Subtask 001: Context Menu — Plan 041
 */

export interface TreeEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: TreeEntry[];
}

/**
 * Format a tree structure as text output (like the `tree` command).
 * Used by "Copy Tree From Here" clipboard operation.
 */
export function formatTree(entries: TreeEntry[], rootName: string, prefix = ''): string {
  const lines: string[] = [];
  if (!prefix) lines.push(`${rootName}/`);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.type === 'directory') {
      lines.push(`${prefix}${connector}${entry.name}/`);
      if (entry.children?.length) {
        lines.push(formatTree(entry.children, '', prefix + childPrefix));
      }
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }
  return lines.join('\n');
}
