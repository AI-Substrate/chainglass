/**
 * Remote-view SDK contribution manifest (Plan 088 Phase 5 — T008).
 *
 * Static declaration of the palette verbs the remote-view domain publishes to the
 * USDK surface (AC-8 SDK half). Handlers are bound at registration time:
 *   - `list` / `detach` — bootstrap-safe (pure fetch + toast) → `sdk/register.ts`.
 *   - `attach` — opens the window picker via `setParams` (Workshop 001 entry), so
 *     its handler is page-level and is registered in `browser-client.tsx` (where
 *     the live `setParams` closure lives), mirroring file-browser's openRecentFeed.
 *
 * Per ADR-0013 (USDK contribution) / ADR-0009 (registerXxxSDK pattern).
 * Pattern: `041-file-browser/sdk/contribution.ts`.
 */
import type { SDKContribution } from '@chainglass/shared/sdk';
import { z } from 'zod';

export const remoteViewContribution: SDKContribution = {
  domain: 'remote-view',
  domainLabel: 'Remote View',
  commands: [
    {
      id: 'remote-view.attach',
      title: 'Attach Remote App Window',
      domain: 'remote-view',
      category: 'Remote View',
      // No args → open the window picker; a windowId attaches that window directly.
      params: z.object({ windowId: z.number().int().optional() }),
      icon: 'monitor',
    },
    {
      id: 'remote-view.list',
      title: 'List Remote App Sessions',
      domain: 'remote-view',
      category: 'Remote View',
      params: z.object({}),
      icon: 'list',
    },
    {
      id: 'remote-view.detach',
      title: 'Detach Remote App Session',
      domain: 'remote-view',
      category: 'Remote View',
      params: z.object({ sessionId: z.string() }),
      icon: 'square-x',
    },
  ],
  settings: [],
  keybindings: [],
};
