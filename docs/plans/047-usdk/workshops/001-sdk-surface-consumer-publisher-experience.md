# Workshop: SDK Surface — Consumer & Publisher Experience

**Type**: API Contract / Integration Pattern
**Plan**: 047-usdk
**Research**: [research-dossier.md](../research-dossier.md)
**External Research**: [vscode-extension-api.md](../external-research/vscode-extension-api.md), [keyboard-shortcuts-react.md](../external-research/keyboard-shortcuts-react.md)
**Created**: 2026-02-24
**Status**: Draft

**Related Documents**:
- [Domain Registry](../../domains/registry.md)
- [Domain Map](../../domains/domain-map.md)
- [File Path Utility Bar Workshop](../041-file-browser/workshops/file-path-utility-bar.md)
- [Workspace Preferences Data Model Workshop](../041-file-browser/workshops/workspace-preferences-data-model.md)
- [ADR-0004: DI Container Architecture](../../adr/adr-0004-dependency-injection-container-architecture.md)
- [ADR-0009: Module Registration Pattern](../../adr/adr-0009-module-registration-function-pattern.md)

**Domain Context**:
- **Primary Domain**: `_platform/sdk` (new — the USDK itself)
- **Related Domains**: All existing domains publish to and consume from the SDK

---

## Purpose

Define the developer experience of the USDK from two perspectives: **consuming** SDK features (calling commands, reading settings, binding shortcuts) and **publishing** to the SDK (registering commands, contributing settings, declaring keybindings). This workshop produces concrete TypeScript interfaces, usage patterns, and worked examples that a developer keeps open during implementation.

## Key Questions Addressed

- What does it look like to call an SDK command from a React component?
- What does it look like to register a command from a domain?
- How do settings get contributed, read, written, and observed?
- How does the command palette discover and execute commands?
- How do keyboard shortcuts bind to commands?
- Where does the SDK layer sit relative to DI, server actions, and React context?
- How do we test SDK consumers and publishers?

---

## 1. Overview: The Two Sides of the SDK

The USDK has exactly two developer-facing surfaces:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USDK Surface                                │
│                                                                     │
│   ┌──────────────────────────┐    ┌──────────────────────────────┐  │
│   │   PUBLISH (Domain Side)  │    │   CONSUME (User Side)        │  │
│   │                          │    │                              │  │
│   │   sdk.commands.register  │    │   sdk.commands.execute       │  │
│   │   sdk.settings.contribute│    │   sdk.settings.get / set     │  │
│   │   sdk.keybindings.bind   │    │   sdk.keybindings.list       │  │
│   │   sdk.context.set        │    │   Command Palette (> prefix) │  │
│   │                          │    │   Keyboard Shortcuts         │  │
│   │   Called during domain   │    │   Settings Page UI           │  │
│   │   bootstrap              │    │                              │  │
│   └──────────────────────────┘    └──────────────────────────────┘  │
│                                                                     │
│   Underlying: Command Registry · Settings Store · Keybinding        │
│   Resolver · Context Key Service                                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Principle**: Domains publish at bootstrap time. Users consume at runtime. The SDK is the middleman.

---

## 2. Core Types

### 2.1 SDK Command

```typescript
import { z } from 'zod';

/**
 * A command registered by a domain.
 * Commands are the atomic unit of SDK functionality.
 */
interface SDKCommand<TParams extends z.ZodType = z.ZodType> {
  /** Unique ID: 'domain.verb' or 'domain.noun.verb' */
  id: string;

  /** Human-readable title shown in command palette */
  title: string;

  /** Domain that owns this command */
  domain: string;

  /** Optional grouping for palette display */
  category?: string;

  /** Zod schema for parameters. z.void() for no params */
  params: TParams;

  /** The handler. Receives validated params */
  handler: (params: z.infer<TParams>) => Promise<void>;

  /** When-clause: command only available when this evaluates true */
  when?: string;

  /** Icon for palette display (Lucide icon name) */
  icon?: string;
}
```

### 2.2 SDK Setting

```typescript
/**
 * A setting contributed by a domain.
 * Settings are typed, validated, and observable.
 */
interface SDKSetting<T extends z.ZodType = z.ZodType> {
  /** Unique key: 'domain.settingName' */
  key: string;

  /** Domain that owns this setting */
  domain: string;

  /** Human-readable label for settings UI */
  label: string;

  /** Longer description for settings UI */
  description: string;

  /** Zod schema with .default() for the default value */
  schema: T;

  /** UI hint for settings page rendering */
  ui?: 'toggle' | 'select' | 'text' | 'number' | 'color' | 'emoji';

  /** Options for 'select' ui type */
  options?: Array<{ value: string; label: string }>;

  /** Settings page section path: 'Appearance' or 'Appearance > Colors' */
  section?: string;
}
```

### 2.3 SDK Keybinding

```typescript
/**
 * A keyboard shortcut bound to a command.
 * Supports single keys (ctrl+p) and chords (ctrl+k ctrl+c).
 */
interface SDKKeybinding {
  /** Key combination: 'ctrl+shift+p' or 'ctrl+k ctrl+c' (chord) */
  key: string;

  /** Command ID to execute */
  command: string;

  /** When-clause: binding only active when this evaluates true */
  when?: string;

  /** Arguments to pass to command */
  args?: Record<string, unknown>;
}
```

