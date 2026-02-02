import type { IFileSystem } from '@chainglass/shared';

/**
 * Write content to a file atomically using temp-then-rename.
 *
 * Per CD-06: Reimplement locally — do not import from workgraph.
 * Writes to a .tmp file first, then renames to the target path.
 * This prevents partial writes from corrupting the target file.
 */
export async function atomicWriteFile(
  fs: IFileSystem,
  path: string,
  content: string
): Promise<void> {
  const tempPath = `${path}.tmp`;
  await fs.writeFile(tempPath, content);
  try {
    await fs.rename(tempPath, path);
  } catch (err) {
    // Best-effort cleanup of temp file on rename failure
    await fs.unlink(tempPath).catch(() => {});
    throw err;
  }
}
