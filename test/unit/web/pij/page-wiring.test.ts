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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PIJ_CHANNEL } from '../../../../apps/web/src/features/089-first-class-pij/types';
import { WORKSPACE_NAV_ITEMS } from '../../../../apps/web/src/lib/navigation-utils';

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
