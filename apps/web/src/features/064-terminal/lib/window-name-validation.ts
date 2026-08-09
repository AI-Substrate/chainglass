const MAX_WINDOW_NAME_LENGTH = 128;

/**
 * Product constraints for tmux window labels. The fixed argv command is what
 * closes shell injection; this validator only keeps tmux labels usable.
 */
export function getWindowNameValidationError(name: string): string | null {
  if (name.trim().length === 0) {
    return 'Window name cannot be empty';
  }
  if (name.length > MAX_WINDOW_NAME_LENGTH) {
    return `Window name must be ${MAX_WINDOW_NAME_LENGTH} characters or fewer`;
  }
  if (name.startsWith('-')) {
    return 'Window name cannot start with a dash';
  }
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return 'Window name cannot contain control characters';
  }
  return null;
}

export function isValidWindowName(name: string): boolean {
  return getWindowNameValidationError(name) === null;
}
