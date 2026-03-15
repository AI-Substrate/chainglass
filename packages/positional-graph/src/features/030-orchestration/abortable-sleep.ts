/**
 * Abortable sleep — signal-aware delay for cooperative cancellation.
 *
 * Uses `node:timers/promises` setTimeout with native AbortSignal support.
 * When the signal fires, the promise rejects with AbortError immediately
 * instead of waiting for the full delay.
 *
 * Per Plan 074 Phase 1 T003.
 *
 * @packageDocumentation
 */

import { setTimeout } from 'node:timers/promises';

/**
 * Sleep for the specified duration, optionally cancellable via AbortSignal.
 *
 * @param ms - Delay in milliseconds
 * @param signal - Optional AbortSignal for cooperative cancellation
 * @throws AbortError if signal is aborted before delay completes
 */
export async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await setTimeout(ms, undefined, { signal });
}
