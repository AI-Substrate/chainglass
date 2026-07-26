/**
 * Fleet grouping — Plan 089 Phase 2 (T003).
 *
 * Turns two independent reads (the repo forest from `pij tree`, the seats from `pij list`) into the
 * shape the ratified POC renders: prime shells, one section per child of a prime, and everything else
 * under "Outside any prime".
 *
 * Three rules, each of which exists because its opposite is a plausible bug:
 *
 * - **Structure comes from the tree, never from names.** `pij tree` is a derived view and the platform
 *   contract's whole point is that re-implementing pij's derivations outside pij is the failure to
 *   avoid. Nothing here parses an id, a title or a folder to decide who reports to whom.
 * - **A row the tree has not placed is still shown.** The two reads are taken at different instants,
 *   so a seat spawned since the last tree read is *unplaced*, not absent — it renders under "Outside
 *   any prime" until a refetch places it. Dropping it would make a just-spawned seat invisible, which
 *   is exactly the moment a human is looking for it.
 * - **Absence of a `lastEventAt` is not idleness.** The idle filter hides seats last heard from
 *   outside the window; a seat with no timestamp at all has told us nothing, and "we don't know" is
 *   never grounds for hiding something.
 */
import type { PijTreeNode } from '../server/pij-records.interface';
import type { FleetRow, PijId } from '../types';

/** The ruled idle window: seats last heard from more than this ago are hidden by the filter. */
export const IDLE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** One seat as the view draws it: identity from the tree, data from the fleet row. */
export interface SeatPlacement {
  id: PijId;
  /** The fleet row, when the seat is in the current fleet snapshot. */
  row?: FleetRow;
  /** The tree node, when the seat is in the current tree snapshot. */
  node?: PijTreeNode;
  /** Nesting under the section lead. 0 = the lead itself. */
  depth: number;
}

/** A section: one lead seat (a PM or a standalone worker) plus everyone beneath it. */
export interface FleetSection {
  lead: SeatPlacement;
  members: SeatPlacement[];
  /** Lead + members. What the header counts. */
  seatCount: number;
  /** True when the lead is a fleet row the tree has not placed yet. */
  unplaced: boolean;
}

/** A prime and the sections it governs. */
export interface PrimeShell {
  lead: SeatPlacement;
  sections: FleetSection[];
  seatCount: number;
}

export interface FleetGrouping {
  primes: PrimeShell[];
  /** Non-prime roots and unplaced rows — the "Outside any prime" band. */
  loose: FleetSection[];
  /** Every seat id the grouping will draw, in draw order. Used to prove each appears exactly once. */
  seatIds: PijId[];
  /** Rows the idle filter removed. Reported, never silently dropped. */
  hiddenByIdle: number;
}

export interface GroupFleetOptions {
  rows: FleetRow[];
  tree: PijTreeNode[];
  /** Reference instant for the idle window. Injected so tests never depend on wall time. */
  now: number;
  /** Apply the 48h idle filter. The scope toggle turns it off for the global list. */
  idleFilter?: boolean;
}

/**
 * The assignment text for a seat, from whichever read has it.
 *
 * `pij list` rows do NOT carry `currentTask` (measured live, 2026-07-26: 179 rows, none has one) —
 * only `pij tree` nodes do. Reading the row alone would leave every section titled "(no assignment)"
 * on real data while the tree was holding the answer. Both are records; neither is inferred.
 */
export function seatTask(placement: SeatPlacement): string | undefined {
  if (placement.row?.currentTask) return placement.row.currentTask;
  const fromTree = placement.node?.currentTask;
  return typeof fromTree === 'string' && fromTree.length > 0 ? fromTree : undefined;
}

/** Is this seat inside the idle window? An absent `lastEventAt` is always shown. */
export function isWithinIdleWindow(row: FleetRow, now: number): boolean {
  if (!row.lastEventAt) return true;
  const at = Date.parse(row.lastEventAt);
  if (Number.isNaN(at)) return true;
  return now - at <= IDLE_WINDOW_MS;
}

/** Most recently heard from first; a seat with no timestamp sorts last but is never dropped. */
function byRecency(a: SeatPlacement, b: SeatPlacement): number {
  return (b.row?.lastEventAt ?? '').localeCompare(a.row?.lastEventAt ?? '');
}

