# Workshop: Global Toast Notification System

**Type**: Integration Pattern
**Plan**: 041-file-browser
**Spec**: [file-browser-spec.md](../file-browser-spec.md)
**Created**: 2026-02-24
**Status**: Draft

**Related Documents**:
- [ADR-0010: Central Domain Event Notification Architecture](../../adr/adr-0010-central-domain-event-notification-architecture.md)
- [Plan 027: Central Notify Events](../../plans/027-central-notify-events/central-notify-events-plan.md)

**Domain Context**:
- **New Domain**: `_platform/toast` — infrastructure domain providing global toast UI
- **Consumers**: `file-browser`, `022-workgraph-ui`, any future feature
- **Related**: `_platform/viewer` (pattern precedent — shared UI component as domain)

---

## Purpose

Design a reusable global toast notification system that any component can call with a single function. This replaces ad-hoc `useState<string>` toast patterns (e.g., workgraph-detail-client) with a proper stackable, icon-aware, colour-coded system. This is the **UI presentation layer** for notifications — it complements the server-side central notification architecture (ADR-0010) which handles SSE event delivery.

## Key Questions Addressed

- What library to use? (sonner vs shadcn toast vs custom)
- How do components call `toast()` without prop drilling?
- How does it work with server actions?
- How do we make it dead simple to use from any component?
- What's the DX for a developer adding toast to a new feature?

---

## Decision: Sonner

**Why sonner over shadcn toast**:

| | Sonner | shadcn/ui toast |
|---|---|---|
| **API** | `toast('message')` — one function call | `useToast()` hook + `toast({...})` — requires hook context |
| **Import** | `import { toast } from 'sonner'` anywhere | Must be in a React component (hook) |
| **Server action result** | Easy — call in `.then()` or `useEffect` | Same, but hookdependency |
| **Stacking** | Built-in, beautiful | Built-in |
| **Icons** | Built-in per type (success ✓, error ✗, info ℹ) | Manual via variant |
| **Bundle** | ~5KB gzipped | Radix + custom (~8KB) |
| **Styling** | Tailwind-friendly, theme-aware | Full Tailwind control |

**Decision**: Use **sonner**. The killer feature is `toast('message')` works **anywhere** — no hook required. A server action callback, a utility function, a hook, a component — all just `import { toast } from 'sonner'`. Zero boilerplate.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Root Layout (app/layout.tsx)                     │
│                                                  │
│   <Toaster />  ← renders portal for all toasts  │
│   {children}                                     │
│                                                  │
└─────────────────────────────────────────────────┘

Any component/hook/callback:
  import { toast } from 'sonner'
  toast.success('File saved')
```

No context provider. No hook. Sonner uses a module-level event emitter — `toast()` is a plain function call that triggers the `<Toaster />` component to render.

---

## Setup

### 1. Install

```bash
pnpm --filter @chainglass/web add sonner
```

### 2. Add `<Toaster />` to root layout

```tsx
// apps/web/app/layout.tsx
import { Toaster } from 'sonner'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            className: 'font-sans',
          }}
        />
      </body>
    </html>
  )
}
```

**Props**:
- `position="bottom-right"` — out of the way, visible
- `richColors` — enables coloured backgrounds for success/error/warning/info
- `closeButton` — manual dismiss
- `toastOptions.className` — inherits our font

### 3. Theme integration

Sonner respects the `theme` prop. We use `next-themes`, so:

```tsx
'use client'
import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from 'next-themes'

export function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{
        className: 'font-sans',
      }}
    />
  )
}
```

Place this wrapper at `apps/web/src/components/ui/toaster.tsx` — follows shadcn UI component pattern.

---

## Usage API

### Basic

```tsx
import { toast } from 'sonner'

// Simple
toast('Something happened')

// With type (icon + colour automatic)
toast.success('File saved')
toast.error('Save failed: conflict detected')
toast.warning('File modified on disk')
toast.info('3 files changed')
```

### With description

```tsx
toast.success('File saved', {
  description: 'README.md updated successfully',
})
```

### With action button

```tsx
toast.error('Save conflict', {
  description: 'File was modified by another process',
  action: {
    label: 'Force save',
    onClick: () => handleForceSave(),
  },
})
```

### Promise (async operation)

```tsx
toast.promise(saveFile(slug, worktree, path, content, mtime), {
  loading: 'Saving...',
  success: 'File saved',
  error: 'Save failed',
})
```

### Stacking

Multiple calls stack automatically. Most recent at bottom. Auto-dismiss after 4s (configurable per-toast via `duration`).

---

## Integration Patterns

### Pattern 1: File browser save

```tsx
// In BrowserClient handleSave:
const handleSave = async (content: string) => {
  if (!selectedFile || !fileData?.ok) return
  const result = await saveFile(slug, worktreePath, selectedFile, content, fileData.mtime)
  if (result.ok) {
    toast.success('File saved')
    const refreshed = await readFile(slug, worktreePath, selectedFile)
    setFileData(refreshed)
  } else if (result.error === 'conflict') {
    toast.error('Save conflict', {
      description: 'File was modified externally. Refresh to see changes.',
      action: {
        label: 'Force save',
        onClick: () => handleForceSave(content),
      },
    })
  }
}
```

### Pattern 2: SSE external change notification (replace workgraph inline toast)

```tsx
// In workgraph-detail-client.tsx:
// BEFORE:
setToast('Graph updated from external change')
setTimeout(() => setToast(null), 3000)

