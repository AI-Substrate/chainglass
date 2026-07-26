/**
 * The flow-file watcher — Plan 089 Phase 3 (T005) · C-02 · C-04.
 *
 * Test Doc:
 * - Why: this is the first production caller of `refreshFlows`, which means it is the thing that makes
 *   `flow-delta` fire at all. It is also the one place in the feature that registers a file watch, so
 *   the C-04 fence ("never watch `~/.pij`") stops being a static claim here and becomes a runtime one.
 * - Contract: T005; C-04 (watch flow files, never the pij store); C-02 (we watch, never write);
 *   Finding 08 (an atomic replace surfaces as an add+change burst, not as a rename).
 * - Usage Notes: the fake is `FakeFileWatcherFactory` from `@chainglass/workflow` — the SAME contract
 *   production uses, so the events a test can simulate are exactly the events that exist. There is no
 *   `simulateRename`, because `FileWatcherEvent` has no `'rename'`; a fake that could emit one would
 *   be testing a protocol the adapter never speaks. No `vi.mock()` (constitution P4).
 * - Quality Contribution: pins the burst coalescing (one scan per edit, not two), the watch-once
 *   property (a busy page must not accumulate watches), and the fence at runtime.
 * - Worked Example: `simulateAdd` + `simulateChange` on one `the-flow.json` → exactly one
 *   `refreshFlows(<that plansRoot>)` after the debounce.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FakeFileWatcherFactory } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FLOW_DOCUMENT,
  PLANS_SUBDIR,
  createFlowWatcher,
} from '../../../../apps/web/src/features/089-first-class-pij/server/flow-watcher';

const WORKSPACE_A = '/Users/fixture/substrate/chainglass';
const WORKSPACE_B = '/Users/fixture/substrate/chainglass-worktree';
const PIJ_HOME = join(homedir(), '.pij');

const plansRootOf = (workspace: string) => join(workspace, PLANS_SUBDIR);
const flowFileIn = (workspace: string, plan: string) =>
  join(plansRootOf(workspace), plan, FLOW_DOCUMENT);

let factory: FakeFileWatcherFactory;
let refreshed: string[];
let warnings: unknown[][];

/** Long enough to be a real debounce, short enough that a test can wait it out honestly. */
const DEBOUNCE_MS = 10;

function makeWatcher(
  overrides: Partial<Parameters<typeof createFlowWatcher>[0]> = {}
): ReturnType<typeof createFlowWatcher> {
  return createFlowWatcher({
    watcherFactory: factory,
    refreshFlows: async (plansRoot) => {
      refreshed.push(plansRoot);
    },
    listWorkspacePaths: async () => [WORKSPACE_A],
    pijHome: PIJ_HOME,
    debounceMs: DEBOUNCE_MS,
    logger: { warn: (...args: unknown[]) => warnings.push(args) },
    ...overrides,
  });
}

/** Wait past the debounce window. */
const settle = () => new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 4));

beforeEach(() => {
  factory = new FakeFileWatcherFactory();
  refreshed = [];
  warnings = [];
});

describe('createFlowWatcher — what it watches', () => {
  it('watches the docs/plans root of every workspace the container knows at bootstrap', async () => {
    const watcher = makeWatcher({ listWorkspacePaths: async () => [WORKSPACE_A, WORKSPACE_B] });
    await watcher.start();

    expect(watcher.watchedRoots().sort()).toEqual(
      [plansRootOf(WORKSPACE_A), plansRootOf(WORKSPACE_B)].sort()
    );
    expect(factory.getLastWatcher()?.getWatchedPaths().sort()).toEqual(
      [plansRootOf(WORKSPACE_A), plansRootOf(WORKSPACE_B)].sort()
    );
    await watcher.stop();
  });

  it('declares atomic explicitly — the production adapter does not implement it', async () => {
    // `FileWatcherOptions.atomic` exists on the contract, and `NativeFileWatcherAdapter` reads it
    // nowhere: it translates fs.watch renames into add/unlink itself. Leaving it unset would look
    // like an oversight; setting it true would be relying on a no-op to do the coalescing that this
    // service's own debounce actually does. So it is stated, false, and the debounce is the mechanism.
    const watcher = makeWatcher();
    await watcher.start();

    expect(factory.getLastWatcher()?.options.atomic).toBe(false);
    await watcher.stop();
  });

  it('creates exactly one watcher no matter how many times it is started (HMR)', async () => {
    const watcher = makeWatcher();
    await watcher.start();
    await watcher.start();
    await watcher.start();

    expect(factory.getWatcherCount()).toBe(1);
    await watcher.stop();
  });
});

