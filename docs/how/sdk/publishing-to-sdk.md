# Publishing to the USDK

How to make your domain's features discoverable through the SDK — command palette, keyboard shortcuts, and settings page.

## Quick Start

### 1. Create a contribution manifest

```typescript
// features/my-domain/sdk/contribution.ts
import { z } from 'zod';
import type { SDKContribution } from '@chainglass/shared/sdk';

export const myDomainContribution: SDKContribution = {
  domain: 'my-domain',
  domainLabel: 'My Domain',
  commands: [
    {
      id: 'my-domain.doSomething',
      title: 'Do Something',
      domain: 'my-domain',
      category: 'Actions',
      params: z.object({ target: z.string() }),
      icon: 'play',
    },
  ],
  settings: [
    {
      key: 'my-domain.autoRefresh',
      domain: 'my-domain',
      label: 'Auto Refresh',
      description: 'Automatically refresh when files change',
      schema: z.boolean().default(true),
      ui: 'toggle',
      section: 'My Domain',
    },
  ],
  keybindings: [
    { key: '$mod+Shift+KeyD', command: 'my-domain.doSomething' },
  ],
};
```

### 2. Create a register function

```typescript
// features/my-domain/sdk/register.ts
import type { IUSDK } from '@chainglass/shared/sdk';
import { myDomainContribution } from './contribution';

export function registerMyDomainSDK(sdk: IUSDK): void {
  // Contribute settings
  for (const setting of myDomainContribution.settings) {
    sdk.settings.contribute(setting);
  }

  // Register commands with handlers
  const doCmd = myDomainContribution.commands.find(
    (c) => c.id === 'my-domain.doSomething'
  )!;
  sdk.commands.register({
    ...doCmd,
    handler: async (params: unknown) => {
      const { target } = params as { target: string };
      // Your domain logic here
      sdk.toast.success(`Done: ${target}`);
    },
  });

  // Register keybindings
  for (const binding of myDomainContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
```

### 3. Wire into bootstrap

```typescript
// In sdk-bootstrap.ts
import { registerMyDomainSDK } from '@/features/my-domain/sdk/register';

// After creating the sdk instance:
registerMyDomainSDK(sdk);
```

## Key Concepts

### Bootstrap-safe vs ref-dependent commands

**Bootstrap-safe**: Commands that don't need React component refs. Register in `registerXxxSDK()` → called from `bootstrapSDK()`.

**Ref-dependent**: Commands that need React refs (e.g., focus an input, scroll a panel). Register via `useEffect` in the owning component:

```typescript
useEffect(() => {
  const reg = sdk.commands.register({
    id: 'my-domain.focusPanel',
    title: 'Focus Panel',
    domain: 'my-domain',
    params: z.object({}),
    handler: async () => {
      panelRef.current?.focus();
    },
  });
  return () => reg.dispose();
}, [sdk]);
```

### Settings types

| `ui` value | Schema type | Renders as |
|-----------|-------------|------------|
| `toggle` | `z.boolean()` | Switch |
| `select` | `z.string()` | Dropdown (needs `options`) |
| `text` | `z.string()` | Text input |
| `number` | `z.number()` | Number input |

### Keyboard shortcut format

Keys use tinykeys format: `$mod+KeyP`, `$mod+Shift+KeyK`. Chords use space separation: `$mod+KeyK $mod+KeyC`.

`$mod` maps to Ctrl on Windows/Linux, Cmd on Mac.

## ADR & Workshops

- [ADR-0013: USDK Architecture](../../adr/adr-0013-usdk-internal-sdk-architecture.md)
- [Workshop 001: SDK Surface](../../plans/047-usdk/workshops/001-sdk-surface-consumer-publisher-experience.md)
- [Workshop 002: SDK Candidates](../../plans/047-usdk/workshops/002-initial-sdk-candidates.md)
