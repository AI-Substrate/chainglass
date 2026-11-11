import { afterEach, describe, expect, it, vi } from 'vitest';
import { TmuxSessionManager } from '../../../../../apps/web/src/features/064-terminal/server/tmux-session-manager';

afterEach(() => vi.restoreAllMocks());

// One shell window. Its pane runs a child that burns CPU, then stops; then the pane is respawned
// (`tmux respawn-pane -k`), so the pane pid changes under the shared 5 s `ps` snapshot.
describe('window activity across a respawned pane', () => {
  it('keeps the window reading through a sample whose snapshot predates the new pane', async () => {
    let t = 0;
    let panePid = 100;
    let childCpu = 0;
    let psReads = 0;
    const exec = async (_: string, args: string[]) =>
      args[0] === 'list-windows' ? '@1\t1\t0\tbuild\n' : '';
    const sampleExec = async (command: string, args: string[]) => {
      if (command === 'ps') {
        psReads += 1;
        return panePid === 100
          ? `100 1 0:00.10 -zsh\n101 100 0:${childCpu.toFixed(2).padStart(5, '0')} yes`
          : `${panePid} 1 0:00.00 sleep 99999`;
      }
      if (args[0] === 'list-panes') return `@1\t${panePid}\t${1_790_000_000 + t}\t%1\t0\n`;
      return '';
    };
    const manager = new TmuxSessionManager(exec, (() => null) as never, sampleExec);
    const poll = async (): Promise<{ fresh: boolean }> => {
      const before = psReads;
      vi.spyOn(Date, 'now').mockReturnValue((1_790_000_000 + t) * 1000);
      await manager.listWindows('main');
      await vi.waitFor(() =>
        expect((manager as unknown as { sampling: Set<string> }).sampling.size).toBe(0)
      );
      t += 2;
      return { fresh: psReads > before };
    };
    const reading = async () => {
      const [window] = await manager.listWindows('main');
      return { activeSeconds: window.activeSeconds, idleSeconds: window.idleSeconds };
    };
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000 * 1000);
    // Busy child: a core's worth of CPU per poll until the window turns active.
    while ((await reading()).activeSeconds === null && t < 60) {
      childCpu += 2;
      await poll();
    }
    expect((await reading()).activeSeconds).not.toBeNull();
    // It stops; past the quiet grace the window is idle with a known idle time.
    while ((await reading()).activeSeconds !== null && t < 120) await poll();
    expect((await reading()).idleSeconds).not.toBeNull();

    // Respawn right after a snapshot, so the next sample is served that (older) snapshot.
    while (!(await poll()).fresh);
    panePid = 300;
    expect((await poll()).fresh).toBe(false);
    expect((await reading()).idleSeconds).not.toBeNull();

    // Once a snapshot shows the new pane, the window carries on from its old history.
    while (!(await poll()).fresh);
    const after = await reading();
    expect(after.activeSeconds).toBeNull();
    expect(after.idleSeconds).toBeGreaterThan(0);
  });
});
