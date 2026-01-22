/**
 * Path resolver interface for secure path operations.
 *
 * Per Critical Discovery 11: All path operations must prevent directory
 * traversal attacks. User-supplied paths could contain ../../../etc/passwd.
 */

/**
 * Error thrown when a path security violation is detected.
 */
export class PathSecurityError extends Error {
  constructor(
    message: string,
    public readonly base: string,
    public readonly requested: string
  ) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * Path resolver interface for secure path operations.
 *
 * All path resolution ensures the result stays within the base directory.
 * Implementations:
 * - PathResolverAdapter: Real implementation using path module
 * - FakePathResolver: Configurable implementation for testing
 */
export interface IPathResolver {
  /**
   * Resolve a relative path against a base directory securely.
   *
   * @param base Absolute base directory path
   * @param relative Relative path to resolve
   * @returns Absolute resolved path within base
   * @throws PathSecurityError if resolution would escape base directory
   */
  resolvePath(base: string, relative: string): string;

  /**
   * Join path segments and normalize the result.
   *
   * @param segments Path segments to join
   * @returns Normalized joined path
   */
  join(...segments: string[]): string;

  /**
   * Get the directory name of a path.
   *
   * @param filePath Path to get directory of
   * @returns Directory path
   */
  dirname(filePath: string): string;

  /**
   * Get the base name (file name) of a path.
   *
   * @param filePath Path to get base name of
   * @param ext Optional extension to remove
   * @returns Base name
   */
  basename(filePath: string, ext?: string): string;

  /**
   * Normalize a path, resolving . and .. segments.
   *
   * @param filePath Path to normalize
   * @returns Normalized path
   */
  normalize(filePath: string): string;

  /**
   * Check if a path is absolute.
   *
   * @param filePath Path to check
   * @returns true if absolute
   */
  isAbsolute(filePath: string): boolean;

  /**
   * Get the relative path from one path to another.
   *
   * @param from Source path
   * @param to Target path
   * @returns Relative path from source to target
   */
  relative(from: string, to: string): string;
}