describe('createFlowWatcher — an atomic replace is a burst, and one edit is one scan', () => {
  it('coalesces the add+change burst into exactly one refreshFlows', async () => {
    // The contract has no 'rename'. On macOS one atomic replace surfaces as BOTH 'add' and 'change' on
    // the same path, because the adapter translates fs.watch's rename by stat-ing the result. Two
    // events for one edit means two full scans of every plan folder unless something coalesces them.
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateAdd(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    await settle();

    expect(refreshed).toEqual([plansRootOf(WORKSPACE_A)]);
    await watcher.stop();
  });

  it('scans once per plans root even when several plans change together', async () => {
    // `refreshFlows` takes a ROOT and scans all of it, so two plans in the same repo are one scan.
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    fake.simulateChange(flowFileIn(WORKSPACE_A, '089-first-class-pij'));
    await settle();

    expect(refreshed).toEqual([plansRootOf(WORKSPACE_A)]);
    await watcher.stop();
  });

  it('debounces per root, so two repos are two scans', async () => {
    const watcher = makeWatcher({ listWorkspacePaths: async () => [WORKSPACE_A, WORKSPACE_B] });
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    fake.simulateChange(flowFileIn(WORKSPACE_B, '088-remote-app-view'));
    await settle();

    expect(refreshed.sort()).toEqual([plansRootOf(WORKSPACE_A), plansRootOf(WORKSPACE_B)].sort());
    await watcher.stop();
  });

  it('does not treat a deleted flow document as a flow moving', async () => {
    // Deliberate absence, documented at the subscription: the CLI is the sole writer and never
    // deletes, so a vanished document is a human `rm`, a branch switch, or the plan folder going —
    // and the snapshot is the path for all three, exactly as it already is for a vanished plan on the
    // client. Pinned as a test so the absence is a decision on the record, not an omission.
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateUnlink(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    await settle();

    expect(refreshed).toEqual([]);
    await watcher.stop();
  });

  it('ignores everything that is not a flow document', async () => {
    // `docs/plans` is full of markdown that changes constantly. Rescanning 86 plan folders because
    // someone saved a tasks file would be a self-inflicted load with nothing to show for it.
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(join(plansRootOf(WORKSPACE_A), '089-first-class-pij', 'tasks.md'));
    fake.simulateAdd(join(plansRootOf(WORKSPACE_A), '090-something', 'notes.txt'));
    await settle();

    expect(refreshed).toEqual([]);
    await watcher.stop();
  });

  it('ignores an event under a root it is not watching', async () => {
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_B, '088-remote-app-view'));
    await settle();

    expect(refreshed).toEqual([]);
    await watcher.stop();
  });
});

describe('createFlowWatcher — lazy registration for worktree roots', () => {
  it('registers a workspace it has never seen, exactly once', async () => {
    // `?worktree=` resolves to a path the workspace list does not contain, and it is a first-class way
    // to view this page. The first flow request for such a path is where the watch comes from.
    const watcher = makeWatcher();
    await watcher.start();

    watcher.watchWorkspace(WORKSPACE_B);
    watcher.watchWorkspace(WORKSPACE_B);
    watcher.watchWorkspace(WORKSPACE_B);

    expect(watcher.watchedRoots().filter((root) => root === plansRootOf(WORKSPACE_B))).toHaveLength(
      1
    );
    expect(
      factory
        .getLastWatcher()
        ?.getWatchedPaths()
        .filter((path) => path === plansRootOf(WORKSPACE_B))
    ).toHaveLength(1);
    await watcher.stop();
  });

  it('delivers events for a lazily registered root', async () => {
    const watcher = makeWatcher();
    await watcher.start();
    watcher.watchWorkspace(WORKSPACE_B);
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_B, '088-remote-app-view'));
    await settle();

    expect(refreshed).toEqual([plansRootOf(WORKSPACE_B)]);
    await watcher.stop();
  });

  it('does nothing at all before start — a request must not create a watcher out of band', async () => {
    const watcher = makeWatcher();

    watcher.watchWorkspace(WORKSPACE_B);

    expect(factory.getWatcherCount()).toBe(0);
    expect(watcher.watchedRoots()).toEqual([]);
  });
});

