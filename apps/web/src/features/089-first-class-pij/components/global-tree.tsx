/**
 * The global prime tree — Plan 089 Phase 4 (T005).
 *
 * Jordan's pick from the T001 spike: **POC A**, the folder-grouped `<details>` design already
 * ratified in `scratch/pij-observatory-poc.html`, at machine scale. One collapsible section per
 * folder, prime roots first, the same seat vocabulary as the workspace tree.
 *
 * The tree and fleet are separate reads: rows not placed by the tree stay in a collapsed band.
 * Legacy calls those dead records. pij-rs cannot attest liveness, so its unplaced records are
 * labelled only by their absence from the tree, never by a presumed process state.
 *
 * **"rows", never "live seats".** A count of rows is a count of records read. Calling them live seats
 * would be a claim about processes that this page has not checked and cannot check.
 */
'use client';

import { useMemo } from 'react';
import { isLivenessUnavailable } from '../lib/fleet-grouping';
import { formatElapsed } from '../lib/relative-time';
import type { PijTreeNode } from '../server/pij-records.interface';
import type { FleetRow, PollerStatus } from '../types';

/** Why the page has no tree to draw. One reason, one rendering, no overlap. */
export type GlobalTreeAbsenceReason = 'unreadable' | 'poller-not-running' | 'no-seats';

export interface GlobalTreeProps {
  roots: PijTreeNode[];
  rows: FleetRow[];
  status: PollerStatus | null;
  livenessUnavailable?: boolean;
  now: number;
  /** Per-surface read failures. Either one is enough to make the view untrustworthy. */
  errors: { fleet: string | null; tree: string | null };
}

/**
 * The absence discriminator — a pure function so the precedence ladder is testable without a DOM.
 *
 * Order matters and is the AC-08 trichotomy: a failed read outranks a stopped poller, which outranks
 * a genuinely empty machine. Collapsing any pair would report "nothing here" for a situation where
 * the honest answer is "we could not tell".
 */
export function globalTreeAbsenceReason(
  props: Pick<GlobalTreeProps, 'roots' | 'rows' | 'status' | 'errors'>
): GlobalTreeAbsenceReason | null {
  if (props.errors.fleet || props.errors.tree) return 'unreadable';
  if (props.status && props.status.running === false) return 'poller-not-running';
  if (props.roots.length === 0 && props.rows.length === 0) return 'no-seats';
  return null;
}

const STATE_DOT: Record<string, string> = {
  working: 'bg-emerald-600',
  idle: 'bg-muted-foreground',
  stalled: 'bg-amber-500',
  starting: 'bg-blue-600',
  stopped: 'bg-muted-foreground/40 border border-muted-foreground',
  dead: 'bg-muted-foreground/40 border border-muted-foreground',
};

/** `~/` for the home prefix, exactly as the ratified POC shortens it. */
export function shortenHome(path: string): string {
  return path.replace(/^\/Users\/[^/]+\//, '~/');
}

/** Every id the global tree places, at any depth. */
function collectTreeIds(nodes: PijTreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.id);
    if (node.children?.length) collectTreeIds(node.children, into);
  }
  return into;
}

export interface FolderGroup {
  folder: string;
  /** Tree roots in this folder, primes first. */
  roots: PijTreeNode[];
  /** Seats the tree places here, counted at every depth. */
  inTree: number;
  /** Fleet rows in this folder that the tree does not place. */
  orphans: FleetRow[];
}

/**
 * Group both reads by folder into one ordered list.
 *
 * A folder can appear because the tree has roots there, because the fleet has rows there, or both —
 * and the third case is the common one. Folders are sorted by tree placements first, then by name
 * so the order is stable between renders. Placement does not attest liveness.
 */
export function groupByFolder(roots: PijTreeNode[], rows: FleetRow[]): FolderGroup[] {
  const placed = collectTreeIds(roots);
  const folders = new Map<string, FolderGroup>();

  const ensure = (folder: string): FolderGroup => {
    let group = folders.get(folder);
    if (!group) {
      group = { folder, roots: [], inTree: 0, orphans: [] };
      folders.set(folder, group);
    }
    return group;
  };

  for (const root of roots) {
    const group = ensure(root.folder ?? '(no folder on record)');
    group.roots.push(root);
    group.inTree += collectTreeIds([root]).size;
  }

  for (const row of rows) {
    const group = ensure(row.folder || '(no folder on record)');
    if (!placed.has(row.id)) group.orphans.push(row);
  }

  for (const group of folders.values()) {
    // Primes lead their folder, then most-recently-seen first. Never array order: the CLI's order is
    // not a ranking and rendering it as one would imply a hierarchy that was never read.
    group.roots.sort(
      (a, b) =>
        (b.prime ? 1 : 0) - (a.prime ? 1 : 0) ||
        String(b.lastEventAt ?? '').localeCompare(String(a.lastEventAt ?? ''))
    );
    group.orphans.sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));
  }

  return [...folders.values()].sort(
    (a, b) => b.inTree - a.inTree || a.folder.localeCompare(b.folder)
  );
}

