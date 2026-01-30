/**
 * Filesystem interface for abstracting Node.js fs operations.
 *
 * Per Critical Discovery 04: All services must use IFileSystem, never `fs` directly.
 * This enables fast, isolated testing with FakeFileSystem while NodeFileSystemAdapter
 * handles production file operations.
 */

/**
 * Result of stat() operation
 */
export interface FileStat {
  /** True if the path is a file */
  isFile: boolean;
  /** True if the path is a directory */
  isDirectory: boolean;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Modification time as ISO-8601 string */
  mtime: string;
}

/**
 * Error thrown when a file operation fails
 */
export class FileSystemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FileSystemError';
  }
}

/**
 * Filesystem abstraction interface.
 *
 * All methods are async and use absolute paths. Implementations:
 * - NodeFileSystemAdapter: Real filesystem using fs/promises
 * - FakeFileSystem: In-memory implementation for testing
 */
export interface IFileSystem {
  /**
   * Check if a path exists.
   * @param path Absolute path to check
   * @returns true if path exists (file or directory)
   */
  exists(path: string): Promise<boolean>;

  /**
   * Read file contents as a UTF-8 string.
   * @param path Absolute path to file
   * @returns File contents as string
   * @throws FileSystemError with code 'ENOENT' if file doesn't exist
   */
  readFile(path: string): Promise<string>;

  /**
   * Write content to a file, creating it if it doesn't exist.
   * Parent directories must exist.
   * @param path Absolute path to file
   * @param content Content to write (UTF-8)
   * @throws FileSystemError with code 'ENOENT' if parent directory doesn't exist
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Read directory contents (non-recursive).
   * @param path Absolute path to directory
   * @returns Array of entry names (files and directories)
   * @throws FileSystemError with code 'ENOENT' if directory doesn't exist
   * @throws FileSystemError with code 'ENOTDIR' if path is not a directory
   */
  readDir(path: string): Promise<string[]>;

  /**
   * Create a directory, optionally creating parent directories.
   * @param path Absolute path to directory
   * @param options.recursive If true, create parent directories as needed (default: false)
   * @throws FileSystemError if recursive is false and parent doesn't exist
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Copy a file from source to destination.
   * @param source Absolute path to source file
   * @param dest Absolute path to destination file
   * @throws FileSystemError with code 'ENOENT' if source doesn't exist
   * @throws FileSystemError with code 'ENOENT' if destination parent directory doesn't exist
   */
  copyFile(source: string, dest: string): Promise<void>;

  /**
   * Get file or directory metadata.
   * @param path Absolute path to file or directory
   * @returns FileStat with isFile, isDirectory, size, mtime
   * @throws FileSystemError with code 'ENOENT' if path doesn't exist
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Delete a file.
   * @param path Absolute path to file
   * @throws FileSystemError with code 'ENOENT' if file doesn't exist
   * @throws FileSystemError with code 'EISDIR' if path is a directory
   */
  unlink(path: string): Promise<void>;

  /**
   * Delete a directory.
   * @param path Absolute path to directory
   * @param options.recursive If true, delete contents recursively (default: false)
   * @throws FileSystemError with code 'ENOENT' if directory doesn't exist
   * @throws FileSystemError with code 'ENOTEMPTY' if directory is not empty and recursive is false
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Copy a directory and all its contents recursively.
   *
   * Per Phase 4 DYK-03: Clean abstraction for template copying.
   *
   * @param source Absolute path to source directory
   * @param dest Absolute path to destination directory (created if doesn't exist)
   * @param options.exclude Directory names to skip (e.g., ['.git', 'node_modules'])
   * @throws FileSystemError with code 'ENOENT' if source doesn't exist
   */
  copyDirectory(source: string, dest: string, options?: { exclude?: string[] }): Promise<void>;

  /**
   * Find files matching a glob pattern.
   *
   * Per Phase 2 DYK: Proper glob abstraction for unit discovery.
   *
   * @param pattern Glob pattern (e.g., '** /unit.yaml' without space)
   * @param options.cwd Base directory for relative patterns (default: process.cwd())
   * @param options.absolute If true, return absolute paths (default: false)
   * @returns Array of matching file paths (relative or absolute based on options)
   */
  glob(pattern: string, options?: { cwd?: string; absolute?: boolean }): Promise<string[]>;

  /**
   * Rename/move a file or directory.
   *
   * Per Phase 3 DYK#4: Required for atomic write pattern (write to .tmp then rename).
   *
   * @param oldPath Current absolute path
   * @param newPath New absolute path
   * @throws FileSystemError with code 'ENOENT' if oldPath doesn't exist
   * @throws FileSystemError with code 'ENOENT' if newPath parent directory doesn't exist
   */
  rename(oldPath: string, newPath: string): Promise<void>;
}