### 2.4 SDK Contribution (Static Manifest)

```typescript
/**
 * A domain's complete SDK contribution.
 * Declared statically. Handlers bound at registration time.
 */
interface SDKContribution {
  /** Domain identifier */
  domain: string;

  /** Human-readable domain name for settings grouping */
  domainLabel: string;

  /** Commands this domain contributes */
  commands: Omit<SDKCommand, 'handler'>[];

  /** Settings this domain contributes */
  settings: SDKSetting[];

  /** Default keybindings for this domain's commands */
  keybindings: SDKKeybinding[];
}
```

---

## 3. The Publisher Experience

### 3.1 Domain Self-Registration Pattern

Every domain that publishes to the SDK exports two things:

1. **A static contribution** (types, schemas, metadata — no runtime code)
2. **A registration function** (binds handlers — follows ADR-0009)

```
packages/
└── shared/
    └── src/
        └── sdk/
            ├── types.ts           # SDKCommand, SDKSetting, SDKKeybinding
            ├── registry.ts        # ICommandRegistry, ISettingsStore interfaces
            └── tokens.ts          # SDK_DI_TOKENS

apps/web/
└── src/
    └── features/
        └── 041-file-browser/
            ├── sdk/
            │   ├── contribution.ts    # Static manifest
            │   └── register.ts        # Handler binding
            └── index.ts               # Re-exports SDK registration
```

### 3.2 Worked Example: File Browser Publishes Commands

**Step 1: Declare the static contribution**

```typescript
// apps/web/src/features/041-file-browser/sdk/contribution.ts
import { z } from 'zod';
import type { SDKContribution } from '@chainglass/shared/sdk/types';

export const fileBrowserContribution: SDKContribution = {
  domain: 'file-browser',
  domainLabel: 'File Browser',

  commands: [
    {
      id: 'file-browser.openFile',
      title: 'Go to File',
      domain: 'file-browser',
      category: 'File',
      params: z.object({ path: z.string() }),
      icon: 'FileText',
    },
    {
      id: 'file-browser.openFileAtLine',
      title: 'Go to File and Line',
      domain: 'file-browser',
      category: 'File',
      params: z.object({
        path: z.string(),
        line: z.number().int().positive(),
      }),
      icon: 'FileCode',
    },
    {
      id: 'file-browser.copyPath',
      title: 'Copy File Path',
      domain: 'file-browser',
      category: 'File',
      params: z.object({ path: z.string() }),
      when: 'file-browser.hasOpenFile',
    },
  ],

  settings: [
    {
      key: 'file-browser.showHiddenFiles',
      domain: 'file-browser',
      label: 'Show Hidden Files',
      description: 'Display files and directories starting with a dot in the file tree',
      schema: z.boolean().default(false),
      ui: 'toggle',
      section: 'File Browser',
    },
    {
      key: 'file-browser.previewOnClick',
      domain: 'file-browser',
      label: 'Preview on Single Click',
      description: 'Open file preview when clicking a file in the tree (vs double-click to edit)',
      schema: z.boolean().default(true),
      ui: 'toggle',
      section: 'File Browser',
    },
  ],

  keybindings: [
    { key: 'ctrl+p', command: 'file-browser.openFile', when: 'workspaceFocus' },
    { key: 'ctrl+g', command: 'file-browser.openFileAtLine', when: 'workspaceFocus' },
  ],
};
```

**Step 2: Bind handlers at registration time**

```typescript
// apps/web/src/features/041-file-browser/sdk/register.ts
import type { IUSDK } from '@chainglass/shared/sdk/types';
import { fileBrowserContribution } from './contribution';

export function registerFileBrowserSDK(sdk: IUSDK): void {
  // Register commands with handlers
  sdk.commands.register({
    ...fileBrowserContribution.commands[0],
    handler: async ({ path }) => {
      // Uses the existing navigation infrastructure
      const { navigateToFile } = sdk.resolve('file-browser.navigation');
      navigateToFile(path);
    },
  });

  sdk.commands.register({
    ...fileBrowserContribution.commands[1],
    handler: async ({ path, line }) => {
      const { navigateToFile } = sdk.resolve('file-browser.navigation');
      navigateToFile(path, { line });
    },
  });

  sdk.commands.register({
    ...fileBrowserContribution.commands[2],
    handler: async ({ path }) => {
      await navigator.clipboard.writeText(path);
      sdk.toast.success('Path copied');
    },
  });

  // Contribute settings (schemas + defaults registered, no handler needed)
  for (const setting of fileBrowserContribution.settings) {
    sdk.settings.contribute(setting);
  }

  // Register default keybindings
  for (const binding of fileBrowserContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
```

**Step 3: Export from domain barrel**

```typescript
// apps/web/src/features/041-file-browser/index.ts
// ... existing exports ...
export { registerFileBrowserSDK } from './sdk/register';
export { fileBrowserContribution } from './sdk/contribution';
```

**Step 4: Wire into bootstrap**

