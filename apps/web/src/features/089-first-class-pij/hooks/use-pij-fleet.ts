/**
 * use-pij-fleet — the fleet page's one data acquisition path. Plan 089 Phase 2 (T002).
 *
 * Everything the page renders arrives through this hook: the scoped fleet snapshot, the repo tree,
 * the flow summaries, the poller's own health, and the live `pij` channel that keeps the first of
 * those current. Three properties are load-bearing, and each is a contract rather than a preference.
 *
 * ## 1. Subscribe BEFORE fetching, then reconcile by `seq`
 *
 * The channel subscription is established by `useChannelEvents` (whose effect registers first, by
 * hook order); the snapshot request goes out afterwards. A delta that lands mid-fetch is therefore
 * *buffered*, not missed — and when the snapshot arrives, the buffer is replayed from the index
 * captured before the request went out, dropping everything the snapshot already reflects
 * (`seq <= snapshot.seq`). Fetch-then-subscribe loses that delta; apply-without-the-guard applies it
 * twice. Both are silent.
 *
 * ## 2. The seq guard applies to the REPLAY WINDOW only
 *
 * `seq <= snapshot.seq` is asked of exactly one set of events: those that arrived between the request
 * leaving and the response being applied. Anything that arrives afterwards is live and is applied
 * whatever its seq — because `tickSlow` stamps its deltas with the *current cursor seq*, which
 * record-only changes never advance. Two consecutive record refreshes therefore carry the SAME seq,
 * and the tempting simplification ("drop anything not newer than what I last applied") would drop
 * every record refresh after the first, leaving the gauges frozen while the view looked healthy.
 *
 * ## 3. Deltas are global; this hook is scoped
 *
 * One shared `pij` mux channel fans the same bytes to every tab, and tabs sit in different
 * workspaces, so the broadcast cannot be pre-scoped — client-side containment is a designed
 * consequence of that ruling, not a workaround.
 *
 * Membership is decided at RENDER, from the tree, and both halves of that are load-bearing:
 *
 * - **From the tree**, because `pij tree` groups by the repo family (git's common dir), while a path
 *   rule cannot: git places a worktree BESIDE its checkout, so `<repo>-worktrees/<branch>` is outside
 *   `<repo>` by path and inside it by repository. Consuming pij's grouping also cannot drift from
 *   pij, and needs no `<repo>-worktrees` naming heuristic — which would reopen the sibling-prefix
 *   leak the containment tests exist to prevent, since a sibling repo has its own git dir and is
 *   therefore structurally absent from this tree.
 * - **At render**, because a row discarded on arrival can never be reconsidered when the tree that
 *   places it lands a moment later. The hook holds the machine's fleet and shows this workspace's.
 *
 * That ordering was the bug: filtering by path on the way in destroyed worktree rows before the only
 * read that could place them was consulted, and the page rendered a confident "2 seats · governs 0
 * sections" out of 18 (voxel-flying-game, 2026-07-28). Both counts are surfaced — `filteredOut` for
 * seats held but elsewhere, `outsideRoot` for family seats outside the root — because the failure was
 * a well-formed small answer, and no reader can notice a row that was never drawn.
 * `removed` applies unconditionally — a seat leaving the global view has left this one too.
 *
 * `flow-delta` (Phase 3) rides the same channel and the same containment rule, keyed on `planDir`, but
 * counts its rejects separately: two counters because they are two claims, and the fleet's is rendered
 * as a sentence about seats. Its rejects are counted unconditionally — the flow route requires a
 * workspace, so there is no global flow set to widen to — and it faces no seq guard at all, for the
 * reason spelled out where that decision is taken.
 *
 * Read-only, like everything in this feature: three GETs and a subscription, no mutating verb, no
 * path to the CLI from the browser at all.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChannelEvents } from '../../../lib/sse/use-channel-events';
import { isFolderInWorkspacePath } from '../lib/folder-containment';
import type { FlowSummary } from '../server/flow-reader.interface';
import type { PijTreeNode } from '../server/pij-records.interface';
import type {
  FleetRow,
  FleetSnapshotData,
  FlowSnapshotData,
  PijChannelEvent,
  PijId,
  PijSnapshot,
  PijStatusRecord,
  PollerStatus,
  TreeSnapshotData,
} from '../types';
import { PIJ_CHANNEL } from '../types';

/** The one network seam. Narrower than the DOM `fetch` so a test double stays honest. */
export type FetchLike = (url: string) => Promise<Response>;

