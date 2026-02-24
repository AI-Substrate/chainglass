import * as pathModule from 'node:path';
import type { FileStat, IFileSystem } from '../interfaces/filesystem.interface.js';
import { FileSystemError } from '../interfaces/filesystem.interface.js';

/**
 * In-memory filesystem implementation for testing.
 *
 * Per Critical Discovery 04: Tests use this fake instead of real filesystem
 * for fast, isolated execution. Stores files in Map<string, string>.
 */
export class FakeFileSystem implements IFileSystem {
  /** In-memory file storage: path -> content */
  private files = new Map<string, string | Buffer>();
  /** In-memory directory storage (directories without files) */
  private dirs = new Set<string>();
  /** File metadata (mtime) */
  private mtimes = new Map<string, string>();
  /** Simulated errors for specific paths */
  private errors = new Map<string, Error>();
  /** Simulated symlinks: path -> real target */
  private symlinks = new Map<string, string>();

  // ========== Test Helpers ==========

  /**
   * Set a file's content directly (test helper).
   * Automatically creates parent directories.
   */
  setFile(path: string, content: string | Buffer): void {
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
   * Register a simulated symlink (test helper).
   * When realpath() is called on `linkPath`, it returns `targetPath`.
   */
  setSymlink(linkPath: string, targetPath: string): void {
    this.symlinks.set(linkPath, targetPath);
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.files.clear();
    this.dirs.clear();
    this.mtimes.clear();
    this.errors.clear();
    this.symlinks.clear();
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
        path
      );
    }
    // Buffer content decoded as utf-8 (matches real adapter: fs.readFile(path, 'utf-8'))
    return typeof content === 'string' ? content : content.toString('utf-8');
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    this.checkSimulatedError(path);

