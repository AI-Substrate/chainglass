import * as path from 'path';
import type { IPathResolver } from '../interfaces/path-resolver.interface.js';
import { PathSecurityError } from '../interfaces/path-resolver.interface.js';

/**
 * Real path resolver implementation using Node.js path module.
 *
 * Per Critical Discovery 11: All path operations must prevent directory
 * traversal attacks by ensuring resolved paths stay within the base directory.
 */
export class PathResolverAdapter implements IPathResolver {
  /**
   * Resolve a relative path against a base directory securely.
   * @throws PathSecurityError if resolution would escape base directory
   */
  resolvePath(base: string, relative: string): string {
    // Normalize the base path
    const normalizedBase = path.normalize(base);

    // Check if relative path is absolute (security violation)
    if (path.isAbsolute(relative)) {
      throw new PathSecurityError(
        `Absolute path not allowed: ${relative}`,
        base,
        relative,
      );
    }

    // Resolve the full path
    const resolved = path.resolve(normalizedBase, relative);

    // Ensure resolved path is within base (security check)
    // Add trailing slash to base to ensure we match directory boundary
    const baseWithSlash = normalizedBase.endsWith(path.sep)
      ? normalizedBase
      : normalizedBase + path.sep;

    // Check that resolved path starts with base (or equals base)
    if (!resolved.startsWith(baseWithSlash) && resolved !== normalizedBase) {
      throw new PathSecurityError(
        `Path traversal attempt detected: ${relative} escapes ${base}`,
        base,
        relative,
      );
    }

    return resolved;
  }

  /**
   * Join path segments and normalize the result.
   */
  join(...segments: string[]): string {
    return path.join(...segments);
  }

  /**
   * Get the directory name of a path.
   */
  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  /**
   * Get the base name (file name) of a path.
   */
  basename(filePath: string, ext?: string): string {
    return ext ? path.basename(filePath, ext) : path.basename(filePath);
  }

  /**
   * Normalize a path, resolving . and .. segments.
   */
  normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * Check if a path is absolute.
   */
  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  /**
   * Get the relative path from one path to another.
   */
  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
}
