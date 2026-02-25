/**
 * Stub Handlers — Placeholder BarHandlers for unimplemented features.
 *
 * DYK-P3-04: Only `#` prefix is a stub handler. Search fallback is
 * ExplorerPanel's "all handlers returned false" path, not a handler.
 *
 * Per Plan 047 Phase 3, Task T005.
 */

import { toast } from 'sonner';

import type { BarHandler } from './types';

/** Creates a BarHandler that intercepts `#` prefix (symbol search stub). */
export function createSymbolSearchStub(): BarHandler {
  return async (input) => {
    if (!input.startsWith('#')) return false;
    toast.info('Symbol search (LSP/Flowspace) coming later');
    return true;
  };
}
