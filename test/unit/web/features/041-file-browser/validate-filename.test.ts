import { validateFileName } from '@/features/041-file-browser/lib/validate-filename';
import { describe, expect, it } from 'vitest';

describe('validateFileName', () => {
  describe('valid names', () => {
    it('should accept a simple filename', () => {
      /*
      Test Doc:
      - Why: Verify the most common case works
      - Contract: validateFileName('readme.md') returns {ok: true}
      - Usage Notes: Basic happy path — no special characters
      - Quality Contribution: Prevents false rejections
      - Worked Example: 'readme.md' → {ok: true}
      */
      const result = validateFileName('readme.md');
      expect(result.ok).toBe(true);
    });

    it('should accept filenames with leading dots (hidden files)', () => {
      /*
      Test Doc:
      - Why: Hidden files like .gitignore are common and must be allowed
      - Contract: validateFileName('.gitignore') returns {ok: true}
      - Usage Notes: Leading dots are valid on POSIX and needed for dotfiles
      - Quality Contribution: Prevents blocking legitimate hidden file creation
      - Worked Example: '.gitignore' → {ok: true}
      */
      expect(validateFileName('.gitignore').ok).toBe(true);
      expect(validateFileName('.env.local').ok).toBe(true);
    });

    it('should accept filenames with spaces', () => {
      /*
      Test Doc:
      - Why: Spaces are valid in filenames on all platforms
      - Contract: validateFileName('my file.txt') returns {ok: true}
      - Usage Notes: Spaces are allowed — git handles them fine
      - Quality Contribution: Prevents overly strict rejection
      - Worked Example: 'my file.txt' → {ok: true}
      */
      expect(validateFileName('my file.txt').ok).toBe(true);
    });

    it('should accept filenames with hyphens, underscores, and numbers', () => {
      /*
      Test Doc:
      - Why: Common naming patterns must be allowed
      - Contract: validateFileName('test-file_2.ts') returns {ok: true}
      - Usage Notes: Standard chars for code files
      - Quality Contribution: Ensures typical developer filenames work
      - Worked Example: 'test-file_2.ts' → {ok: true}
      */
      expect(validateFileName('test-file_2.ts').ok).toBe(true);
      expect(validateFileName('Component123.tsx').ok).toBe(true);
    });
  });

  describe('empty and reserved names', () => {
    it('should reject empty string', () => {
      /*
      Test Doc:
      - Why: Empty filenames are invalid on all filesystems
      - Contract: validateFileName('') returns {ok: false, error: 'empty'}
      - Usage Notes: Check before any filesystem operation
      - Quality Contribution: Prevents ENOENT errors from empty paths
      - Worked Example: '' → {ok: false, error: 'empty'}
      */
      const result = validateFileName('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('empty');
      }
    });

    it('should reject whitespace-only strings', () => {
      /*
      Test Doc:
      - Why: Whitespace-only names create invisible files
      - Contract: validateFileName('   ') returns {ok: false, error: 'empty'}
      - Usage Notes: Trim before checking — whitespace-only is effectively empty
      - Quality Contribution: Prevents confusing invisible entries in tree
      - Worked Example: '   ' → {ok: false, error: 'empty'}
      */
      const result = validateFileName('   ');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('empty');
      }
    });

    it('should reject "." (current directory)', () => {
      /*
      Test Doc:
      - Why: "." is a reserved filesystem name meaning current directory
      - Contract: validateFileName('.') returns {ok: false, error: 'reserved'}
      - Usage Notes: Must reject to prevent path confusion
      - Quality Contribution: Prevents accidental directory reference as filename
      - Worked Example: '.' → {ok: false, error: 'reserved'}
      */
      const result = validateFileName('.');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('reserved');
      }
    });

    it('should reject ".." (parent directory)', () => {
      /*
      Test Doc:
      - Why: ".." is a reserved name that could enable path traversal
      - Contract: validateFileName('..') returns {ok: false, error: 'reserved'}
      - Usage Notes: Security-critical — prevents directory traversal
      - Quality Contribution: Blocks trivial traversal attack vector
      - Worked Example: '..' → {ok: false, error: 'reserved'}
      */
      const result = validateFileName('..');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('reserved');
      }
    });
  });

  describe('git-portable invalid characters', () => {
    const invalidChars = [
      { char: '/', label: 'forward slash' },
      { char: '\\', label: 'backslash' },
      { char: '\0', label: 'null byte' },
      { char: ':', label: 'colon' },
      { char: '*', label: 'asterisk' },
      { char: '?', label: 'question mark' },
      { char: '"', label: 'double quote' },
      { char: '<', label: 'less than' },
      { char: '>', label: 'greater than' },
      { char: '|', label: 'pipe' },
    ];

    for (const { char, label } of invalidChars) {
      it(`should reject names containing ${label}`, () => {
        /*
        Test Doc:
        - Why: Git-portable filenames must avoid characters invalid on Windows
        - Contract: validateFileName containing the char returns {ok: false, error: 'invalid-char'}
        - Usage Notes: Per spec clarification Q8 — git-portable validation
        - Quality Contribution: Prevents cross-platform git issues
        - Worked Example: 'file<char>name' → {ok: false, error: 'invalid-char', char}
        */
        const result = validateFileName(`file${char}name`);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe('invalid-char');
          expect(result.char).toBe(char);
        }
      });
    }
  });

  describe('edge cases', () => {
    it('should reject names with trailing spaces', () => {
      /*
      Test Doc:
      - Why: Trailing spaces cause issues on Windows NTFS
      - Contract: validateFileName('file.txt ') returns {ok: false, error: 'invalid-char'}
      - Usage Notes: Windows silently strips trailing spaces, causing mismatches
      - Quality Contribution: Prevents cross-platform filename inconsistencies
      - Worked Example: 'file.txt ' → {ok: false, error: 'invalid-char'}
      */
      const result = validateFileName('file.txt ');
      expect(result.ok).toBe(false);
    });

    it('should reject names with trailing dots', () => {
      /*
      Test Doc:
      - Why: Trailing dots cause issues on Windows
      - Contract: validateFileName('file.') returns {ok: false, error: 'invalid-char'}
      - Usage Notes: Windows silently strips trailing dots
      - Quality Contribution: Prevents cross-platform filename inconsistencies
      - Worked Example: 'file.' → {ok: false, error: 'invalid-char'}
      */
      const result = validateFileName('file.');
      expect(result.ok).toBe(false);
    });
  });
});