```typescript
// apps/web/src/lib/sdk-bootstrap.ts
import { createUSDK } from '@chainglass/shared/sdk/registry';
import { registerFileBrowserSDK } from '../features/041-file-browser';
import { registerEventsSDK } from '../features/027-central-notify-events';
import { registerSettingsSDK } from '../features/settings';

export function bootstrapSDK(): IUSDK {
  const sdk = createUSDK();

  // Each domain self-registers (order doesn't matter)
  registerFileBrowserSDK(sdk);
  registerEventsSDK(sdk);
  registerSettingsSDK(sdk);
  // ... future domains

  return sdk;
}
```

### 3.3 Worked Example: Events Domain Publishes Toast

```typescript
// apps/web/src/features/027-central-notify-events/sdk/contribution.ts
import { z } from 'zod';
import type { SDKContribution } from '@chainglass/shared/sdk/types';

export const eventsContribution: SDKContribution = {
  domain: 'events',
  domainLabel: 'Notifications',

  commands: [
    {
      id: 'toast.show',
      title: 'Show Notification',
      domain: 'events',
      category: 'Notifications',
      params: z.object({
        message: z.string(),
        type: z.enum(['success', 'error', 'info', 'warning']).default('info'),
        description: z.string().optional(),
      }),
    },
    {
      id: 'toast.dismiss',
      title: 'Dismiss All Notifications',
      domain: 'events',
      category: 'Notifications',
      params: z.void(),
    },
  ],

  settings: [
    {
      key: 'events.toastPosition',
      domain: 'events',
      label: 'Notification Position',
      description: 'Where toast notifications appear on screen',
      schema: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).default('bottom-right'),
      ui: 'select',
      options: [
        { value: 'bottom-right', label: 'Bottom Right' },
        { value: 'bottom-left', label: 'Bottom Left' },
        { value: 'top-right', label: 'Top Right' },
        { value: 'top-left', label: 'Top Left' },
      ],
      section: 'Appearance',
    },
  ],

  keybindings: [],
};
```

```typescript
// apps/web/src/features/027-central-notify-events/sdk/register.ts
import { toast } from 'sonner';
import type { IUSDK } from '@chainglass/shared/sdk/types';
import { eventsContribution } from './contribution';

export function registerEventsSDK(sdk: IUSDK): void {
  sdk.commands.register({
    ...eventsContribution.commands[0],
    handler: async ({ message, type, description }) => {
      // toast() is client-only — this handler only runs in browser context
      toast[type](message, { description });
    },
  });

  sdk.commands.register({
    ...eventsContribution.commands[1],
    handler: async () => {
      toast.dismiss();
    },
  });

  for (const setting of eventsContribution.settings) {
    sdk.settings.contribute(setting);
  }
}
```

### 3.4 Publisher Checklist

When adding your domain to the SDK:

```
□ Create sdk/ folder in your feature directory
□ Define contribution.ts with static manifest (commands, settings, keybindings)
□ Define register.ts with handler bindings
□ Export both from domain barrel (index.ts)
□ Add registerXxxSDK(sdk) call to sdk-bootstrap.ts
□ Add FakeSDK tests for your handlers
□ Update domain.md with SDK surface documentation
```

---

## 4. The Consumer Experience

### 4.1 Executing Commands

**From a React component:**

```typescript
'use client';
import { useSDK } from '@/lib/sdk/use-sdk';

function MyComponent() {
  const sdk = useSDK();

  const handleOpenFile = () => {
    sdk.commands.execute('file-browser.openFile', { path: 'src/index.ts' });
  };

  const handleNotify = () => {
    sdk.commands.execute('toast.show', {
      message: 'Build succeeded',
      type: 'success',
    });
  };

  return (
    <button onClick={handleOpenFile}>Open index.ts</button>
  );
}
```

**From a server action (cross-domain):**

```typescript
'use server';

export async function handleWorktreeChange(slug: string, worktree: string) {
  // Server-side: use DI for service calls
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(/*...*/);
  await workspaceService.updatePreferences(slug, { /* ... */ });

  // Note: sdk.commands.execute() is client-only for UI commands
  // Server actions return data; client components call SDK commands on result
}
```

**Cross-domain consumption pattern:**

```typescript
// Domain A wants to navigate to a file from Domain B
// Instead of importing file-browser internals:

// ❌ BAD: Direct cross-domain import
import { useFileNavigation } from '@/features/041-file-browser/hooks/use-file-navigation';

// ✅ GOOD: Consume through SDK
const sdk = useSDK();
sdk.commands.execute('file-browser.openFile', { path: 'src/config.ts' });
```

### 4.2 Reading and Writing Settings

**Read a setting:**

```typescript
'use client';
import { useSDKSetting } from '@/lib/sdk/use-sdk';

function FileTree() {
  // Returns typed value + setter. Re-renders on change.
  const [showHidden, setShowHidden] = useSDKSetting('file-browser.showHiddenFiles');
  // showHidden: boolean (typed from Zod schema)

  return (
    <div>
      {files.filter(f => showHidden || !f.name.startsWith('.')).map(/*...*/)}
      <Toggle checked={showHidden} onChange={setShowHidden} />
    </div>
  );
}
```

**Observe setting changes (non-React):**

