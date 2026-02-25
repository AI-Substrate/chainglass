# Deep Linking

How URL state management works in Chainglass, and how to add deep-linkable params to new pages.

## Overview

Every page in Chainglass uses URL search params as the source of truth for UI state. This means:
- Every view is bookmarkable and shareable
- Browser back/forward navigation works between states
- Multiple tabs can show different views of the same workspace

We use [nuqs](https://nuqs.47ng.com/) for type-safe URL state management. It provides a `useState`-like API that syncs with search params.

## Architecture

```
URL: /workspaces/my-proj/browser?worktree=/path&file=README.md&mode=preview&panel=tree
                                 ─────────────── ─────────────── ──────────── ──────────
                                 workspace param   file browser params
```

**Shared params** (all workspace pages): `worktree`
**Page-specific params** (file browser): `dir`, `file`, `mode`, `panel`

### Key Files

| File | Role |
|------|------|
| `apps/web/src/lib/params/workspace.params.ts` | Shared `worktree` param definition |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | File browser param definitions |
| `apps/web/src/lib/workspace-url.ts` | `workspaceHref()` URL builder |

## Defining Params

Params are defined using nuqs parsers with defaults:

```typescript
// apps/web/src/lib/params/workspace.params.ts
import { parseAsString } from 'nuqs';

export const workspaceParams = {
  worktree: parseAsString.withDefault(''),
};
```

```typescript
// apps/web/src/features/041-file-browser/params/file-browser.params.ts
import { parseAsString, parseAsStringLiteral } from 'nuqs';

export const fileBrowserParams = {
  dir: parseAsString.withDefault(''),
  file: parseAsString.withDefault(''),
  mode: parseAsStringLiteral(['edit', 'preview', 'diff'] as const).withDefault('preview'),
  panel: parseAsStringLiteral(['tree', 'changes'] as const).withDefault('tree'),
};
```

Available parsers: `parseAsString`, `parseAsStringLiteral` (enum), `parseAsInteger`, `parseAsBoolean`. See [nuqs docs](https://nuqs.47ng.com/) for the full list.

## Reading Params (Server Components)

Use `createSearchParamsCache` for server-side access:

```typescript
import { createSearchParamsCache } from 'nuqs/server';

export const fileBrowserPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...fileBrowserParams,
});
```

Then in the page Server Component:

```typescript
export default async function BrowserPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const worktreePath = typeof resolved.worktree === 'string' ? resolved.worktree : defaultPath;
  // Use params for server-side data fetching
}
```

## Reading/Writing Params (Client Components)

Use `useQueryStates` for client-side binding:

```typescript
'use client';
import { useQueryStates } from 'nuqs';
import { fileBrowserParams } from '@/features/041-file-browser/params/file-browser.params';

function BrowserClient() {
  const [params, setParams] = useQueryStates(fileBrowserParams);

  // Read
  const currentFile = params.file;
  const currentMode = params.mode; // typed as 'edit' | 'preview' | 'diff'

  // Write (URL updates automatically)
  const selectFile = (file: string) => setParams({ file });
  const changeMode = (mode: string) => setParams({ mode });
}
```

### Browser History

By default, `setParams` uses `replaceState` (no history entry). To create a history entry for back/forward navigation, pass `{ history: 'push' }`:

```typescript
// File selection creates history entries (back/forward between files)
setParams({ file }, { history: 'push' });

// Mode changes replace current entry (don't pollute history)
setParams({ mode: 'edit' });
```

## Building URLs

Use `workspaceHref()` to construct workspace-scoped URLs:

```typescript
import { workspaceHref } from '@/lib/workspace-url';

// /workspaces/my-proj/browser?worktree=%2Fpath
workspaceHref('my-proj', '/browser', { worktree: '/path' });

// /workspaces/my-proj/browser?worktree=%2Fpath&file=README.md&mode=preview
workspaceHref('my-proj', '/browser', {
  worktree: '/path',
  file: 'README.md',
  mode: 'preview',
});
```

`workspaceHref` automatically:
- URI-encodes the slug and option values
- Places `worktree` first in the query string for readability
- Omits empty, null, undefined, or false values

## Adding Params to a New Page (Step-by-Step)

### 1. Define your params

```typescript
// apps/web/src/features/YOUR_FEATURE/params/my-page.params.ts
import { parseAsString, parseAsStringLiteral } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';
import { workspaceParams } from '@/lib/params/workspace.params';

export const myPageParams = {
  tab: parseAsStringLiteral(['overview', 'details'] as const).withDefault('overview'),
  search: parseAsString.withDefault(''),
};

export const myPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...myPageParams,
});
```

### 2. Use in your Server Component

```typescript
// apps/web/app/(dashboard)/workspaces/[slug]/my-page/page.tsx
export default async function MyPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolved = await searchParams;
  // Use resolved.tab, resolved.search for server-side logic
}
```

### 3. Use in your Client Component

```typescript
'use client';
import { useQueryStates } from 'nuqs';
import { myPageParams } from '@/features/YOUR_FEATURE/params/my-page.params';

function MyPageClient() {
  const [params, setParams] = useQueryStates(myPageParams);
  // params.tab, params.search are typed and synced with URL
}
```

### 4. Set page identity for tab titles

```typescript
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';

function MyPageClient({ worktreePath, worktreeBranch }) {
  const ctx = useWorkspaceContext();

  useEffect(() => {
    ctx?.setWorktreeIdentity({
      worktreePath,
      branch: worktreeBranch,
      pageTitle: 'My Page',
    });
    return () => ctx?.setWorktreeIdentity(null);
  }, [worktreePath, worktreeBranch]);
}
```

This sets the browser tab title to `{emoji} {branch} — My Page`.

## WorkspaceContext

The `[slug]/layout.tsx` provides a `WorkspaceContext` to all workspace pages. It contains:

- `slug`, `name`, `emoji`, `color` — workspace identity
- `worktreeIdentity` — per-worktree identity (branch, emoji, color, pageTitle)
- `setWorktreeIdentity()` — pages announce themselves for tab titles
- `hasChanges`, `setHasChanges()` — attention system for tab title ❗ prefix

Pages don't need to fetch workspace data — it's already in context from the layout.
