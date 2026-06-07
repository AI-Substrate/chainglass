/**
 * Image Editor Save — Integration (binary round-trip + action-path wiring)
 *
 * Exercises the real save path the server action composes — deriveEditedFilename
 * → saveImageService — against FakeFileSystem/FakePathResolver (no vi.mock).
 * Proves image BYTES survive intact (Buffer, not string) and that save-as-new
 * replaces an existing -edited sibling unconditionally.
 *
 * Plan 086: In-browser Image Editor — T012
 * AC-7 (native dimensions), AC-9 (valid image bytes), AC-4 (unconditional replace)
 */

import { deflateSync } from 'node:zlib';

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveEditedFilename } from '@/features/041-file-browser/services/image-filename';
import { saveImageService } from '@/features/041-file-browser/services/save-image';

// --- minimal-but-valid PNG construction (no decoder lib in the unit env) ---

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePng(width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // Real, decodable image data: each scanline is filter byte 0 + RGBA pixels,
  // zlib-compressed into an IDAT chunk (a PNG without IDAT is not decodable).
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) {
    const o = 1 + x * 4;
    row[o] = 200;
    row[o + 1] = 220;
    row[o + 2] = 255;
    row[o + 3] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.from(row)));
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function isPng(buf: Buffer): boolean {
  return (
    buf.length > 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71
  );
}

/** Confirm the byte stream contains an IDAT chunk (required for a decodable PNG). */
function hasIdat(buf: Buffer): boolean {
  return buf.includes(Buffer.from('IDAT', 'ascii'));
}

function parsePngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const WORKTREE = '/w';

let fs: FakeFileSystem;
let resolver: FakePathResolver;

beforeEach(() => {
  fs = new FakeFileSystem();
  resolver = new FakePathResolver();
  fs.setDir('/w/pics');
});

describe('image editor save — binary round-trip', () => {
  it('preserves PNG bytes and native dimensions through save-as-new', async () => {
    /*
    Test Doc:
    - Why: the save path must not corrupt binary image data — AC-9, AC-7
    - Contract: deriveEditedFilename + saveImageService(edited-copy) writes exact bytes
    - Usage Notes: mirrors what saveEditedImage composes (minus DI)
    - Quality Contribution: AC-9, AC-7, AC-4
    - Worked Example: 120x80 PNG saved → read back deep-equals input, IHDR 120x80
    */
    const png = makePng(120, 80);
    const target = deriveEditedFilename('pics/shot.png'); // pics/shot-edited.png

    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: target,
      content: png,
      mode: 'edited-copy',
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedPath).toBe('pics/shot-edited.png');

    const readBack = fs.getFile('/w/pics/shot-edited.png');
    expect(Buffer.isBuffer(readBack)).toBe(true);
    expect(readBack).toEqual(png); // byte-identical — no corruption
    expect(isPng(readBack as Buffer)).toBe(true); // valid signature
    expect(hasIdat(readBack as Buffer)).toBe(true); // decodable — has image data
    expect(parsePngSize(readBack as Buffer)).toEqual({ width: 120, height: 80 });
  });

  it('replaces an existing -edited sibling unconditionally', async () => {
    const target = deriveEditedFilename('pics/shot.png');
    fs.setFile('/w/pics/shot-edited.png', Buffer.from([0x00, 0x01]));

    const png = makePng(64, 64);
    const result = await saveImageService({
      worktreePath: WORKTREE,
      filePath: target,
      content: png,
      mode: 'edited-copy',
      // even a stale baseline must not block edited-copy (AC-4)
      expectedMtime: '2000-01-01T00:00:00.000Z',
      fileSystem: fs,
      pathResolver: resolver,
    });

    expect(result.ok).toBe(true);
    expect(fs.getFile('/w/pics/shot-edited.png')).toEqual(png);
  });

  it('overwrite mode targets the original path; edited-copy derives the sibling', async () => {
    // Mirrors the action's path selection for both modes.
    const original = 'pics/shot.png';
    fs.setFile('/w/pics/shot.png', Buffer.from([0x09]));

    const overwrite = await saveImageService({
      worktreePath: WORKTREE,
      filePath: original,
      content: makePng(10, 10),
      mode: 'overwrite',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(overwrite.ok && overwrite.savedPath).toBe('pics/shot.png');

    const copyTarget = deriveEditedFilename(original);
    const copy = await saveImageService({
      worktreePath: WORKTREE,
      filePath: copyTarget,
      content: makePng(10, 10),
      mode: 'edited-copy',
      fileSystem: fs,
      pathResolver: resolver,
    });
    expect(copy.ok && copy.savedPath).toBe('pics/shot-edited.png');
  });
});
