/**
 * **Browser-safe** public contract for the `_platform/clipboard` sub-domain.
 *
 * One primitive, one contract: `copyText` resolves `true` only when the write
 * landed, and every caller gates its success feedback on that. See
 * `lib/copy-text.ts` for why a failure is ordinary here rather than exceptional.
 */

export { copyText } from './lib/copy-text';
