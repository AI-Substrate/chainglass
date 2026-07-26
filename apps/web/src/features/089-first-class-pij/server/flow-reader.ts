/**
 * fs-backed builder-flow reader — Plan 089 Phase 1 (T005).
 *
 * READ ONLY. C-02 makes `the-flow.json` / `the-flow.md` / `.the-flow-state.json` a sole-writer fence
 * owned by the `harness flow` CLI; this module opens one file for reading and nothing else.
 *
 * The classification is deliberately ONE signal deep — `provenance` present? — because a file census
 * is the trap: 088 is missing `.the-flow-state.json` *because that is correct now*, and 088 is not
 * finished. File-set shape tells you the schema era, never the progress.
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  FlowCompletion,
  FlowCompletionSource,
  FlowNode,
  FlowPhase,
  FlowProvenance,
  FlowReadOptions,
  FlowReview,
  FlowSummary,
  IFlowReader,
} from './flow-reader.interface';

/** The one document that is state. The sibling `.md` is a render and is never parsed back. */
export const FLOW_FILE_NAME = 'the-flow.json';

/** Node type that forms the rail. Filter on TYPE — ids are not a contract (088 uses `ph1…ph6`). */
const PHASE_TYPE = 'phase';
const REVIEW_TYPE = 'review';

/** The only status that counts as progress. `assumed` and `known` are futures, not evidence. */
const DONE = 'done';

/**
 * Evidence that work happened without the flow. Deliberately specific: a directory being non-empty is
 * not work (a `.gitkeep` is not an artifact).
 */
const ARTIFACT_DIRS = ['tasks', 'reviews', 'workshops', 'validations'];
const ARTIFACT_FILE = /-plan\.md$/;

class FsFlowReader implements IFlowReader {
  async read(planDir: string, options: FlowReadOptions = {}): Promise<FlowSummary> {
    const readAt = new Date().toISOString();
    const base = {
      planDir,
      planFolder: basename(planDir),
      completion: 'unknown' as FlowCompletion,
      completionSource: 'none' as FlowCompletionSource,
      phases: [] as FlowPhase[],
      phasesDone: 0,
      phasesTotal: 0,
      reviews: [] as FlowReview[],
      nodes: [] as FlowNode[],
      eventCount: 0,
      signature: '',
      readAt,
    };

    let raw: string;
    try {
      raw = await readFile(join(planDir, FLOW_FILE_NAME), 'utf8');
    } catch {
      // No flow document (or no folder). The remaining distinction is artifacts-or-not, and it is
      // the same distinction the /builder skill itself makes at its entry paths.
      const worked = await hasArtifacts(planDir);
      return { ...base, state: worked ? 'untracked' : 'not-started' };
    }

    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      return {
        ...base,
        state: 'corrupt',
        reason: `the-flow.json failed to parse: ${(error as Error).message}`,
      };
    }

    // THE signal. Not the file set, not `.the-flow-state.json`, not `*.legacy.*`.
    const provenanceRaw = doc.provenance as Record<string, unknown> | undefined;
    if (!provenanceRaw || typeof provenanceRaw !== 'object') {
      return {
        ...base,
        state: 'legacy',
        reason:
          'no `provenance` block — predates the flow CLI; every `harness flow` verb refuses it (E308). Needs re-creating, not repairing.',
      };
    }

    const nodes = readNodes(doc.nodes);
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const nav = (doc.nav ?? {}) as Record<string, unknown>;
    const now = options.now ?? (typeof nav.now === 'string' ? nav.now : undefined);

    if (now !== undefined && !nodesById.has(now)) {
      return {
        ...base,
        state: 'corrupt',
        reason: `nav.now names "${now}", which is not in nodes[] — orient errors E305 on this rather than degrading to node: null`,
        now,
      };
    }

    const events = Array.isArray(doc.events) ? (doc.events as Record<string, unknown>[]) : [];
    const activations = countActivations(events);
    const ordered = walkSpine(nodes);
    const phases = buildPhases(ordered, activations, resolveOwningPhase(now, nodesById));
    const { completion, completionSource } = resolveCompletion(nav, ordered);

    return {
      ...base,
      state: 'live',
      slug: typeof doc.slug === 'string' ? doc.slug : undefined,
      schemaVersion: typeof doc.schema_version === 'number' ? doc.schema_version : undefined,
      provenance: readProvenance(provenanceRaw),
      now,
      nowPhaseId: resolveOwningPhase(now, nodesById),
      next: typeof nav.next === 'string' ? nav.next : undefined,
      completion,
      completionSource,
      phases,
      phasesDone: phases.filter((p) => p.status === DONE).length,
      phasesTotal: phases.length,
      reviews: buildReviews(nodes),
      nodes,
      eventCount: events.length,
      // Finding 08: events length + nav.now is a sufficient change signature, and it is free.
      signature: `${events.length}:${now ?? ''}`,
    };
  }

  async scan(plansRoot: string): Promise<FlowSummary[]> {
    let entries: string[];
    try {
      entries = (await readdir(plansRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
    return Promise.all(entries.map((name) => this.read(join(plansRoot, name))));
  }
}

export function createFlowReader(): IFlowReader {
  return new FsFlowReader();
}

/** Did work happen here without the flow being told? */
async function hasArtifacts(planDir: string): Promise<boolean> {
  try {
    const entries = await readdir(planDir, { withFileTypes: true });
    return entries.some(
      (e) =>
        (e.isDirectory() && ARTIFACT_DIRS.includes(e.name)) ||
        (e.isFile() && ARTIFACT_FILE.test(e.name))
    );
  } catch {
    return false;
  }
}

function readProvenance(raw: Record<string, unknown>): FlowProvenance {
  const str = (key: string): string | null =>
    typeof raw[key] === 'string' ? (raw[key] as string) : null;
  return {
    branch: str('branch'),
    repo: str('repo'),
    agent: str('agent'),
    planId: str('plan_id'),
    createdAt: str('created_at'),
    harnessVersion: str('harness_version'),
  };
}

/**
 * Carry nodes through verbatim. No enum validation anywhere: the schema is resolved only at `create`
 * and mutations enforce almost nothing, so invalid types and statuses are on disk right now. The
 * renderer degrades rather than drops; so do we.
 */
function readNodes(raw: unknown): FlowNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
    .filter((n) => typeof n.id === 'string')
    .map((n) => ({
      ...n,
      id: n.id as string,
      type: typeof n.type === 'string' ? n.type : 'unknown',
      status: typeof n.status === 'string' ? n.status : 'unknown',
      next: Array.isArray(n.next) ? (n.next.filter((x) => typeof x === 'string') as string[]) : [],
      branch_of: typeof n.branch_of === 'string' ? n.branch_of : undefined,
    }));
}

/** `cursor-moved` is the only transition event; `--next`, `--intent` and `nav meta set` fire none. */
function countActivations(events: Record<string, unknown>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'cursor-moved') continue;
    const to = (event.details as Record<string, unknown> | undefined)?.to;
    if (typeof to !== 'string') continue;
    counts.set(to, (counts.get(to) ?? 0) + 1);
  }
  return counts;
}

