/**
 * Remote-view URL params (Workshop 001 §URL).
 *
 * Plan-scoped: 088-remote-view
 * Domain: remote-view (contract)
 *
 * The remote-view content-area mode is addressed by two params, composed into the
 * browser page's param set alongside the file-browser params:
 *   - `view=remote`  — selects the content-area mode (the literal lives in
 *     file-browser.params.ts, extended from the `recent-feed` precedent).
 *   - `rv=<sessionId>` — the active remote-view session (defined here).
 *
 * `rv` is **inert without `view=remote`**: nothing reads it unless the remote-view
 * panel is the active content-area mode, so a stray `?rv=…` is a no-op (Workshop 001).
 *
 * @example URL: /workspaces/my-proj/browser?view=remote&rv=ses_abc123
 */

import { parseAsString } from 'nuqs';

export const remoteViewParams = {
  /** Active remote-view session id. `null` = no session yet (picker). Inert unless `view=remote`. */
  rv: parseAsString,
};