```typescript
// In a service or hook
const unsubscribe = sdk.settings.onChange('file-browser.showHiddenFiles', (newValue) => {
  fileTreeInstance.refresh();
});

// Cleanup
unsubscribe();
```

**Settings are workspace-scoped by default** (per ADR-0008):

```
~/.config/chainglass/workspaces.json
{
  "version": 2,
  "workspaces": [
    {
      "slug": "substrate",
      "preferences": {
        "emoji": "🔮",
        "color": "violet",
        "settings": {                          // ← NEW: SDK settings
          "file-browser.showHiddenFiles": true,
          "file-browser.previewOnClick": false,
          "events.toastPosition": "top-right"
        }
      }
    }
  ]
}
```

### 4.3 Command Palette

The explorer bar gains a command palette mode via the `>` prefix:

```
┌─────────────────────────────────────────────────────────────────────┐
│ > show hidden                                                   ⌘⇧P│
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  📁 File Browser: Show Hidden Files (Toggle)          ⌘.     │ │
│ │  📁 File Browser: Go to File                          ⌘P     │ │
│ │  🔔 Notifications: Show Notification                          │ │
│ │  ⚙️ Settings: Open Settings                           ⌘,     │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Palette modes (explorer bar prefix):**

| Input | Mode | Status | Behavior |
|-------|------|--------|----------|
| `> ` | Command palette | **In scope** | List commands, filter by typing, execute on select |
| (no prefix) | File path navigation | **Existing** | Navigate to file/directory (current behavior) |
| `# ` | Symbol search | **OOS stub** | Show "LSP/Flowspace coming later" message |

**Implementation: A new BarHandler at the front of the chain**

```typescript
// apps/web/src/features/sdk/bar-handlers/command-palette-handler.ts
import type { BarHandler } from '@/features/041-file-browser/types';

export function createCommandPaletteHandler(sdk: IUSDK): BarHandler {
  return async (input, context) => {
    if (!input.startsWith('>')) return false;

    const query = input.slice(1).trim();
    // Palette UI takes over — shows filtered command list
    sdk.palette.open(query);
    return true; // handled
  };
}
```

**Handler chain order (updated):**

```typescript
const handlers: BarHandler[] = [
  createCommandPaletteHandler(sdk),  // 1. '>' prefix → command palette
  createSymbolSearchStub(),          // 2. '#' prefix → stub message
  createFilePathHandler(),           // 3. Default → file navigation (existing)
];
```

### 4.4 Keyboard Shortcuts

**Triggering the command palette:**

```
Ctrl+Shift+P → Opens explorer bar with '>' pre-filled → Command palette mode
Ctrl+P       → Opens explorer bar empty → File navigation mode (existing)
```

**Shortcut lifecycle:**

```
User presses Ctrl+Shift+P
    │
    ▼
KeyboardShortcutProvider (root Client Component)
    │  Captures keydown on document
    │  Normalizes key combo: 'ctrl+shift+p'
    │  Looks up in keybinding registry
    │  Evaluates when-clause (if any)
    │
    ▼
Keybinding match found: { command: 'sdk.openCommandPalette' }
    │
    ▼
sdk.commands.execute('sdk.openCommandPalette')
    │
    ▼
Explorer bar gains focus with '>' prefix
    │
    ▼
User types to filter, presses Enter to execute selected command
```

**Chord example:**

```
User presses Ctrl+K → enters chord mode (status bar shows "Ctrl+K was pressed, waiting...")
    │
    ├── User presses Ctrl+C within 1000ms → chord resolved: 'ctrl+k ctrl+c'
    │       → execute bound command
    │
    └── Timeout (1000ms) or non-matching key → exit chord mode, no action
```

### 4.5 Settings Page

The settings page is auto-generated from SDK setting contributions:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚙️ Settings                                                  ⌘,  │
├─────────────┬───────────────────────────────────────────────────────┤
│             │                                                       │
│  Sections   │  File Browser                                        │
│  ─────────  │  ─────────────────────────────────────────────────   │
│             │                                                       │
│  Appearance │  Show Hidden Files                          [  ○ ]   │
│  File       │  Display files and directories starting                │
│  Browser    │  with a dot in the file tree                          │
│  Worktree   │                                                       │
│  Notifi-    │  Preview on Single Click                    [● ]     │
│  cations    │  Open file preview when clicking a file                │
│             │  in the tree (vs double-click to edit)                 │
│             │                                                       │
│             │  ─────────────────────────────────────────────────    │
│             │                                                       │
│             │  Notifications                                        │
│             │  ─────────────────────────────────────────────────    │
│             │                                                       │
│             │  Notification Position          [Bottom Right ▾]     │
│             │  Where toast notifications appear on screen           │
│             │                                                       │
└─────────────┴───────────────────────────────────────────────────────┘
```

**How it works:**

1. Settings page reads all contributed settings from the SDK registry
2. Groups by `section` field (or `domainLabel` as fallback)
3. Renders UI control based on `ui` hint (`toggle`, `select`, `text`, etc.)
4. On change: calls `sdk.settings.set(key, value)` → persists → fires onChange listeners

**No settings editor for raw JSON** (unlike VS Code). Graphical only.

---

## 5. The IUSDK Interface

The central SDK interface that domains receive during registration and consumers access via hook:

```typescript
/**
 * The USDK surface — consumed by domains (publishing) and React components (consuming).
 * Obtained via useSDK() hook in client components, or passed to register functions.
 */