/**
 * Depth-first placements for a subtree, pruned to what is still live.
 *
 * A node with no fleet row and no live descendant is kept out: it is a seat the hot registry no
 * longer lists (terminal, migrated to the archive tier after 48h), and drawing it would put a seat on
 * screen that the fleet does not have. A node with no row but with live children stays, because it is
 * load-bearing structure.
 */
function flatten(
  node: PijTreeNode,
  rows: Map<PijId, FleetRow>,
  visible: Set<string>,
  depth: number
): SeatPlacement[] {
  const id = node.id as PijId;
  const children = (node.children ?? [])
    .filter((child) => hasVisibleSeat(child, visible))
    .flatMap((child) => flatten(child, rows, visible, depth + 1));
  if (!visible.has(node.id) && children.length === 0) return [];
  return [{ id, row: rows.get(id), node, depth }, ...children];
}

/** True when a subtree contains at least one seat the fleet snapshot still knows about. */
function hasVisibleSeat(node: PijTreeNode, visible: Set<string>): boolean {
  if (visible.has(node.id)) return true;
  return (node.children ?? []).some((child) => hasVisibleSeat(child, visible));
}

function sectionFrom(
  node: PijTreeNode,
  rows: Map<PijId, FleetRow>,
  visible: Set<string>
): FleetSection {
  const [lead, ...members] = flatten(node, rows, visible, 0);
  return { lead, members, seatCount: 1 + members.length, unplaced: false };
}

export function groupFleet(options: GroupFleetOptions): FleetGrouping {
  const { rows, tree, now } = options;
  const idleFilter = options.idleFilter ?? true;

  const visibleRows = idleFilter ? rows.filter((row) => isWithinIdleWindow(row, now)) : rows;
  const hiddenByIdle = rows.length - visibleRows.length;
  const rowsById = new Map<PijId, FleetRow>(visibleRows.map((row) => [row.id, row]));
  const visibleIds = new Set<string>(rowsById.keys());

  const placed = new Set<string>();
  const primes: PrimeShell[] = [];
  const loose: FleetSection[] = [];

  for (const root of tree) {
    // A branch with nothing live in it is history, not fleet. Keep the branch only for the seats it
    // still holds — never as an empty shell implying seats that are gone.
    if (!hasVisibleSeat(root, visibleIds)) continue;

    // Prime comes from the TREE and nowhere else. The fleet row carries a `prime` of its own and the
    // two can disagree — different reads, taken at different instants — and if the row is allowed to
    // win, a stale or disagreeing copy promotes a seat into a shell that governs sections the tree
    // never gave it. "Structure comes from the tree" has to hold on the conflict, not just the silence.
    if (root.prime === true) {
      const lead: SeatPlacement = {
        id: root.id as PijId,
        row: rowsById.get(root.id as PijId),
        node: root,
        depth: 0,
      };
      const sections = (root.children ?? [])
        .filter((child) => hasVisibleSeat(child, visibleIds))
        .map((child) => sectionFrom(child, rowsById, visibleIds))
        .sort((a, b) => byRecency(a.lead, b.lead));
      const seatCount = 1 + sections.reduce((total, section) => total + section.seatCount, 0);
      primes.push({ lead, sections, seatCount });
      for (const id of [
        lead.id,
        ...sections.flatMap((s) => [s.lead, ...s.members].map((p) => p.id)),
      ])
        placed.add(id);
      continue;
    }

    const section = sectionFrom(root, rowsById, visibleIds);
    loose.push(section);
    for (const seat of [section.lead, ...section.members]) placed.add(seat.id);
  }

  // Rows the tree snapshot has never mentioned. The tree is a separate, older read; a seat spawned
  // since is unplaced, not missing, and it gets a section of its own until a refetch adopts it.
  for (const row of visibleRows) {
    if (placed.has(row.id)) continue;
    placed.add(row.id);
    loose.push({
      lead: { id: row.id, row, depth: 0 },
      members: [],
      seatCount: 1,
      unplaced: true,
    });
  }

  primes.sort((a, b) => byRecency(a.lead, b.lead));
  loose.sort((a, b) => byRecency(a.lead, b.lead));

  const seatIds: PijId[] = [
    ...primes.flatMap((prime) => [
      prime.lead.id,
      ...prime.sections.flatMap((section) => [section.lead, ...section.members].map((s) => s.id)),
    ]),
    ...loose.flatMap((section) => [section.lead, ...section.members].map((s) => s.id)),
  ];

  return { primes, loose, seatIds, hiddenByIdle };
}
