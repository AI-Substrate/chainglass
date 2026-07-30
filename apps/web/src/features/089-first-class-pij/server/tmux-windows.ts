/**
 * tmux-windows — the window-label read behind the rail's "3:cheetah" line.
 *
 * Tree nodes carry `windowId` (`@12`), which is meaningless to a human scanning for the pane to
 * jump to; the index:name pair is how tmux's own status bar names it. That pair lives only in tmux,
 * so this module asks tmux — one `list-windows -a` per tree request, read-only.
 *
 * Fence note: the focus route's R-01 ("`select-window` and nothing else") governs MUTATION — this
 * module never selects, attaches, resizes or sends keys. `list-windows` observes. It still follows
 * the same execution discipline as every process seam in this feature: `execFile`, a fixed argv
 * array, no shell, bounded by a timeout.
 *
 * Failure is an empty map, never a throw: a machine without tmux (or a tmux that refuses) costs the
 * label line and nothing else — the tree itself must not become unreadable because a nicety was.
 */
import { execFile } from 'node:child_process';

/** `@12` → `3:cheetah`. Keyed by tmux's window id, the one field tree nodes carry. */
export type TmuxWindowLabels = Record<string, string>;

export type TmuxExecutor = (
  command: string,
  args: readonly string[],
  options: { timeoutMs: number }
) => Promise<string>;

/** tmux answers instantly or something is badly wrong; mirror the focus route's budget. */
export const TMUX_WINDOWS_TIMEOUT_MS = 3_000;

/**
 * Tab-separated, name last: a window name may contain spaces (the naming mandate encourages it),
 * so the id is split off the front and everything after the first tab is the label verbatim.
 */
const FORMAT = '#{window_id}\t#{window_index}:#{window_name}';

export async function readTmuxWindowLabels(
  executor: TmuxExecutor = nodeTmuxExecutor
): Promise<TmuxWindowLabels> {
  try {
    const output = await executor('tmux', ['list-windows', '-a', '-F', FORMAT], {
      timeoutMs: TMUX_WINDOWS_TIMEOUT_MS,
    });
    const labels: TmuxWindowLabels = {};
    for (const line of output.split('\n')) {
      const tab = line.indexOf('\t');
      if (tab <= 0) continue;
      const id = line.slice(0, tab);
      const label = line.slice(tab + 1).trim();
      if (id.startsWith('@') && label.length > 0) labels[id] = label;
    }
    return labels;
  } catch {
    return {};
  }
}

const nodeTmuxExecutor: TmuxExecutor = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { timeout: options.timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
