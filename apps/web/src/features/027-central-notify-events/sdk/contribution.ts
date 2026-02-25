/**
 * Events/toast SDK contribution manifest.
 *
 * Static declaration of toast commands that the events domain
 * publishes to the USDK surface.
 *
 * DYK-P6-01: Keep IUSDK.toast as direct sonner calls (developer API).
 * toast.show command is for palette discoverability only.
 * Don't wire them together — chicken-and-egg at bootstrap.
 *
 * Per Plan 047, Phase 6, Task T002.
 */

import { z } from 'zod';

import type { SDKContribution } from '@chainglass/shared/sdk';

export const eventsContribution: SDKContribution = {
  domain: 'events',
  domainLabel: 'Events & Notifications',
  commands: [
    {
      id: 'toast.show',
      title: 'Show Toast Notification',
      domain: 'events',
      category: 'Notifications',
      params: z.object({
        message: z.string(),
        type: z.enum(['success', 'error', 'info', 'warning']).default('info'),
      }),
      icon: 'bell',
    },
    {
      id: 'toast.dismiss',
      title: 'Dismiss All Toasts',
      domain: 'events',
      category: 'Notifications',
      params: z.object({}),
      icon: 'bell-off',
    },
  ],
  settings: [],
  keybindings: [],
};
