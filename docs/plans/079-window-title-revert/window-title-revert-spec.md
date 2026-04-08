# Fix Window Titles Reverting to "Chainglass"

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from research-dossier.md (56 findings from 8 parallel subagents).

Key research findings:
- Browser tab titles are composed client-side via a singleton TitleManager — SSR always shows "Chainglass"
- Only 1 of 13 workspace pages (BrowserClient) sets worktreeIdentity with branch name
- No workspace sub-layout uses `generateMetadata()` — so SSR title is always the root fallback
- BrowserClient clears worktreeIdentity on unmount, degrading the title when navigating away
- The TitleManager is in-memory only; all state lost on page reload

## Summary

**WHAT**: After page reload or navigating between workspace pages, the browser tab title shows "Chainglass" instead of the expected `{emoji} {branch} — {page}` format (e.g., "🔧 077-random-enhancements-2 — Browser"). Users lose the ability to distinguish between multiple open tabs, making multi-workspace workflows frustrating.

**WHY**: The root cause is architectural — page titles are only composed client-side via useEffect hooks, and the SSR-rendered HTML always contains `<title>Chainglass</title>` from the root layout's static metadata export. Additionally, only the browser page sets the worktree identity (branch name + page label); all other pages fall back to just the workspace name.

## Goals

- Tab title shows meaningful workspace/branch info immediately on page load (SSR), not just after hydration
- Every workspace page contributes a page-specific label to the tab title (e.g., "Terminal", "Workflows", "Agents")
- Tab titles survive client-side navigation between workspace pages without reverting to generic fallback
- Users can distinguish between multiple open workspace tabs at a glance

## Non-Goals

- Changing the TitleManager architecture or prefix system — it works well for dynamic prefixes (❗, ❓)
- Adding title persistence to localStorage/sessionStorage — SSR metadata is the correct solution
- Changing tmux session naming — that's a separate concern from browser tab titles
- Favicon changes per workspace — the icon the user refers to is the emoji in the title, not the favicon

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workspace | existing | **modify** | Add worktreeIdentity setting to workspace layout level; update workspace-attention-wrapper |
| file-browser | existing | **modify** | Update BrowserClient to stop clearing worktreeIdentity on unmount |
| terminal | existing | **modify** | Set worktreeIdentity with pageTitle: 'Terminal' in TerminalPageClient |
| _platform/sdk | existing | **consume** | TitleManager continues to be the document.title writer (no changes) |

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=1
  - Surface Area (S=1): Multiple files across workspace layout and several page clients, but changes are small and repetitive
  - Integration (I=0): Internal only — uses existing Next.js metadata API
  - Data/State (D=0): No schema or persistence changes
  - Novelty (N=0): Well-understood — Next.js generateMetadata is standard practice
  - Non-Functional (F=0): No performance/security implications
  - Testing/Rollout (T=1): Should add unit test for title composition after reload; existing tests cover the hook chain
- **Confidence**: 0.95
- **Assumptions**: 
  - Next.js `generateMetadata()` in the workspace layout will override the root metadata title during SSR
  - Setting worktreeIdentity at layout level won't conflict with page-level overrides
- **Dependencies**: None
- **Risks**: Minimal — changes are additive and the existing title system is well-tested
- **Phases**: Single phase — all changes are small and cohesive

## Acceptance Criteria

1. **AC-01**: When a user reloads any workspace page, the browser tab shows `{workspaceName} | Chainglass` during SSR (before hydration), never bare "Chainglass"
2. **AC-02**: After hydration on the browser page, the tab title shows `{emoji} {branch} — Browser`
3. **AC-03**: After hydration on the terminal page, the tab title shows `{emoji} {branch} — Terminal`
4. **AC-04**: After hydration on the workflows page, the tab title shows `{emoji} {branch} — Workflows`
5. **AC-05**: After hydration on any other workspace page, the tab title shows at minimum `{emoji} {branch}` with a page label where applicable
6. **AC-06**: Navigating from the browser page to the terminal page updates the title to `{emoji} {branch} — Terminal` (does not revert to "Chainglass" or lose the branch)
7. **AC-07**: The root landing page (`/`) and non-workspace pages continue to show "Chainglass" as the title
8. **AC-08**: The existing attention prefix (❗ for unsaved changes) and question popper prefix (❓) continue to work on top of the new titles
9. **AC-09**: Existing use-attention-title tests continue to pass

## Risks & Assumptions

- **Low Risk**: Next.js metadata template (`title.template`) in the root layout works with `generateMetadata()` in sub-layouts. This is a well-documented Next.js pattern.
- **Assumption**: The workspace layout has access to the workspace name via the server-side `workspaceService.list()` call it already makes.
- **Assumption**: Setting worktreeIdentity in the workspace layout (instead of individual pages) provides the branch name to all pages without requiring each page to independently resolve it.

## Open Questions

1. Should the metadata template format be `{page} — {workspace} | Chainglass` or `{workspace} | Chainglass`? The former is more specific but longer; the latter is simpler for SSR where we don't know the page yet.

## Workshop Opportunities

None — the changes are straightforward application of existing Next.js metadata patterns and extending an already-working worktreeIdentity system to more pages.
