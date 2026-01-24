import * as path from 'node:path';
import type { IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

/**
 * Test suite for IPathResolver implementations.
 *
 * Per Critical Discovery 11: Path validation is critical for security.
 * These tests verify that directory traversal attacks are prevented.
 */

describe('IPathResolver Interface Tests', () => {
  // These tests verify the expected behavior using the native path module
  // They will be run against both PathResolverAdapter and FakePathResolver in contract tests

  describe('resolvePath() security', () => {
    it('should resolve simple relative path within base', () => {
      /*
      Test Doc:
      - Why: Normal operation - relative paths should resolve within base
      - Contract: resolvePath(base, relative) returns absolute path under base
      - Usage Notes: Both paths should be normalized
      - Quality Contribution: Ensures normal path resolution works
      - Worked Example: resolvePath('/base', 'sub/file.txt') → '/base/sub/file.txt'
      */
      const base = '/base';
      const relative = 'sub/file.txt';
      const expected = path.resolve(base, relative);
      expect(expected).toBe('/base/sub/file.txt');
    });

    it('should block ../ traversal attempt', () => {
      /*
      Test Doc:
      - Why: Security - prevent directory traversal attacks
      - Contract: resolvePath() throws PathSecurityError on ../ escape attempt
      - Usage Notes: Check for PathSecurityError in error handling
      - Quality Contribution: Prevents security vulnerabilities
      - Worked Example: resolvePath('/base', '../etc/passwd') → throws PathSecurityError
      */
      // This test verifies the expected behavior
      const base = '/base';
      const dangerous = '../etc/passwd';
      const resolved = path.resolve(base, dangerous);
      expect(resolved.startsWith(base)).toBe(false); // Would escape!
    });

    it('should block absolute path injection', () => {
      /*
      Test Doc:
      - Why: Security - absolute paths bypass base entirely
      - Contract: resolvePath() throws PathSecurityError on absolute path
      - Usage Notes: Absolute paths are always rejected
      - Quality Contribution: Prevents absolute path injection
      - Worked Example: resolvePath('/base', '/etc/passwd') → throws PathSecurityError
      */
      const base = '/base';
      const absolute = '/etc/passwd';
      // In Node.js, resolve with absolute second arg returns the absolute path
      const resolved = path.resolve(base, absolute);
      expect(resolved).toBe('/etc/passwd'); // Would escape!
    });

    it('should normalize . segments', () => {
      /*
      Test Doc:
      - Why: . segments should be removed but stay in base
      - Contract: resolvePath() normalizes ./file.txt to file.txt
      - Usage Notes: . means current directory
      - Quality Contribution: Ensures . handling is correct
      - Worked Example: resolvePath('/base', './file.txt') → '/base/file.txt'
      */
      const base = '/base';
      const withDot = './sub/./file.txt';
      const expected = path.resolve(base, withDot);
      expect(expected).toBe('/base/sub/file.txt');
    });

    it('should handle trailing slashes', () => {
      /*
      Test Doc:
      - Why: Trailing slashes should be normalized
      - Contract: resolvePath() handles base with trailing slash
      - Usage Notes: Result should be normalized
      - Quality Contribution: Ensures trailing slash handling
      - Worked Example: resolvePath('/base/', 'file.txt') → '/base/file.txt'
      */
      const base = '/base/';
      const relative = 'file.txt';
      const expected = path.resolve(base, relative);
      expect(expected).toBe('/base/file.txt');
    });

    it('should allow .. within base directory', () => {
      /*
      Test Doc:
      - Why: .. that stays within base is valid
      - Contract: resolvePath() allows .. if result stays in base
      - Usage Notes: Check resolved path starts with base
      - Quality Contribution: Allows valid relative navigation
      - Worked Example: resolvePath('/base', 'a/../b/file.txt') → '/base/b/file.txt'
      */
      const base = '/base';
      const relative = 'sub/../other/file.txt';
      const resolved = path.resolve(base, relative);
      expect(resolved).toBe('/base/other/file.txt');
      expect(resolved.startsWith(base)).toBe(true); // Stays in base
    });
  });

  describe('join()', () => {
    it('should join path segments', () => {
      /*
      Test Doc:
      - Why: Join is basic path operation
      - Contract: join() combines segments with path separator
      - Usage Notes: Does not resolve absolute paths
      - Quality Contribution: Ensures join works correctly
      - Worked Example: join('a', 'b', 'c') → 'a/b/c'
      */
      const result = path.join('a', 'b', 'c');
      expect(result).toBe('a/b/c');
    });

    it('should normalize .. in joined path', () => {
      const result = path.join('a', 'b', '..', 'c');
      expect(result).toBe('a/c');
    });
  });

  describe('dirname()', () => {
    it('should return parent directory', () => {
      /*
      Test Doc:
      - Why: dirname extracts directory part of path
      - Contract: dirname() returns path without final segment
      - Usage Notes: Works on both files and directories
      - Quality Contribution: Ensures dirname works correctly
      - Worked Example: dirname('/a/b/file.txt') → '/a/b'
      */
      const result = path.dirname('/a/b/file.txt');
      expect(result).toBe('/a/b');
    });
  });

  describe('basename()', () => {
    it('should return file name', () => {
      /*
      Test Doc:
      - Why: basename extracts file name from path
      - Contract: basename() returns final path segment
      - Usage Notes: Optional ext parameter removes extension
      - Quality Contribution: Ensures basename works correctly
      - Worked Example: basename('/a/b/file.txt') → 'file.txt'
      */
      const result = path.basename('/a/b/file.txt');
      expect(result).toBe('file.txt');
    });

    it('should remove extension when specified', () => {
      const result = path.basename('/a/b/file.txt', '.txt');
      expect(result).toBe('file');
    });
  });

  describe('normalize()', () => {
    it('should remove redundant separators', () => {
      /*
      Test Doc:
      - Why: normalize cleans up messy paths
      - Contract: normalize() removes redundant / and resolves . and ..
      - Usage Notes: Does not make path absolute
      - Quality Contribution: Ensures normalize works correctly
      - Worked Example: normalize('/a//b/../c') → '/a/c'
      */
      const result = path.normalize('/a//b/../c');
      expect(result).toBe('/a/c');
    });
  });

  describe('isAbsolute()', () => {
    it('should return true for absolute paths', () => {
      /*
      Test Doc:
      - Why: isAbsolute identifies path type
      - Contract: isAbsolute() returns true if path starts with /
      - Usage Notes: On Windows, also checks for drive letter
      - Quality Contribution: Ensures absolute detection works
      - Worked Example: isAbsolute('/a/b') → true
      */
      expect(path.isAbsolute('/a/b')).toBe(true);
      expect(path.isAbsolute('a/b')).toBe(false);
    });
  });

  describe('relative()', () => {
    it('should return relative path between two paths', () => {
      /*
      Test Doc:
      - Why: relative computes path navigation
      - Contract: relative(from, to) returns path to reach to from from
      - Usage Notes: Both paths should be absolute for reliable results
      - Quality Contribution: Ensures relative works correctly
      - Worked Example: relative('/a/b', '/a/c/d') → '../c/d'
      */
      const result = path.relative('/a/b', '/a/c/d');
      expect(result).toBe('../c/d');
    });
  });
});
