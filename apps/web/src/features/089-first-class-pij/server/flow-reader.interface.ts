/**
 * Builder-flow reader contract — Plan 089 Phase 1 (T005).
 *
 * Bound surface = meadowlark's **Q2 safe subset** plus the Q6/Q8 absence rules, and nothing else.
 * Chainglass is registered as a named read-only consumer of exactly that surface, so anything bound
 * outside it is a change we owe them notice of:
 *
 *     schema_version, kind, slug,
 *     provenance.{branch,repo,agent,plan_id,created_at},
 *     nav.{now,next,bag},
 *     nodes[].{id,type,label,status,next,branch_of,phase,chore},
 *     events[]
 *
 * Deliberately **not** bound: `agents[]` (nothing populates it until the v2 `harness flow agent`
 * verb lands), anything in `the-flow.md` (render-only, never parsed back), and `*.legacy.*`
 * (a tombstone).
 */

/**
 * The five ruled states of a plan folder. AC-07 renders each distinctly; **none** of them is an
 * error and **none** of them is a blank.
 */
export type FlowState =
  /** `the-flow.json` present WITH `provenance` — CLI-readable, usable. */
  | 'live'
  /** Present WITHOUT `provenance` — a genuine pre-CLI flow; every verb refuses it with E308. */
  | 'legacy'
  /** No flow, but artifacts exist: worked, not tracked (predates the flow, or direct-jump). */
  | 'untracked'
  /** No flow, no artifacts: genuinely nothing started. */
  | 'not-started'
  /** Unparseable, or `nav.now` names a node that is not in `nodes[]` (the E305 shape). */
  | 'corrupt';

/** Completion is `nav.bag.status`, with the terminal node as the read-time fallback. Never files. */
export type FlowCompletion = 'active' | 'complete' | 'unknown';

/** Which rule produced `completion` — surfaced so the UI can be honest about its own basis. */
export type FlowCompletionSource = 'nav.bag.status' | 'terminal-node' | 'none';

/** A node, carried through with its status and type verbatim — the schema is unenforced on write. */
export interface FlowNode {
  id: string;
  /** OPEN: unknown types are on disk (`add-node --type wormhole` persists). Never switch exhaustively. */
  type: string;
  label?: string;
  /** OPEN: `status --to bogus` returns ok and persists. Only `'done'` ever counts as done. */
  status: string;
  next: string[];
  /** Present ⇒ this node is an EXCURSION, excluded from the rail and never counted as progress. */
  branch_of?: string;
  phase?: number;
  chore?: unknown;
  [additive: string]: unknown;
}

/** One phase on the rail. */
export interface FlowPhase {
  id: string;
  label: string;
  /** Verbatim. `assumed` and `known` are FUTURES, not progress. */
  status: string;
  /** 1-based position in the `next[]` walk. */
  order: number;
  /** True when `nav.now` is this phase, or a chore whose `branch_of` chain reaches it. */
  current: boolean;
  /**
   * Cursor entries into this node, counted from `cursor-moved` events. Label this **"phase
   * activations"** in any UI: there is no seat dimension in flow data, so calling it "coder
   * activations" would invent one.
   */
  activations: number;
  /**
   * True when the node was NOT reachable by walking `next[]` — an orphan that `rail`/`render` would
   * splice into the chain by array order, drawing an edge that does not exist. Surfaced, never
   * silently dropped, and never given a fabricated position.
   */
  offSpine: boolean;
}

/** A review, whether it sits on the spine or hangs off a phase as an excursion. */
export interface FlowReview {
  id: string;
  label: string;
  status: string;
  /** The phase this review branches off, when it is an excursion. */
  branchOf?: string;
  /** True when `branch_of` is set — in 088 ALL reviews are excursions and never reach the rail. */
  excursion: boolean;
}

/** The `provenance` keys we bind, plus the join hook. */
export interface FlowProvenance {
  branch: string | null;
  repo: string | null;
  /** A SKILL name (`the-flow`), never a seat. It will never distinguish agents. */
  agent: string | null;
  /** The designed join hook. Present or absent — never assume it is populated. */
  planId: string | null;
  createdAt: string | null;
  harnessVersion: string | null;
}

/** One plan folder's ruled state. */
export interface FlowSummary {
  /** Absolute path of the plan folder. */
  planDir: string;
  /** Its basename — `088-remote-app-view` — the convention half of the project join. */
  planFolder: string;
  state: FlowState;
  /** Human-readable basis for `legacy` and `corrupt`. Absent otherwise. */
  reason?: string;
  slug?: string;
  schemaVersion?: number;
  provenance?: FlowProvenance;
  /** `nav.now` verbatim. */
  now?: string;
  /** The owning phase of `nav.now` (itself, or one resolved up the `branch_of` chain). */
  nowPhaseId?: string;
  /** `nav.next` — ADVISORY ONLY. It fires no event and the CLI never routes. Never render as fact. */
  next?: string;
  completion: FlowCompletion;
  completionSource: FlowCompletionSource;
  phases: FlowPhase[];
  phasesDone: number;
  phasesTotal: number;
  reviews: FlowReview[];
  /** Every node, verbatim, for callers that need more than the rail. */
  nodes: FlowNode[];
  eventCount: number;
  /** `events[].length + ':' + nav.now` — the ruled cheap change signature (Finding 08). */
  signature: string;
  readAt: string;
}

export interface FlowReadOptions {
  /** Override the cursor position. Tests only; production always reads `nav.now` from the file. */
  now?: string;
}

export interface IFlowReader {
  /** Classify and read one plan folder. Never throws — every failure is a `FlowState`. */
  read(planDir: string, options?: FlowReadOptions): Promise<FlowSummary>;
  /**
   * Classify every immediate subdirectory of a plans root, sorted by folder name.
   *
   * Globbing `docs/plans/*` ourselves is mandatory: `harness flow list` only scans `.harness/flows/`
   * and **cannot see flight plans at all** (it returns `{flows: [], count: 0}` in a repo full of them).
   */
  scan(plansRoot: string): Promise<FlowSummary[]>;
}
