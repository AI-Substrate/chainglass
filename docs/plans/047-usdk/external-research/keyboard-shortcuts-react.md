# External Research: Keyboard Shortcut Chord Handling in React

**Source**: Perplexity Deep Research
**Date**: 2026-02-24
**Purpose**: Inform USDK keyboard shortcut implementation strategy

---

## Executive Summary

Implementing VS Code-style keyboard shortcuts in React 19/Next.js 16 requires a centralized keyboard event manager with a context-aware state machine for chord sequences. Key findings:

1. **Nearly all existing JS keyboard shortcut libraries have significant limitations** around keyboard layout handling and cross-browser compatibility
2. **A single centralized keyboard listener** is substantially more efficient than distributed listeners
3. **Native DOM listeners are strongly preferred** over React synthetic events for shortcuts
4. **Chord sequences require a state machine** with configurable timeout between keypresses
5. **Browser/OS shortcut restrictions are unavoidable** and must be planned around

---

## 1. Library Comparison

### react-hotkeys-hook
- **GitHub**: 1.3k uses
- **Issue**: Employs both `code` and `key` properties, causing shortcuts to trigger more often than intended
- **Chord support**: Requires manual state management
- **Verdict**: Problematic for production use due to dual-property ambiguity

### mousetrap
- **GitHub**: 11.8k stars, 49k+ project uses
- **Issue**: Relies on deprecated `which` property (alias for `code`)
- **Chord support**: Native — `Mousetrap.bind('g i', callback)` works out of the box
- **Verdict**: Battle-tested but uses deprecated APIs

### tinykeys
- **Approach**: Uses `code` property (physical key position, layout-independent)
- **Chord support**: Space-separated syntax `"g i"` with configurable timeout (default 1000ms)
- **Size**: Minimal dependencies
- **Verdict**: **Recommended for moderate complexity** — well-designed, clear documentation

### React-Keyhub
- **Approach**: Single global event listener, centralized handler
- **Features**: Sequence shortcuts, context-aware filtering, built-in visualizations, TypeScript-first
- **Architecture**: Maintains a map of key combinations → shortcut IDs for constant-time lookups
- **Verdict**: **Recommended for complex applications** (100+ shortcuts, extensive chords, context rules)

### Custom Hook (Simple)
- **When to use**: Under 20 shortcuts, no complex chord sequences
- **Advantage**: No external dependencies, full control
- **Works well with**: React Server Components (naturally isolates client-side logic)

---

## 2. Chord Sequence State Machine

### VS Code's Approach
Chords are sequences of keypresses where the first key enters "chord mode":

```
State Machine:
  IDLE → (Ctrl+K pressed) → CHORD_PENDING(firstKey: "Ctrl+K")
    → (Ctrl+C pressed within timeout) → RESOLVED(command: "editor.comment")
    → (timeout elapsed) → IDLE
    → (non-matching key pressed) → IDLE (optionally show error)
```

### Implementation Pattern
```typescript
type ChordState =
  | { mode: 'idle' }
  | { mode: 'chord_pending'; firstKey: string; timeoutId: ReturnType<typeof setTimeout> };

class KeybindingResolver {
  private state: ChordState = { mode: 'idle' };
  private chordTimeout = 1000; // ms

  handleKeyEvent(event: KeyboardEvent): string | null {
    const key = this.normalizeKey(event);

    if (this.state.mode === 'chord_pending') {
      clearTimeout(this.state.timeoutId);
      const chord = `${this.state.firstKey} ${key}`;
      this.state = { mode: 'idle' };

      const command = this.resolveBinding(chord);
      if (command) return command;
      // No match for chord — fall through to single-key check
    }

    // Check if this key starts a chord
    if (this.hasChordStartingWith(key)) {
      const timeoutId = setTimeout(() => {
        this.state = { mode: 'idle' };
      }, this.chordTimeout);
      this.state = { mode: 'chord_pending', firstKey: key, timeoutId };
      return null; // Wait for second key
    }

    // Single-key binding
    return this.resolveBinding(key);
  }
}
```

---

## 3. Shortcut Configuration Schema

### Recommended Schema
```typescript
const KeybindingSchema = z.object({
  key: z.string(),           // 'ctrl+p' or 'ctrl+k ctrl+c' (space-separated for chords)
  command: z.string(),       // command ID
  when: z.string().optional(), // context expression
  args: z.unknown().optional(), // arguments to pass to command
});

// Storage format (JSON)
{
  "keybindings": [
    { "key": "ctrl+shift+p", "command": "commandPalette.open" },
    { "key": "ctrl+k ctrl+c", "command": "editor.commentLine", "when": "editorFocus" },
    { "key": "ctrl+p", "command": "file.quickOpen" },
    { "key": "-ctrl+s", "command": "" }  // '-' prefix removes a default binding
  ]
}
```

### Key Normalization
```typescript
function normalizeKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');

  // Use event.key for printable characters, event.code for special keys
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.code;
  parts.push(key);

  return parts.join('+');
}
```

---

## 4. Browser/OS Shortcut Conflicts

### Cannot Override (Browser Enforced)
| Shortcut | Browser | Purpose |
|----------|---------|---------|
| Ctrl+T | All | New tab |
| Ctrl+W | All | Close tab |
| Ctrl+N | All | New window |
| Ctrl+Shift+I | Chrome/Firefox | DevTools |
| Ctrl+L | All | Focus address bar |
| F11 | All | Fullscreen |