interface IUSDK {
  // ─── Commands ───────────────────────────────────────────────────

  commands: {
    /** Register a command with handler (publisher) */
    register<T extends z.ZodType>(command: SDKCommand<T>): Disposable;

    /** Execute a command by ID (consumer) */
    execute(id: string, params?: unknown): Promise<void>;

    /** List all registered commands, optionally filtered */
    list(filter?: { domain?: string; category?: string }): SDKCommand[];

    /** Check if a command is currently available (when-clause evaluates true) */
    isAvailable(id: string): boolean;
  };

  // ─── Settings ───────────────────────────────────────────────────

  settings: {
    /** Contribute a setting schema + default (publisher) */
    contribute<T extends z.ZodType>(setting: SDKSetting<T>): void;

    /** Get a setting value, typed from schema (consumer) */
    get<T>(key: string): T;

    /** Set a setting value (consumer or publisher) */
    set(key: string, value: unknown): Promise<void>;

    /** Subscribe to setting changes (consumer or publisher) */
    onChange(key: string, callback: (value: unknown) => void): Disposable;

    /** List all contributed settings (for settings page) */
    list(filter?: { domain?: string; section?: string }): SDKSetting[];
  };

  // ─── Keybindings ────────────────────────────────────────────────

  keybindings: {
    /** Register a default keybinding (publisher) */
    register(binding: SDKKeybinding): Disposable;

    /** List all keybindings (for settings/display) */
    list(): SDKKeybinding[];

    /** Set a user-override keybinding (consumer via settings) */
    override(command: string, key: string): void;

    /** Remove a user-override, restoring default (consumer via settings) */
    resetToDefault(command: string): void;
  };

  // ─── Context ────────────────────────────────────────────────────

  context: {
    /** Set a context key (publisher — from domain components) */
    set(key: string, value: unknown): void;

    /** Get a context key value */
    get(key: string): unknown;

    /** Evaluate a when-clause expression */
    evaluate(expression: string): boolean;
  };

  // ─── Palette ────────────────────────────────────────────────────

  palette: {
    /** Open the command palette (optionally pre-filtered) */
    open(query?: string): void;

    /** Close the command palette */
    close(): void;
  };

  // ─── Convenience ────────────────────────────────────────────────

  /** Shortcut: sdk.toast.success('msg') instead of sdk.commands.execute('toast.show', ...) */
  toast: {
    success(message: string, options?: { description?: string }): void;
    error(message: string, options?: { description?: string }): void;
    info(message: string, options?: { description?: string }): void;
    warning(message: string, options?: { description?: string }): void;
  };
}

/** Cleanup handle — call dispose() to unregister */
interface Disposable {
  dispose(): void;
}
```

---

## 6. React Integration

### 6.1 Provider Architecture

```
Root Layout (Server Component)
  └── Providers (Client Component, 'use client')
       ├── ThemeProvider
       ├── SDKProvider                     ← NEW
       │   ├── Creates USDK instance
       │   ├── Runs domain registrations
       │   ├── Initializes KeyboardShortcutProvider
       │   └── Provides useSDK() context
       └── Toaster
```

```typescript
// apps/web/src/lib/sdk/sdk-provider.tsx
'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createUSDK, type IUSDK } from './create-usdk';
import { registerFileBrowserSDK } from '@/features/041-file-browser';
import { registerEventsSDK } from '@/features/027-central-notify-events';
import { KeyboardShortcutListener } from './keyboard-shortcut-listener';

const SDKContext = createContext<IUSDK | null>(null);

export function SDKProvider({ children }: { children: ReactNode }) {
  const sdk = useMemo(() => {
    const instance = createUSDK();
    registerFileBrowserSDK(instance);
    registerEventsSDK(instance);
    // ... other domains
    return instance;
  }, []);

  return (
    <SDKContext.Provider value={sdk}>
      <KeyboardShortcutListener sdk={sdk} />
      {children}
    </SDKContext.Provider>
  );
}

export function useSDK(): IUSDK {
  const sdk = useContext(SDKContext);
  if (!sdk) throw new Error('useSDK must be used within SDKProvider');
  return sdk;
}
```

### 6.2 Settings Hook

```typescript
// apps/web/src/lib/sdk/use-sdk-setting.ts
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSDK } from './sdk-provider';

export function useSDKSetting<T>(key: string): [T, (value: T) => void] {
  const sdk = useSDK();
  const [value, setValue] = useState<T>(() => sdk.settings.get<T>(key));

  useEffect(() => {
    const disposable = sdk.settings.onChange(key, (newValue) => {
      setValue(newValue as T);
    });
    return () => disposable.dispose();
  }, [sdk, key]);

  const setter = useCallback(
    (newValue: T) => {
      sdk.settings.set(key, newValue);
    },
    [sdk, key],
  );

  return [value, setter];
}
```

### 6.3 Context Key Hook (for Publishers)

```typescript
// apps/web/src/lib/sdk/use-sdk-context.ts
'use client';
import { useEffect } from 'react';
import { useSDK } from './sdk-provider';

