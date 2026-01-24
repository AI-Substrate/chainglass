/**
 * Server-Only Utilities
 *
 * This module re-exports server utilities with the `server-only` guard.
 * Use this import path in Server Components to ensure build-time enforcement.
 *
 * Usage:
 * ```typescript
 * // In Server Components - use this guarded import
 * import { highlightCode } from '@/lib/server';
 *
 * // In tests - import directly from the processor module
 * import { highlightCode } from '@/lib/server/shiki-processor';
 * ```
 */

import 'server-only';

export { highlightCode } from './shiki-processor';
