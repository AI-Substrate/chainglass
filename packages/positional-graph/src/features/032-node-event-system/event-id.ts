/**
 * Generate a unique event ID.
 *
 * Format: `evt_<timestamp_hex>_<random_4hex>`
 *
 * The hex timestamp provides monotonic ordering (within ms resolution).
 * The random suffix prevents collisions when events are raised in the
 * same millisecond.
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `evt_${timestamp}_${random}`;
}
