/**
 * pij record reader contract — Plan 089 Phase 1 (T004).
 *
 * Finding 01: the spine is bound **by file**; records are read **through the CLI**. That is not a
 * preference — `pij-platform.md` § Path stability rules individual record paths unstable (the
 * two-tier registry renames records between `~/.pij/` and `~/.pij/archive/` on a 48h TTL, and 1,988
 * of ~2,184 seats currently live in `archive/`), while explicitly keeping the *schema* stable. Read
 * derived views through the CLI, because "re-implementing pij's derivation logic outside pij is the
 * failure this document exists to prevent".
 *
 * Every shape here is **open**: an index signature keeps additive fields alive, because records
 * evolve additively and readers "must tolerate unknown fields" (dove's `needs-human` field is in
 * flight as of 2026-07-26 and is expected to arrive mid-build).
 */

/**
 * The one process-spawning seam. `execFile`-shaped on purpose: a command plus a **fixed argv array**,
 * never a shell string — pij ids are arbitrary strings and a shell would make them an injection
 * vector.
 */
export type PijExecutor = (
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs: number }
) => Promise<string>;

/** One row of `pij list --json` (live shape measured 2026-07-26; 177 rows, ~135KB). */
export interface PijListRow {
  id: string;
  /** The workspace join key: the seat's working directory. */
  folder: string;
  dataDir?: string;
  /** Present, but NEVER an identity — pids recycle (C-03). */
  pid?: number | null;
  /** The daemon's mechanical verdict. */
  state?: string;
  activity?: string;
  liveness?: string;
  /** The freshness axis. Has no spine event, so it rides the slow loop (C-10). */
  lastEventAt?: string | null;
  /** Pinned until observed — render provenance, never as fact (C-05). */
  boundModel?: string | null;
  boundProvider?: string | null;
  effort?: string | null;
  failureReason?: string | null;
  bindHealth?: string;
  degraded?: boolean;
  terminal?: unknown;
  watchdog?: unknown;
  prime?: boolean;
  oldPrime?: boolean;
  /**
   * JC-2 role, as pij emits it. Deliberately open: `prime | pm | worker | pa` are the values ratified
   * so far, and a value outside that set is a vocabulary gap this consumer must be able to SAY, not
   * an excuse to assert `null`. Classification lives in `readSeatRole`.
   */
  orchestrationRole?: string | null;
  /** Ruled derivation (adoption axis) — consumed, never recomputed. */
  unadopted?: boolean;
  [additive: string]: unknown;
}

/**
 * How a tree read is scoped. Exactly one of the two, never both and never neither.
 *
 * Modelled as a union rather than an optional flag because the two reads answer different questions
 * and a caller that supplies neither would silently get the *server's own repo* — the trap this
 * module's `cwd` discipline exists to close, pointing the other way.
 */
/**
 * `all: true` adds `--all`, which includes seats the default read omits — dead ones.
 *
 * It matters for MEMBERSHIP, not for decoration: the default tree carries only living seats, so a
 * dead seat working in a sibling worktree is claimed by neither the tree (absent) nor path
 * containment (outside the root) and disappears from the workspace entirely. Measured on
 * voxel-flying-game 2026-07-28: 18 seats in the family, 4 of them dead-in-a-worktree, and those 4
 * were invisible — not hidden with a count, invisible.
 */
export type PijTreeScope = ({ cwd: string } | { global: true }) & { all?: boolean };

/** A node of `pij tree --json`. Repo-scoped from cwd — 7KB here vs ~100KB global. */
export interface PijTreeNode {
  id: string;
  folder?: string;
  harness?: string;
  /** Present-when-true on tree nodes (adoption axis). */
  unadopted?: boolean;
  prime?: boolean;
  /**
   * JC-2 role, as pij emits it. Deliberately open: `prime | pm | worker | pa` are the values ratified
   * so far, and a value outside that set is a vocabulary gap this consumer must be able to SAY, not
   * an excuse to assert `null`. Classification lives in `readSeatRole`.
   */
  orchestrationRole?: string | null;
  children?: PijTreeNode[];
  [additive: string]: unknown;
}