function SeatLine({
  node,
  row,
  depth,
  now,
  livenessUnavailable,
}: {
  node: PijTreeNode;
  row?: FleetRow;
  depth: number;
  now: number;
  livenessUnavailable?: boolean;
}) {
  const unavailable = livenessUnavailable || isLivenessUnavailable(row);
  const state = row?.state ?? (typeof node.state === 'string' ? node.state : undefined);
  const liveness = row?.liveness ?? (typeof node.liveness === 'string' ? node.liveness : undefined);
  const lastEventAt =
    row?.lastEventAt ?? (typeof node.lastEventAt === 'string' ? node.lastEventAt : null);

  return (
    <div
      data-testid={`global-seat-${node.id}`}
      className="grid grid-cols-[minmax(220px,1.6fr)_150px_110px_90px] items-baseline gap-2 py-0.5 text-xs hover:bg-muted/50"
    >
      <div style={{ paddingLeft: depth * 18 }} className="flex items-center gap-1.5">
        {depth > 0 && <span className="text-muted-foreground/60">└</span>}
        <span className="font-mono text-[11.5px]">{node.id}</span>
        {node.prime ? (
          <span className="rounded-full border border-purple-400/50 px-1.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">
            prime
          </span>
        ) : null}
        {node.unadopted ? (
          <span className="rounded-full border border-red-500/40 px-1.5 text-[10px] text-red-700 dark:text-red-400">
            unadopted
          </span>
        ) : null}
      </div>
      {unavailable ? (
        <span data-reason="liveness-unavailable" className="text-muted-foreground">
          liveness unavailable from pij-rs
          {state ? <span className="block">reported state: {state}</span> : null}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            className={`inline-block size-2 rounded-full ${STATE_DOT[state ?? ''] ?? 'bg-muted-foreground'}`}
            aria-hidden="true"
          />
          <span>{state ?? 'not read yet'}</span>
          {liveness ? (
            <span className="text-[11px] text-muted-foreground">· {liveness}</span>
          ) : null}
        </span>
      )}
      {/* Verbatim, never re-derived (AC-03). Absent stays absent. */}
      <span>
        {row?.badge ? (
          <span className="rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
            {unavailable ? 'reported badge: ' : ''}
            {row.badge}
          </span>
        ) : null}
      </span>
      <span className="text-right text-[11px] text-muted-foreground">
        {formatElapsed(lastEventAt, now)}
      </span>
    </div>
  );
}

