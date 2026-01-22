import { describe, it, expect } from 'vitest';
import { PathResolverAdapter, PathSecurityError } from '@chainglass/shared';

/**
 * Tests for PathResolverAdapter.
 *
 * Per Critical Discovery 11: Path validation is critical for security.
 * These tests verify that directory traversal attacks are prevented.
 */
describe('PathResolverAdapter', () => {
  const resolver = new PathResolverAdapter();

  describe('resolvePath() security', () => {
    it('should resolve simple relative path within base', () => {
      const result = resolver.resolvePath('/base', 'sub/file.txt');
      expect(result).toBe('/base/sub/file.txt');
    });

    it('should throw PathSecurityError on ../ traversal attempt', () => {
      expect(() => resolver.resolvePath('/base', '../etc/passwd'))
        .toThrow(PathSecurityError);
    });

    it('should throw PathSecurityError on absolute path injection', () => {
      expect(() => resolver.resolvePath('/base', '/etc/passwd'))
        .toThrow(PathSecurityError);
    });

    it('should normalize . segments', () => {
      const result = resolver.resolvePath('/base', './sub/./file.txt');
      expect(result).toBe('/base/sub/file.txt');
    });

    it('should handle trailing slashes on base', () => {
      const result = resolver.resolvePath('/base/', 'file.txt');
      expect(result).toBe('/base/file.txt');
    });

    it('should allow .. that stays within base', () => {
      const result = resolver.resolvePath('/base', 'sub/../other/file.txt');
      expect(result).toBe('/base/other/file.txt');
    });

    it('should throw on multiple ../ that escape base', () => {
      expect(() => resolver.resolvePath('/base', '../../etc/passwd'))
        .toThrow(PathSecurityError);
    });

    it('should throw PathSecurityError with correct properties', () => {
      try {
        resolver.resolvePath('/base', '../escape');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PathSecurityError);
        const secErr = err as PathSecurityError;
        expect(secErr.base).toBe('/base');
        expect(secErr.requested).toBe('../escape');
        expect(secErr.message).toContain('traversal');
      }
    });
  });

  describe('join()', () => {
    it('should join path segments', () => {
      const result = resolver.join('a', 'b', 'c');
      expect(result).toBe('a/b/c');
    });

    it('should normalize .. in joined path', () => {
      const result = resolver.join('a', 'b', '..', 'c');
      expect(result).toBe('a/c');
    });
  });

  describe('dirname()', () => {
    it('should return parent directory', () => {
      const result = resolver.dirname('/a/b/file.txt');
      expect(result).toBe('/a/b');
    });

    it('should handle root path', () => {
      const result = resolver.dirname('/file.txt');
      expect(result).toBe('/');
    });
  });

  describe('basename()', () => {
    it('should return file name', () => {
      const result = resolver.basename('/a/b/file.txt');
      expect(result).toBe('file.txt');
    });

    it('should remove extension when specified', () => {
      const result = resolver.basename('/a/b/file.txt', '.txt');
      expect(result).toBe('file');
    });
  });

  describe('normalize()', () => {
    it('should remove redundant separators', () => {
      const result = resolver.normalize('/a//b/../c');
      expect(result).toBe('/a/c');
    });
  });

  describe('isAbsolute()', () => {
    it('should return true for absolute paths', () => {
      expect(resolver.isAbsolute('/a/b')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(resolver.isAbsolute('a/b')).toBe(false);
    });
  });

  describe('relative()', () => {
    it('should return relative path between two paths', () => {
      const result = resolver.relative('/a/b', '/a/c/d');
      expect(result).toBe('../c/d');
    });
  });
});
