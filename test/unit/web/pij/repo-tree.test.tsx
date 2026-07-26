/**
 * The repo tree tab — Plan 089 Phase 2 (T006).
 *
 * Test Doc:
 * - Why: the tree carries far more than this feature binds — the live nodes include `pid`, `paneId`,
 *   `dataDir`, `eventsPath` and more. C-03 forbids pid and pane id from being identity anywhere, and
 *   the cheapest enforcement is an audit of what actually reached the DOM.
 * - Contract: AC-05 (repo half), C-03, the tree route's 400/503 designed states.
 * - Usage Notes: the fixture nodes deliberately carry the forbidden fields, so the audit has
 *   something to catch. An audit over sanitised input proves nothing.
 * - Quality Contribution: the audit is written over the rendered HTML rather than over the component
 *   source, so a future field added to the renderer is caught by the same test.
 * - Worked Example: node `pij-prime-owl` has `pid: 4242` and `paneId: '%1881'`; neither appears.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  NEVER_RENDERED_FIELDS,
  RepoTree,
} from '../../../../apps/web/src/features/089-first-class-pij/components/repo-tree';
import {
  UI_LOOSE_ID,
  UI_PM_ID,
  UI_PRIME_ID,
  UI_TREE_ROOTS,
  UI_WORKER_IDS,
  UI_WORKSPACE_PATH,
} from '../../../fixtures/pij/fleet-ui';

function renderTree(props: Partial<Parameters<typeof RepoTree>[0]> = {}) {
  return render(<RepoTree roots={UI_TREE_ROOTS} workspacePath={UI_WORKSPACE_PATH} {...props} />);
}

describe('RepoTree', () => {
  it('draws the forest the CLI derived, at every depth', async () => {
    renderTree();
    for (const id of [UI_PRIME_ID, UI_PM_ID, ...UI_WORKER_IDS, UI_LOOSE_ID]) {
      expect(screen.getByTestId(`tree-node-${id}`)).toBeTruthy();
    }
  });

  it('marks prime and unadopted nodes', async () => {
    renderTree();
    expect(screen.getByTestId(`tree-node-${UI_PRIME_ID}`).textContent).toContain('prime');
    expect(screen.getByTestId(`tree-node-${UI_LOOSE_ID}`).textContent).toContain('unadopted');
  });

  it('DOM audit: no pid, pane id, data dir or events path reaches the browser (C-03)', async () => {
    const { container } = renderTree();
    const html = container.innerHTML;

    // The literal values from the fixture…
    for (const forbidden of ['4242', '4243', '%1881', '%1882', '/Users/fixture/.pij/']) {
      expect(html).not.toContain(forbidden);
    }
    // …and the field names, so a future renderer cannot print them as labels either.
    for (const field of NEVER_RENDERED_FIELDS) {
      expect(html).not.toContain(field);
    }
    // Nothing shaped like a tmux pane id, whatever its digits.
    expect(html).not.toMatch(/%\d{3,}/);
  });

  it('tolerates unknown extra fields on a node without rendering them', async () => {
    // Records evolve additively and readers must tolerate unknown fields — dove's `needs-human` is in
    // flight and will arrive on these nodes without a release of this component.
    const { container } = renderTree({
      roots: [
        {
          id: 'pij-future-seat',
          folder: UI_WORKSPACE_PATH,
          harness: 'claude',
          needsHuman: true,
          somethingNobodyHasInventedYet: { nested: 'value' },
        },
      ],
    });

    expect(screen.getByTestId('tree-node-pij-future-seat')).toBeTruthy();
    expect(container.innerHTML).not.toContain('somethingNobodyHasInventedYet');
    expect(container.innerHTML).not.toContain('needsHuman');
  });

  it('renders an empty forest as a designed state, naming the scope it read', async () => {
    renderTree({ roots: [] });
    const empty = screen.getByTestId('repo-tree-empty');
    expect(empty.textContent).toContain('No sessions in this repository');
    expect(empty.textContent).toContain(UI_WORKSPACE_PATH);
  });

  it('renders a 503 as a read failure, keeping the pij code', async () => {
    renderTree({ roots: [], error: 'E-PIJ-CLI: pij tree exited 1' });
    const failure = screen.getByTestId('repo-tree-error');
    expect(failure.textContent).toContain('could not be read');
    expect(failure.textContent).toContain('E-PIJ-CLI');
    // A read failure must never be mistaken for an empty repo.
    expect(screen.queryByTestId('repo-tree-empty')).toBeNull();
  });

  it('renders a 400 as a missing-scope state, not as a store failure', async () => {
    renderTree({ roots: [], error: 'Missing required query parameter: workspace' });
    expect(screen.getByTestId('repo-tree-error').textContent).toContain('No workspace to read');
  });
});
