# Consuming the USDK

How to use SDK features from your React components — executing commands, reading settings, and accessing context.

## Hooks

### `useSDK()` — Access the SDK instance

```typescript
import { useSDK } from '@/lib/sdk/sdk-provider';

function MyComponent() {
  const sdk = useSDK();

  const handleClick = () => {
    sdk.commands.execute('file-browser.openFileAtLine', {
      path: 'src/index.ts',
      line: 42,
    });
  };

  return <button onClick={handleClick}>Open File</button>;
}
```

### `useSDKSetting()` — Reactive setting value

```typescript
import { useSDKSetting } from '@/lib/sdk/use-sdk-setting';

function MyComponent() {
  const [fontSize, setFontSize] = useSDKSetting<number>('editor.fontSize');

  return (
    <div style={{ fontSize }}>
      <button onClick={() => setFontSize((fontSize ?? 14) + 1)}>
        Increase Font Size
      </button>
    </div>
  );
}
```

The hook returns `[value, setValue]` — similar to `useState`. Changes persist to workspace preferences automatically (300ms debounce).

### `useSDKContext()` — Reactive context key

```typescript
import { useSDKContext } from '@/lib/sdk/use-sdk-context';

function MyComponent() {
  const hasOpenFile = useSDKContext('file-browser.hasOpenFile');

  return hasOpenFile ? <FileTools /> : null;
}
```

## Command Palette

Users open the command palette with **Ctrl+Shift+P** (or **Cmd+Shift+P** on Mac). Type `>` in the explorer bar to activate palette mode.

All registered commands appear in the palette, sorted by most recently used (MRU).

## Toast

```typescript
const sdk = useSDK();

// Direct convenience methods
sdk.toast.success('File saved');
sdk.toast.error('Permission denied');
sdk.toast.info('Processing...');
sdk.toast.warning('Unsaved changes');
```

## Listing Commands & Shortcuts

```typescript
const sdk = useSDK();

// List all commands
const commands = sdk.commands.list();

// List by domain
const fbCommands = sdk.commands.list({ domain: 'file-browser' });

// List keyboard shortcuts
const bindings = sdk.keybindings.getBindings();
```

## ADR & Workshops

- [ADR-0013: USDK Architecture](../../adr/adr-0013-usdk-internal-sdk-architecture.md)
- [Workshop 003: Settings Data Model](../../plans/047-usdk/workshops/003-settings-domain-data-model.md)
- [Workshop 004: SDK Events](../../plans/047-usdk/workshops/004-sdk-event-firing-via-events-domain.md)
