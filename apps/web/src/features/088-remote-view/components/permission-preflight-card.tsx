'use client';

/**
 * PermissionPreflightCard — the AC-14 in-app permissions card (Plan 088 Phase 6, T004).
 *
 * When the daemon's `/health.permissions` reports a missing TCC grant, the picker shows this
 * card BEFORE the user tries to attach — so a revoked grant never surfaces as a silent black
 * frame. Each missing grant is named with why it's needed and a deep-link straight to its System
 * Settings pane; a Re-check button re-reads health so re-granting recovers without a reload.
 *
 * Presentational only: the missing-grant list + the recheck action are injected (the panel owns
 * the health hook), so the branch logic lives in `permissions-ux.ts` and is unit-tested directly.
 */

import { ShieldAlert } from 'lucide-react';
import type { MissingGrant } from './permissions-ux';

export interface PermissionPreflightCardProps {
  /** The grants the host Mac is missing (empty → the card renders nothing). */
  missing: MissingGrant[];
  /** Re-read the daemon's permission state after the user grants in System Settings. */
  onRecheck: () => void;
}

export function PermissionPreflightCard({ missing, onRecheck }: PermissionPreflightCardProps) {
  if (missing.length === 0) return null;
  return (
    <div
      data-testid="remote-view-permission-preflight"
      role="alert"
      className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4" />
        Permission needed on the host Mac
      </div>
      <ul className="flex flex-col gap-2">
        {missing.map((m) => (
          <li
            key={m.grant}
            data-testid={`remote-view-missing-grant-${m.grant}`}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{m.label}</span>
              <a
                href={m.settingsUrl}
                data-testid={`remote-view-open-settings-${m.grant}`}
                className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-muted"
              >
                Open System Settings
              </a>
            </div>
            <span className="text-xs text-muted-foreground">{m.why}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onRecheck}
        data-testid="remote-view-permission-recheck"
        className="self-start rounded border px-3 py-1 text-xs hover:bg-muted"
      >
        Re-check permissions
      </button>
    </div>
  );
}
