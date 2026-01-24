import * as path from 'node:path';
import type { IPathResolver } from '../interfaces/path-resolver.interface.js';
import { PathSecurityError } from '../interfaces/path-resolver.interface.js';

/**
 * Fake path resolver for testing.
 *
 * Per Critical Discovery 11: Tests need to verify path security behavior.
 * This fake provides configurable responses and security check simulation.
 */
export class FakePathResolver implements IPathResolver {
  /** Whether to enforce security checks (default: true) */
  private enforceSecurityChecks = true;

  /** Preset path mappings for testing */
  private pathMappings = new Map<string, string>();

  /** Paths that should trigger security errors */
  private blockedPaths = new Set<string>();

  // ========== Test Helpers ==========

  /**
   * Set whether to enforce security checks (test helper).
   */
  setEnforceSecurity(enforce: boolean): void {
    this.enforceSecurityChecks = enforce;
  }

  /**
   * Add a preset path mapping (test helper).
   * When resolvePath is called with matching base+relative, return preset result.
   */
  setPathMapping(base: string, relative: string, result: string): void {
    const key = `${base}|${relative}`;
    this.pathMappings.set(key, result);
  }

  /**
   * Add a path that should trigger security error (test helper).
   */
  blockPath(relative: string): void {
    this.blockedPaths.add(relative);
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.enforceSecurityChecks = true;
    this.pathMappings.clear();
    this.blockedPaths.clear();
  }

  // ========== IPathResolver Implementation ==========

  resolvePath(base: string, relative: string): string {
    // Check if path is explicitly blocked
    if (this.blockedPaths.has(relative)) {
      throw new PathSecurityError(`Blocked path: ${relative}`, base, relative);
    }

    // Check for preset mapping
    const key = `${base}|${relative}`;
    const presetPath = this.pathMappings.get(key);
    if (presetPath !== undefined) {
      return presetPath;
    }

    // Use real path logic with optional security enforcement
    const normalizedBase = path.normalize(base);

    if (this.enforceSecurityChecks) {
      // Check if relative path is absolute
      if (path.isAbsolute(relative)) {
        throw new PathSecurityError(`Absolute path not allowed: ${relative}`, base, relative);
      }

      const resolved = path.resolve(normalizedBase, relative);

      // Ensure resolved path is within base
      const baseWithSlash = normalizedBase.endsWith(path.sep)
        ? normalizedBase
        : normalizedBase + path.sep;

      if (!resolved.startsWith(baseWithSlash) && resolved !== normalizedBase) {
        throw new PathSecurityError(
          `Path traversal attempt detected: ${relative} escapes ${base}`,
          base,
          relative
        );
      }

      return resolved;
    }

    // No security checks - just resolve
    return path.resolve(normalizedBase, relative);
  }

  join(...segments: string[]): string {
    return path.join(...segments);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return ext ? path.basename(filePath, ext) : path.basename(filePath);
  }

  normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }
}
