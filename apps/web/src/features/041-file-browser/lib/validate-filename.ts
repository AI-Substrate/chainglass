// Candidate for packages/shared if needed outside file-browser

export type ValidateFileNameResult =
  | { ok: true }
  | { ok: false; error: 'empty' | 'reserved' | 'invalid-char'; char?: string };

/** Characters that are invalid in git-portable filenames (Windows compat) */
const INVALID_CHARS = /[/\\:\0*?"<>|]/;

/**
 * Validate a file or folder name for git-portable safety.
 *
 * Rejects: empty, whitespace-only, reserved (`.`, `..`),
 * git-portable invalid chars (/ \ : * ? " < > | NUL),
 * trailing spaces, and trailing dots (Windows issues).
 */
export function validateFileName(name: string): ValidateFileNameResult {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' };
  }

  if (trimmed === '.' || trimmed === '..') {
    return { ok: false, error: 'reserved' };
  }

  const match = INVALID_CHARS.exec(name);
  if (match) {
    return { ok: false, error: 'invalid-char', char: match[0] };
  }

  // Trailing spaces cause issues on Windows NTFS
  if (name !== name.trimEnd()) {
    return { ok: false, error: 'invalid-char', char: ' ' };
  }

  // Trailing dots cause issues on Windows
  if (name.endsWith('.') && name !== '.' && name !== '..') {
    return { ok: false, error: 'invalid-char', char: '.' };
  }

  return { ok: true };
}