/**
 * How long to wait before re-reading the tree after a delta names a seat the tree has never seen.
 *
 * A burst of spawns should cost ONE `pij tree` call, not one per seat: the tree is a whole-forest
 * read on the far side of a process spawn, and the seats are unplaceable (but visible) meanwhile.
 */
export const TREE_REFETCH_DEBOUNCE_MS = 1_500;

/** How many `pij` channel messages the buffer retains. See the retention note at the subscription. */
export const PIJ_CHANNEL_RETENTION = 1_000;

/**
 * Which fleet to acquire.
 *
 * `global` drops the `workspace` parameter (the route's scoping is optional) AND the client-side
 * containment filter — the two must move together, or the page would ask for every seat on the
 * machine and then quietly discard the ones it did not ask about.
 */
export type FleetScope = 'workspace' | 'global';

export interface UsePijFleetOptions {
  /** The workspace's absolute filesystem PATH. Never the slug — see the module docs on scoping. */
  workspacePath: string;
  /** Defaults to `workspace`. The page's scope toggle drives this. */
  scope?: FleetScope;
  /** Test seam. Production leaves this unset and the global `fetch` is used. */
  fetchImpl?: FetchLike;
  /** Test seam for the unknown-id refetch debounce. */
  treeRefetchDebounceMs?: number;
}

/** What the page reads. Deliberately flat: the view components take values, never this hook. */
export interface UsePijFleetResult {
  /** Seats in this workspace, snapshot-then-deltas. */
  rows: FleetRow[];
  /** JC-1 cold-start records from the fleet snapshot; live deltas are consumed by `usePijStatus`. */
  statuses: PijStatusRecord[];
  status: PollerStatus | null;
  /** The highest spine seq this view reflects. */
  seq: number;
  phase: 'connecting' | 'live' | 'degraded';
  tree: PijTreeNode[];
  flows: FlowSummary[];
  /**
   * SEAT rows rejected by the containment filter since mount. The discriminator between "nothing to
   * show" and "the filter dropped everything", which is otherwise an invisible failure.
   */
  filteredOut: number;
  /**
   * Seats shown because the repo tree places them in this workspace's family, though their folder
   * sits outside the workspace root — worktrees, which git conventionally puts beside the checkout
   * rather than inside it. Rendered as a visible non-zero: the reader cannot notice seats that were
   * never drawn, and a small fleet looks exactly like a correct one.
   */
  outsideRoot: number;
  /**
   * PLAN FOLDERS rejected by the containment filter since mount. Deliberately a second counter: the
   * Fleet tab renders {@link filteredOut} as a sentence about seats, and folding plan folders into it
   * would make that sentence false at the moment a human is reading it to find a missing seat.
   */
  flowsFilteredOut: number;
  /** Per-surface load failures, rendered as designed states rather than thrown. */
  errors: { fleet: string | null; tree: string | null; flows: string | null };
  /** Re-read all three snapshots. What a tab change calls. */
  refresh: () => void;
}

type PijChannelMessage = PijChannelEvent & { channel?: string };

/** Collect every id the tree places, at any depth. Placement is the tree's job, never a name's. */
function collectTreeIds(nodes: PijTreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.id);
    if (node.children?.length) collectTreeIds(node.children, into);
  }
  return into;
}

/** Turn a non-2xx pij response into one line that keeps the `E-` code verbatim (AC-08). */
async function describeFailure(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string; code?: string };
    const message = parsed.error ?? body;
    return parsed.code ? `${parsed.code}: ${message}` : message;
  } catch {
    return `HTTP ${response.status}: ${body}`;
  }
}

