/**
 * File Mutation Actions Tests (create, delete, rename)
 *
 * Purpose: Verify secure file/folder CRUD with path security,
 *          duplicate detection, filename validation, and error handling.
 * Quality Contribution: Security-critical — prevents path traversal and symlink attacks.
 *
 * Plan 068: Add File/Folder Features — Phase 1
 */

import {
  type CreateFileOptions,
  type CreateFolderOptions,
  type DeleteItemOptions,
  MAX_DELETE_CHILDREN,
  type RenameItemOptions,
  createFileService,
  createFolderService,
  deleteItemService,
  renameItemService,
} from '@/features/041-file-browser/services/file-mutation-actions';
import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

describe('createFileService', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    // Ensure parent directory exists
    fs.setFile('/workspace/src/.gitkeep', '');
  });

  const opts = (overrides?: Partial<CreateFileOptions>): CreateFileOptions => ({
    worktreePath: '/workspace',
    dirPath: 'src',
    fileName: 'index.ts',
    fileSystem: fs,
    pathResolver,
    ...overrides,
  });

  it('creates an empty file and returns its path', async () => {
    /*
    Test Doc:
    - Why: Verify the core happy path for file creation
    - Contract: createFileService creates file at dirPath/fileName, returns {ok: true, path}
    - Usage Notes: File is created empty — content editing happens after via saveFile
    - Quality Contribution: Core CRUD operation
    - Worked Example: createFileService({dirPath: 'src', fileName: 'index.ts'}) → {ok: true, path: 'src/index.ts'}
    */
    const result = await createFileService(opts());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe('src/index.ts');
    }
    expect(await fs.exists('/workspace/src/index.ts')).toBe(true);
  });

  it('rejects duplicate file names', async () => {
    /*
    Test Doc:
    - Why: Creating over an existing file would silently destroy content
    - Contract: Returns {ok: false, error: 'exists'} if file already exists
    - Usage Notes: Check before write — no overwrite behavior
    - Quality Contribution: Prevents data loss from accidental overwrites
    - Worked Example: createFileService for existing file → {ok: false, error: 'exists'}
    */
    fs.setFile('/workspace/src/index.ts', 'existing content');

    const result = await createFileService(opts());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('exists');
    }
  });

  it('rejects invalid file names', async () => {
    /*
    Test Doc:
    - Why: Invalid names would fail on disk or cause cross-platform issues
    - Contract: Returns {ok: false, error: 'invalid-name'} for git-portable violations
    - Usage Notes: Validates before any filesystem I/O
    - Quality Contribution: Prevents bad filenames from reaching disk
    - Worked Example: createFileService({fileName: 'file*.ts'}) → {ok: false, error: 'invalid-name'}
    */
    const result = await createFileService(opts({ fileName: 'file*.ts' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-name');
    }
  });

  it('rejects path traversal attempts', async () => {
    /*
    Test Doc:
    - Why: Attacker could use ../../../etc/passwd as dirPath
    - Contract: Returns {ok: false, error: 'security'} on path traversal
    - Usage Notes: PathResolver.resolvePath throws PathSecurityError
    - Quality Contribution: Blocks directory traversal attack vector
    - Worked Example: createFileService({dirPath: '../../etc'}) → {ok: false, error: 'security'}
    */

    const result = await createFileService(opts({ dirPath: '../../etc' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });
});

describe('createFolderService', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    fs.setFile('/workspace/src/.gitkeep', '');
  });

  const opts = (overrides?: Partial<CreateFolderOptions>): CreateFolderOptions => ({
    worktreePath: '/workspace',
    dirPath: 'src',
    folderName: 'components',
    fileSystem: fs,
    pathResolver,
    ...overrides,
  });

  it('creates a directory and returns its path', async () => {
    /*
    Test Doc:
    - Why: Verify the core happy path for folder creation
    - Contract: createFolderService creates dir at dirPath/folderName, returns {ok: true, path}
    - Usage Notes: Creates directory with mkdir
    - Quality Contribution: Core CRUD operation
    - Worked Example: createFolderService({dirPath: 'src', folderName: 'components'}) → {ok: true, path: 'src/components'}
    */
    const result = await createFolderService(opts());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe('src/components');
    }
  });

  it('rejects duplicate folder names', async () => {
    /*
    Test Doc:
    - Why: Creating over an existing directory is confusing and may lose data
    - Contract: Returns {ok: false, error: 'exists'} if folder already exists
    - Usage Notes: Uses exists() check before mkdir
    - Quality Contribution: Prevents confusion from silent no-ops
    - Worked Example: createFolderService for existing dir → {ok: false, error: 'exists'}
    */
    await fs.mkdir('/workspace/src/components');

    const result = await createFolderService(opts());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('exists');
    }
  });

  it('rejects path traversal', async () => {
    /*
    Test Doc:
    - Why: Attacker could use directory traversal to create folders outside workspace
    - Contract: Returns {ok: false, error: 'security'} on traversal
    - Usage Notes: PathResolver catches the escape
    - Quality Contribution: Security boundary enforcement
    - Worked Example: createFolderService({dirPath: '../..'}) → {ok: false, error: 'security'}
    */

    const result = await createFolderService(opts({ dirPath: '../../etc' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });
});

describe('deleteItemService', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
  });

  const opts = (overrides?: Partial<DeleteItemOptions>): DeleteItemOptions => ({
    worktreePath: '/workspace',
    itemPath: 'src/old.ts',
    fileSystem: fs,
    pathResolver,
    ...overrides,
  });

  it('deletes a file', async () => {
    /*
    Test Doc:
    - Why: Verify the core happy path for file deletion
    - Contract: deleteItemService removes the file, returns {ok: true}
    - Usage Notes: Uses unlink for files
    - Quality Contribution: Core CRUD operation
    - Worked Example: deleteItemService({itemPath: 'src/old.ts'}) → {ok: true}
    */
    fs.setFile('/workspace/src/old.ts', 'content');

    const result = await deleteItemService(opts());

    expect(result.ok).toBe(true);
    expect(await fs.exists('/workspace/src/old.ts')).toBe(false);
  });

  it('deletes a folder recursively', async () => {
    /*
    Test Doc:
    - Why: Verify folder deletion with contents
    - Contract: deleteItemService removes dir and contents, returns {ok: true}
    - Usage Notes: Uses rmdir({recursive: true}) for directories
    - Quality Contribution: Handles the more dangerous delete case
    - Worked Example: deleteItemService({itemPath: 'src/old-dir'}) → {ok: true}
    */
    fs.setFile('/workspace/src/old-dir/a.ts', 'a');
    fs.setFile('/workspace/src/old-dir/b.ts', 'b');

    const result = await deleteItemService(opts({ itemPath: 'src/old-dir' }));

    expect(result.ok).toBe(true);
    expect(await fs.exists('/workspace/src/old-dir')).toBe(false);
  });

  it('rejects deletion of non-existent paths', async () => {
    /*
    Test Doc:
    - Why: Deleting a non-existent file should fail clearly
    - Contract: Returns {ok: false, error: 'not-found'}
    - Usage Notes: Stat check before delete
    - Quality Contribution: Clear error instead of ENOENT crash
    - Worked Example: deleteItemService for missing file → {ok: false, error: 'not-found'}
    */
    const result = await deleteItemService(opts({ itemPath: 'src/nonexistent.ts' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not-found');
    }
  });

  it('rejects path traversal', async () => {
    /*
    Test Doc:
    - Why: Attacker could try to delete files outside workspace
    - Contract: Returns {ok: false, error: 'security'} on traversal
    - Usage Notes: PathResolver validates containment
    - Quality Contribution: Blocks deletion outside workspace boundary
    - Worked Example: deleteItemService({itemPath: '../../etc/passwd'}) → {ok: false, error: 'security'}
    */

    const result = await deleteItemService(opts({ itemPath: '../../etc/passwd' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });

  it('rejects deletion of folders with too many children', async () => {
    /*
    Test Doc:
    - Why: Deleting node_modules (10k+ files) could block the server
    - Contract: Returns {ok: false, error: 'too-large', itemCount} for oversized dirs
    - Usage Notes: Quick readDir count before rmdir — server-side safety limit
    - Quality Contribution: Prevents accidental mass deletion and server stalls
    - Worked Example: deleteItemService for folder with >5000 children → {ok: false, error: 'too-large'}
    */
    // Create a directory with entries exceeding the limit
    fs.setFile('/workspace/.gitkeep', '');
    await fs.mkdir('/workspace/huge-dir');
    const entries: string[] = [];
    for (let i = 0; i < MAX_DELETE_CHILDREN + 1; i++) {
      entries.push(`file${i}.ts`);
    }
    // FakeFileSystem.readDir returns children — simulate many entries
    for (const entry of entries) {
      fs.setFile(`/workspace/huge-dir/${entry}`, '');
    }

    const result = await deleteItemService(opts({ itemPath: 'huge-dir' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('too-large');
      expect(result.itemCount).toBeGreaterThan(MAX_DELETE_CHILDREN);
    }
  });
});

describe('renameItemService', () => {
  let fs: InstanceType<typeof FakeFileSystem>;
  let pathResolver: InstanceType<typeof FakePathResolver>;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
  });

  const opts = (overrides?: Partial<RenameItemOptions>): RenameItemOptions => ({
    worktreePath: '/workspace',
    oldPath: 'src/old.ts',
    newName: 'new.ts',
    fileSystem: fs,
    pathResolver,
    ...overrides,
  });

  it('renames a file and returns both paths', async () => {
    /*
    Test Doc:
    - Why: Verify core rename happy path with both old and new paths in result
    - Contract: renameItemService renames file, returns {ok: true, oldPath, newPath}
    - Usage Notes: DYK-04: Both paths needed for Phase 3 selectedFile sync
    - Quality Contribution: Core CRUD + state management support
    - Worked Example: renameItemService({oldPath: 'src/old.ts', newName: 'new.ts'}) → {ok: true, oldPath: 'src/old.ts', newPath: 'src/new.ts'}
    */
    fs.setFile('/workspace/src/old.ts', 'content');

    const result = await renameItemService(opts());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.oldPath).toBe('src/old.ts');
      expect(result.newPath).toBe('src/new.ts');
    }
    expect(await fs.exists('/workspace/src/old.ts')).toBe(false);
    expect(await fs.exists('/workspace/src/new.ts')).toBe(true);
  });

  it('renames a folder', async () => {
    /*
    Test Doc:
    - Why: Verify folder rename works — same IFileSystem.rename under the hood
    - Contract: renameItemService renames folder, returns {ok: true, oldPath, newPath}
    - Usage Notes: Folder rename preserves all children
    - Quality Contribution: Ensures folder rename doesn't lose contents
    - Worked Example: renameItemService({oldPath: 'src/old-dir', newName: 'new-dir'}) → {ok: true}
    */
    fs.setFile('/workspace/src/old-dir/child.ts', 'child');

    const result = await renameItemService(opts({ oldPath: 'src/old-dir', newName: 'new-dir' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newPath).toBe('src/new-dir');
    }
  });

  it('rejects rename if destination already exists', async () => {
    /*
    Test Doc:
    - Why: Renaming onto an existing file would silently overwrite
    - Contract: Returns {ok: false, error: 'exists'} if destination exists
    - Usage Notes: Check before rename — no clobber behavior
    - Quality Contribution: Prevents data loss from name collision
    - Worked Example: rename to existing name → {ok: false, error: 'exists'}
    */
    fs.setFile('/workspace/src/old.ts', 'old content');
    fs.setFile('/workspace/src/new.ts', 'new content');

    const result = await renameItemService(opts());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('exists');
    }
  });

  it('rejects rename of non-existent source', async () => {
    /*
    Test Doc:
    - Why: Renaming a non-existent file should fail clearly
    - Contract: Returns {ok: false, error: 'not-found'} if source doesn't exist
    - Usage Notes: Stat check on source before rename
    - Quality Contribution: Clear error instead of ENOENT crash
    - Worked Example: rename missing file → {ok: false, error: 'not-found'}
    */
    const result = await renameItemService(opts());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('not-found');
    }
  });

  it('rejects invalid new name', async () => {
    /*
    Test Doc:
    - Why: Invalid names would fail on disk or cause cross-platform issues
    - Contract: Returns {ok: false, error: 'invalid-name'} for git-portable violations
    - Usage Notes: Validates before any filesystem I/O
    - Quality Contribution: Prevents bad filenames from reaching disk
    - Worked Example: rename with newName containing '?' → {ok: false, error: 'invalid-name'}
    */
    fs.setFile('/workspace/src/old.ts', 'content');

    const result = await renameItemService(opts({ newName: 'invalid?.ts' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-name');
    }
  });

  it('rejects path traversal', async () => {
    /*
    Test Doc:
    - Why: Attacker could rename files outside workspace
    - Contract: Returns {ok: false, error: 'security'} on traversal
    - Usage Notes: PathResolver validates both source and destination
    - Quality Contribution: Security boundary enforcement
    - Worked Example: rename with traversal path → {ok: false, error: 'security'}
    */

    const result = await renameItemService(opts({ oldPath: '../../etc/passwd' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('security');
    }
  });
});