    const parent = pathModule.dirname(path);
    if (parent !== '/' && parent !== '.' && !(await this.exists(parent))) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, open '${path}'`,
        'ENOENT',
        path
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
        throw new FileSystemError(`ENOTDIR: not a directory, scandir '${path}'`, 'ENOTDIR', path);
      }
      throw new FileSystemError(
        `ENOENT: no such file or directory, scandir '${path}'`,
        'ENOENT',
        path
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
          currentPath = `${currentPath}/${part}`;
          this.dirs.add(currentPath);
        }
      } else {
        // Relative path: build up parts without leading slash
        const parts = path.split('/').filter(Boolean);
        let currentPath = '';
        for (let i = 0; i < parts.length; i++) {
          currentPath = i === 0 ? parts[i] : `${currentPath}/${parts[i]}`;
          this.dirs.add(currentPath);
        }
      }
    } else {
      const parent = pathModule.dirname(path);
      if (parent !== '/' && parent !== '.' && !(await this.exists(parent))) {
        throw new FileSystemError(
          `ENOENT: no such file or directory, mkdir '${path}'`,
          'ENOENT',
          path
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
        source
      );
    }

    const destParent = pathModule.dirname(dest);
    if (destParent !== '/' && destParent !== '.' && !(await this.exists(destParent))) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, copyfile '${source}' -> '${dest}'`,
        'ENOENT',
        dest
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
        path
      );
    }

    return {
      isFile,
      isDirectory: isDir && !isFile,
      size: isFile
        ? (() => {
            const c = this.files.get(path);
            if (c === undefined) return 0;
            return Buffer.isBuffer(c) ? c.length : Buffer.byteLength(c, 'utf-8');
          })()
        : 0,
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
          path
        );
      }
      throw new FileSystemError(
        `ENOENT: no such file or directory, unlink '${path}'`,
        'ENOENT',
        path
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
        path
      );
    }

    if (options?.recursive) {
      // Delete all files and subdirectories under this path
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

      for (const filePath of Array.from(this.files.keys())) {
        if (filePath.startsWith(`${normalizedPath}/`)) {
          this.files.delete(filePath);
          this.mtimes.delete(filePath);
        }
      }

      for (const dirPath of Array.from(this.dirs)) {
        if (dirPath === normalizedPath || dirPath.startsWith(`${normalizedPath}/`)) {
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
          path
        );
      }
      this.dirs.delete(path);
    }
  }

  /**
   * Copy a directory and all its contents recursively.
   *
   * Per Phase 4 DYK-03: In-memory recursive copy for testing.
   */
  async copyDirectory(
    source: string,
    dest: string,
    options?: { exclude?: string[] }
  ): Promise<void> {
    this.checkSimulatedError(source);
    this.checkSimulatedError(dest);

    // Verify source exists
    const isSourceDir = this.dirs.has(source) || this.isImplicitDir(source);
    if (!isSourceDir) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, copyDirectory '${source}'`,
        'ENOENT',
        source
      );
    }

    // Create destination directory
    await this.mkdir(dest, { recursive: true });

    const exclude = options?.exclude ?? [];
    const normalizedSource = source.endsWith('/') ? source.slice(0, -1) : source;
    const normalizedDest = dest.endsWith('/') ? dest.slice(0, -1) : dest;

    // Copy all files under source to destination
    for (const [filePath, content] of this.files.entries()) {
      if (filePath.startsWith(`${normalizedSource}/`)) {
        const relativePath = filePath.slice(normalizedSource.length + 1);

        // Check if any path segment should be excluded
        const pathParts = relativePath.split('/');
        const shouldExclude = pathParts.some((part) => exclude.includes(part));

        if (!shouldExclude) {
          const destPath = `${normalizedDest}/${relativePath}`;
          // Ensure parent directories exist
          const destParent = pathModule.dirname(destPath);
          if (destParent !== normalizedDest) {
            await this.mkdir(destParent, { recursive: true });
          }
          this.files.set(destPath, content);
          this.mtimes.set(destPath, new Date().toISOString());
        }
      }
    }

    // Copy explicit subdirectories (empty directories)
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(`${normalizedSource}/`)) {
        const relativePath = dirPath.slice(normalizedSource.length + 1);

        // Check if any path segment should be excluded
        const pathParts = relativePath.split('/');
        const shouldExclude = pathParts.some((part) => exclude.includes(part));

        if (!shouldExclude) {
          const destDirPath = `${normalizedDest}/${relativePath}`;
          this.dirs.add(destDirPath);
        }
      }
    }
  }

  /**
   * Find files matching a glob pattern.
   *
   * Per Phase 2 DYK: In-memory glob matching for testing.
   * Uses simple pattern matching (supports * and **).
   */
  async glob(pattern: string, options?: { cwd?: string; absolute?: boolean }): Promise<string[]> {
    const cwd = options?.cwd ?? '';
    const absolute = options?.absolute ?? false;

    // Convert glob pattern to regex
    const regexPattern = this.globToRegex(pattern);

    const matches: string[] = [];

    for (const filePath of this.files.keys()) {
      // Get path relative to cwd
      let testPath = filePath;
      if (cwd) {
        const cwdNormalized = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
        if (filePath.startsWith(`${cwdNormalized}/`)) {
          testPath = filePath.slice(cwdNormalized.length + 1);
        } else if (filePath.startsWith(cwdNormalized)) {
          testPath = filePath.slice(cwdNormalized.length);
          if (testPath.startsWith('/')) testPath = testPath.slice(1);
        } else {
          continue; // File is not under cwd
        }
      }

      if (regexPattern.test(testPath)) {
        matches.push(absolute ? filePath : testPath);
      }
    }

    return matches.sort();
  }

  /**
   * Rename/move a file or directory.
   *
   * Per Phase 3 DYK#4: In-memory rename for testing atomic writes.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.checkSimulatedError(oldPath);
    this.checkSimulatedError(newPath);

    // Check if source exists
    const isFile = this.files.has(oldPath);
    const isDir = this.dirs.has(oldPath) || this.isImplicitDir(oldPath);

    if (!isFile && !isDir) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, rename '${oldPath}'`,
        'ENOENT',
        oldPath
      );
    }

    // Check if destination parent exists
    const destParent = pathModule.dirname(newPath);
    if (destParent !== '/' && destParent !== '.' && !(await this.exists(destParent))) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`,
        'ENOENT',
        newPath
      );
    }

    if (isFile) {
      // Move file
      const content = this.files.get(oldPath);
      if (content === undefined) {
        throw new FileSystemError(
          `ENOENT: no such file or directory, rename '${oldPath}'`,
          'ENOENT',
          oldPath
        );
      }
      const mtime = this.mtimes.get(oldPath) ?? new Date().toISOString();

      this.files.delete(oldPath);
      this.mtimes.delete(oldPath);

      this.files.set(newPath, content);
      this.mtimes.set(newPath, mtime);
    } else {
      // Move directory - move all files under oldPath to newPath
      const normalizedOld = oldPath.endsWith('/') ? oldPath.slice(0, -1) : oldPath;
      const normalizedNew = newPath.endsWith('/') ? newPath.slice(0, -1) : newPath;

      // Move files
      for (const [filePath, content] of Array.from(this.files.entries())) {
        if (filePath.startsWith(`${normalizedOld}/`) || filePath === normalizedOld) {
          const newFilePath = filePath.replace(normalizedOld, normalizedNew);
          const mtime = this.mtimes.get(filePath);

          this.files.delete(filePath);
          this.mtimes.delete(filePath);

          this.files.set(newFilePath, content);
          if (mtime) this.mtimes.set(newFilePath, mtime);
        }
      }

      // Move explicit directories
      for (const dirPath of Array.from(this.dirs)) {
        if (dirPath.startsWith(`${normalizedOld}/`) || dirPath === normalizedOld) {
          const newDirPath = dirPath.replace(normalizedOld, normalizedNew);
          this.dirs.delete(dirPath);
          this.dirs.add(newDirPath);
        }
      }
    }
  }

  /**
   * Convert a glob pattern to a regex.
   * Supports * (any characters except /) and ** (any characters including /).
   */
  private globToRegex(pattern: string): RegExp {
    let regex = '^';
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      if (char === '*') {
        if (pattern[i + 1] === '*') {
          // ** matches any characters including /
          if (pattern[i + 2] === '/') {
            regex += '(?:.*/)?'; // **/ matches zero or more path segments
            i += 3;
          } else {
            regex += '.*'; // ** at end matches anything
            i += 2;
          }
        } else {
          // * matches any characters except /
          regex += '[^/]*';
          i += 1;
        }
      } else if (char === '?') {
        regex += '[^/]';
        i += 1;
      } else if (
        char === '[' ||
        char === ']' ||
        char === '(' ||
        char === ')' ||
        char === '{' ||
        char === '}' ||
        char === '.' ||
        char === '+' ||
        char === '^' ||
        char === '$' ||
        char === '|' ||
        char === '\\'
      ) {
        regex += `\\${char}`;
        i += 1;
      } else {
        regex += char;
        i += 1;
      }
    }

    regex += '$';
    return new RegExp(regex);
  }

  // ========== Private Helpers ==========

  /**
   * Check if a directory exists implicitly (has files under it).
   */
  private isImplicitDir(path: string): boolean {
    const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;

    // Check if any file is under this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(`${normalizedPath}/`)) {
        return true;
      }
    }

    // Check if any explicit directory is under this path
    for (const dirPath of this.dirs) {
      if (dirPath.startsWith(`${normalizedPath}/`)) {
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
      currentPath = `${currentPath}/${parts[i]}`;
      this.dirs.add(currentPath);
    }
  }

  async realpath(path: string): Promise<string> {
    this.checkSimulatedError(path);

    // Check if there's a symlink registered for this path
    const target = this.symlinks.get(path);
    if (target) {
      return target;
    }

    // Path must exist as file or directory
    if (!(await this.exists(path))) {
      throw new FileSystemError(
        `ENOENT: no such file or directory, realpath '${path}'`,
        'ENOENT',
        path
      );
    }

    return pathModule.resolve(path);
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
