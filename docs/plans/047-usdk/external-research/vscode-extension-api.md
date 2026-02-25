# External Research: VS Code Extension API Architecture

**Source**: Perplexity Deep Research
**Date**: 2026-02-24
**Purpose**: Inform USDK internal SDK design by understanding VS Code's proven patterns

---

## Executive Summary

VS Code's extension architecture employs three fundamental architectural pillars:
1. **Activation events** that trigger extension loading at opportune moments
2. **Contribution points** that enable static declarations of capabilities in the package manifest
3. **The VS Code API** that provides programmatic access to editor functionality

The command execution system forms the backbone, implementing a sophisticated resolution and dispatch mechanism that maps user input (keyboard shortcuts, menu selections, programmatic invocations) to command handlers through a layered context evaluation system.

---

## 1. Command Palette: Registration → Dispatch Flow

### Two-Step Process
1. **Registration**: Extension calls `vscode.commands.registerCommand(id, handler)` — binds command ID to handler function in the command service's internal registry
2. **Contribution**: Extension declares command in `package.json` manifest under `contributes.commands` — makes it discoverable in the Command Palette with title, category, optional icon

This separation means commands can exist purely as programmatic internal APIs (registration only) or be user-facing (registration + contribution).

### Execution Pipeline
1. User opens Command Palette → VS Code queries all contributed commands from extension manifests
2. User selects command → if extension not active, activation event triggers and extension loads
3. `registerCommand` in extension's `activate()` binds command ID to handler
4. Dispatcher invokes handler with arguments

### Key Design Decisions for USDK
- **Lazy loading**: Extensions activate only when their commands are invoked (since VS Code 1.74.0, commands in `contributes.commands` auto-trigger activation)
- **Static metadata**: Command titles, categories, icons are declared statically in manifests — no code execution needed to build the palette UI
- **Programmatic invocation**: `vscode.commands.executeCommand(id, ...args)` allows commands to call other commands — enables command composition

### USDK Adaptation
```typescript
// Static contribution (compile-time manifest)
const fileBrowserContributions = {
  commands: [
    { id: 'file.open', title: 'Go to File', category: 'File', params: z.object({ path: z.string() }) },
    { id: 'file.goToLine', title: 'Go to File and Line', category: 'File', params: z.object({ path: z.string(), line: z.number() }) },
  ],
};

// Runtime registration (in domain's registerSDK function)
function registerFileBrowserSDK(sdk: IUSDK) {
  sdk.commands.register('file.open', async (params) => {
    const validated = fileBrowserContributions.commands[0].params.parse(params);
    // ... navigate to file
  });
}
```

---

## 2. Keyboard Shortcut Chords & Keybinding Resolution

### Bottom-to-Top Rule Evaluation
VS Code evaluates keybinding rules from bottom to top — later declarations override earlier ones. This means:
- Default keybindings are loaded first
- Extension keybindings layer on top
- User keybindings have highest priority (evaluated last = highest priority)

### Chord Sequences
- Chords are sequences of keypresses: e.g., `Ctrl+K Ctrl+C`
- First key (`Ctrl+K`) enters "chord mode" — subsequent keys are interpreted as the second part
- A configurable timeout exits chord mode if no second key is pressed
- State machine: `idle` → `chord_pending(firstKey)` → `resolved(command)` or `timeout → idle`

### When-Clause Context
Each keybinding can have a `when` clause that restricts when it's active:
```json
{ "key": "ctrl+shift+k", "command": "editor.action.deleteLines", "when": "editorTextFocus" }
```

### Resolution Algorithm
1. Capture key event
2. Filter keybindings by current key combination
3. Evaluate `when` clauses against current context
4. Select highest-priority matching binding (bottom-to-top)
5. Execute associated command

### USDK Adaptation
```typescript
interface SDKKeybinding {
  key: string;           // 'ctrl+p' or 'ctrl+k ctrl+c' (chord)
  command: string;       // command ID
  when?: string;         // context expression
  priority?: number;     // explicit priority (replaces bottom-to-top ordering)
}
```

---

## 3. Settings System

### How Extensions Contribute Settings
Extensions declare settings schemas in `package.json` under `contributes.configuration`:
```json
{
  "contributes": {
    "configuration": {
      "title": "My Extension",
      "properties": {
        "myExtension.enableFeature": {
          "type": "boolean",
          "default": true,
          "description": "Enable the feature"
        },
        "myExtension.maxItems": {
          "type": "number",
          "default": 10,
          "minimum": 1,
          "maximum": 100
        }
      }
    }
  }
}
```

### Settings Hierarchy
1. **Default settings** — defined by extensions
2. **User settings** — `settings.json` (global)
3. **Workspace settings** — `.vscode/settings.json` (per-project)
4. **Language-specific settings** — `[language]` scoped overrides

Lower levels override higher ones. VS Code merges settings hierarchically.

### Organization
- Settings are organized by **category** (the `title` field in contribution)
- Within categories, settings are grouped by common prefix (e.g., `editor.fontSize`, `editor.lineHeight`)
- The Settings UI generates UI elements from JSON Schema types automatically

### USDK Adaptation
```typescript
// Domain contributes settings schema
sdk.settings.contribute({
  domain: 'file-browser',
  title: 'File Browser',
  properties: {
    'file-browser.showHiddenFiles': {
      schema: z.boolean().default(false),
      description: 'Show hidden files in the file tree',
    },
    'file-browser.previewOnClick': {
      schema: z.boolean().default(true),
      description: 'Preview files on single click',
    },
  },
});

// Domain reads settings
const showHidden = sdk.settings.get('file-browser.showHiddenFiles'); // typed as boolean

// Domain listens for changes
sdk.settings.onChange('file-browser.showHiddenFiles', (newValue) => { /* re-render */ });
```

