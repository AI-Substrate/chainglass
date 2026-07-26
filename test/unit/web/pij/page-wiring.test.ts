/**
 * The wiring — Plan 089 Phase 2 (T001).
 *
 * Test Doc:
 * - Why: two one-line edits in app-shell files carry the whole page. If `'pij'` is missing from the
 *   layout's channel list, `useChannelEvents('pij', …)` subscribes to a channel the provider never
 *   asked the server for and receives NOTHING — no error, no warning, no reconnect, just a page that
 *   is permanently as fresh as its first snapshot. That is the single most silent failure in this
 *   phase, and it is one deleted array entry away at all times.
 * - Contract: T001; ADR-0015 (the mux is the one consumption path).
 * - Usage Notes: asserted over the source text rather than by rendering the layout, which would need
 *   a container, a workspace service and a session. The string is the contract here.
 * - Quality Contribution: converts "remember to add the channel" into a failing test.
 * - Worked Example: layout lists 'pij'; the nav row points at /pij; the page passes a PATH.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIJ_CHANNEL } from '../../../../apps/web/src/features/089-first-class-pij/types';
import {
  GLOBAL_NAV_ITEMS,
  WORKSPACE_NAV_ITEMS,
} from '../../../../apps/web/src/lib/navigation-utils';

const REPO_ROOT = join(import.meta.dirname, '../../../..');

async function source(path: string): Promise<string> {
  return readFile(join(REPO_ROOT, path), 'utf8');
}

describe('pij page wiring', () => {
  it('subscribes the workspace layout to the pij channel', async () => {
    const layout = await source('apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx');
    const channelList = /WORKSPACE_SSE_CHANNELS\s*=\s*\[([\s\S]*?)\]/.exec(layout)?.[1] ?? '';

    expect(channelList).toContain(`'${PIJ_CHANNEL}'`);
  });

  it('keeps the channel list inside the mux ceiling', async () => {
    // MAX_CHANNELS is 20; this adds the 7th. Asserted so a future phase adding channels has to look.
    const layout = await source('apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx');
    const channelList = /WORKSPACE_SSE_CHANNELS\s*=\s*\[([\s\S]*?)\]/.exec(layout)?.[1] ?? '';
    // Comments inside the array name channels too (the `pij` entry documents itself) — strip them,
    // or the count measures the prose rather than the subscription.
    const channels = channelList.replace(/\/\/.*$/gm, '').match(/'[a-z-]+'/g) ?? [];

    expect(channels.length).toBeLessThanOrEqual(20);
    expect(channels.length).toBe(7);
  });

  it('adds exactly one workspace nav row, pointing at the page', async () => {
    const pij = WORKSPACE_NAV_ITEMS.filter((item) => item.href === '/pij');

    expect(pij).toHaveLength(1);
    expect(pij[0].id).toBe('pij');
    expect(pij[0].label).toBe('Fleet');
  });

  it('leaves the other workspace nav rows untouched', async () => {
    expect(WORKSPACE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'browser',
      'work-units',
      'workflows',
      'terminal',
      'pij',
    ]);
  });

  it('hands the client shell a filesystem PATH, never the slug', async () => {
    // The mistake this asserts against does not throw: a slug in the `workspace` parameter returns a
    // plausible wrong answer — an empty fleet, or this repo's own tree labelled as another workspace.
    const page = await source('apps/web/app/(dashboard)/workspaces/[slug]/pij/page.tsx');

    expect(page).toMatch(/workspacePath=\{workspacePath\}/);
    expect(page).toMatch(/toJSON\(\)\.path/);
    // The one thing that must never appear: the slug being passed as the scoping key.
    expect(page).not.toMatch(/workspacePath=\{slug\}/);
  });

  it('renders a designed state when the workspace has no path at all', async () => {
    const page = await source('apps/web/app/(dashboard)/workspaces/[slug]/pij/page.tsx');
    expect(page).toContain('No filesystem path is recorded');
  });
});

describe('pij overlay wiring — Phase 4 (T003)', () => {
  it('composes the overlay INSIDE the SSE provider, where the channel exists', async () => {
    /*
    Test Doc:
    - Why: the panel's fleet list is live. Mounted outside `MultiplexedSSEProvider` it would render
      a snapshot and then never move again — no error, no warning, the same silent staleness the
      channel-list test above guards against, arriving by a different route.
    - Contract: `PijOverlayWrapper` appears after `MultiplexedSSEProvider` opens and before it closes.
    - Usage Notes: asserted over the source text; rendering the layout needs a container, a workspace
      service and a session.
    - Quality Contribution: makes the nesting — which reads as an arbitrary choice — a checked one.
    - Worked Example: index of the wrapper falls inside the provider's span.
    */
    const layout = await source('apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx');

    const providerOpen = layout.indexOf('<MultiplexedSSEProvider');
    const providerClose = layout.indexOf('</MultiplexedSSEProvider>');
    const wrapper = layout.indexOf('<PijOverlayWrapper');

    expect(providerOpen).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(providerOpen);
    expect(wrapper).toBeLessThan(providerClose);
  });

  it('adds exactly one button to the sidebar, using the established CustomEvent seam', async () => {
    /*
    Test Doc:
    - Why: `dashboard-sidebar.tsx` is shared app-shell furniture and this phase's touch is sanctioned
      for exactly one element. "Exactly one" is the kind of constraint that erodes silently.
    - Contract: one `pij:toggle` dispatch in the sidebar, and no direct import of the pij feature —
      the sidebar sits outside the overlay providers, so the event is the only legitimate route.
    - Usage Notes: counts dispatch sites rather than reading the JSX shape.
    - Quality Contribution: keeps a sanctioned exception from becoming a habit.
    - Worked Example: one dispatch, zero feature imports.
    */
    const sidebar = await source('apps/web/src/components/dashboard-sidebar.tsx');

    expect([...sidebar.matchAll(/pij:toggle/g)]).toHaveLength(1);
    expect(sidebar).not.toMatch(/from '@\/features\/089-first-class-pij/);
  });

  it('registers the domain with the SDK exactly once, statically', async () => {
    /*
    Test Doc:
    - Why: ADR-0009. The tinykeys map is built ONCE at mount, so a keybinding registered any later is
      simply never seen — and the failure is a shortcut that silently does nothing.
    - Contract: one import and one call in `registerAllDomains`.
    - Usage Notes: the static manifest is asserted separately below.
    - Quality Contribution: pins the one wiring line the whole command + keybinding surface hangs on.
    - Worked Example: `registerPijSDK(sdk);` appears once.
    */
    const registrations = await source('apps/web/src/app-composition/sdk-domain-registrations.ts');

    expect([...registrations.matchAll(/registerPijSDK\(sdk\)/g)]).toHaveLength(1);
    expect(registrations).toContain("from '@/features/089-first-class-pij/sdk/register'");
  });

  it('claims a keybinding no other contribution already holds', async () => {
    /*
    Test Doc:
    - Why: a duplicate keybinding does not error — the two commands simply fight, and which one wins
      depends on registration order. `$mod+Shift+KeyF` was verified free before being claimed; this
      keeps it that way as other domains land.
    - Contract: exactly one contribution in the repo declares this key.
    - Usage Notes: reads every `sdk/contribution.ts` rather than trusting the survey done once.
    - Quality Contribution: turns a point-in-time check into a standing one.
    - Worked Example: one declaration, in the pij contribution.
    */
    const contributions = await readdir(join(REPO_ROOT, 'apps/web/src/features'), {
      recursive: true,
    });
    const files = contributions.filter((name) => String(name).endsWith('sdk/contribution.ts'));
    expect(files.length).toBeGreaterThanOrEqual(4);

    const holders: string[] = [];
    for (const file of files) {
      const code = await source(join('apps/web/src/features', String(file)));
      if (code.includes('$mod+Shift+KeyF')) holders.push(String(file));
    }

    expect(holders).toEqual(['089-first-class-pij/sdk/contribution.ts']);
  });
});

