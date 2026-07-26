/**
 * The global pij observatory — `/pij` — Plan 089 Phase 4 (T005).
 *
 * Deliberately OUTSIDE `workspaces/[slug]/`. Two consequences, both intended:
 *
 * 1. **It resolves no workspace.** There is no slug, no path, and nothing to scope to — the whole
 *    point is the machine. `/api/pij/fleet` with no parameter and `/api/pij/tree?global=1` are the
 *    two reads, and neither takes a scope.
 * 2. **It has no SSE.** `MultiplexedSSEProvider` is mounted in the workspace layout, so there is no
 *    `pij` channel here. The page is snapshot-only and says so, ages its own timestamp, and offers a
 *    refresh — see `PijGlobalClient`. That is the designed v1, not a gap.
 *
 * The shell is a Server Component purely for consistency with the workspace page; it resolves
 * nothing, because there is nothing to resolve.
 */

import { PijGlobalClient } from '@/features/089-first-class-pij/components/pij-global-client';

export const dynamic = 'force-dynamic';

export default function PijGlobalPage() {
  return <PijGlobalClient />;
}