---

## 4. Contribution Points Model

### What Extensions Can Contribute (Static Declarations)
| Contribution Point | Purpose | Example |
|-------------------|---------|---------|
| `commands` | Palette-visible commands | `{ id, title, category, icon }` |
| `configuration` | Settings schemas | `{ properties: { "ext.key": { type, default, description } } }` |
| `menus` | Context menu items | `{ "editor/context": [{ command, when, group }] }` |
| `keybindings` | Default keyboard shortcuts | `{ key, command, when }` |
| `views` | Sidebar/panel views | `{ id, name, when }` |
| `viewsContainers` | View container groups | `{ id, title, icon }` |
| `languages` | Language definitions | `{ id, extensions, aliases }` |
| `themes` | Color themes | `{ label, uiTheme, path }` |

### Key Insight: Static vs Dynamic
- **Static** (manifest/compile-time): Commands, settings schemas, menu placements, keybindings, views
- **Dynamic** (runtime): Command handlers, setting values, view content, tree data providers

VS Code can build its entire UI from static contributions without executing any extension code. This is critical for performance.

### USDK Adaptation
```typescript
// Each domain exports a static contribution manifest
export const fileBrowserContribution: SDKContribution = {
  commands: [...],
  settings: [...],
  keybindings: [...],
  // No menus/views/themes for internal SDK — we use React components directly
};

// And a dynamic registration function
export function registerFileBrowserSDK(sdk: IUSDK) {
  // Bind handlers to contributed commands
  // Set up settings change listeners
  // Register UI components
}
```

---

## 5. When-Clause Context System

### How It Works
- VS Code maintains a **context key service** — a key-value store of current application state
- Extensions and VS Code core set context keys: `editorTextFocus`, `resourceScheme`, `isLinux`, etc.
- When-clauses are boolean expressions evaluated against context keys

### Expressions Supported
```
editorTextFocus                          // simple boolean check
resourceScheme == 'file'                 // equality
editorLangId in ['javascript', 'typescript']  // membership
editorTextFocus && !editorReadonly       // logical operators
config.editor.minimap.enabled           // settings as context
```

### Context Key Categories
| Category | Examples | Set By |
|----------|----------|--------|
| Editor state | `editorTextFocus`, `editorHasSelection` | VS Code core |
| Resource | `resourceScheme`, `resourceFilename` | VS Code core |
| View state | `view == 'explorer'`, `sideBarVisible` | VS Code core |
| Extension | `myExtension.isActive`, `myExtension.mode` | Extensions via `setContext` |
| Config | `config.editor.minimap.enabled` | Settings system |

### Setting Custom Context
```typescript
vscode.commands.executeCommand('setContext', 'myExtension.isActive', true);
```

### USDK Adaptation
```typescript
// SDK provides context service
interface IContextService {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  evaluate(expression: string): boolean;
  onChange(key: string, callback: (value: unknown) => void): Disposable;
}

// Domains set context
sdk.context.set('file-browser.hasOpenFile', true);
sdk.context.set('file-browser.currentFileType', 'typescript');

// Commands use when-clauses
sdk.commands.register({
  id: 'file.save',
  when: 'file-browser.hasOpenFile && !file-browser.isReadonly',
  handler: async () => { /* ... */ },
});
```

---

## 6. Key Architectural Takeaways for USDK

### Pattern: Separate Declaration from Implementation
- Static contributions (manifests) enable UI generation without code execution
- Dynamic registration binds handlers at runtime
- This maps to: **Zod schemas for declarations** + **factory functions for handlers**

### Pattern: Hierarchical Override
- Settings: defaults → user → workspace
- Keybindings: defaults → extensions → user
- Always allow user-level override as highest priority

### Pattern: Context-Driven Visibility
- Commands, menus, keybindings all use when-clauses
- Single context service manages all state keys
- Evaluation is synchronous for instant UI response

### Pattern: Namespace Everything
- Commands: `domain.action` (e.g., `file-browser.open`)
- Settings: `domain.settingName` (e.g., `file-browser.showHiddenFiles`)
- Context keys: `domain.contextKey` (e.g., `file-browser.hasOpenFile`)

### Server/Client Boundary Considerations
- **Client-only**: Keybinding resolution, command palette UI, context key service, when-clause evaluation
- **Server-only**: Command handlers that access filesystem/database, settings persistence
- **Bridged**: Command dispatch (client triggers → server executes → client receives result)

---

## Citations

1. https://code.visualstudio.com/api/extension-guides/command
2. https://code.visualstudio.com/api/references/vscode-api
3. https://code.visualstudio.com/docs/configure/keybindings
4. https://www.youtube.com/watch?v=fZnS4DA9egU
5. https://code.visualstudio.com/api/get-started/extension-anatomy
6. https://www.youtube.com/watch?v=pZGtKVYnzfI
7. https://vscode-docs1.readthedocs.io/en/latest/extensionAPI/extension-points/
8. https://code.visualstudio.com/api/references/when-clause-contexts
9. https://code.visualstudio.com/api/references/contribution-points
10. https://code.visualstudio.com/api/ux-guidelines/overview
