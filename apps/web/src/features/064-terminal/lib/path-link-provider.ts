/**
 * xterm link provider for file paths on screen (Jordan, 2026-10-06: "I should be able to click
 * these and see them in chainglass browser").
 *
 * For the hovered row it reads the whole logical line (soft-wrapped rows joined, so a long path
 * that wraps is one link), proposes path-shaped tokens, and asks the sidecar which exist. Only
 * those become links, so a word that merely looks like a path is never underlined.
 */

import type { IBufferCellPosition, ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import type { ResolvedTerminalPath } from '../types';
import { findPathCandidates } from './terminal-paths';

/** Hovering re-asks for the same row; this keeps that to one lookup per path. */
const LOOKUP_CACHE_MS = 2_000;

export type OpenTerminalPath = (
  path: ResolvedTerminalPath,
  line: number | null,
  event: MouseEvent
) => void;

interface LogicalLine {
  text: string;
  /** Buffer cell (1-based x and y) of each UTF-16 unit of `text`. */
  cells: IBufferCellPosition[];
}

/** The soft-wrapped line through buffer row `row` (0-based), with each character's cell. */
export function readLogicalLine(terminal: Terminal, row: number): LogicalLine | null {
  const buffer = terminal.buffer.active;
  let first = row;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first--;
  let text = '';
  const cells: IBufferCellPosition[] = [];
  for (let y = first; y < buffer.length; y++) {
    const line = buffer.getLine(y);
    if (!line || (y > first && !line.isWrapped)) break;
    for (let x = 0; x < line.length; x++) {
      const chars = line.getCell(x)?.getChars() ?? '';
      // The trailing half of a wide character has no chars of its own.
      if (chars === '' && line.getCell(x)?.getWidth() === 0) continue;
      const unit = chars === '' ? ' ' : chars;
      text += unit;
      for (let i = 0; i < unit.length; i++) cells.push({ x: x + 1, y: y + 1 });
    }
  }
  return cells.length > 0 ? { text, cells } : null;
}

export function createPathLinkProvider(
  terminal: Terminal,
  resolvePaths: (paths: string[]) => Promise<ResolvedTerminalPath[]>,
  open: OpenTerminalPath
): ILinkProvider {
  const cache = new Map<string, { at: number; resolved: ResolvedTerminalPath | null }>();

  return {
    provideLinks(y, callback) {
      const logical = readLogicalLine(terminal, y - 1);
      const candidates = logical
        ? findPathCandidates(logical.text).filter((candidate) =>
            logical.cells.slice(candidate.start, candidate.end).some((cell) => cell.y === y)
          )
        : [];
      if (!logical || candidates.length === 0) {
        callback(undefined);
        return;
      }
      const now = Date.now();
      const missing = [...new Set(candidates.map((candidate) => candidate.path))].filter(
        (path) => (cache.get(path)?.at ?? 0) < now - LOOKUP_CACHE_MS
      );
      void (missing.length > 0 ? resolvePaths(missing) : Promise.resolve([])).then((found) => {
        const byPath = new Map(found.map((resolved) => [resolved.path, resolved]));
        for (const path of missing)
          cache.set(path, { at: now, resolved: byPath.get(path) ?? null });
        const links: ILink[] = [];
        for (const candidate of candidates) {
          const resolved = cache.get(candidate.path)?.resolved;
          if (!resolved) continue;
          links.push({
            range: {
              start: logical.cells[candidate.start],
              end: logical.cells[candidate.end - 1],
            },
            text: logical.text.slice(candidate.start, candidate.end),
            decorations: { underline: true, pointerCursor: true },
            activate: (event) => open(resolved, candidate.line, event),
          });
        }
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
}
