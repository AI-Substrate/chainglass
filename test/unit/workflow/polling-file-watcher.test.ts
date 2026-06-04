/**
 * PollingFileWatcherAdapter + FileWatcherFactory unit tests.
 *
 * Per Plan 085: env-forced polling fallback for WSL/Windows mounts.
 *
 * Two concerns:
 * 1. FileWatcherFactory selection logic (pure — env flag / explicit option).
 * 2. PollingFileWatcherAdapter diff→event parity with the native adapter
 *    (real temp-dir filesystem, no mocks — the poller IS the impl).
 *
 * Uses a short poll interval so the suite stays fast and deterministic.
 */

import { mkdir, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileWatcherFactory,
  NativeFileWatcherAdapter,
  PollingFileWatcherAdapter,
} from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const INTERVAL = 80; // fast polling for tests
const SETTLE = 400; // ~5 ticks — margin for a scan to capture a change on a loaded box

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Captured {
  event: string;
  path: string;
}

describe('FileWatcherFactory selection', () => {
  it('returns NativeFileWatcherAdapter when the flag is unset', () => {
    const factory = new FileWatcherFactory({} as NodeJS.ProcessEnv);
    expect(factory.create()).toBeInstanceOf(NativeFileWatcherAdapter);
  });

  it('returns PollingFileWatcherAdapter when CHAINGLASS_WATCH_POLLING=true', () => {
    const factory = new FileWatcherFactory({
      CHAINGLASS_WATCH_POLLING: 'true',
    } as NodeJS.ProcessEnv);
    expect(factory.create()).toBeInstanceOf(PollingFileWatcherAdapter);
  });

  it('lets an explicit usePolling:true override an unset flag', () => {
    const factory = new FileWatcherFactory({} as NodeJS.ProcessEnv);
    expect(factory.create({ usePolling: true })).toBeInstanceOf(PollingFileWatcherAdapter);
  });

  it('lets an explicit usePolling:false override the flag', () => {
    const factory = new FileWatcherFactory({
      CHAINGLASS_WATCH_POLLING: 'true',
    } as NodeJS.ProcessEnv);
    expect(factory.create({ usePolling: false })).toBeInstanceOf(NativeFileWatcherAdapter);
  });

  it('treats any non-"true" flag value as native (e.g. "1", "yes")', () => {
    for (const value of ['1', 'yes', 'TRUE', '']) {
      const factory = new FileWatcherFactory({
        CHAINGLASS_WATCH_POLLING: value,
      } as NodeJS.ProcessEnv);
      expect(factory.create()).toBeInstanceOf(NativeFileWatcherAdapter);
    }
  });

  it('falls back to the 1000ms default when CHAINGLASS_WATCH_POLL_INTERVAL is invalid (AC5)', () => {
    // Invalid interval must not throw AND must use the 1000ms default (assert the value, not just the type).
    for (const bad of ['not-a-number', '0', '-5', '']) {
      const factory = new FileWatcherFactory({
        CHAINGLASS_WATCH_POLLING: 'true',
        CHAINGLASS_WATCH_POLL_INTERVAL: bad,
      } as NodeJS.ProcessEnv);
      const adapter = factory.create();
      expect(adapter).toBeInstanceOf(PollingFileWatcherAdapter);
      expect((adapter as PollingFileWatcherAdapter).intervalMs).toBe(1000);
    }
  });

  it('uses the 1000ms default when the interval env var is unset', () => {
    const factory = new FileWatcherFactory({
      CHAINGLASS_WATCH_POLLING: 'true',
    } as NodeJS.ProcessEnv);
    expect((factory.create() as PollingFileWatcherAdapter).intervalMs).toBe(1000);
  });

  it('applies a valid CHAINGLASS_WATCH_POLL_INTERVAL', () => {
    const factory = new FileWatcherFactory({
      CHAINGLASS_WATCH_POLLING: 'true',
      CHAINGLASS_WATCH_POLL_INTERVAL: '250',
    } as NodeJS.ProcessEnv);
    expect((factory.create() as PollingFileWatcherAdapter).intervalMs).toBe(250);
  });

  it('lets an explicit options.interval win over the env interval', () => {
    const factory = new FileWatcherFactory({
      CHAINGLASS_WATCH_POLLING: 'true',
      CHAINGLASS_WATCH_POLL_INTERVAL: '250',
    } as NodeJS.ProcessEnv);
    expect((factory.create({ interval: 77 }) as PollingFileWatcherAdapter).intervalMs).toBe(77);
  });
});

