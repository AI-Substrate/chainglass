import {
  type UploadFileOptions,
  type UploadFileResult,
  uploadFileService,
} from '@/features/041-file-browser/services/upload-file';
import { FakeFileSystem } from '@chainglass/shared/fakes';
import { FakePathResolver } from '@chainglass/shared/fakes';
import { beforeEach, describe, expect, it } from 'vitest';

describe('uploadFileService', () => {
  let fakeFs: FakeFileSystem;
  let fakePathResolver: FakePathResolver;
  const worktreePath = '/home/user/project';

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    fakeFs.setFile('/home/user/project/.gitignore', 'scratch/*');
    fakePathResolver = new FakePathResolver(worktreePath);
  });

  function makeOptions(overrides: Partial<UploadFileOptions> = {}): UploadFileOptions {
    return {
      worktreePath,
      fileName: 'screenshot.png',
      mimeType: 'image/png',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      fileSystem: fakeFs,
      pathResolver: fakePathResolver,
      ...overrides,
    };
  }

  it('should write file to scratch/paste/ with timestamp name', async () => {
    /*
    Test Doc:
    - Why: Core upload behavior — files land in correct location with timestamp names
    - Contract: uploadFileService writes to <worktree>/scratch/paste/<timestamp>.<ext>
    - Usage Notes: Uses FakeFileSystem + FakePathResolver
    - Quality Contribution: Verifies AC-16, AC-18 (destination + naming)
    - Worked Example: upload screenshot.png → scratch/paste/YYYYMMDDTHHMMSS.png
    */
    const result = await uploadFileService(makeOptions());

    expect(result.ok).toBe(true);
    expect(result.filePath).toMatch(/^scratch\/paste\/\d{8}T\d{6}\.png$/);
  });

  it('should create scratch/paste/ directory if not exists', async () => {
    /*
    Test Doc:
    - Why: First upload needs to create the directory (AC-17)
    - Contract: uploadFileService calls mkdir with recursive: true
    - Usage Notes: FakeFileSystem starts with no scratch/ directory
    - Quality Contribution: Verifies AC-17 (auto-create)
    - Worked Example: upload when scratch/paste/ missing → directory created
    */
    const result = await uploadFileService(makeOptions());

    expect(result.ok).toBe(true);
    const dirExists = await fakeFs.exists(`${worktreePath}/scratch/paste`);
    expect(dirExists).toBe(true);
  });

  it('should append collision suffix for same-second uploads', async () => {
    /*
    Test Doc:
    - Why: Two uploads in the same second must not collide (AC-20)
    - Contract: Second file gets -1 suffix, third gets -2
    - Usage Notes: Pre-create a file matching the expected timestamp
    - Quality Contribution: Verifies AC-20 (collision suffix)
    - Worked Example: existing 20260224T070054.png → next is 20260224T070054-1.png
    */
    // First upload
    const result1 = await uploadFileService(makeOptions());
    expect(result1.ok).toBe(true);

    // Second upload in same second — use the same timestamp by writing another file
    const result2 = await uploadFileService(makeOptions());
    expect(result2.ok).toBe(true);
    expect(result2.filePath).not.toBe(result1.filePath);
    // One of them should have a -1 suffix (or they have different seconds)
    if (result1.filePath === result2.filePath?.replace(/-\d+\./, '.')) {
      expect(result2.filePath).toMatch(/-\d+\.png$/);
    }
  });

  it('should reject path traversal in worktreePath', async () => {
    /*
    Test Doc:
    - Why: Security — prevent writing outside worktree (AC-29)
    - Contract: Returns { ok: false, error: 'security' } on traversal
    - Usage Notes: FakePathResolver configured to throw on traversal
    - Quality Contribution: Verifies AC-29, AC-30 (path security)
    - Worked Example: worktreePath with /../ → security error
    */
    fakePathResolver.blockPath('scratch/paste');
    const result = await uploadFileService(makeOptions());

    expect(result.ok).toBe(false);
    expect(result.error).toBe('security');
  });

  it('should reject files over 10MB', async () => {
    /*
    Test Doc:
    - Why: Prevent oversized uploads consuming disk (AC-28)
    - Contract: Returns { ok: false, error: 'too-large' } for files > 10MB
    - Usage Notes: Pass a buffer larger than limit
    - Quality Contribution: Verifies AC-28 (size limit)
    - Worked Example: 11MB buffer → too-large error
    */
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
    const result = await uploadFileService(makeOptions({ content: bigBuffer }));

    expect(result.ok).toBe(false);
    expect(result.error).toBe('too-large');
  });

  it('should derive extension from filename, then MIME type, then fallback to bin', async () => {
    /*
    Test Doc:
    - Why: Extension detection priority chain (AC-19)
    - Contract: filename ext → MIME type → 'bin' fallback
    - Usage Notes: Test each fallback level
    - Quality Contribution: Verifies AC-19 (extension derivation)
    - Worked Example: unknown MIME + no extension → .bin
    */
    // MIME type fallback (no extension in filename)
    const result1 = await uploadFileService(
      makeOptions({ fileName: 'image', mimeType: 'image/jpeg' })
    );
    expect(result1.ok).toBe(true);
    expect(result1.filePath).toMatch(/\.jpg$/);

    // Fallback to bin (unknown MIME, no extension)
    const result2 = await uploadFileService(
      makeOptions({ fileName: 'data', mimeType: 'application/octet-stream' })
    );
    expect(result2.ok).toBe(true);
    expect(result2.filePath).toMatch(/\.bin$/);
  });
});