describe('createFlowWatcher — C-04, the fence at runtime', () => {
  it('throws rather than watch a ~/.pij-shaped path', async () => {
    // Descriptors under `~/.pij` are rewritten every daemon tick across ~180 seats. Watching them is
    // the naive client-side design relocated server-side, and C-04 rules it out absolutely — so this
    // throws rather than logging: a fence breach that degrades quietly is a fence that stopped.
    const watcher = makeWatcher();
    await watcher.start();

    expect(() => watcher.watchWorkspace(PIJ_HOME)).toThrow(/C-04/);
    expect(() => watcher.watchWorkspace(join(PIJ_HOME, 'spine'))).toThrow(/C-04/);
    expect(() => watcher.watchWorkspace('/Users/fixture/.pij')).toThrow(/C-04/);
    expect(watcher.watchedRoots()).toEqual([plansRootOf(WORKSPACE_A)]);
    await watcher.stop();
  });

  it('refuses a ~/.pij-shaped workspace from the container list too, without failing the rest', async () => {
    // Enumeration is not a trusted source either. One bad entry must not watch, and must not take the
    // good ones down with it.
    const watcher = makeWatcher({
      listWorkspacePaths: async () => [WORKSPACE_A, PIJ_HOME, WORKSPACE_B],
    });
    await watcher.start();

    expect(watcher.watchedRoots().sort()).toEqual(
      [plansRootOf(WORKSPACE_A), plansRootOf(WORKSPACE_B)].sort()
    );
    expect(warnings.flat().join(' ')).toContain('C-04');
    await watcher.stop();
  });
});

describe('createFlowWatcher — failure and teardown', () => {
  it('degrades to snapshot-only when the watcher cannot be created, and says so', async () => {
    const watcher = makeWatcher({
      watcherFactory: {
        create() {
          throw new Error('EMFILE: too many open files');
        },
      },
    });

    await expect(watcher.start()).resolves.toBeUndefined();
    expect(watcher.watchedRoots()).toEqual([]);
    expect(warnings.flat().join(' ')).toContain('EMFILE');
  });

  it('degrades when the workspace list cannot be read', async () => {
    const watcher = makeWatcher({
      listWorkspacePaths: async () => {
        throw new Error('container not bootstrapped');
      },
    });

    await expect(watcher.start()).resolves.toBeUndefined();
    expect(watcher.watchedRoots()).toEqual([]);
    expect(warnings.flat().join(' ')).toContain('container not bootstrapped');
  });

  it('survives a refreshFlows that rejects — the next edit still scans', async () => {
    let calls = 0;
    const watcher = makeWatcher({
      refreshFlows: async (plansRoot) => {
        calls += 1;
        if (calls === 1) throw new Error('scan blew up');
        refreshed.push(plansRoot);
      },
    });
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    await settle();
    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    await settle();

    expect(refreshed).toEqual([plansRootOf(WORKSPACE_A)]);
    expect(warnings.flat().join(' ')).toContain('scan blew up');
    await watcher.stop();
  });

  it('logs a watcher error without throwing', async () => {
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateError(new Error('ENOSPC: inotify limit'));

    expect(warnings.flat().join(' ')).toContain('ENOSPC');
    await watcher.stop();
  });

  it('closes the watcher and cancels a pending scan on stop', async () => {
    // SIGTERM arriving inside the debounce window must not fire a scan against a shutting-down poller.
    const watcher = makeWatcher();
    await watcher.start();
    const fake = factory.getLastWatcher();
    if (!fake) throw new Error('no watcher was created');

    fake.simulateChange(flowFileIn(WORKSPACE_A, '088-remote-app-view'));
    await watcher.stop();
    await settle();

    expect(refreshed).toEqual([]);
    expect(fake.isClosed()).toBe(true);
    expect(watcher.watchedRoots()).toEqual([]);
  });
});