export interface PijTree {
  roots: PijTreeNode[];
  [additive: string]: unknown;
}

/** `pij node show <id> --json` — the node card's record. */
export interface PijNodeDetail {
  id: string;
  harness?: string;
  lifecycle?: string;
  parent?: string | null;
  spawnedBy?: string | null;
  /** Daemon-computed only. */
  systemState?: string | null;
  /** Externally owned; the daemon never clobbers it. */
  semanticState?: string | null;
  /**
   * The ruled worst-first badge across BOTH vocabularies. **Consumed verbatim, never re-derived**
   * (AC-03) — a local recomputation drifts from pij exactly when an open assignment carries the
   * worse state, i.e. exactly when the badge matters.
   */
  badge?: string;
  currentAssignment?: string | null;
  currentTask?: string | null;
  assignments?: unknown[];
  /** Present in the record; never rendered as identity (C-03). */
  paneId?: string;
  /** tmux window; the ONLY sanctioned focus mechanism, and only on a human click (C-06, Phase 4). */
  windowId?: string;
  /**
   * The seat's working directory — and the focus route's containment key.
   *
   * **Note the name.** `pij list` rows call this `folder`; `node show` calls it `cwd`, and carries no
   * `folder` key at all (verified live 2026-07-26 against the full key set). The values agree; the
   * names do not. A containment check written against `detail.folder` reads `undefined`, and
   * `undefined` fails containment for every seat — a focus button that always refuses, for a reason
   * that looks like a policy decision.
   */
  cwd?: string;
  /**
   * The daemon's liveness observation. Phase 4 reads it to refuse focusing a seat that is not there.
   * ABSENT is its own case: it means not observable, and must never be inferred from `lastEventAt`.
   */
  liveness?: string;
  /** The freshness axis, echoed in the not-live refusal so the human sees what was observed and when. */
  lastEventAt?: string | null;
  boundModel?: string | null;
  effort?: string | null;
  contextMax?: number | null;
  /** A real token count or the literal `"unknown"` — never an estimate (C-05). */
  contextCurrent?: { value: number | 'unknown'; asOf?: string; provenance?: string } | null;
  [additive: string]: unknown;
}

/** `pij state <id> --json` — the declared-state report. */
export interface PijStateReport {
  [additive: string]: unknown;
}

export interface PijReadOptions {
  /**
   * The workspace to scope this call to. Bare `pij` calls scope to the process cwd — for a Next.js
   * server that is the chainglass repo, so an omitted cwd returns a *plausible wrong answer*.
   */
  cwd?: string;
}

/** Read-only access to pij records. There is deliberately no mutating method (C-01, C-02). */
export interface IPijRecords {
  /**
   * ONE global list — the acquisition model ruled in F-13. Workspace scoping is a server-side filter
   * on `folder`, not a second CLI call.
   */
  list(options?: PijReadOptions): Promise<PijListRow[]>;
  /**
   * The session forest, at one of two scopes. `{ cwd }` is the repo-scoped read (~7KB);
   * `{ global: true }` is the whole machine (~63KB, 30 roots / 52 nodes measured 2026-07-26). The
   * scope is REQUIRED either way: the whole point of the call is which forest it returns.
   */
  tree(options: PijTreeScope): Promise<PijTree>;
  nodeShow(id: string, options?: PijReadOptions): Promise<PijNodeDetail>;
  state(id: string, options?: PijReadOptions): Promise<PijStateReport>;
  /**
   * Escape hatch for a read verb this interface has not modelled yet. Still allowlist-checked — it
   * cannot be used to reach a mutating verb.
   */
  raw(args: readonly string[], options?: PijReadOptions): Promise<unknown>;
}
