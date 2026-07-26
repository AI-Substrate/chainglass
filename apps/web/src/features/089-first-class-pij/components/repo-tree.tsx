/**
 * The repo tree — Plan 089 Phase 2 (T006).
 *
 * `pij tree` is a *derived* view: the CLI decides who is whose child, and re-implementing that
 * derivation outside pij is the exact failure the platform contract exists to prevent. So this
 * component draws `PijTreeNode.children` and computes nothing about structure.
 *
 * ## What it deliberately does not draw
 *
 * Tree nodes come off the wire with far more than the four fields this feature binds — the live shape
 * carries `pid`, `paneId`, `dataDir`, `eventsPath`, `harnessSessionId` and a dozen more. Only an
 * allowlist is rendered. That is stronger than "we don't display pid": there is no path from an
 * additive field the CLI grows tomorrow to the DOM, and `pid`/`paneId` in particular are forbidden
 * identity (C-03) — both recycle, and a recycled identifier silently attributes one seat's state to
 * another. `test/unit/web/pij/repo-tree.test.tsx` audits the rendered output for them.
 *
 * The 400 and 503 responses are rendered states, not blanks: "no tree" and "the tree could not be
 * read" are different facts, and only one of them is somebody's problem.
 */
'use client';

import type { PijTreeNode } from '../server/pij-records.interface';

/** The only node fields this component is allowed to put on screen. */
const RENDERED_FIELDS = ['id', 'folder', 'harness', 'unadopted', 'prime'] as const;

/** Exported for the DOM audit: the fields that must never reach the browser. */
export const NEVER_RENDERED_FIELDS = ['pid', 'paneId', 'dataDir', 'eventsPath'] as const;

function TreeNode({ node, depth }: { node: PijTreeNode; depth: number }) {
  const children = node.children ?? [];
  const isLeaf = children.length === 0;

  return (
    <li className="py-0.5">
      <details open={depth < 2} className="group">
        <summary
          className={`cursor-pointer list-none ${isLeaf ? 'marker:content-none' : ''}`}
          data-testid={`tree-node-${node.id}`}
        >
          <span className="mr-1 inline-block w-3 text-muted-foreground">{isLeaf ? '·' : '▸'}</span>
          <span className="font-mono text-xs">{node.id}</span>
          {node.prime ? (
            <span className="ml-1.5 rounded-full border border-purple-500/40 px-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
              prime
            </span>
          ) : null}
          {node.unadopted ? (
            <span className="ml-1.5 rounded-full border border-red-500/40 px-1.5 text-[10px] text-red-700 dark:text-red-400">
              unadopted
            </span>
          ) : null}
          {node.harness ? (
            <span className="ml-1.5 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
              {node.harness}
            </span>
          ) : null}
        </summary>
        {children.length > 0 ? (
          <ul className="ml-5 border-l border-border pl-3">
            {children.map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </ul>
        ) : null}
      </details>
    </li>
  );
}

export function RepoTree({
  roots,
  error,
  workspacePath,
}: {
  roots: PijTreeNode[];
  /** A formatted 400/503 from the tree route, or null. */
  error?: string | null;
  workspacePath: string;
}) {
  if (error) {
    const missingParam = error.toLowerCase().includes('missing required query parameter');
    return (
      <div
        data-testid="repo-tree-error"
        className={`rounded-lg border p-4 text-sm ${missingParam ? 'border-border bg-card' : 'border-red-500/40 bg-red-50/60 dark:bg-red-950/20'}`}
      >
        <h4 className="mb-1 font-medium">
          {missingParam ? '◌ No workspace to read' : '◎ The session tree could not be read'}
        </h4>
        <p className="text-muted-foreground">
          {missingParam
            ? 'This page needs the workspace’s filesystem path, and it did not receive one.'
            : 'The pij CLI returned an error for this repository. The forest below is unavailable — this is a read failure, not an empty repo.'}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div
        data-testid="repo-tree-empty"
        className="rounded-lg border border-border bg-card p-4 text-sm"
      >
        <h4 className="mb-1 font-medium">◌ No sessions in this repository</h4>
        <p className="text-muted-foreground">
          The session tree reports no seats rooted at{' '}
          <span className="break-all font-mono text-xs">{workspacePath}</span>. Seats in other
          repositories are not shown here by design — this view is repo-scoped.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="repo-tree">
      <p className="mb-3 text-xs text-muted-foreground">
        Repo-scoped forest, exactly as <span className="font-mono">pij tree</span> derived it —
        structure is read, never re-computed. Showing {RENDERED_FIELDS.join(' · ')}.
      </p>
      <ul className="font-mono text-xs">
        {roots.map((root) => (
          <TreeNode key={root.id} node={root} depth={0} />
        ))}
      </ul>
    </div>
  );
}