### Can Override (With `preventDefault()`)
| Shortcut | Default | Safe to Override? |
|----------|---------|-------------------|
| Ctrl+S | Save page | ✅ Common in web apps |
| Ctrl+P | Print | ✅ Common for quick-open |
| Ctrl+F | Find | ⚠️ Users expect it |
| Ctrl+G | Find next | ✅ Safe |
| Ctrl+K | Various | ✅ Safe as chord starter |
| Ctrl+Shift+P | None in most browsers | ✅ Ideal for command palette |

### Strategy
- Maintain a **blocklist** of non-overridable shortcuts
- Validate user-defined shortcuts against the blocklist at registration time
- Show warnings for shortcuts that conflict with common browser defaults
- Use `Ctrl+Shift+*` combinations which rarely conflict

---

## 5. Context-Aware (When-Clause) Keybinding Resolution

### Pattern: Context Key Service
```typescript
interface IContextKeyService {
  // Set context values
  set(key: string, value: unknown): void;

  // Evaluate when-clause expressions
  evaluate(expression: string): boolean;

  // React hook for components to set context on mount/unmount
  useContext(key: string, value: unknown): void;
}

// Usage in components
function EditorPanel() {
  const ctx = useContextKeyService();
  ctx.useContext('editorFocus', true);   // Sets when mounted, clears when unmounted
  ctx.useContext('editorLangId', 'typescript');
  // ...
}
```

### Resolution with When-Clauses
```typescript
function resolveBinding(key: string, context: IContextKeyService): string | null {
  const candidates = bindings
    .filter(b => b.key === key)
    .filter(b => !b.when || context.evaluate(b.when));

  // Return highest-priority match (last defined = highest priority)
  return candidates.at(-1)?.command ?? null;
}
```

### Expression Parser (Simple)
```typescript
// Support: key, !key, key == value, key1 && key2, key1 || key2
function evaluate(expr: string, context: Map<string, unknown>): boolean {
  // Split on && and || (simple recursive descent)
  // For each term:
  //   "!key" → !context.get(key)
  //   "key == value" → context.get(key) === value
  //   "key" → Boolean(context.get(key))
}
```

---

## 6. Performance & React 19 Considerations

### Native DOM Listeners (Strongly Preferred)
```typescript
// ✅ GOOD: Single global listener, native DOM
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const command = resolver.handleKeyEvent(e);
    if (command) {
      e.preventDefault();
      sdk.commands.execute(command);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []);

// ❌ BAD: React synthetic events on every component
<div onKeyDown={(e) => { /* per-component handling */ }} />
```

### React Server Components Constraint
- Keyboard listeners MUST be in Client Components (`'use client'`)
- Create a single `<KeyboardShortcutProvider>` at the root layout
- Load shortcut configuration statically at build time or from an API
- The provider initializes the listener in `useEffect` with proper cleanup

### Architecture for Next.js 16
```
Root Layout (Server Component)
  └── KeyboardShortcutProvider (Client Component, 'use client')
       ├── useEffect → document.addEventListener('keydown', ...)
       ├── Context: IContextKeyService
       ├── State: ChordState machine
       └── Children (can be Server or Client Components)
            ├── EditorPanel → sets context keys via hook
            ├── FileTree → sets context keys via hook
            └── CommandPalette → reads registered commands
```

---

## 7. Recommendations for USDK

### Library Choice
- **Start with tinykeys** as the keyboard event engine
- Build application-specific context and when-clause handling on top
- If complexity grows beyond 100 shortcuts, evaluate React-Keyhub

### Architecture
1. **Single global listener** in `<KeyboardShortcutProvider>` Client Component
2. **Centralized keybinding registry** (part of USDK command registry)
3. **Context key service** for when-clause evaluation
4. **Chord state machine** with 1000ms timeout (configurable in settings)
5. **Conflict detection** at registration time, not runtime

### Configuration Storage
- Default shortcuts: JSON file in repo (compile-time)
- User overrides: Workspace preferences (`workspaces.json` or new settings domain)
- Merge: defaults → domain contributions → user overrides (VS Code precedence model)

### Testing Strategy
- Unit test the chord state machine independently
- Unit test when-clause expression evaluation
- Integration test: key event → command execution
- Use `FakeContextKeyService` for testing context-dependent shortcuts

---

## Citations

1. https://github.com/jaywcjlove/react-hotkeys
2. https://feedback.remnote.com/p/add-keyboard-shortcut-chords-shortcut-sequence
3. https://github.com/olup/react-hook-mousetrap
4. https://blog.duvallj.pw/posts/2025-01-10-all-javascript-keyboard-shortcut-libraries-are-broken.html
5. https://forum.glyphsapp.com/t/chord-shortcuts/32563
6. https://github.com/JohannesKlauss/react-hotkeys-hook
7. https://code.visualstudio.com/docs/configure/keybindings
8. https://www.raspberrypi.com/news/make-a-chord-keyboard-with-raspberry-pi-pico-and-circuitpython/
9. https://github.com/sandialabs/Chordly
10. https://dev.to/ryankolter/vscode-4-commands-and-keybindings-system-4nhm
