import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validate a path parameter for API routes.
 * Rejects path traversal attempts and invalid characters.
 *
 * @param path - Path to validate (null is allowed as it means "use default")
 * @returns true if path is valid or null, false if path contains dangerous patterns
 */
export function isValidPath(path: string | null): boolean {
  if (!path) return true; // null is OK (uses default)
  if (path.includes('..') || path.includes('\0')) return false;
  return /^[a-zA-Z0-9/_.-]+$/.test(path);
}
