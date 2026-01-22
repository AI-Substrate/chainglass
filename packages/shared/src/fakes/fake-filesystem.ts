import * as pathModule from 'path';
import type { IFileSystem, FileStat } from '../interfaces/filesystem.interface.js';
import { FileSystemError } from '../interfaces/filesystem.interface.js';

/**
 * In-memory filesystem implementation for testing.
 *
 * Per Critical Discovery 04: Tests use this fake instead of real filesystem
 * for fast, isolated execution. Stores files in Map<string, string>.
 */
export class FakeFileSystem implements IFileSystem {
  /** In-memory file storage: path -> content */
  private files = new Map<string, string>();
  /** In-memory directory storage (directories without files) */
  private dirs = new Set<string>();
  /** File metadata (mtime) */
  private mtimes = new Map<string, string>();
  /** Simulated errors for specific paths */
  private errors = new Map<string, Error>();

  // ========== Test Helpers ==========

  /**
   * Set a file's content directly (test helper).
   * Automatically creates parent directories.
   */
  setFile(path: string, content: string): void {
    this.ensureParentDirs(path);
    this.files.set(path, content);
    this.mtimes.set(path, new Date().toISOString());
  }

  /**
   * Get a file's content directly (test helper).
   */
  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  /**
   * Create a directory directly (test helper).
   */
  setDir(path: string): void {
    this.ensureParentDirs(path);
    this.dirs.add(path);
  }

  /**
   * Configure an error to be thrown for a specific path (test helper).
   */
  simulateError(path: string, error: Error): void {
    this.errors.set(path, error);
  }

  /**
   * Clear all simulated errors (test helper).
   */
  clearErrors(): void {
    this.errors.clear();
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.files.clear();
    this.dirs.clear();
    this.mtimes.clear();
    this.errors.clear();
  }

