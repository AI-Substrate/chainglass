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
 * consequence of that ruling, not a workaround. Delta rows are therefore filtered through the same
 * segment-aware containment rule the server applies to snapshots, and the number dropped is
 * *counted*: an empty view whose cause is "the filter rejected everything" must be distinguishable
 * from "there is nothing here", or a scope-key mismatch reads as an honest empty fleet.
 * `removed` applies unconditionally — a seat leaving the global view has left this one too.
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
  status: PollerStatus | null;
  /** The highest spine seq this view reflects. */
  seq: number;
  phase: 'connecting' | 'live' | 'degraded';
  tree: PijTreeNode[];
  flows: FlowSummary[];
  /**
   * Delta rows rejected by the containment filter since mount. The discriminator between "nothing to
   * show" and "the filter dropped everything", which is otherwise an invisible failure.
   */
  filteredOut: number;
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
  const [seq, setSeq] = useState(0);
  const [tree, setTree] = useState<PijTreeNode[]>([]);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [filteredOut, setFilteredOut] = useState(0);
  const [errors, setErrors] = useState<UsePijFleetResult['errors']>({
    fleet: null,
    tree: null,
    flows: null,
  });

  /*
   * `maxMessages: 0` — unbounded, and load-bearing rather than greedy.
   *
   * The default retention is 1000 messages and it SLIDES: past the cap the array stops growing while
   * `appliedIndexRef` sits at the same number, so `appliedIndexRef.current >= messages.length` is true
   * forever and every subsequent delta is skipped. The page keeps its "live" badge and silently stops
   * updating — a freeze with no error, which is the worst shape this could take.
   *
   * The cost is a page-lifetime array of applied events. Phase 2 volume is one delta per slow loop, so
   * this is small; Phase 3's `flow-delta` raises it, and a cursor that survives trimming (an absolute
   * message counter rather than an index into a sliding array) is the fix to make there.
   */
  const { messages } = useChannelEvents<PijChannelMessage>(PIJ_CHANNEL, { maxMessages: 0 });
  const messagesRef = useRef<PijChannelMessage[]>(messages);
  messagesRef.current = messages;

  /**
   * The replay guard. `null` until the first snapshot lands — while it is null, arriving deltas are
   * left untouched in the accumulating `messages` array, which IS the buffer.
   */
  const snapshotSeqRef = useRef<number | null>(null);
  /** How far into `messages` we have applied. Rewound to the pre-fetch mark on every snapshot. */
  const appliedIndexRef = useRef(0);
  /**
   * The end of the replay window: the message count at the instant the snapshot was applied. Events
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
    const query = `workspace=${encodeURIComponent(workspacePath)}`;
    try {
      const response = await fetchImpl(`/api/pij/tree?${query}`);
      if (!response.ok) {
        const failure = await describeFailure(response);
        if (mountedRef.current) setErrors((prev) => ({ ...prev, tree: failure }));
        return;
      }
      const snapshot = (await response.json()) as PijSnapshot<TreeSnapshotData>;
      if (!mountedRef.current) return;
      treeIdsRef.current = collectTreeIds(snapshot.data.roots);
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
    const url =
      scope === 'global'
        ? '/api/pij/fleet'
        : `/api/pij/fleet?workspace=${encodeURIComponent(workspacePath)}`;
    // The buffer mark, taken BEFORE the request leaves. Everything that arrives from here on is
    // replayable against whatever seq comes back — that is the whole of the race handling.
    const bufferedFrom = messagesRef.current.length;
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
      appliedIndexRef.current = bufferedFrom;
      replayUntilRef.current = messagesRef.current.length;
      snapshotSeqRef.current = snapshot.seq;
      setRowsById(new Map(snapshot.data.rows.map((row) => [row.id, row])));
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
  }, [fetchImpl, workspacePath, scope]);

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
    if (appliedIndexRef.current >= messages.length) return;

    const firstPendingIndex = appliedIndexRef.current;
    const pending = messages.slice(firstPendingIndex);
    appliedIndexRef.current = messages.length;

    // In global scope every row belongs by definition: there is no workspace to be outside of.
    const belongsHere = (folder: string): boolean =>
      scope === 'global' || isFolderInWorkspacePath(folder, workspacePath);

    let rejected = 0;
    let highestSeq = 0;
    let unknownId = false;
    let latestStatus: PollerStatus | null = null;
    const applicable: Array<Extract<PijChannelEvent, { type: 'fleet-delta' }>> = [];

    for (const [offset, event] of pending.entries()) {
      if (event.type === 'poller-status') {
        latestStatus = event.status;
        continue;
      }
      if (event.type !== 'fleet-delta') continue;
      // The replay guard, and ONLY the replay guard: asked of events that raced the fetch, never of
      // live ones — see the module docs on repeated seqs.
      const racedTheFetch = firstPendingIndex + offset < replayUntilRef.current;
      if (racedTheFetch && event.seq <= snapshotSeq) continue;
      applicable.push(event);
      highestSeq = Math.max(highestSeq, event.seq);
      for (const row of event.rows) {
        if (!belongsHere(row.folder)) rejected += 1;
        else if (!treeIdsRef.current.has(row.id)) unknownId = true;
      }
    }

    if (applicable.length > 0) {
      setRowsById((previous) => {
        const next = new Map(previous);
        for (const event of applicable) {
          for (const row of event.rows) {
            // Whole-row replacement. There is no field-level merge anywhere in this hook, which is
            // what makes "never re-derive a value" (AC-03) structurally true rather than promised.
            if (belongsHere(row.folder)) next.set(row.id, row);
          }
          // Unconditional: `removed` says "gone from this view", and this view is a subset of that one.
          for (const id of event.removed) next.delete(id);
        }
        return next;
      });
    }
    if (rejected > 0) setFilteredOut((count) => count + rejected);
    if (highestSeq > 0) setSeq((current) => Math.max(current, highestSeq));
    if (latestStatus) setStatus(latestStatus);
    if (unknownId) scheduleTreeRefetch();
  }, [messages, snapshotToken, workspacePath, scope, scheduleTreeRefetch]);

  const rows = useMemo(() => [...rowsById.values()], [rowsById]);

  const phase: UsePijFleetResult['phase'] =
    snapshotSeqRef.current === null
      ? 'connecting'
      : errors.fleet !== null || status === null || !status.running || status.lastError !== null
        ? 'degraded'
        : 'live';

  return { rows, status, seq, phase, tree, flows, filteredOut, errors, refresh };
}