export function usePijFleet(options: UsePijFleetOptions): UsePijFleetResult {
  const { workspacePath } = options;
  const scope = options.scope ?? 'workspace';
  const debounceMs = options.treeRefetchDebounceMs ?? TREE_REFETCH_DEBOUNCE_MS;
  const injectedFetch = options.fetchImpl;
  const fetchImpl = useMemo<FetchLike>(
    () => injectedFetch ?? ((url: string) => fetch(url)),
    [injectedFetch]
  );

  const [rowsById, setRowsById] = useState<Map<PijId, FleetRow>>(() => new Map());
  const [status, setStatus] = useState<PollerStatus | null>(null);
  const [statuses, setStatuses] = useState<PijStatusRecord[]>([]);
  const [seq, setSeq] = useState(0);
  const [tree, setTree] = useState<PijTreeNode[]>([]);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [treeIds, setTreeIds] = useState<Set<string>>(() => new Set());
  const [flowsFilteredOut, setFlowsFilteredOut] = useState(0);
  const [errors, setErrors] = useState<UsePijFleetResult['errors']>({
    fleet: null,
    tree: null,
    flows: null,
  });

  /*
   * Retention is capped, and the cursor is an absolute COUNT rather than an index.
   *
   * The two go together. `maxMessages` slides: past the cap the array stops growing, so an index into
   * it is never behind again, every subsequent delta is skipped, and the page keeps its "live" badge
   * while silently going static — a freeze with no error, which is the worst shape this could take.
   * Phase 2 bought its way out by disabling the cap entirely; that traded the stall for a page-lifetime
   * array, tolerable at one delta per slow loop and not at `flow-delta` rates.
   *
   * So the position is kept in a coordinate trimming cannot move: `receivedCount`, the total number of
   * messages ever delivered to this subscriber. Every position below — how far we have applied, and
   * where the replay window ends — is a count in that same coordinate, and `messages` is consulted
   * only for the tail it still holds.
   */
  const { messages, receivedCount } = useChannelEvents<PijChannelMessage>(PIJ_CHANNEL, {
    maxMessages: PIJ_CHANNEL_RETENTION,
  });
  const receivedCountRef = useRef(receivedCount);
  receivedCountRef.current = receivedCount;

  /**
   * The replay guard. `null` until the first snapshot lands — while it is null, arriving deltas are
   * left untouched in the accumulating `messages` array, which IS the buffer.
   */
  const snapshotSeqRef = useRef<number | null>(null);
  /** How many received messages we have applied. Rewound to the pre-fetch mark on every snapshot. */
  const appliedCountRef = useRef(0);
  /**
   * The end of the replay window: the received count at the instant the snapshot was applied. Events
   * before it raced the fetch and face the seq guard; events at or after it are live and do not.
   */
  const replayUntilRef = useRef(0);
  /**
   * Bumped once per applied snapshot. A plain seq cannot drive the replay effect: a refresh often
   * returns the SAME seq, React would bail out of the state update, and the deltas buffered during
   * that refetch would never be replayed.
   */
  const [snapshotToken, setSnapshotToken] = useState(0);

  const treeIdsRef = useRef<Set<string>>(new Set());
  const treeRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const loadTree = useCallback(async () => {
    // `all=1`: membership needs the DEAD seats too — see the tree scope docs. Without it a dead
    // seat in a sibling worktree is claimed by neither rung and disappears rather than being hidden.
    const query = `workspace=${encodeURIComponent(workspacePath)}&all=1`;
    try {
      const response = await fetchImpl(`/api/pij/tree?${query}`);
      if (!response.ok) {
        const failure = await describeFailure(response);
        if (mountedRef.current) setErrors((prev) => ({ ...prev, tree: failure }));
        return;
      }
      const snapshot = (await response.json()) as PijSnapshot<TreeSnapshotData>;
      if (!mountedRef.current) return;
      const ids = collectTreeIds(snapshot.data.roots);
      treeIdsRef.current = ids;
      // The ref answers "have I seen this id" inside the delta loop without re-running it; the state
      // is what makes membership RE-DERIVE when a tree read lands after the rows it places.
      setTreeIds(ids);
      setTree(snapshot.data.roots);
      setErrors((prev) => ({ ...prev, tree: null }));
    } catch (error) {
      if (mountedRef.current) setErrors((prev) => ({ ...prev, tree: String(error) }));
    }
  }, [fetchImpl, workspacePath]);

  const loadFlows = useCallback(async () => {
    const query = `workspace=${encodeURIComponent(workspacePath)}`;
    try {
      const response = await fetchImpl(`/api/pij/flow?${query}`);
      if (!response.ok) {
        const failure = await describeFailure(response);
        if (mountedRef.current) setErrors((prev) => ({ ...prev, flows: failure }));
        return;
      }
      const snapshot = (await response.json()) as PijSnapshot<FlowSnapshotData>;
      if (!mountedRef.current) return;
      setFlows(snapshot.data.flows);
      setErrors((prev) => ({ ...prev, flows: null }));
    } catch (error) {
      if (mountedRef.current) setErrors((prev) => ({ ...prev, flows: String(error) }));
    }
  }, [fetchImpl, workspacePath]);

  const loadFleet = useCallback(async () => {
    // Global scope omits the parameter entirely: the route treats an absent `workspace` as "the whole
    // fleet", which is a different question, not a looser filter.
    /*
     * ALWAYS the global read, in both scopes — and the workspace filter now happens here, on the
     * client, at render.
     *
     * The server's `?workspace=` filter is path containment, and path containment is the wrong
     * question: git places a worktree as a SIBLING of its checkout, so seats working in
     * `<repo>-worktrees/<branch>` are outside `<repo>` by path while being inside the same repo
     * family. Asking the server to pre-filter meant those rows were destroyed before the tree — the
     * only read that knows the family — was ever consulted. Measured 2026-07-28 on
     * voxel-flying-game: 18 seats in the family, 4 under the workspace root, and the page rendered a
     * confident "2 seats · governs 0 sections".
     */
    const url = '/api/pij/fleet';
    // The buffer mark, taken BEFORE the request leaves. Everything that arrives from here on is
    // replayable against whatever seq comes back — that is the whole of the race handling.
    const bufferedFrom = receivedCountRef.current;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        const failure = await describeFailure(response);
        if (!mountedRef.current) return;
        // Deliberately keep the rows we already have: a failed re-read is a stale view, and a stale
        // view labelled stale beats a blank one that implies the fleet is empty (AC-09).
        setErrors((prev) => ({ ...prev, fleet: failure }));
        snapshotSeqRef.current = snapshotSeqRef.current ?? 0;
        setSnapshotToken((token) => token + 1);
        return;
      }
      const snapshot = (await response.json()) as PijSnapshot<FleetSnapshotData>;
      if (!mountedRef.current) return;
      appliedCountRef.current = bufferedFrom;
      replayUntilRef.current = receivedCountRef.current;
      snapshotSeqRef.current = snapshot.seq;
      setRowsById(new Map(snapshot.data.rows.map((row) => [row.id, row])));
      setStatuses(snapshot.data.statuses ?? []);
      setStatus(snapshot.data.status);
      setSeq(snapshot.seq);
      setErrors((prev) => ({ ...prev, fleet: null }));
      setSnapshotToken((token) => token + 1);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrors((prev) => ({ ...prev, fleet: String(error) }));
      snapshotSeqRef.current = snapshotSeqRef.current ?? 0;
      setSnapshotToken((token) => token + 1);
    }
  }, [fetchImpl]);

  const refresh = useCallback(() => {
    void loadFleet();
    void loadTree();
    void loadFlows();
  }, [loadFleet, loadTree, loadFlows]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (treeRefetchTimerRef.current) clearTimeout(treeRefetchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void loadFleet();
    void loadTree();
    void loadFlows();
  }, [loadFleet, loadTree, loadFlows]);

  const scheduleTreeRefetch = useCallback(() => {
    if (treeRefetchTimerRef.current) clearTimeout(treeRefetchTimerRef.current);
    treeRefetchTimerRef.current = setTimeout(() => {
      treeRefetchTimerRef.current = null;
      void loadTree();
    }, debounceMs);
  }, [debounceMs, loadTree]);

  /*
   * `snapshotToken` is a REPLAY TRIGGER, not a value this effect reads. It is bumped once per applied
   * snapshot so the buffered deltas are replayed against the new `snapshotSeqRef`. Remove it from the
   * list and a delta that raced the fetch is never applied — the exact bug the race test covers.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshotToken is a replay trigger, not a read value — see the comment above
  useEffect(() => {
    // Buffer until the first snapshot has landed: `messages` accumulates on its own, so doing nothing
    // here IS the buffering.
    const snapshotSeq = snapshotSeqRef.current;
    if (snapshotSeq === null) return;
    const pendingCount = receivedCount - appliedCountRef.current;
    if (pendingCount <= 0) return;

    /*
     * `pendingCount` is what we are owed; `messages.length` is what the buffer still holds. They differ
     * only when retention trimmed an event before this effect ran, which needs more than
     * `PIJ_CHANNEL_RETENTION` messages inside a single fetch window — orders of magnitude above the
     * observed rate. Clamping loses those events rather than reading past the start of the array; the
     * snapshot that closes the window is what re-establishes the truth, so the loss is bounded and
     * self-healing rather than silent and permanent, which is what the index cursor made it.
     */
    const available = Math.min(pendingCount, messages.length);
    const firstPendingCount = receivedCount - available;
    const pending = messages.slice(messages.length - available);
    appliedCountRef.current = receivedCount;

    let flowsRejected = 0;
    let highestSeq = 0;
    let unknownId = false;
    let latestStatus: PollerStatus | null = null;
    const applicable: Array<Extract<PijChannelEvent, { type: 'fleet-delta' }>> = [];
    const applicableFlows: FlowSummary[] = [];

    for (const [offset, event] of pending.entries()) {
      if (event.type === 'poller-status') {
        latestStatus = event.status;
        continue;
      }
      if (event.type === 'flow-delta') {
        /*
         * Flow-deltas skip the replay guard entirely, and that is a decision rather than an oversight.
         *
         * The guard compares against the FLEET snapshot's seq, and the fleet snapshot says nothing
         * about which flow scans a flow-delta reflects — they are different reads on different clocks,
         * and `refreshFlows` stamps its deltas with a cursor seq that a flow file changing never moves.
         * Applying the guard here would drop live flow updates wholesale (the repeated-seq problem the
         * module docs describe), so the guard is not applicable rather than merely inconvenient.
         *
         * What that costs: a flow-delta that raced the flow fetch can re-apply a summary the snapshot
         * has already superseded. A merge by `planDir` is idempotent, so the cost is bounded to one
         * plan card briefly showing a slightly older read of itself, corrected by the next delta or
         * refresh. Losing every live update was the alternative.
         *
         * Containment is unconditional, unlike the fleet's. `/api/pij/flow` requires a workspace, so
         * this hook holds ONE workspace's plans whatever the fleet scope is; a global-scope tab has no
         * wider flow set to be widened to.
         */
        for (const flow of event.flows) {
          if (isFolderInWorkspacePath(flow.planDir, workspacePath)) applicableFlows.push(flow);
          else flowsRejected += 1;
        }
        continue;
      }
      if (event.type !== 'fleet-delta') continue;
      // The replay guard, and ONLY the replay guard: asked of events that raced the fetch, never of
      // live ones — see the module docs on repeated seqs.
      const racedTheFetch = firstPendingCount + offset < replayUntilRef.current;
      if (racedTheFetch && event.seq <= snapshotSeq) continue;
      applicable.push(event);
      highestSeq = Math.max(highestSeq, event.seq);
      for (const row of event.rows) {
        // A row the tree has not placed AND the path does not claim may still belong here — the tree
        // read is simply older than the seat. Refetching is how it gets its chance; dropping it was
        // the bug.
        if (!treeIdsRef.current.has(row.id) && isFolderInWorkspacePath(row.folder, workspacePath))
          unknownId = true;
      }
    }

    if (applicable.length > 0) {
      setRowsById((previous) => {
        const next = new Map(previous);
        for (const event of applicable) {
          for (const row of event.rows) {
            // Whole-row replacement, and UNCONDITIONAL. Storage is not the place to decide
            // membership: a row discarded here can never be reconsidered when the tree that places
            // it arrives a moment later. The hook holds the machine's fleet; the derivation below
            // decides which of it this workspace is looking at.
            next.set(row.id, row);
          }
          // Unconditional: `removed` says "gone from this view", and this view is a subset of that one.
          for (const id of event.removed) next.delete(id);
        }
        return next;
      });
    }
    if (applicableFlows.length > 0) {
      setFlows((previous) => {
        // Merge by absolute plan folder. There is no removal signal on this channel — a deleted plan
        // folder simply stops being scanned and emits nothing — so a plan the delta does not mention
        // stays exactly as it was. Deletion arrives with the next snapshot, and only there.
        const byDir = new Map(previous.map((flow) => [flow.planDir, flow]));
        for (const flow of applicableFlows) byDir.set(flow.planDir, flow);
        return [...byDir.values()];
      });
    }
    if (flowsRejected > 0) setFlowsFilteredOut((count) => count + flowsRejected);
    if (highestSeq > 0) setSeq((current) => Math.max(current, highestSeq));
    if (latestStatus) setStatus(latestStatus);
    if (unknownId) scheduleTreeRefetch();
  }, [messages, receivedCount, snapshotToken, workspacePath, scope, scheduleTreeRefetch]);

  /*
   * Membership, derived — and the TREE is the authority, not the path.
   *
   * `pij tree` scopes by the repo family (git's common dir, per dove 2026-07-28), so it already
   * answers "is this seat part of this repo" for worktrees placed anywhere, under any naming
   * convention, while a sibling repo that merely shares a prefix is structurally absent from it.
   * Consuming that grouping beats recomputing it: a second implementation drifts, and a name-based
   * rule reopens the sibling leak the containment tests exist to prevent.
   *
   * Path containment stays as the second rung, for seats too new for the current tree read.
   */
  const { rows, filteredOut, outsideRoot } = useMemo(() => {
    const held = [...rowsById.values()];
    if (scope === 'global') return { rows: held, filteredOut: 0, outsideRoot: 0 };

    const family = treeIds;
    const visible = held.filter(
      (row) => family.has(row.id) || isFolderInWorkspacePath(row.folder, workspacePath)
    );
    return {
      rows: visible,
      filteredOut: held.length - visible.length,
      // Shown BECAUSE the tree placed them, though they live outside the workspace root — the
      // worktree seats. Surfaced as a positive number because their absence is what a reader cannot
      // notice: a fleet of 2 is a perfectly plausible fleet (mastodon, 2026-07-28).
      outsideRoot: visible.filter((row) => !isFolderInWorkspacePath(row.folder, workspacePath))
        .length,
    };
  }, [rowsById, treeIds, workspacePath, scope]);

  const phase: UsePijFleetResult['phase'] =
    snapshotSeqRef.current === null
      ? 'connecting'
      : errors.fleet !== null || status === null || !status.running || status.lastError !== null
        ? 'degraded'
        : 'live';

  return {
    rows,
    statuses,
    status,
    seq,
    phase,
    tree,
    flows,
    filteredOut,
    outsideRoot,
    flowsFilteredOut,
    errors,
    refresh,
  };
}
