import { promises as fs } from 'fs';
import type { IFileSystem, FileStat } from '../interfaces/filesystem.interface.js';
import { FileSystemError } from '../interfaces/filesystem.interface.js';

/**
 * Real filesystem implementation using Node.js fs/promises.
 *
 * Per Critical Discovery 04: Production services use this adapter for actual
 * filesystem operations. All paths must be absolute.
 */
export class NodeFileSystemAdapter implements IFileSystem {
  /**
   * Check if a path exists.
   */
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file contents as a UTF-8 string.
   */
  async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Write content to a file, creating it if it doesn't exist.
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      await fs.writeFile(path, content, 'utf-8');
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Read directory contents (non-recursive).
   */
  async readDir(path: string): Promise<string[]> {
    try {
      return await fs.readdir(path);
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Create a directory, optionally creating parent directories.
   */
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: options?.recursive ?? false });
    } catch (err) {
      // mkdir with recursive:true doesn't throw on existing dir
      if (options?.recursive) {
        return;
      }
      throw this.wrapError(err, path);
    }
  }

  /**
   * Copy a file from source to destination.
   */
  async copyFile(source: string, dest: string): Promise<void> {
    try {
      await fs.copyFile(source, dest);
    } catch (err) {
      // Determine which path caused the error
      const errorPath = await this.exists(source) ? dest : source;
      throw this.wrapError(err, errorPath);
    }
  }

  /**
   * Get file or directory metadata.
   */
  async stat(path: string): Promise<FileStat> {
    try {
      const stats = await fs.stat(path);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      };
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Delete a file.
   */
  async unlink(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Delete a directory.
   */
  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      if (options?.recursive) {
        await fs.rm(path, { recursive: true, force: false });
      } else {
        await fs.rmdir(path);
      }
    } catch (err) {
      throw this.wrapError(err, path);
    }
  }

  /**
   * Wrap Node.js errors in FileSystemError.
   */
  private wrapError(err: unknown, path: string): FileSystemError {
    if (err instanceof Error) {
      const nodeErr = err as NodeJS.ErrnoException;
      const code = nodeErr.code ?? 'UNKNOWN';
      return new FileSystemError(nodeErr.message, code, path, err);
    }
    return new FileSystemError(String(err), 'UNKNOWN', path);
  }
}