function TreeBranch({
  node,
  rowsById,
  depth,
  now,
  livenessUnavailable,
}: {
  node: PijTreeNode;
  rowsById: Map<string, FleetRow>;
  depth: number;
  now: number;
  livenessUnavailable?: boolean;
}) {
  return (
    <div>
      <SeatLine
        node={node}
        row={rowsById.get(node.id)}
        depth={depth}
        now={now}
        livenessUnavailable={livenessUnavailable}
      />
      {node.children?.length ? (
        <div className="ml-5 border-l border-border pl-3">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              rowsById={rowsById}
              depth={depth + 1}
              now={now}
              livenessUnavailable={livenessUnavailable}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ABSENCE_COPY: Record<GlobalTreeAbsenceReason, { title: string; body: string }> = {
  unreadable: {
    title: 'The pij store could not be read',
    body: 'This is a read failure, not an empty machine. The code below is pij’s own.',
  },
  'poller-not-running': {
    title: 'The pij poller is not running',
    body: 'Nothing has been read yet, so there is nothing to show. That is different from having no seats.',
  },
  'no-seats': {
    title: 'No pij seats on this machine',
    body: 'The store was read and it is empty. A designed state, not a fault.',
  },
};

export function GlobalTree(props: GlobalTreeProps) {
  const { roots, rows, now } = props;

  const groups = useMemo(() => groupByFolder(roots, rows), [roots, rows]);
  const rowsById = useMemo(() => new Map(rows.map((row) => [String(row.id), row])), [rows]);
  const unavailable = props.livenessUnavailable || rows.some(isLivenessUnavailable);

  const absence = globalTreeAbsenceReason(props);
  if (absence) {
    const copy = ABSENCE_COPY[absence];
    return (
      <div
        data-testid={`global-tree-empty-${absence}`}
        data-reason={absence}
        className="rounded-lg border border-border bg-card p-6 text-sm"
      >
        <div className="mb-1 font-medium">{copy.title}</div>
        <div className="text-muted-foreground">{copy.body}</div>
        {unavailable ? (
          <div data-reason="liveness-unavailable" className="text-muted-foreground">
            liveness unavailable from pij-rs
          </div>
        ) : null}
        {props.errors.fleet || props.errors.tree ? (
          <div className="mt-2 font-mono text-xs text-amber-700 dark:text-amber-400">
            {props.errors.tree ?? props.errors.fleet}
          </div>
        ) : null}
      </div>
    );
  }

  const inTree = groups.reduce((total, group) => total + group.inTree, 0);
  const unplaced = groups.reduce((total, group) => total + group.orphans.length, 0);

  return (
    <div data-testid="global-tree">
      <p className="mb-3 text-xs text-muted-foreground" data-testid="global-tree-summary">
        {/* "rows", not "live seats" — see the module docs. */}
        <span className="text-foreground">{rows.length}</span> rows across{' '}
        <span className="text-foreground">{groups.length}</span> folders ·{' '}
        <span className="text-foreground">{inTree}</span> placed in the global tree ·{' '}
        <span className="text-foreground">{unplaced}</span>{' '}
        {unavailable ? 'records the tree does not place' : 'dead records the tree does not place'}
        {unavailable ? (
          <span data-reason="liveness-unavailable"> · liveness unavailable from pij-rs</span>
        ) : null}
      </p>

      {groups.map((group) => (
        <div
          key={group.folder}
          data-testid={`global-folder-${group.folder}`}
          className="mb-2 overflow-hidden rounded-lg border border-border bg-card"
        >
          {/* Open the folder with the most tree placements, not a claim about living seats. */}
          <details open={group.folder === groups[0]?.folder || undefined}>
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-2 bg-muted/40 px-3.5 py-2">
              <span className="font-mono text-[12.5px]">{shortenHome(group.folder)}</span>
              <span className="text-[11px] text-muted-foreground">
                {group.inTree} in tree · {group.orphans.length} {unavailable ? 'unplaced' : 'dead'}{' '}
                record
                {group.orphans.length === 1 ? '' : 's'}
              </span>
            </summary>

            <div className="px-3.5 py-2">
              {group.roots.length > 0 ? (
                group.roots.map((root) => (
                  <TreeBranch
                    key={root.id}
                    node={root}
                    rowsById={rowsById}
                    depth={0}
                    now={now}
                    livenessUnavailable={props.livenessUnavailable}
                  />
                ))
              ) : (
                <div className="text-xs text-muted-foreground">
                  {unavailable
                    ? 'No seat in the global tree — this folder has unplaced records only.'
                    : 'No seat in the global tree — this folder is dead records only.'}
                </div>
              )}

              {group.orphans.length > 0 ? (
                <details
                  className="mt-2 border-t border-dashed border-border pt-1.5"
                  data-testid={`global-dead-${group.folder}`}
                >
                  <summary className="cursor-pointer py-1 text-[11.5px] text-muted-foreground">
                    {group.orphans.length} {unavailable ? 'unplaced' : 'dead'} record
                    {group.orphans.length === 1 ? '' : 's'} — present in the store, absent from the
                    tree
                  </summary>
                  {group.orphans.map((row) => (
                    <div
                      key={row.id}
                      data-testid={`global-dead-row-${row.id}`}
                      className="grid grid-cols-[minmax(220px,1fr)_120px_90px] gap-2 py-0.5 text-[11.5px] text-muted-foreground"
                    >
                      <span className="font-mono">{row.id}</span>
                      {props.livenessUnavailable || isLivenessUnavailable(row) ? (
                        <span data-reason="liveness-unavailable">
                          liveness unavailable from pij-rs
                          {row.state ? (
                            <span className="block">reported state: {row.state}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span>{row.liveness ?? 'liveness not observed'}</span>
                      )}
                      <span className="text-right">{formatElapsed(row.lastEventAt, now)}</span>
                    </div>
                  ))}
                </details>
              ) : null}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
