# Fix FX001: Deduplicate BrowserClient mobileViews JSX

**Created**: 2026-04-12
**Status**: Proposed
**Plan**: [mobile-experience-plan.md](../mobile-experience-plan.md)
**Source**: DYK #1 — discovered during didyouknow-v2 clarity check before Phase 3
**Domain(s)**: `file-browser` (modify)

---

## Problem

BrowserClient has ~150 lines of duplicated JSX — the LeftPanel (file tree + changes) and MainPanel (file viewer) content appears twice: once in the `mobileViews` prop and once in the `left`/`main` props passed to PanelShell. Any future change to the file tree or viewer panel needs updating in two places. Phase 3 will add view-switch callbacks and explorer sheet wiring, making this worse.

## Proposed Fix

Extract the left panel and main panel content into local variables before the `return`, then reference them in both `mobileViews` and the desktop `left`/`main` slots. Zero behavior change, ~150 lines removed.

```tsx
const filesContent = <LeftPanel ...>{{ tree: ..., changes: ... }}</LeftPanel>;
const contentView = <MainPanel>...</MainPanel>;

return (
  <PanelShell
    mobileViews={[
      { label: 'Files', icon: <FolderOpen />, content: filesContent },
      { label: 'Content', icon: <FileText />, content: contentView },
    ]}
    explorer={<ExplorerPanel ... />}
    left={filesContent}
    main={contentView}
  />
);
```

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `file-browser` | modify | BrowserClient refactored — same output, shared JSX variables |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Extract filesContent and contentView variables | `file-browser` | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | LeftPanel and MainPanel JSX extracted to local variables; referenced in both mobileViews and left/main props; zero behavior change; ~150 lines removed | Idiomatic React: shared JSX via variables |
| [ ] | FX001-2 | Verify no regression | — | — | All existing tests pass; harness screenshot at mobile + desktop viewports identical to before | |

## Workshops Consumed

None — pure refactor.

## Acceptance

- [ ] BrowserClient has zero duplicated JSX between mobileViews and left/main
- [ ] Desktop layout unchanged (harness screenshot at 1024px)
- [ ] Mobile layout unchanged (harness screenshot at 390px)
- [ ] All existing tests pass
