# Workshop: Deep Linking System

**Type**: Integration Pattern
**Plan**: 041-file-browser
**Spec**: docs/plans/041-file-browser/research.md
**Created**: 2026-02-22
**Status**: Draft

**Related Documents**:
- [Exploration Research Dossier](../research.md)
- [nuqs library](https://nuqs.dev) — Type-safe URL state for Next.js

---

## Purpose

Design a reusable, zero-boilerplate deep linking system so that every page in the app — file browser, agent chat, workgraphs, future features — can have its full UI state encoded in the URL. Users should be able to bookmark, share, and pin URLs to get back to exactly where they were. Developers should be able to add deep linking to new pages with 1-2 lines of code.

## Key Questions Addressed

- How to make URL state management feel like `useState` (zero ceremony)?
- How to handle workspace-scoping (slug + worktree) across all workspace pages?
- How to keep server components and client components working together with URL state?
- How to avoid duplicating URLSearchParams boilerplate on every page?
- What's the idiomatic Next.js pattern vs what we should standardise ourselves?

---

## 1. Problem Statement: Current Pain Points

Today, workspace-scoped pages manually thread `?worktree=` through search params:

```typescript
// CURRENT: Every page duplicates this (5 pages and growing)
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ worktree?: string }>;
}

export default async function SomePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree: worktreePath } = await searchParams;
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);
  // ...
}
```

Client components manually construct URLs:

```typescript
// CURRENT: Ad-hoc URL building scattered everywhere
const agentsUrl = `/workspaces/${slug}/agents?worktree=${encodeURIComponent(worktreePath)}`;
const samplesUrl = `/workspaces/${slug}/samples?worktree=${encodeURIComponent(worktreePath)}`;
```

There's no type-safe way to manage client-side search params. No standard for what params each page supports. No way to add new state (like `?file=` or `?mode=edit`) without writing raw URLSearchParams code.

---

## 2. Proposed Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Page Components (Server & Client)                              │
│  "Just use the hooks / helpers — URL state is automatic"        │
├─────────────────────────────────────────────────────────────────┤
│  Feature-Specific Param Definitions                             │
│  e.g. fileBrowserParams, agentChatParams                        │
│  "Declare what params your feature uses, with types & defaults" │
├─────────────────────────────────────────────────────────────────┤
│  Workspace URL Kit (our reusable layer)                         │
│  useWorkspaceParams(), workspaceHref(), parseWorkspaceParams()  │
│  "Workspace-scoped URL helpers that all pages share"            │
├─────────────────────────────────────────────────────────────────┤
│  nuqs (3rd-party library, ~3KB gzip)                            │
│  useQueryState(), useQueryStates(), NuqsAdapter                 │
│  "Type-safe URL ↔ state sync, instant updates, SSR-safe"        │
├─────────────────────────────────────────────────────────────────┤
│  Next.js App Router                                             │
│  useSearchParams, usePathname, useRouter, params, searchParams  │
└─────────────────────────────────────────────────────────────────┘
```

### Why `nuqs` over rolling our own?

| Concern | Roll our own | nuqs |
|---------|-------------|------|
| Type-safe parsing | Manual Zod/casting | Built-in parsers (`parseAsString`, `parseAsInteger`, `parseAsArrayOf`) |
| Instant URL updates | `router.replace()` → re-renders entire route | History API → client-only, no server round-trip |
| Debouncing/throttling | Manual | Built-in option |
| SSR/RSC support | Manual hydration care | `createSearchParamsCache()` for server components |
| API surface | Custom hooks (~100 LOC each) | `useState`-like API, 1 line per param |
| Bundle size | 0 (but LOC cost) | ~3KB gzipped |
| Maintenance | Ours to maintain forever | Active OSS, 5k+ stars, Vercel-adjacent |

**Decision: Use `nuqs`** as the foundation. It removes 90% of boilerplate while giving us type safety and instant updates. We wrap it with thin workspace-aware helpers.

---

## 3. Detailed Design

### 3.1 Installation & Setup

```bash
pnpm add nuqs
```

Wire the adapter in the root layout (one-time):

```typescript
// apps/web/app/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider ...>
          <Providers>
            <NuqsAdapter>{children}</NuqsAdapter>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### 3.2 Param Definition Pattern

Each feature declares its URL params as a plain object of `nuqs` parsers. This is the "schema" for that page's URL state.

```typescript
// apps/web/src/lib/params/file-browser.params.ts
import { parseAsString, parseAsStringLiteral, parseAsBoolean } from 'nuqs';

/**
 * URL params for the file browser page.
 * 
 * Example URL: /workspaces/my-proj/browser?worktree=/path&dir=src/lib&file=utils.ts&mode=edit
 */
export const fileBrowserParams = {
  /** Current directory path (relative to worktree root) */
  dir: parseAsString.withDefault(''),
  /** Selected file path (relative to worktree root) */
  file: parseAsString.withDefault(''),
  /** Viewer mode */
  mode: parseAsStringLiteral(['edit', 'preview', 'diff'] as const).withDefault('preview'),
  /** Show only git-changed files */
  changed: parseAsBoolean.withDefault(false),
};

/** Type derived from param definitions — use in components */
export type FileBrowserParams = {
  dir: string;
  file: string;
  mode: 'edit' | 'preview' | 'diff';
  changed: boolean;
};
```

```typescript
// apps/web/src/lib/params/agent-chat.params.ts
import { parseAsString } from 'nuqs';

export const agentChatParams = {
  /** Active tab in agent view */
  tab: parseAsString.withDefault('chat'),
};
```

```typescript
// apps/web/src/lib/params/index.ts
export { fileBrowserParams, type FileBrowserParams } from './file-browser.params';
export { agentChatParams } from './agent-chat.params';
```

### 3.3 Client Components — `useQueryStates` (the core pattern)

In any client component, use the param definition directly with `nuqs`:

```typescript
// apps/web/src/components/file-browser/file-browser-panel.tsx
'use client';

import { useQueryStates } from 'nuqs';
import { fileBrowserParams } from '@/lib/params';

export function FileBrowserPanel() {
  // State synced to URL — works exactly like useState
  const [params, setParams] = useQueryStates(fileBrowserParams);

  // Read: params.dir, params.file, params.mode, params.changed
  // Write: setParams({ file: 'README.md', mode: 'preview' })
  //   → URL updates to ?file=README.md&mode=preview (instant, no re-render of server components)

  const handleFileSelect = (filePath: string) => {
    setParams({ file: filePath, mode: 'preview' });
  };

  const handleModeChange = (mode: 'edit' | 'preview' | 'diff') => {
    setParams({ mode });
  };

  const handleToggleChanged = () => {
    setParams({ changed: !params.changed });
  };

  return (
    <div>
      <FileTree
        currentDir={params.dir}
        onNavigate={(dir) => setParams({ dir, file: '' })}
        changedOnly={params.changed}
        onToggleChanged={handleToggleChanged}
      />
      <FileViewerPanel
        filePath={params.file}
        mode={params.mode}
        onModeChange={handleModeChange}
      />
    </div>
  );
}
```

**That's it.** No URLSearchParams. No `router.replace`. No manual encoding. The URL is the state.

### 3.4 Server Components — `createSearchParamsCache`

Server components can't use hooks. `nuqs` provides `createSearchParamsCache` for type-safe server-side parsing:

```typescript
// apps/web/src/lib/params/file-browser.params.ts (add to existing file)
import { createSearchParamsCache } from 'nuqs/server';

export const fileBrowserParamsCache = createSearchParamsCache(fileBrowserParams);
```

```typescript
// apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx
import { fileBrowserParamsCache } from '@/lib/params/file-browser.params';
import type { SearchParams } from 'nuqs/server';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function BrowserPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { dir, file, mode } = fileBrowserParamsCache.parse(await searchParams);
  
  // Type-safe: dir is string, mode is 'edit' | 'preview' | 'diff'
  // Use for server-side data fetching, metadata, etc.
}
```

### 3.5 Workspace URL Kit — The Shared Layer

The workspace slug comes from the route path (`[slug]`), not search params. The worktree comes from `?worktree=`. Every workspace page needs both. We standardise this:

```typescript
// apps/web/src/lib/params/workspace.params.ts
import { parseAsString } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';

/**
 * Base params shared by ALL workspace-scoped pages.
 * The workspace slug comes from the URL path [slug], not search params.
 * The worktree path is the one universal search param.
 */
export const workspaceParams = {
  worktree: parseAsString.withDefault(''),
};

/** Server-side cache for workspace params */
export const workspaceParamsCache = createSearchParamsCache(workspaceParams);
```

```typescript
// apps/web/src/lib/workspace-url.ts
/**
 * Workspace URL Kit — helpers for building workspace-scoped URLs.
 * 
 * Usage:
 *   workspaceHref('my-proj', '/browser', { file: 'README.md', mode: 'preview' })
 *   → '/workspaces/my-proj/browser?file=README.md&mode=preview'
 * 
 *   workspaceHref('my-proj', '/browser', { file: 'README.md' }, '/path/to/worktree')
 *   → '/workspaces/my-proj/browser?worktree=%2Fpath%2Fto%2Fworktree&file=README.md'
 */

/**
 * Build a workspace-scoped URL with optional search params.
 * Handles encoding, omits empty/default values to keep URLs clean.
 */
export function workspaceHref(
  slug: string,
  subPath: string,
  searchParams?: Record<string, string | boolean | number | undefined>,
  worktreePath?: string,
): string {
  const base = `/workspaces/${encodeURIComponent(slug)}${subPath}`;
  const params = new URLSearchParams();

  if (worktreePath) {
    params.set('worktree', worktreePath);
  }

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '' && value !== false) {
        params.set(key, String(value));
      }
    }
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Parse the common workspace context from server component props.
 * Reduces boilerplate in every workspace page.
 */
export async function parseWorkspacePageProps(
  params: Promise<{ slug: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  const { slug } = await params;
  const sp = await searchParams;
  const worktree = typeof sp.worktree === 'string' ? sp.worktree : undefined;
  return { slug, worktree };
}
```

### 3.6 Combining Workspace Params + Feature Params

When a feature page needs both workspace context AND its own params, merge them:

```typescript
// apps/web/src/lib/params/file-browser.params.ts
import { parseAsString, parseAsStringLiteral, parseAsBoolean } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';
import { workspaceParams } from './workspace.params';

export const fileBrowserParams = {
  dir: parseAsString.withDefault(''),
  file: parseAsString.withDefault(''),
  mode: parseAsStringLiteral(['edit', 'preview', 'diff'] as const).withDefault('preview'),
  changed: parseAsBoolean.withDefault(false),
};

/** Combined params for server-side parsing (workspace + file browser) */
export const fileBrowserPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...fileBrowserParams,
});
```

Server component uses the combined cache:

```typescript
// apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx
export default async function BrowserPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree, dir, file, mode } = fileBrowserPageParamsCache.parse(await searchParams);
  
  // Resolve workspace context
  const context = await workspaceService.resolveContextFromParams(slug, worktree || undefined);
  
  // Server-side: maybe prefetch file metadata for `file` if set
  // Then pass to client component which uses useQueryStates(fileBrowserParams)
}
```

---

## 4. Usage Examples — Adding Deep Linking to a New Page

### Example: Adding a new "Workflows" page (future feature)

**Step 1: Define params** (~10 lines)

```typescript
// apps/web/src/lib/params/workflows.params.ts
import { parseAsString, parseAsStringLiteral } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';
import { workspaceParams } from './workspace.params';

export const workflowsParams = {
  selected: parseAsString.withDefault(''),
  tab: parseAsStringLiteral(['overview', 'runs', 'config'] as const).withDefault('overview'),
};

export const workflowsPageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...workflowsParams,
});
```

**Step 2: Use in client component** (1 line to bind)

```typescript
'use client';
import { useQueryStates } from 'nuqs';
import { workflowsParams } from '@/lib/params/workflows.params';

export function WorkflowsView() {
  const [params, setParams] = useQueryStates(workflowsParams);
  // params.selected, params.tab — synced to URL
  // setParams({ selected: 'deploy-prod', tab: 'runs' }) — updates URL instantly
}
```

**Step 3: Use in server component** (1 line to parse)

```typescript
export default async function WorkflowsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const parsed = workflowsPageParamsCache.parse(await searchParams);
  // parsed.worktree, parsed.selected, parsed.tab — all typed
}
```

**That's the entire integration.** No URLSearchParams. No router.replace. No encoding. Just declare → use.

### Example: Deep link to agent chat with specific tab

```typescript
import { workspaceHref } from '@/lib/workspace-url';

// Build link programmatically
const url = workspaceHref('my-project', `/agents/${agentId}`, { tab: 'logs' });
// → '/workspaces/my-project/agents/abc123?tab=logs'

// In JSX
<Link href={workspaceHref(slug, `/agents/${agent.id}`, { tab: 'logs' })}>
  View Logs
</Link>
```

### Example: Pinnable file browser URL

```
/workspaces/my-project/browser?worktree=%2Fhome%2Fjak%2Fproject&dir=src%2Flib&file=utils.ts&mode=edit
```

User bookmarks this. Next time they open it → file browser opens at `src/lib/utils.ts` in edit mode.

---

## 5. File Structure

```
apps/web/src/lib/params/
├── index.ts                    # Re-exports all param definitions
├── workspace.params.ts         # worktree param (shared by all workspace pages)
├── file-browser.params.ts      # dir, file, mode, changed
├── agent-chat.params.ts        # tab
└── [future-feature].params.ts  # Add new files as features grow

apps/web/src/lib/
├── workspace-url.ts            # workspaceHref(), parseWorkspacePageProps()
└── ... (existing files)
```

---

## 6. Migration Path for Existing Pages

Existing pages that manually use `?worktree=` can be migrated incrementally:

### Before (current pattern):
```typescript
const { worktree: worktreePath } = await searchParams;
const url = `/workspaces/${slug}/samples?worktree=${encodeURIComponent(worktreePath)}`;
```

### After (with workspace URL kit):
```typescript
const { slug, worktree } = await parseWorkspacePageProps(params, searchParams);
const url = workspaceHref(slug, '/samples', {}, worktree);
```

**Migration is optional** — existing pages work fine. New pages should use the new pattern. Migrate old pages opportunistically.

---

## 7. Workspace Emoji Session

The user wants a random emoji per workspace tab for quick visual identification. This is orthogonal to deep linking but related to workspace binding.

**Design**: Store emoji in `sessionStorage` (per-tab, not per-URL).

```typescript
// apps/web/src/hooks/useWorkspaceEmoji.ts
'use client';
import { useEffect, useState } from 'react';

const EMOJI_POOL = ['🔮', '🌊', '🔥', '⚡', '🌿', '🎯', '💎', '🚀', '🌈', '🎪',
  '🦊', '🐙', '🌸', '🍊', '🎲', '🧊', '🌺', '🦋', '🍀', '⭐'];

export function useWorkspaceEmoji(workspaceSlug: string): string {
  const [emoji, setEmoji] = useState('');

  useEffect(() => {
    const key = `workspace-emoji:${workspaceSlug}`;
    let stored = sessionStorage.getItem(key);
    if (!stored) {
      stored = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
      sessionStorage.setItem(key, stored);
    }
    setEmoji(stored);
  }, [workspaceSlug]);

  return emoji;
}
```

Usage in header:
```typescript
const emoji = useWorkspaceEmoji(slug);
// Title: "🔮 my-project" — different emoji in each tab
```

This uses `sessionStorage` (tab-scoped, not URL-scoped) which is correct — the emoji is per browser tab session, not something you'd want in a bookmark.

---

## 8. Server Component vs Client Component Decision Tree

```
Does this component need to READ URL params?
├─ Server Component → use xxxParamsCache.parse(searchParams)
│  (for data fetching, metadata, initial props)
│
└─ Client Component → use useQueryStates(xxxParams)
   (for interactive state, user input, instant updates)

Does this component need to WRITE URL params?
├─ MUST be Client Component → setParams({ key: value })
│
└─ Or use <Link href={workspaceHref(...)}> (works in both)
```

**Golden rule**: Server components parse params for data fetching. Client components own the interactive state. Use `workspaceHref()` + `<Link>` for navigation in either.

---

## 9. Testing Strategy

### Unit tests for param definitions:

```typescript
// test/unit/web/lib/params/file-browser-params.test.ts
import { describe, expect, it } from 'vitest';
import { fileBrowserPageParamsCache } from '@/lib/params/file-browser.params';

describe('fileBrowserPageParamsCache', () => {
  it('parses empty search params with defaults', () => {
    const result = fileBrowserPageParamsCache.parse({});
    expect(result.dir).toBe('');
    expect(result.file).toBe('');
    expect(result.mode).toBe('preview');
    expect(result.changed).toBe(false);
  });

  it('parses populated search params', () => {
    const result = fileBrowserPageParamsCache.parse({
      dir: 'src/lib',
      file: 'utils.ts',
      mode: 'edit',
      changed: 'true',
      worktree: '/home/jak/project',
    });
    expect(result.dir).toBe('src/lib');
    expect(result.mode).toBe('edit');
    expect(result.changed).toBe(true);
    expect(result.worktree).toBe('/home/jak/project');
  });

  it('falls back to default for invalid mode', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'invalid' });
    expect(result.mode).toBe('preview');
  });
});
```

### Unit tests for workspaceHref:

```typescript
// test/unit/web/lib/workspace-url.test.ts
import { describe, expect, it } from 'vitest';
import { workspaceHref } from '@/lib/workspace-url';

describe('workspaceHref', () => {
  it('builds basic workspace URL', () => {
    expect(workspaceHref('my-proj', '/browser')).toBe('/workspaces/my-proj/browser');
  });

  it('includes worktree param', () => {
    const url = workspaceHref('my-proj', '/browser', {}, '/home/jak/proj');
    expect(url).toContain('worktree=%2Fhome%2Fjak%2Fproj');
  });

  it('includes feature params', () => {
    const url = workspaceHref('my-proj', '/browser', { file: 'README.md', mode: 'edit' });
    expect(url).toContain('file=README.md');
    expect(url).toContain('mode=edit');
  });

  it('omits empty/false/undefined params', () => {
    const url = workspaceHref('my-proj', '/browser', { file: '', mode: undefined, changed: false });
    expect(url).toBe('/workspaces/my-proj/browser');
  });
});
```

---

## 10. Open Questions

### Q1: Should `nuqs` replace ALL existing `useSearchParams` usage?

**RESOLVED**: Yes, for new code. Existing pages migrate opportunistically. The `NuqsAdapter` wraps the app — it's compatible with existing `useSearchParams` usage so nothing breaks.

### Q2: Should the worktree param be in the URL path instead of search params?

**RESOLVED**: Keep as search param (`?worktree=`). Worktree paths contain `/` characters which would require complex encoding in URL segments. Search params handle this naturally. The current pattern works well and all existing pages use it.

### Q3: Should we persist the "selected workspace" somewhere?

**RESOLVED**: No persistent state needed. The URL IS the state. Each browser tab has its own URL → its own workspace context. This is exactly what the user wants ("different workspaces in different browser tabs"). The emoji is the only per-tab decoration, and it uses `sessionStorage`.

### Q4: What about the `z` (Zod) library for server-side validation?

**RESOLVED**: Not needed. `nuqs/server`'s `createSearchParamsCache` handles parsing and defaults. If we need stricter validation (e.g., "file path must not contain `..`"), we do that in the server action / API layer, not in the URL parser.

---

## 11. Quick Reference — Cheatsheet

```typescript
// === DEFINE params for your feature ===
// apps/web/src/lib/params/my-feature.params.ts
import { parseAsString, parseAsInteger, parseAsBoolean, parseAsStringLiteral } from 'nuqs';
import { createSearchParamsCache } from 'nuqs/server';
import { workspaceParams } from './workspace.params';

export const myFeatureParams = {
  tab: parseAsStringLiteral(['a', 'b', 'c'] as const).withDefault('a'),
  page: parseAsInteger.withDefault(1),
  query: parseAsString.withDefault(''),
};

export const myFeaturePageParamsCache = createSearchParamsCache({
  ...workspaceParams,
  ...myFeatureParams,
});

// === USE in client component ===
'use client';
import { useQueryStates } from 'nuqs';
import { myFeatureParams } from '@/lib/params/my-feature.params';

const [params, setParams] = useQueryStates(myFeatureParams);
// Read:  params.tab, params.page, params.query
// Write: setParams({ tab: 'b', page: 2 })

// === USE in server component ===
const parsed = myFeaturePageParamsCache.parse(await searchParams);
// parsed.worktree, parsed.tab, parsed.page, parsed.query

// === BUILD links ===
import { workspaceHref } from '@/lib/workspace-url';
workspaceHref(slug, '/my-feature', { tab: 'b', page: '2' }, worktree);
// → '/workspaces/slug/my-feature?worktree=...&tab=b&page=2'
```
