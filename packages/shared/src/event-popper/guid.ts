import { randomBytes } from 'node:crypto';

/**
 * Plan 067: Event Popper Infrastructure
 *
 * Generate a unique, chronologically sortable event ID.
 * Format: `{ISO-timestamp}_{4-char-sequence}{2-char-hex}` with colons replaced
 * by hyphens for filesystem safety.
 *
 * Same-millisecond calls are monotonically ordered via an incrementing sequence
 * counter that resets when the timestamp advances.
 *
 * Example: `2026-03-07T05-52-00-000Z_0000a8`
 */

let lastTimestamp = '';
let sameMsSequence = 0;

export function generateEventId(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-');

  sameMsSequence = timestamp === lastTimestamp ? sameMsSequence + 1 : 0;
  lastTimestamp = timestamp;

  const suffix = `${sameMsSequence.toString(16).padStart(4, '0')}${randomBytes(1).toString('hex')}`;
  return `${timestamp}_${suffix}`;
}
