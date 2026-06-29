/**
 * Discoverable launch affordance for remote-view (Plan 088 Phase 6, T005 — DL-003).
 *
 * Before this, remote-view was reachable only via the command palette (`remote-view.attach`) or a
 * hand-typed `?view=remote` URL — invisible to a first-time user. This is the visible entry point:
 * an icon button that lives in the file-browser ExplorerPanel `rightActions` slot, beside the
 * recent-feed (`History`) and split-terminal toggles, mirroring the recent-feed entrypoint
 * precedent (browser-client.tsx). It is purely presentational — the parent owns the action and
 * wires `onLaunch` → `setParams({ view: 'remote', rv: null })`, which opens the window picker. The
 * palette command stays registered, so both paths reach the same place.
 */
import { Monitor } from 'lucide-react';

export interface RemoteViewLaunchButtonProps {
  /** Fired on click; the parent maps this to `setParams({ view: 'remote', rv: null })`. */
  onLaunch: () => void;
}

export function RemoteViewLaunchButton({ onLaunch }: RemoteViewLaunchButtonProps) {
  return (
    <button
      type="button"
      onClick={onLaunch}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Remote View — stream a desktop app window"
      aria-label="Open Remote View"
      data-testid="remote-view-launch"
    >
      <Monitor className="h-4 w-4" />
    </button>
  );
}
