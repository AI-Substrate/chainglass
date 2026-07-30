import { describe, expect, it } from 'vitest';
import {
  TMUX_WINDOWS_TIMEOUT_MS,
  readTmuxWindowLabels,
} from '../../../../apps/web/src/features/089-first-class-pij/server/tmux-windows';

describe('readTmuxWindowLabels', () => {
  it('parses id→index:name pairs and keeps spaces in window names', async () => {
    /*
    Test Doc:
    - Why: The naming mandate encourages descriptive window names, and those contain spaces — the
      parser splits on the FIRST tab only, so everything after it is the label verbatim.
    - Contract: Tab-separated lines become map entries; malformed lines and non-`@` ids are dropped.
    - Usage Notes: —
    - Quality Contribution: Pins the parse so a tmux format drift fails here, not as a blank rail line.
    - Worked Example: '@3\t3:cheetah' → { '@3': '3:cheetah' }.
    */
    const labels = await readTmuxWindowLabels(async (command, args) => {
      expect(command).toBe('tmux');
      expect(args).toEqual([
        'list-windows',
        '-a',
        '-F',
        '#{window_id}\t#{window_index}:#{window_name}',
      ]);
      return ['@3\t3:cheetah', '@7\t1:s066 revive pane', 'no-tab-line', '\t0:headless', ''].join(
        '\n'
      );
    });

    expect(labels).toEqual({ '@3': '3:cheetah', '@7': '1:s066 revive pane' });
  });

  it('degrades to an empty map when tmux refuses, within a bounded timeout', async () => {
    /*
    Test Doc:
    - Why: A machine without tmux (CI, a headless deploy) must lose the label line and nothing else.
    - Contract: A rejecting executor yields {}, never a throw; the timeout budget is passed through.
    - Usage Notes: —
    - Quality Contribution: Keeps the tree route unbreakable by its own nicety.
    - Worked Example: executor throws → {}.
    */
    let timeout = 0;
    const labels = await readTmuxWindowLabels(async (_command, _args, options) => {
      timeout = options.timeoutMs;
      throw new Error('no server running');
    });

    expect(labels).toEqual({});
    expect(timeout).toBe(TMUX_WINDOWS_TIMEOUT_MS);
  });
});