/**
 * Sets a context key when the component is mounted, clears on unmount.
 * Used by domain components to declare their state to the SDK.
 */
export function useSDKContext(key: string, value: unknown): void {
  const sdk = useSDK();

  useEffect(() => {
    sdk.context.set(key, value);
    return () => sdk.context.set(key, undefined);
  }, [sdk, key, value]);
}
```

**Usage in domain component:**

```typescript
function FileViewerPanel({ filePath }: { filePath: string }) {
  // Publish context keys so when-clauses work
  useSDKContext('file-browser.hasOpenFile', !!filePath);
  useSDKContext('file-browser.currentFilePath', filePath);

  // ... render viewer
}
```

---

## 7. Where the SDK Sits in the Stack

```
┌──────────────────────────────────────────────────────────────────┐
│  Presentation Layer (React Components, Pages)                     │
│  ├── Command Palette (ExplorerPanel + CommandPaletteHandler)     │
│  ├── Settings Page (auto-generated from SDK settings)            │
│  └── Keyboard Shortcuts (KeyboardShortcutListener)               │
├──────────────────────────────────────────────────────────────────┤
│  SDK Layer (IUSDK)                                                │
│  ├── Command Registry (in-memory Map<string, SDKCommand>)        │
│  ├── Settings Store (backed by workspace preferences)            │
│  ├── Keybinding Resolver (tinykeys-based, chord state machine)   │
│  └── Context Key Service (in-memory Map<string, unknown>)        │
├──────────────────────────────────────────────────────────────────┤
│  Domain Layer (Feature Domains)                                   │
│  ├── file-browser → registers commands, settings, shortcuts      │
│  ├── events → registers toast commands, notification settings     │
│  ├── settings → registers settings management commands           │
│  └── viewer → registers viewer commands                          │
├──────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer (DI Container, Server Actions)              │
│  ├── DI Container (tsyringe — services, adapters, fakes)         │
│  ├── Server Actions (file I/O, persistence, workspace service)   │
│  └── SSE/Event System (real-time notifications)                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key boundary**: The SDK is a **client-side layer**. It lives in the browser. Server-side operations are reached through existing server actions and DI. The SDK doesn't replace DI — it's a user-facing surface on top of it.

**When to use SDK vs DI:**

| Scenario | Use SDK | Use DI |
|----------|---------|--------|
| User triggers action via UI | ✅ `sdk.commands.execute(...)` | |
| Cross-domain feature consumption | ✅ `sdk.commands.execute(...)` | |
| Service-to-service (server side) | | ✅ `container.resolve(...)` |
| Infrastructure wiring | | ✅ `registerXxxServices(container)` |
| Reading user preferences | ✅ `sdk.settings.get(...)` | |
| Reading system config | | ✅ `container.resolve(IConfigService)` |
| Button navigates to file | ✅ `sdk.commands.execute('file-browser.openFile', ...)` | |
| Injecting a filesystem adapter | | ✅ `container.resolve(IFileSystem)` |

---

## 8. Testing

### 8.1 FakeUSDK for Consumer Tests

```typescript
// test/fakes/fake-usdk.ts
export function createFakeUSDK(): IUSDK & {
  /** Inspect registered commands */
  getRegisteredCommands(): SDKCommand[];
  /** Inspect executed commands */
  getExecutionLog(): Array<{ id: string; params: unknown }>;
  /** Inspect contributed settings */
  getContributedSettings(): SDKSetting[];
  /** Inspect set context keys */
  getContextKeys(): Map<string, unknown>;
} {
  const commands = new Map<string, SDKCommand>();
  const executionLog: Array<{ id: string; params: unknown }> = [];
  const settings = new Map<string, { definition: SDKSetting; value: unknown }>();
  const contextKeys = new Map<string, unknown>();
  const settingsListeners = new Map<string, Set<(value: unknown) => void>>();

  return {
    commands: {
      register(command) {
        commands.set(command.id, command);
        return { dispose: () => commands.delete(command.id) };
      },
      async execute(id, params) {
        executionLog.push({ id, params });
        const cmd = commands.get(id);
        if (cmd) {
          const validated = cmd.params.parse(params);
          await cmd.handler(validated);
        }
      },
      list: (filter) => [...commands.values()].filter(/*...*/),
      isAvailable: () => true,
    },
    settings: {
      contribute(setting) {
        const defaultValue = setting.schema.parse(undefined);
        settings.set(setting.key, { definition: setting, value: defaultValue });
      },
      get: (key) => settings.get(key)?.value,
      async set(key, value) {
        const entry = settings.get(key);
        if (entry) {
          entry.value = entry.definition.schema.parse(value);
          settingsListeners.get(key)?.forEach(cb => cb(entry.value));
        }
      },
      onChange(key, callback) {
        if (!settingsListeners.has(key)) settingsListeners.set(key, new Set());
        settingsListeners.get(key)!.add(callback);
        return { dispose: () => settingsListeners.get(key)?.delete(callback) };
      },
      list: () => [...settings.values()].map(e => e.definition),
    },
    context: {
      set: (key, value) => contextKeys.set(key, value),
      get: (key) => contextKeys.get(key),
      evaluate: () => true,
    },
    palette: { open: () => {}, close: () => {} },
    keybindings: {
      register: () => ({ dispose: () => {} }),
      list: () => [],
      override: () => {},
      resetToDefault: () => {},
    },
    toast: {
      success: (msg) => executionLog.push({ id: 'toast.show', params: { message: msg, type: 'success' } }),
      error: (msg) => executionLog.push({ id: 'toast.show', params: { message: msg, type: 'error' } }),
      info: (msg) => executionLog.push({ id: 'toast.show', params: { message: msg, type: 'info' } }),
      warning: (msg) => executionLog.push({ id: 'toast.show', params: { message: msg, type: 'warning' } }),
    },
    // Inspection methods
    getRegisteredCommands: () => [...commands.values()],
    getExecutionLog: () => executionLog,
    getContributedSettings: () => [...settings.values()].map(e => e.definition),
    getContextKeys: () => contextKeys,
  };
}
```