describe('global page wiring — Phase 4 (T005)', () => {
  it('adds exactly one machine-wide nav entry, in its own group above Dev', async () => {
    /*
    Test Doc:
    - Why: the sidebar had no top-level slot — `WORKSPACE_NAV_ITEMS` renders under a `:slug` and the
      Dev group is for demos. Putting the global fleet in Dev would file a product surface as a
      prototype; adding it to the workspace list would scope a machine-wide page to one repo.
    - Contract: one `GLOBAL_NAV_ITEMS` entry pointing at `/pij`, rendered before the Dev group.
    - Usage Notes: order is asserted by source index, since both groups are plain JSX.
    - Quality Contribution: keeps this phase's second sanctioned sidebar edit to exactly one element,
      in the right place.
    - Worked Example: one entry; GLOBAL_NAV_ITEMS appears before DEV_NAV_ITEMS in the sidebar.
    */
    expect(GLOBAL_NAV_ITEMS).toHaveLength(1);
    expect(GLOBAL_NAV_ITEMS[0].href).toBe('/pij');

    const sidebar = await source('apps/web/src/components/dashboard-sidebar.tsx');
    const globalAt = sidebar.indexOf('GLOBAL_NAV_ITEMS.map');
    const devAt = sidebar.indexOf('DEV_NAV_ITEMS.map');
    expect(globalAt).toBeGreaterThan(-1);
    expect(devAt).toBeGreaterThan(-1);
    expect(globalAt).toBeLessThan(devAt);
  });

  it('keeps the workspace-scoped nav rows exactly as they were', async () => {
    /*
    Test Doc:
    - Why: the new group must be additive. A machine-wide entry appearing in the workspace list would
      render a global page under a slug that does not scope it.
    - Contract: WORKSPACE_NAV_ITEMS is unchanged, and its `/pij` row is still the workspace one.
    - Usage Notes: guards the Phase 2 nav row against this phase's edit.
    - Quality Contribution: proves "additive" rather than asserting it.
    - Worked Example: five workspace rows, ids unchanged.
    */
    expect(WORKSPACE_NAV_ITEMS.map((item) => item.id)).toEqual([
      'browser',
      'work-units',
      'workflows',
      'terminal',
      'pij',
    ]);
    expect(GLOBAL_NAV_ITEMS.map((item) => item.id)).not.toContain('pij');
  });

  it('places the global page OUTSIDE the workspace layout, with no SSE provider', async () => {
    /*
    Test Doc:
    - Why: this is the whole reason the page is snapshot-only. Inside `workspaces/[slug]/` it would
      inherit `MultiplexedSSEProvider` and a workspace scope, and would stop being a machine-wide
      view. Outside it, there is no `pij` channel — which the page must state rather than hide.
    - Contract: the route file lives at `app/(dashboard)/pij/`, not under `[slug]`, and mounts no
      provider; the client says the page does not update itself.
    - Usage Notes: asserted over source text — rendering needs a container and a session.
    - Quality Contribution: pins the structural decision the honesty of the page rests on.
    - Worked Example: no MultiplexedSSEProvider in either file; the disclosure string present.
    */
    const page = await source('apps/web/app/(dashboard)/pij/page.tsx');
    const client = await source(
      'apps/web/src/features/089-first-class-pij/components/pij-global-client.tsx'
    );

    // The JSX usage, not the word: both files explain in prose WHY the provider is absent, and a
    // bare string match would fail on the explanation instead of on the mistake.
    expect(page).not.toMatch(/<MultiplexedSSEProvider/);
    expect(client).not.toMatch(/<MultiplexedSSEProvider/);
    expect(client).not.toMatch(/useChannelEvents\(/);
    expect(client).toContain('does not update itself');
  });
});
