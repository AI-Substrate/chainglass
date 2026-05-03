/**
 * Public surface for the bootstrap-code auth library.
 *
 * Plan 084 Phase 1 — Shared Primitives. Consumers:
 * - Phase 2 (`apps/web/instrumentation.ts`) — `ensureBootstrapCode`, `EnsureResult`
 * - Phase 3 (proxy + verify route) — cookie helpers, `activeSigningSecret`,
 *   `BOOTSTRAP_COOKIE_NAME`, `BOOTSTRAP_CODE_PATTERN`
 * - Phase 4 (terminal-WS sidecar) — `activeSigningSecret`,
 *   `BOOTSTRAP_CODE_FILE_PATH_REL`
 * - Phase 5 (`requireLocalAuth`) — `verifyCookieValue`,
 *   `BOOTSTRAP_COOKIE_NAME`
 *
 * `_resetSigningSecretCacheForTests` is exported but tagged `@internal` —
 * it must never be imported by production code.
 */

export type { BootstrapCodeFile, EnsureResult } from './types.js';
export {
  BOOTSTRAP_CODE_PATTERN,
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_CODE_FILE_PATH_REL,
  BootstrapCodeFileSchema,
} from './types.js';
export { generateBootstrapCode } from './generator.js';
export {
  readBootstrapCode,
  writeBootstrapCode,
  ensureBootstrapCode,
} from './persistence.js';
export { buildCookieValue, verifyCookieValue } from './cookie.js';
export { activeSigningSecret } from './signing-key.js';
export { findWorkspaceRoot } from './workspace-root.js';
/**
 * @internal For tests only — clears the cwd-keyed signing-key cache between
 * test cases. Production code MUST NOT import.
 */
export { _resetSigningSecretCacheForTests } from './signing-key.js';
/**
 * @internal For tests only — clears the workspace-root cache between test
 * cases. Production code MUST NOT import.
 */
export { _resetWorkspaceRootCacheForTests } from './workspace-root.js';