describe('PollingFileWatcherAdapter diff→event parity', () => {
  let tempDir: string;
  let watcher: PollingFileWatcherAdapter;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `polling-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) await watcher.close();
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /** Start a watcher with ignoreInitial:true and let the baseline snapshot seed. */
  async function startWatcher(options: Record<string, unknown> = {}): Promise<Captured[]> {
    const captured: Captured[] = [];
    watcher = new PollingFileWatcherAdapter({
      ignoreInitial: true,
      interval: INTERVAL,
      ...options,
    });
    for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
      watcher.on(event, (p) => captured.push({ event, path: p as string }));
    }
    watcher.add(tempDir);
    await sleep(SETTLE); // let the baseline walk + a tick settle
    captured.length = 0; // drop anything from the seeding window
    return captured;
  }

  it('T-add: emits "add" for a new file', async () => {
    const events = await startWatcher();
    const file = join(tempDir, 'new.txt');
    await writeFile(file, 'hello');
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'add' && e.path === file)).toBe(true);
  });

  it('T-change: emits "change" for a modified file', async () => {
    const file = join(tempDir, 'edit.txt');
    await writeFile(file, 'initial');
    const events = await startWatcher();
    await writeFile(file, 'initial + more content'); // size + mtime differ
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'change' && e.path === file)).toBe(true);
  });

  it('T-unlink: emits "unlink" for a deleted file', async () => {
    const file = join(tempDir, 'doomed.txt');
    await writeFile(file, 'bye');
    const events = await startWatcher();
    await unlink(file);
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'unlink' && e.path === file)).toBe(true);
  });

  it('T-addDir: emits "addDir" for a new directory', async () => {
    const events = await startWatcher();
    const dir = join(tempDir, 'subdir');
    await mkdir(dir);
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'addDir' && e.path === dir)).toBe(true);
  });

  it('parity: a removed directory emits "unlink" (never "unlinkDir")', async () => {
    const dir = join(tempDir, 'gone');
    await mkdir(dir);
    const events = await startWatcher(); // dir is in the baseline
    await rmdir(dir);
    await sleep(SETTLE);
    expect(events.some((e) => e.event === 'unlink' && e.path === dir)).toBe(true);
    expect(events.some((e) => e.event === 'unlinkDir')).toBe(false);
  });

  it('T-initial: ignoreInitial suppresses events for pre-existing entries', async () => {
    await writeFile(join(tempDir, 'pre1.txt'), 'a');
    await mkdir(join(tempDir, 'predir'));
    const events = await startWatcher(); // baseline seeded silently, captured cleared
    // Give it a couple more ticks with no filesystem activity.
    await sleep(SETTLE);
    expect(events).toHaveLength(0);
  });

  it('debounces "change" when awaitWriteFinish is set (native parity)', async () => {
    const file = join(tempDir, 'rapid.txt');
    await writeFile(file, 'v0');
    const events = await startWatcher({ awaitWriteFinish: { stabilityThreshold: 150 } });
    for (let i = 0; i < 4; i++) {
      await writeFile(file, `v0-write-${i}-padding`);
      await sleep(40);
    }
    await sleep(400);
    const changes = events.filter((e) => e.event === 'change' && e.path === file);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.length).toBeLessThanOrEqual(3);
  });

  it('unwatch during the pending baseline scan does not resurrect the watch', async () => {
    // ignoreInitial:false → a resurrected baseline would emit "add" for the pre-existing file.
    await writeFile(join(tempDir, 'pre.txt'), 'x');
    const captured: Captured[] = [];
    watcher = new PollingFileWatcherAdapter({ ignoreInitial: false, interval: INTERVAL });
    for (const event of ['add', 'addDir'] as const) {
      watcher.on(event, (p) => captured.push({ event, path: p as string }));
    }
    watcher.add(tempDir);
    watcher.unwatch(tempDir); // synchronous — before the baseline walk resolves
    await sleep(SETTLE);
    expect(captured).toHaveLength(0);
  });

  it('E5: a path reused as a different type emits unlink then addDir (never change)', async () => {
    const p = join(tempDir, 'swap');
    await writeFile(p, 'i am a file');
    const events = await startWatcher(); // file is in the baseline
    await unlink(p);
    await mkdir(p); // same path, now a directory
    await sleep(SETTLE);
    const idxUnlink = events.findIndex((e) => e.event === 'unlink' && e.path === p);
    const idxAddDir = events.findIndex((e) => e.event === 'addDir' && e.path === p);
    expect(idxUnlink).toBeGreaterThanOrEqual(0);
    expect(idxAddDir).toBeGreaterThanOrEqual(0);
    expect(idxUnlink).toBeLessThan(idxAddDir); // parity order: unlink BEFORE the re-add
    expect(events.some((e) => e.event === 'change' && e.path === p)).toBe(false);
  });

  it('AC6: logs a startup line naming the watched root and interval', async () => {
    // Capture console.warn via plain reassignment (restored in finally) — no vitest mock.
    const lines: string[] = [];
    const original = console.warn;
    console.warn = ((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    }) as typeof console.warn;
    try {
      watcher = new PollingFileWatcherAdapter({ ignoreInitial: true, interval: INTERVAL });
      watcher.add(tempDir);
      await sleep(SETTLE);
    } finally {
      console.warn = original;
    }
    expect(
      lines.some(
        (l) =>
          l.includes(tempDir) &&
          l.includes(`${INTERVAL}ms`) &&
          l.includes('CHAINGLASS_WATCH_POLLING')
      )
    ).toBe(true);
  });
});