// AFTER:
import { toast } from 'sonner'
toast.info('Graph updated from external change')
// No state, no timeout, no cleanup
```

### Pattern 3: From a hook

```tsx
// In any custom hook:
import { toast } from 'sonner'

export function useFileOperations() {
  const refresh = async () => {
    toast.info('Refreshing...')
    // ...
    toast.success('Refreshed')
  }
}
```

### Pattern 4: From server action result via useEffect

```tsx
// When using useActionState:
useEffect(() => {
  if (state?.ok) toast.success('Done')
  if (state?.error) toast.error(state.error)
}, [state])
```

---

## Testing

Sonner's `toast()` is a plain function — no React context needed. In tests:

```tsx
// Mock sonner in test
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  }),
}))

// Assert
import { toast } from 'sonner'
expect(toast.success).toHaveBeenCalledWith('File saved')
```

No rendering `<Toaster />` in tests. Just verify `toast()` was called with the right args.

---

## Migration: Workgraph inline toast → sonner

The workgraph-detail-client currently uses:
- `useState<string | null>(null)` for toast
- `setTimeout(() => setToast(null), 3000)` for auto-dismiss
- Inline `<div className="absolute top-16 right-4 z-50 bg-blue-500...">` for rendering

**Migration**:
1. Remove `const [toast, setToast] = useState<string | null>(null)`
2. Replace `setToast('message')` with `toast.info('message')` (from sonner import)
3. Remove `setTimeout` cleanup
4. Remove inline toast `<div>` from JSX
5. Same for error toast — replace with `toast.error(error)`

Net: **remove ~15 lines**, add 1 import.

---

## File Structure

```
apps/web/src/components/ui/
  └── toaster.tsx          # Theme-aware <Toaster /> wrapper

# Usage: import { toast } from 'sonner' — no local wrapper needed
# The toast() function is the public API, not a component
```

---

## Domain: `_platform/toast`

This is an infrastructure domain. Minimal footprint:

| What | Where |
|------|-------|
| Toaster wrapper | `apps/web/src/components/ui/toaster.tsx` |
| Layout mount | `apps/web/app/layout.tsx` (one line) |
| Public API | `import { toast } from 'sonner'` (npm package, no wrapper needed) |

**Why a domain?** It's a shared infrastructure component that every feature will use. Tracking it as a domain means we can find all toast consumers, and future enhancements (persistent notifications, notification centre) have a clear home.

**Contracts**:
- `<Toaster />` — mounted once in root layout, consumed by all features
- `toast()` / `toast.success()` / `toast.error()` etc. — sonner's API is the contract

---

## Open Questions

### Q1: Should we wrap sonner's `toast()` in our own function?

**RESOLVED**: No. Sonner's API is already perfect — `toast.success('msg')` is as clean as it gets. Wrapping adds indirection with no benefit. If we ever need to swap libraries, we'd search-replace `from 'sonner'` imports.

### Q2: Position?

**RESOLVED**: `bottom-right`. Out of the way of the file tree (left) and viewer panel (center). Consistent with VS Code notification position.

### Q3: Should the `<Toaster />` be in root layout or dashboard layout?

**RESOLVED**: Root layout. Toasts should work on every page, including any future non-dashboard pages (login, settings, etc).

### Q4: Duration?

**RESOLVED**: Default 4s (sonner default). Errors persist until dismissed (set `duration: Infinity` for errors, or use sonner's `richColors` which makes errors more prominent).

---

## Implementation Checklist

1. `pnpm --filter @chainglass/web add sonner`
2. Create `apps/web/src/components/ui/toaster.tsx` (theme-aware wrapper)
3. Add `<Toaster />` to `apps/web/app/layout.tsx`
4. Wire into file browser save/refresh flows
5. Migrate workgraph inline toast to sonner
6. Add to domain registry as `_platform/toast`
