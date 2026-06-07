/**
 * saveImageService Tests (TDD — RED first)
 *
 * Buffer-based, atomic (tmp→rename) image save modelled on uploadFileService.
 * Two modes:
 *  - 'overwrite'   — optional mtime-conflict guard (AC-3)
 *  - 'edited-copy' — unconditional write of the derived -edited sibling (AC-4)
 * Security via IPathResolver (AC-8); typed write-failed (AC-13); Buffer bytes (AC-9).
 *
 * Plan 086: In-browser Image Editor — T003
 * AC-3, AC-4, AC-8, AC-9, AC-13
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { saveImageService } from '@/features/041-file-browser/services/save-image';

const WORKTREE = '/work';
const REL = 'images/foo.png';
const ABS = '/work/images/foo.png';
const TMP = '/work/images/foo.png.tmp';

// A tiny but real PNG-ish byte sequence (header is what matters for "is binary").
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);

let fs: FakeFileSystem;
let resolver: FakePathResolver;

beforeEach(() => {
  fs = new FakeFileSystem();
  resolver = new FakePathResolver();
  fs.setDir('/work/images');
});

describe('saveImageService — overwrite mode', () => {
  it('writes Buffer bytes atomically and returns the new mtime', async () => {
    /*
    Test Doc:
    - Why: Image bytes must survive the save path intact (Buffer, not string) — AC-9
    - Contract: saveImageService({mode:'overwrite', content:Buffer}) → {ok:true, savedPath, newMtime}
    - Usage Notes: atomic tmp→rename; the .tmp must not linger
    - Quality Contribution: AC-9, AC-3
    - Worked Example: write PNG_BYTES → getFile(ABS) deep-equals PNG_BYTES
    */
    fs.setFile(ABS, Buffer.from([0x00]));
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: PNG_BYTES,
      mode: 'overwrite',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedPath).toBe(REL);
    expect(typeof result.newMtime).toBe('string');
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES);
    expect(await fs.exists(TMP)).toBe(false);
  });

  it('halts with conflict + serverMtime when mtime differs', async () => {
    /*
    Test Doc:
    - Why: An external edit since load must not be silently clobbered — AC-3
    - Contract: stale expectedMtime → {ok:false, error:'conflict', serverMtime}
    - Usage Notes: serverMtime lets the UI offer Reload / Save-as-new / Overwrite-anyway
    - Quality Contribution: AC-3
    - Worked Example: expectedMtime='2000-..' but file mtime is now → conflict
    */
    fs.setFile(ABS, PNG_BYTES);
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: Buffer.from([0xff]),
      mode: 'overwrite',
      expectedMtime: '2000-01-01T00:00:00.000Z',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('conflict');
    expect(typeof result.serverMtime).toBe('string');
    // Original bytes untouched on conflict.
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES);
  });

  it('writes when expectedMtime matches the current mtime', async () => {
    fs.setFile(ABS, Buffer.from([0x00]));
    const current = (await fs.stat(ABS)).mtime;
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: PNG_BYTES,
      mode: 'overwrite',
      expectedMtime: current,
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(true);
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES);
  });

  it('overwrites unconditionally when no expectedMtime is given (overwrite-anyway)', async () => {
    fs.setFile(ABS, Buffer.from([0x00]));
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: PNG_BYTES,
      mode: 'overwrite',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(true);
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES);
  });
});

describe('saveImageService — edited-copy mode', () => {
  it('replaces an existing -edited sibling unconditionally (no mtime check)', async () => {
    /*
    Test Doc:
    - Why: Save-as-new targets a derived name — always overwrite, never prompt — AC-4
    - Contract: mode:'edited-copy' ignores expectedMtime entirely
    - Usage Notes: even a stale expectedMtime must not cause a conflict
    - Quality Contribution: AC-4
    - Worked Example: pre-existing foo-edited.png is replaced silently
    */
    const editedAbs = '/work/images/foo-edited.png';
    fs.setFile(editedAbs, Buffer.from([0x00]));
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: 'images/foo-edited.png',
      content: PNG_BYTES,
      mode: 'edited-copy',
      expectedMtime: '2000-01-01T00:00:00.000Z',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(true);
    expect(fs.getFile(editedAbs)).toEqual(PNG_BYTES);
  });
});

describe('saveImageService — failure modes', () => {
  it('returns security and writes nothing on a path-traversal attempt', async () => {
    /*
    Test Doc:
    - Why: Traversal must never write outside the worktree — AC-8
    - Contract: PathSecurityError → {ok:false, error:'security'}
    - Usage Notes: validated before any I/O
    - Quality Contribution: AC-8
    - Worked Example: blocked '../../etc/x.png' → security, no file created
    */
    resolver.blockPath('../../etc/passwd.png');
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: '../../etc/passwd.png',
      content: PNG_BYTES,
      mode: 'edited-copy',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('security');
    expect(fs.getAllFiles()).not.toContain('/etc/passwd.png');
  });

  it('returns write-failed when the filesystem write throws', async () => {
    fs.setFile(ABS, Buffer.from([0x00]));
    fs.simulateError(TMP, new Error('ENOSPC: disk full'));
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: PNG_BYTES,
      mode: 'overwrite',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('write-failed');
  });

  it('does not silently bypass the mtime guard when the stat check fails (F002)', async () => {
    /*
    Test Doc:
    - Why: a non-missing stat error during conflict detection must not be treated
      as "file absent" and allowed to overwrite (companion F002)
    - Contract: stat throws (not ENOENT) + expectedMtime → write-failed, no write
    - Usage Notes: only a FileSystemError 'ENOENT' is the safe creation case
    - Quality Contribution: AC-13, F002
    - Worked Example: EACCES on stat → write-failed; original bytes untouched
    */
    fs.setFile(ABS, PNG_BYTES);
    fs.simulateError(ABS, new Error('EACCES: permission denied'));
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: Buffer.from([0xaa]),
      mode: 'overwrite',
      expectedMtime: 'irrelevant',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('write-failed');
    fs.clearErrors();
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES); // not overwritten
  });

  it('allows creation (no conflict) when the target file does not exist yet', async () => {
    // No setFile → ABS absent; a stale expectedMtime must not block first write.
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: REL,
      content: PNG_BYTES,
      mode: 'overwrite',
      expectedMtime: '2020-01-01T00:00:00.000Z',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(result.ok).toBe(true);
    expect(fs.getFile(ABS)).toEqual(PNG_BYTES);
  });
});
