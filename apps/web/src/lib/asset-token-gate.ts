/**
 * Plan 084 FX011 — asset-token short-circuit eligibility gate.
 *
 * Companion to `cookie-gate.ts`. The asset-token short-circuit in
 * `bootstrapCookieStage` is intentionally narrow — it must ONLY fire
 * for the raw-file route (where the HtmlViewer's sandboxed iframe
 * sends sub-resource requests with no cookie). Over-broadening would
 * let any caller bypass the cookie gate by carrying a valid asset token
 * for ANY workspace, defeating the always-on local gate.
 *
 * The route's pathname is parameterised by `[slug]`, so the existing
 * `AUTH_BYPASS_ROUTES` `startsWith` model can't express it. This regex
 * encapsulates the eligibility check and is the single source of truth
 * tested by `asset-token-gate.test.ts`.
 *
 * Pathname semantics: `NextRequest.nextUrl.pathname` excludes the query
 * string, so the regex doesn't need to handle `?_at=...`.
 */

const ASSET_TOKEN_ELIGIBLE_PATH = /^\/api\/workspaces\/[^/]+\/files\/raw$/;

/**
 * True if `pathname` is the raw-file route — and only that route —
 * eligible for asset-token short-circuit auth.
 *
 * Negative cases (locked by unit tests): trailing slash, any sub-path,
 * empty slug, different route, root, empty string.
 */
export function isAssetTokenEligiblePath(pathname: string): boolean {
  return ASSET_TOKEN_ELIGIBLE_PATH.test(pathname);
}
