/**
 * Role chips — Plan 089 Phase 2 (T003).
 *
 * **Three chips, not five.** The ratified POC showed `Coder` and `Reviewer` alongside them, and they
 * are not rendered here, because nothing in the data attests them: `pij list` and `pij tree` carry no
 * `role` field (flagged to the pij o-prime; expected to land additively). The only ways to produce
 * those two chips today are to pattern-match seat names, models or harnesses — all inference, all
 * wrong exactly when a seat is doing something unusual, which is when a human is looking.
 *
 * What the tree DOES attest is structure, and structure gives three honest roles:
 *
 *   - **Prime** — the TREE node carries `prime`
 *   - **PM** — the node has children (it is managing seats; the tree says so)
 *   - **Worker** — a leaf, or a row the tree has not placed
 *
 * All three come from the tree node, never from the fleet row — the row carries a `prime` of its own,
 * the two reads can disagree, and letting the row win would put a Prime chip on a seat no tree has
 * adopted. A row the tree has not placed at all therefore reads as `Worker` until a refetch adopts it:
 * unattested structure, not assumed structure.
 *
 * When the `role` field lands, these upgrade additively and nothing here has to be unwound.
 */
'use client';

import type { PijTreeNode } from '../server/pij-records.interface';
import type { FleetRow } from '../types';

export type SeatRole = 'Prime' | 'PM' | 'Worker';

/**
 * The role the TREE attests — never one inferred from a name, a model or a harness, and never one
 * taken from the fleet row. `row` stays in the signature because callers hold both halves of a
 * placement; it is deliberately unread here.
 */
export function seatRole(input: { node?: PijTreeNode; row?: FleetRow }): SeatRole {
  if (input.node?.prime === true) return 'Prime';
  if ((input.node?.children?.length ?? 0) > 0) return 'PM';
  return 'Worker';
}

const ROLE_CLASS: Record<SeatRole, string> = {
  Prime: 'border-purple-500/40 text-purple-700 dark:text-purple-300 font-semibold',
  PM: 'border-purple-500/40 text-purple-700 dark:text-purple-300',
  Worker: 'border-border text-muted-foreground',
};

export function RoleChip({ role }: { role: SeatRole }) {
  return (
    <span
      data-testid={`role-chip-${role}`}
      className={`inline-block rounded-full border px-1.5 py-px text-[10px] leading-4 ${ROLE_CLASS[role]}`}
    >
      {role}
    </span>
  );
}
