/**
 * Atomic File Write Utility.
 *
 * Per Critical Discovery 03: Write to temporary file, then rename.
 * This prevents corruption if the process is killed mid-write.
 *
 * Per DYK#2: Always overwrite .tmp files - no recovery logic needed.
 */

import type { IFileSystem } from '@chainglass/shared';

/**
 * Write content to a file atomically.
 *
 * Uses the write-to-temp-then-rename pattern:
 * 1. Write content to <path>.tmp (overwrites any existing .tmp file)
 * 2. Rename .tmp file to target path (atomic on most filesystems)
 *
 * This ensures the target file is never in an intermediate state.
 *
 * @param fs - Filesystem interface
 * @param path - Target file path
 * @param content - Content to write
 */
export async function atomicWriteFile(
  fs: IFileSystem,
  path: string,
  content: string
): Promise<void> {
  const tempPath = `${path}.tmp`;

  // Write to temp file (overwrites any existing .tmp - per DYK#2)
  await fs.writeFile(tempPath, content);

  // Rename to target path (atomic operation)
  await fs.rename(tempPath, path);
}

/**
 * Write JSON content to a file atomically.
 *
 * Convenience wrapper that JSON.stringify's the data.
 *
 * @param fs - Filesystem interface
 * @param path - Target file path
 * @param data - Data to serialize and write
 * @param indent - JSON indentation (default: 2)
 */
export async function atomicWriteJson(
  fs: IFileSystem,
  path: string,
  data: unknown,
  indent = 2
): Promise<void> {
  const content = JSON.stringify(data, null, indent);
  await atomicWriteFile(fs, path, content);
}
