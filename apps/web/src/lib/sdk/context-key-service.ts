/**
 * ContextKeyService — Real implementation of IContextKeyService.
 *
 * In-memory Map for when-clause evaluation.
 * Supports: 'key' (truthy), '!key' (negation), 'key == value' (equality).
 *
 * Per Plan 047 Phase 1, Task T008.
 */

import type { IContextKeyService } from '@chainglass/shared/sdk';

export class ContextKeyService implements IContextKeyService {
  private readonly keys = new Map<string, unknown>();
  private readonly changeListeners = new Set<(key: string, value: unknown) => void>();

  set(key: string, value: unknown): void {
    this.keys.set(key, value);
    for (const cb of this.changeListeners) cb(key, value);
  }

  get(key: string): unknown {
    return this.keys.get(key);
  }

  evaluate(expression: string | undefined): boolean {
    if (!expression || expression.trim() === '') return true;

    const expr = expression.trim();

    // Negation: !key
    if (expr.startsWith('!')) {
      const key = expr.slice(1).trim();
      return !this.keys.get(key);
    }

    // Equality: key == value
    if (expr.includes('==')) {
      const [key, val] = expr.split('==').map((s) => s.trim());
      const current = this.keys.get(key);
      if (current === undefined) return false;
      return String(current) === val;
    }

    // Simple truthy: key
    return !!this.keys.get(expr);
  }

  onChange(callback: (key: string, value: unknown) => void): { dispose: () => void } {
    this.changeListeners.add(callback);
    return {
      dispose: () => {
        this.changeListeners.delete(callback);
      },
    };
  }
}