### 8.2 Testing a Publisher

```typescript
// test/unit/web/features/041-file-browser/sdk/register.test.ts
import { describe, it, expect } from 'vitest';
import { createFakeUSDK } from '../../../../fakes/fake-usdk';
import { registerFileBrowserSDK } from '@/features/041-file-browser/sdk/register';

describe('registerFileBrowserSDK', () => {
  it('registers file.open command with Zod-validated params', () => {
    const sdk = createFakeUSDK();
    registerFileBrowserSDK(sdk);

    const commands = sdk.getRegisteredCommands();
    const openCmd = commands.find(c => c.id === 'file-browser.openFile');

    expect(openCmd).toBeDefined();
    expect(openCmd!.title).toBe('Go to File');
    expect(openCmd!.domain).toBe('file-browser');
  });

  it('contributes file-browser settings with defaults', () => {
    const sdk = createFakeUSDK();
    registerFileBrowserSDK(sdk);

    expect(sdk.settings.get('file-browser.showHiddenFiles')).toBe(false);
    expect(sdk.settings.get('file-browser.previewOnClick')).toBe(true);
  });
});
```

### 8.3 Testing a Consumer

```typescript
// test/unit/web/components/some-component.test.tsx
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createFakeUSDK } from '../../../../fakes/fake-usdk';
import { SDKContext } from '@/lib/sdk/sdk-provider';
import { SomeComponent } from '@/components/some-component';

describe('SomeComponent', () => {
  it('executes file.open command on button click', async () => {
    const sdk = createFakeUSDK();

    // Pre-register the command (publisher would do this in real app)
    sdk.commands.register({
      id: 'file-browser.openFile',
      title: 'Open',
      domain: 'file-browser',
      params: z.object({ path: z.string() }),
      handler: async () => {},
    });

    const { getByText } = render(
      <SDKContext.Provider value={sdk}>
        <SomeComponent />
      </SDKContext.Provider>
    );

    fireEvent.click(getByText('Open File'));

    const log = sdk.getExecutionLog();
    expect(log).toHaveLength(1);
    expect(log[0].id).toBe('file-browser.openFile');
    expect(log[0].params).toEqual({ path: 'src/index.ts' });
  });
});
```

---

## 9. Settings Persistence Deep Dive

### 9.1 Storage Location

SDK settings live inside the existing workspace preferences:

```json
// ~/.config/chainglass/workspaces.json (v2 schema, extended)
{
  "version": 2,
  "workspaces": [
    {
      "slug": "substrate",
      "name": "Substrate",
      "path": "/home/jak/substrate",
      "preferences": {
        "emoji": "🔮",
        "color": "violet",
        "starred": true,
        "sortOrder": 0,
        "starredWorktrees": [],
        "worktreePreferences": {},
        "sdkSettings": {
          "file-browser.showHiddenFiles": true,
          "events.toastPosition": "top-right"
        }
      }
    }
  ]
}
```

**Why here (not a separate file)?**
- Follows existing preferences pattern (no new storage format)
- Workspace-scoped per ADR-0008
- Survives worktree deletion (global registry)
- Single read/write path via existing `IWorkspaceRegistryAdapter`

### 9.2 Read/Write Flow

```
sdk.settings.set('file-browser.showHiddenFiles', true)
    │
    ▼
SettingsStore.set(key, value)
    │  1. Validate against Zod schema
    │  2. Persist (server action)
    │  3. Fire onChange listeners
    │
    ▼
Server Action: updateSDKSettings(slug, key, value)
    │  1. getContainer() → resolve IWorkspaceService
    │  2. workspaceService.updatePreferences(slug, {
    │       sdkSettings: { ...existing, [key]: value }
    │     })
    │  3. revalidatePath()
    │
    ▼
onChange listeners fire
    │  Components re-render via useSDKSetting hook
```

### 9.3 Default Resolution Order

```
1. SDK Setting schema default (z.boolean().default(false))
2. Workspace sdkSettings override (from workspaces.json)
3. (Future: User-global defaults)
```

No raw JSON editing. Settings page is the only editor.

---

## 10. Open Questions

### Q1: Should SDK commands run through server actions for file/IO operations?