  /**
   * Get all file paths (test helper for debugging).
   */
  getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }

  /**
   * Get all directory paths (test helper for debugging).
   */
  getAllDirs(): string[] {
    return Array.from(this.dirs);
  }

  // ========== IFileSystem Implementation ==========

  async exists(path: string): Promise<boolean> {
    this.checkSimulatedError(path);
    return this.files.has(path) || this.dirs.has(path) || this.isImplicitDir(path);
  }

  async readFile(path: string): Promise<string> {
    this.checkSimulatedError(path);

    const content = this.files.get(path);
    if (content === undefined) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, open '${path}'`,
        'ENOENT',
        path,
      );
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.checkSimulatedError(path);

    const parent = pathModule.dirname(path);
    if (parent !== '/' && parent !== '.' && !await this.exists(parent)) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, open '${path}'`,
        'ENOENT',
        path,
      );
    }

    this.files.set(path, content);
    this.mtimes.set(path, new Date().toISOString());
  }

  async readDir(path: string): Promise<string[]> {
    this.checkSimulatedError(path);

    // Check if path exists as a directory
    const isDir = this.dirs.has(path) || this.isImplicitDir(path);
    if (!isDir) {
      if (this.files.has(path)) {
        throw new FileSystemError(
          `ENOTDIR: not a directory, scandir '${path}'`,
          'ENOTDIR',
          path,
        );
      }
      throw new FileSystemError(
        `ENOENT: no such file or directory, scandir '${path}'`,
        'ENOENT',
        path,
      );
    }

    // Normalize path for comparison
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
    const entries = new Set<string>();

    // Find all files in this directory (non-recursive)
    for (const filePath of this.files.keys()) {
      const parent = pathModule.dirname(filePath);
      if (parent === normalizedPath || parent === path) {
        entries.add(pathModule.basename(filePath));
      }
    }

    // Find all subdirectories
    for (const dirPath of this.dirs) {
      const parent = pathModule.dirname(dirPath);
      if (parent === normalizedPath || parent === path) {
        entries.add(pathModule.basename(dirPath));
      }
    }

    // Also find implicit directories from file paths
    for (const filePath of this.files.keys()) {
      const parts = filePath.split('/').filter(Boolean);
      const normalizedParts = normalizedPath.split('/').filter(Boolean);

      if (parts.length > normalizedParts.length + 1) {
        // Check if this file is nested under our directory
        let matches = true;
        for (let i = 0; i < normalizedParts.length; i++) {
          if (parts[i] !== normalizedParts[i]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          entries.add(parts[normalizedParts.length]);
        }
      }
    }

    return Array.from(entries);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.checkSimulatedError(path);

    if (options?.recursive) {
      // Create all parent directories
      // Handle both absolute (/foo/bar) and relative (foo/bar) paths
      if (path.startsWith('/')) {
        const parts = path.split('/').filter(Boolean);
        let currentPath = '';
        for (const part of parts) {
          currentPath = currentPath + '/' + part;
          this.dirs.add(currentPath);
        }
      } else {
        // Relative path: build up parts without leading slash
        const parts = path.split('/').filter(Boolean);
        let currentPath = '';
        for (let i = 0; i < parts.length; i++) {
          currentPath = i === 0 ? parts[i] : currentPath + '/' + parts[i];
          this.dirs.add(currentPath);
        }
      }
    } else {
      const parent = pathModule.dirname(path);
      if (parent !== '/' && parent !== '.' && !await this.exists(parent)) {
        throw new FileSystemError(
          `ENOENT: no such file or directory, mkdir '${path}'`,
          'ENOENT',
          path,
        );
      }
      this.dirs.add(path);
    }
  }

  async copyFile(source: string, dest: string): Promise<void> {
    this.checkSimulatedError(source);
    this.checkSimulatedError(dest);

    const content = this.files.get(source);
    if (content === undefined) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, copyfile '${source}' -> '${dest}'`,
        'ENOENT',
        source,
      );
    }

    const destParent = pathModule.dirname(dest);
    if (destParent !== '/' && destParent !== '.' && !await this.exists(destParent)) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, copyfile '${source}' -> '${dest}'`,
        'ENOENT',
        dest,
      );
    }

    this.files.set(dest, content);
    this.mtimes.set(dest, new Date().toISOString());
  }

  async stat(path: string): Promise<FileStat> {
    this.checkSimulatedError(path);

    const isFile = this.files.has(path);
    const isDir = this.dirs.has(path) || this.isImplicitDir(path);

    if (!isFile && !isDir) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, stat '${path}'`,
        'ENOENT',
        path,
      );
    }

    return {
      isFile,
      isDirectory: isDir && !isFile,
      size: isFile ? (this.files.get(path)?.length ?? 0) : 0,
      mtime: this.mtimes.get(path) ?? new Date().toISOString(),
    };
  }

  async unlink(path: string): Promise<void> {
    this.checkSimulatedError(path);

    if (!this.files.has(path)) {
      if (this.dirs.has(path) || this.isImplicitDir(path)) {
        throw new FileSystemError(
          `EISDIR: illegal operation on a directory, unlink '${path}'`,
          'EISDIR',
          path,
        );
      }
      throw new FileSystemError(
        `ENOENT: no such file or directory, unlink '${path}'`,
        'ENOENT',
        path,
      );
    }

    this.files.delete(path);
    this.mtimes.delete(path);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.checkSimulatedError(path);

    const isDir = this.dirs.has(path) || this.isImplicitDir(path);
    if (!isDir) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, rmdir '${path}'`,
        'ENOENT',
        path,
      );
    }

    if (options?.recursive) {
      // Delete all files and subdirectories under this path
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

      for (const filePath of Array.from(this.files.keys())) {
        if (filePath.startsWith(normalizedPath + '/')) {
          this.files.delete(filePath);
          this.mtimes.delete(filePath);
        }
      }

      for (const dirPath of Array.from(this.dirs)) {
        if (dirPath === normalizedPath || dirPath.startsWith(normalizedPath + '/')) {
          this.dirs.delete(dirPath);
        }
      }
    } else {
      // Check if directory is empty
      const contents = await this.readDir(path);
      if (contents.length > 0) {
        throw new FileSystemError(
          `ENOTEMPTY: directory not empty, rmdir '${path}'`,
          'ENOTEMPTY',
          path,
        );
      }
      this.dirs.delete(path);
    }
  }

  // ========== Private Helpers ==========

  /**
   * Check if a directory exists implicitly (has files under it).
   */
  private isImplicitDir(path: string): boolean {
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

    // Check if any file is under this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(normalizedPath + '/')) {
        return true;
      }
    }

    // Check if any explicit directory is under this path
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(normalizedPath + '/')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Ensure parent directories exist when setting a file.
   */
  private ensureParentDirs(filePath: string): void {
    const parts = filePath.split('/').filter(Boolean);
    let currentPath = filePath.startsWith('/') ? '' : '';

    // Don't include the file itself
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath + '/' + parts[i];
      this.dirs.add(currentPath);
    }
  }

  /**
   * Throw any simulated error for a path.
   */
  private checkSimulatedError(path: string): void {
    const error = this.errors.get(path);
    if (error) {
      throw error;
    }
  }
}
