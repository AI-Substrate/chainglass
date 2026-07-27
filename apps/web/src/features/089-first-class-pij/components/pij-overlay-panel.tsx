/**
 * pij overlay panel — Plan 089 Phase 4 (T003).
 *
 * The quick-glance surface: a condensed seat list for the current workspace, over whatever the user
 * is doing. Geometry copied from `pr-view-overlay-panel.tsx` line for line — anchor measurement via
 * `ResizeObserver` on `[data-terminal-overlay-anchor]`, `zIndex: 44`, `hasOpened` lazy guard,
 * `display: none` rather than unmount so state survives a close, Escape to close.
 *
 * **`zIndex: 44` is the same as the terminal's, not higher.** "Over" is established by opening later
 * plus the `overlay:close-all` mutual exclusion, not by a z-index race. A higher number here would
 * win the wrong argument and put pij permanently above a terminal the user is typing into.
 *
 * **The panel renders the PAGE'S fleet view, not a summary of it** (Jordan's ruling 2026-07-27,
 * superseding both the plan's "compact fleet list" wording — AC-12 / task 4.3 — and this panel's
 * first flat-list design). Two rewrites taught the same lesson twice: a condensed re-rendering is a
 * second implementation no matter how thin it is, and every field it drops (observed state, model
 * provenance, effort, flags, context gauge, the section's flow chip and project/worktree meta) is a
 * field the operator then has to leave the overlay to see. So this file owns the CONTAINER —
 * geometry, open/close, mutual exclusion — and `FleetView` owns everything inside it. There is one
 * fleet rendering in this codebase; the page and the overlay are two frames around it.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePijFleet } from '../hooks/use-pij-fleet';
import { usePijOverlay } from '../hooks/use-pij-overlay';
import type { FleetScope } from '../hooks/use-pij-fleet';
import { FleetView } from './fleet-view';

function PijOverlayContent({
  workspacePath,
  fetchImpl,
}: {
  workspacePath: string;
  fetchImpl?: typeof fetch;
}) {
  const [scope, setScope] = useState<FleetScope>('workspace');
  const { rows, tree, status, phase, errors, filteredOut } = usePijFleet({
    workspacePath,
    scope,
    fetchImpl,
  });
  const [now, setNow] = useState(() => Date.now());

  // Freshness is a column here as much as on the page, so it ticks on the same 5s cadence. It moves
  // nothing else: no refetch, no request.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[13px] font-medium">pij fleet</span>
        <span
          className="text-[11px] text-muted-foreground"
          data-testid="pij-overlay-phase"
          data-phase={phase}
        >
          {phase}
        </span>
        <span className="flex-1" />
        <span className="text-[10.5px] text-muted-foreground">Esc to close</span>
      </div>

      {/* The view brings its own honesty machinery — the four empty states, the filtered-out counter,
          provenance and freshness wording — so none of it is restated here where it could drift.
          `overflow-auto` on both axes: the seat grid has a real minimum width and a narrow pane must
          scroll to it rather than crush the columns into unreadability. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <FleetView
          rows={rows}
          tree={tree}
          status={status}
          workspacePath={workspacePath}
          now={now}
          scope={scope}
          onScopeChange={setScope}
          filteredOut={filteredOut}
          fetchError={errors.fleet}
          focusFetchImpl={fetchImpl}
        />
      </div>
    </>
  );
}

/** `fetchImpl` is the test seam, mirroring `PijPageClient`'s. Production passes nothing. */
export function PijOverlayPanel({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const { isOpen, workspacePath, closePij } = usePijOverlay();

  const [anchorRect, setAnchorRect] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  const measureRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const measure = () => {
      const anchor = document.querySelector('[data-terminal-overlay-anchor]');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
      }
    };
    measureRef.current = measure;
    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    const anchor = document.querySelector('[data-terminal-overlay-anchor]');
    if (anchor) observer.observe(anchor);
    const timer = setTimeout(measure, 200);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (isOpen) measureRef.current?.();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePij();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePij]);

  if (!hasOpened) return null;

  return (
    <div
      className="fixed flex flex-col border-l bg-background shadow-2xl"
      style={{
        zIndex: 44,
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        display: isOpen ? 'flex' : 'none',
      }}
      data-testid="pij-overlay-panel"
    >
      {/* Children unmount when closed so the closed overlay holds no SSE subscription open. The
          OPEN/CLOSED flag itself lives in the provider, which is why closing here loses nothing. */}
      {isOpen && workspacePath ? (
        <PijOverlayContent workspacePath={workspacePath} fetchImpl={fetchImpl} />
      ) : null}
    </div>
  );
}
