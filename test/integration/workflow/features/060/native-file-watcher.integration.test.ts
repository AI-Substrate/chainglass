/**
 * NativeFileWatcherAdapter integration tests.
 *
 * Per Plan 060: Replace Chokidar with Native File Watcher
 * Tests the adapter against real filesystem operations — no mocks.
 *
 * Uses fs.watch({recursive: true}) which uses FSEvents on macOS, inotify on Linux.
 */

import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeFileWatcherAdapter, NativeFileWatcherFactory } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('NativeFileWatcherAdapter', () => {
  let tempDir: string;
  let watcher: NativeFileWatcherAdapter;

  beforeEach(async () => {
    tempDir = join(
      tmpdir(),
      `native-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.close();
    }
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('T001: Basic add/on/close', () => {
    it('should detect file changes via native fs.watch', async () => {
      // Arrange: create initial file
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'initial');

      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: { event: string; path: string }[] = [];
      watcher.on('change', (p) => events.push({ event: 'change', path: p as string }));
      watcher.on('add', (p) => events.push({ event: 'add', path: p as string }));
      watcher.add(tempDir);
      await sleep(200);

      // Act: modify the file
      await writeFile(filePath, 'modified');
      await sleep(500);

      // Assert: should receive at least one event for this file path
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.path === filePath)).toBe(true);
    });

    it('should stop emitting events after close()', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'initial');

      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: string[] = [];
      watcher.on('change', (p) => events.push(p as string));
      watcher.on('add', (p) => events.push(p as string));
      watcher.add(tempDir);
      await sleep(200);

      await watcher.close();
      events.length = 0; // Clear any events that arrived before close

      await writeFile(filePath, 'after-close');
      await sleep(500);

      expect(events).toHaveLength(0);
    });
  });

  describe('T002: Event normalization', () => {
    it('should emit add for new file creation', async () => {
      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: { event: string; path: string }[] = [];
      watcher.on('add', (p) => events.push({ event: 'add', path: p as string }));
      watcher.add(tempDir);
      await sleep(200);

      const newFile = join(tempDir, 'new-file.txt');
      await writeFile(newFile, 'hello');
      await sleep(500);

      expect(events.some((e) => e.event === 'add' && e.path === newFile)).toBe(true);
    });

    it('should emit unlink for file deletion', async () => {
      const filePath = join(tempDir, 'to-delete.txt');
      await writeFile(filePath, 'content');

      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: { event: string; path: string }[] = [];
      watcher.on('unlink', (p) => events.push({ event: 'unlink', path: p as string }));
      watcher.add(tempDir);
      await sleep(200);

      await unlink(filePath);
      await sleep(500);

      expect(events.some((e) => e.event === 'unlink' && e.path === filePath)).toBe(true);
    });

    it('should emit addDir for new directory creation', async () => {
      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: { event: string; path: string }[] = [];
      watcher.on('addDir', (p) => events.push({ event: 'addDir', path: p as string }));
      watcher.add(tempDir);
      await sleep(200);

      const newDir = join(tempDir, 'new-subdir');
      await mkdir(newDir);
      await sleep(500);

      expect(events.some((e) => e.event === 'addDir' && e.path === newDir)).toBe(true);
    });
  });

  describe('T003: Ignored pattern filtering', () => {
    it('should suppress events for paths matching function predicates', async () => {
      watcher = new NativeFileWatcherAdapter({
        ignoreInitial: true,
        ignored: [(path: string) => path.includes('node_modules')],
      });
      const events: string[] = [];
      watcher.on('add', (p) => events.push(p as string));
      watcher.on('change', (p) => events.push(p as string));
      watcher.add(tempDir);
      await sleep(200);

      // Create ignored file
      await mkdir(join(tempDir, 'node_modules'), { recursive: true });
      await writeFile(join(tempDir, 'node_modules', 'ignored.txt'), 'ignored');
      // Create non-ignored file
      await writeFile(join(tempDir, 'visible.txt'), 'visible');
      await sleep(500);

      const ignoredEvents = events.filter((p) => p.includes('node_modules'));
      const visibleEvents = events.filter((p) => p.includes('visible'));
      expect(ignoredEvents).toHaveLength(0);
      expect(visibleEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should suppress events for paths matching RegExp', async () => {
      watcher = new NativeFileWatcherAdapter({
        ignoreInitial: true,
        ignored: [/\.swp$/],
      });
      const events: string[] = [];
      watcher.on('add', (p) => events.push(p as string));
      watcher.add(tempDir);
      await sleep(200);

      await writeFile(join(tempDir, 'test.swp'), 'swap');
      await writeFile(join(tempDir, 'test.txt'), 'real');
      await sleep(500);

      const swpEvents = events.filter((p) => p.endsWith('.swp'));
      const txtEvents = events.filter((p) => p.endsWith('.txt'));
      expect(swpEvents).toHaveLength(0);
      expect(txtEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('T004: Write stabilization (change-only)', () => {
    it('should debounce rapid writes into fewer events', async () => {
      watcher = new NativeFileWatcherAdapter({
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      });
      const changeEvents: string[] = [];
      watcher.on('change', (p) => changeEvents.push(p as string));
      watcher.add(tempDir);

      const filePath = join(tempDir, 'rapid-write.txt');
      await writeFile(filePath, 'initial');
      await sleep(500); // Wait for initial stabilization

      changeEvents.length = 0; // Reset after initial

      // Rapid writes
      for (let i = 0; i < 5; i++) {
        await writeFile(filePath, `write-${i}`);
        await sleep(50);
      }
      // Wait for stabilization
      await sleep(600);

      // With 300ms stabilization, 5 rapid writes should coalesce into fewer events
      const fileEvents = changeEvents.filter((p) => p === filePath);
      expect(fileEvents.length).toBeLessThanOrEqual(3);
      expect(fileEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT delay rename/add events', async () => {
      watcher = new NativeFileWatcherAdapter({
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 1000 }, // Long threshold
      });
      const addEvents: string[] = [];
      watcher.on('add', (p) => addEvents.push(p as string));
      watcher.add(tempDir);
      await sleep(200);

      const newFile = join(tempDir, 'nodelay.txt');
      await writeFile(newFile, 'hello');
      // Wait much less than the stabilityThreshold
      await sleep(500);

      // Add event should arrive quickly (not delayed by 1000ms stabilization)
      expect(addEvents.some((p) => p === newFile)).toBe(true);
    });
  });

  describe('T005: Multi-path and unwatch', () => {
    it('should watch multiple paths via separate add() calls', async () => {
      const dir1 = join(tempDir, 'dir1');
      const dir2 = join(tempDir, 'dir2');
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });

      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: string[] = [];
      watcher.on('add', (p) => events.push(p as string));
      watcher.add(dir1);
      watcher.add(dir2);
      await sleep(200);

      await writeFile(join(dir1, 'file1.txt'), 'hello');
      await writeFile(join(dir2, 'file2.txt'), 'world');
      await sleep(500);

      expect(events.some((p) => p.includes('file1'))).toBe(true);
      expect(events.some((p) => p.includes('file2'))).toBe(true);
    });

    it('should stop events for unwatched path only', async () => {
      const dir1 = join(tempDir, 'dir1');
      const dir2 = join(tempDir, 'dir2');
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });

      watcher = new NativeFileWatcherAdapter({ ignoreInitial: true });
      const events: string[] = [];
      watcher.on('add', (p) => events.push(p as string));
      watcher.add(dir1);
      watcher.add(dir2);
      await sleep(200);

      watcher.unwatch(dir1);
      await sleep(100);

      await writeFile(join(dir1, 'unwatched.txt'), 'should not appear');
      await writeFile(join(dir2, 'watched.txt'), 'should appear');
      await sleep(500);

      expect(events.some((p) => p.includes('unwatched'))).toBe(false);
      expect(events.some((p) => p.includes('watched'))).toBe(true);
    });
  });

  describe('T006: NativeFileWatcherFactory', () => {
    it('should create NativeFileWatcherAdapter instances', () => {
      const factory = new NativeFileWatcherFactory();
      const instance = factory.create({ ignoreInitial: true });
      expect(instance).toBeInstanceOf(NativeFileWatcherAdapter);
    });

    it('should pass options through to adapter', async () => {
      const factory = new NativeFileWatcherFactory();
      watcher = factory.create({
        ignoreInitial: true,
        ignored: [(p: string) => p.includes('skip')],
      }) as NativeFileWatcherAdapter;

      const events: string[] = [];
      watcher.on('add', (p) => events.push(p as string));
      watcher.add(tempDir);
      await sleep(200);

      await writeFile(join(tempDir, 'skip-this.txt'), 'ignored');
      await writeFile(join(tempDir, 'keep-this.txt'), 'visible');
      await sleep(500);

      expect(events.some((p) => p.includes('skip'))).toBe(false);
      expect(events.some((p) => p.includes('keep'))).toBe(true);
    });
  });
});