**RESOLVED**: No. SDK commands are client-side dispatchers. When a command needs server-side work (e.g., reading a file), the command handler calls existing server actions internally. The SDK doesn't own the server boundary — it delegates.

```typescript
// Handler calls server action internally
handler: async ({ path }) => {
  const content = await readFile(slug, worktreePath, path); // existing server action
  // ... do something with content
}
```

### Q2: Should the SDK replace the DI container?

**RESOLVED**: No. They serve different purposes:
- **DI**: Infrastructure wiring, service-to-service, server-side
- **SDK**: User-facing surface, cross-domain discovery, client-side

They coexist. SDK commands may resolve DI services when needed.

### Q3: How does the settings page know the current workspace?

**RESOLVED**: Via URL params. The settings page lives at `/workspaces/[slug]/settings` and uses the existing `workspaceParams` cache to resolve the workspace context. SDK settings are read/written for that workspace.

### Q4: What about user-global settings (not workspace-scoped)?

**OPEN**: Some settings may want to be global (e.g., toast position, theme). Options:
- **Option A**: All settings workspace-scoped (simple, follows ADR-0008)
- **Option B**: SDKSetting gains a `scope: 'workspace' | 'global'` field, global settings stored in a separate file

**Leaning**: Option A for v1. Global settings can come later as a non-breaking extension.

### Q5: How do OOS stubs for search (#) and LSP work?

**RESOLVED**: They're BarHandlers that show a toast:

```typescript
function createSymbolSearchStub(): BarHandler {
  return async (input, context) => {
    if (!input.startsWith('#')) return false;
    toast.info('Symbol search (LSP/Flowspace) coming soon');
    return true;
  };
}
```

### Q6: Can SDK commands be called from the CLI?

**OPEN**: Not in v1. The SDK is client-side (browser). Future consideration:
- CLI could have its own SDK bootstrap with CLI-appropriate handlers
- Commands declare `context: 'web' | 'cli' | 'both'` (pattern from 032-node-event-system)
- For now, CLI uses DI directly

---

## 11. Quick Reference

### Publisher Cheatsheet

```typescript
// 1. Define contribution (contribution.ts)
export const myContribution: SDKContribution = {
  domain: 'my-domain',
  domainLabel: 'My Domain',
  commands: [{ id: 'my-domain.doThing', title: 'Do Thing', params: z.object({...}), domain: 'my-domain' }],
  settings: [{ key: 'my-domain.enabled', schema: z.boolean().default(true), ... }],
  keybindings: [{ key: 'ctrl+shift+d', command: 'my-domain.doThing' }],
};

// 2. Bind handlers (register.ts)
export function registerMyDomainSDK(sdk: IUSDK): void {
  sdk.commands.register({ ...myContribution.commands[0], handler: async (params) => { /* ... */ } });
  for (const s of myContribution.settings) sdk.settings.contribute(s);
  for (const k of myContribution.keybindings) sdk.keybindings.register(k);
}

// 3. Wire in (sdk-bootstrap.ts)
registerMyDomainSDK(sdk);
```

### Consumer Cheatsheet

```typescript
// Execute command
const sdk = useSDK();
sdk.commands.execute('file-browser.openFile', { path: 'README.md' });

// Read/write setting
const [value, setValue] = useSDKSetting('file-browser.showHiddenFiles');

// Set context (in your component)
useSDKContext('my-domain.isActive', true);

// Show toast
sdk.toast.success('Done!');

// Open command palette
sdk.palette.open();
```

### Naming Conventions

| Element | Pattern | Examples |
|---------|---------|---------|
| Command ID | `domain.verbNoun` | `file-browser.openFile`, `toast.show` |
| Setting Key | `domain.settingName` | `file-browser.showHiddenFiles` |
| Context Key | `domain.contextName` | `file-browser.hasOpenFile` |
| Keybinding | `ctrl+key` or `ctrl+k ctrl+c` | `ctrl+shift+p`, `ctrl+k ctrl+s` |

---

## 12. Candidate SDK Commands (Initial Set)

| Command ID | Domain | Params | Shortcut | Description |
|------------|--------|--------|----------|-------------|
| `sdk.openCommandPalette` | sdk | `z.void()` | `ctrl+shift+p` | Open command palette |
| `sdk.openSettings` | sdk | `z.object({ section?: z.string() })` | `ctrl+,` | Open settings page |
| `file-browser.openFile` | file-browser | `z.object({ path: z.string() })` | `ctrl+p` | Go to file |
| `file-browser.openFileAtLine` | file-browser | `z.object({ path: z.string(), line: z.number() })` | `ctrl+g` | Go to file:line |
| `file-browser.copyPath` | file-browser | `z.object({ path: z.string() })` | | Copy file path |
| `toast.show` | events | `z.object({ message, type, description? })` | | Show notification |
| `toast.dismiss` | events | `z.void()` | | Dismiss all |
| `worktree.setIcon` | settings | `z.object({ emoji: z.string() })` | | Set worktree emoji |
| `worktree.setColor` | settings | `z.object({ color: z.string() })` | | Set worktree color |
| `worktree.setAlert` | settings | `z.object({ status: z.enum([...]) })` | | Set alert status |
| `log.write` | events | `z.object({ message, level })` | | Write to server log |
