/**
 * Resolves the paths written on a terminal screen to files on disk.
 *
 * An agent writes paths relative to where it runs, which is its pane's working directory,
 * not the terminal's. So a relative path is tried against every pane of the session's current
 * window, active pane first (a split can show text from either side); `~/` and absolute paths
 * are taken as written. Only paths that exist come back, which is what makes them links.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommandExecutor, ResolvedTerminalPath } from '../types';

/** One screen line proposes at most 20; this bounds a whole request. */
export const MAX_PATHS_PER_REQUEST = 64;

/** Working directories of the panes in the session's current window, active pane first. */
export function currentWindowPaneCwds(exec: CommandExecutor, sessionName: string): string[] {
  const output = exec('tmux', [
    'list-panes',
    '-t',
    `=${sessionName}:`,
    '-F',
    '#{pane_active}\t#{pane_current_path}',
  ]);
  const rows = output
    .split('\n')
    .map((row) => row.split('\t'))
    .filter((cols): cols is [string, string] => cols.length === 2 && cols[1].length > 0);
  rows.sort((a, b) => Number(b[0]) - Number(a[0]));
  return [...new Set(rows.map(([, cwd]) => cwd))];
}

export function resolveTerminalPaths(
  paths: readonly string[],
  cwds: readonly string[],
  home: string = os.homedir(),
  stat: (file: string) => fs.Stats = fs.statSync
): ResolvedTerminalPath[] {
  const resolved: ResolvedTerminalPath[] = [];
  for (const written of new Set(paths.slice(0, MAX_PATHS_PER_REQUEST))) {
    const tries =
      written === '~' || written.startsWith('~/')
        ? [path.join(home, written.slice(1))]
        : path.isAbsolute(written)
          ? [written]
          : cwds.map((cwd) => path.resolve(cwd, written));
    for (const absolute of tries) {
      try {
        const stats = stat(absolute);
        resolved.push({ path: written, absolute, directory: stats.isDirectory() });
        break;
      } catch {
        // Not here; try the next pane's directory.
      }
    }
  }
  return resolved;
}