/**
 * Order the spine by walking `next[]` from its real roots.
 *
 * Never array order: 088's `nodes[]` is stored newest-first (ship, ph6, … research), so array order
 * renders the rail backwards. And an orphan node spliced in by array order draws an edge that does
 * not exist — so unreachable spine nodes are appended at the end and flagged, not woven in.
 */
function walkSpine(nodes: FlowNode[]): Array<{ node: FlowNode; offSpine: boolean }> {
  const spine = nodes.filter((n) => n.branch_of === undefined);
  const byId = new Map(spine.map((n) => [n.id, n]));

  const hasIncoming = new Set<string>();
  for (const node of spine) {
    for (const target of node.next) {
      if (byId.has(target)) hasIncoming.add(target);
    }
  }

  const ordered: Array<{ node: FlowNode; offSpine: boolean }> = [];
  const visited = new Set<string>();
  const roots = spine.filter((n) => !hasIncoming.has(n.id));

  const visit = (node: FlowNode): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    ordered.push({ node, offSpine: false });
    for (const target of node.next) {
      const child = byId.get(target);
      if (child) visit(child);
    }
  };

  // A true root (nothing points at it) that is also an orphan (points at nothing) is indistinguishable
  // from the chain head by structure alone — so chain heads are walked first, and any remaining
  // unreachable node is appended as off-spine.
  for (const root of roots.filter((n) => n.next.length > 0)) visit(root);
  for (const node of spine) {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      ordered.push({ node, offSpine: true });
    }
  }

  return ordered;
}

function buildPhases(
  ordered: Array<{ node: FlowNode; offSpine: boolean }>,
  activations: Map<string, number>,
  nowPhaseId: string | undefined
): FlowPhase[] {
  return ordered
    .filter(({ node }) => node.type === PHASE_TYPE)
    .map(({ node, offSpine }, index) => ({
      id: node.id,
      label: node.label ?? node.id,
      status: node.status,
      order: index + 1,
      current: node.id === nowPhaseId,
      activations: activations.get(node.id) ?? 0,
      offSpine,
    }));
}

/**
 * Reviews live in two places and a view must handle both: the current template puts one `review-N`
 * ON the spine, while 088's are excursions off `ph4`. Excursions never reach the rail, so a rail-only
 * count reports zero reviews for a plan that had three.
 */
function buildReviews(nodes: FlowNode[]): FlowReview[] {
  return nodes
    .filter((n) => n.type === REVIEW_TYPE)
    .map((n) => ({
      id: n.id,
      label: n.label ?? n.id,
      status: n.status,
      branchOf: n.branch_of,
      excursion: n.branch_of !== undefined,
    }));
}

/** `nav.now` may sit on an excursion; the owning phase is one or more hops up `branch_of`. */
function resolveOwningPhase(
  now: string | undefined,
  byId: Map<string, FlowNode>
): string | undefined {
  let cursor = now === undefined ? undefined : byId.get(now);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    if (cursor.type === PHASE_TYPE) return cursor.id;
    seen.add(cursor.id);
    cursor = cursor.branch_of ? byId.get(cursor.branch_of) : undefined;
  }
  return undefined;
}

/**
 * Completion is `nav.bag.status`, and when the bag is absent (some live flows predate it) the
 * terminal node's status. **Never** the file set: that is the rule that would have rendered
 * in-flight 088 as finished.
 */
function resolveCompletion(
  nav: Record<string, unknown>,
  ordered: Array<{ node: FlowNode; offSpine: boolean }>
): { completion: FlowCompletion; completionSource: FlowCompletionSource } {
  const bag = nav.bag as Record<string, unknown> | undefined;
  const bagStatus = bag && typeof bag.status === 'string' ? bag.status : undefined;
  if (bagStatus === 'complete')
    return { completion: 'complete', completionSource: 'nav.bag.status' };
  if (bagStatus !== undefined) return { completion: 'active', completionSource: 'nav.bag.status' };

  const terminal = [...ordered]
    .reverse()
    .find(({ node, offSpine }) => !offSpine && node.next.length === 0);
  if (!terminal) return { completion: 'unknown', completionSource: 'none' };
  return {
    completion: terminal.node.status === DONE ? 'complete' : 'active',
    completionSource: 'terminal-node',
  };
}
