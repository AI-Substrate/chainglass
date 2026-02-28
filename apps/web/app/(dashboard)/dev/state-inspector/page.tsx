'use client';

/**
 * Plan 056: State Inspector Page
 *
 * Route: /dev/state-inspector
 * Renders the StateInspector panel for live state system observability.
 */

import { StateInspector } from '@/features/_platform/dev-tools';

export default function StateInspectorPage() {
  return (
    <div className="h-full">
      <StateInspector />
    </div>
  );
}
