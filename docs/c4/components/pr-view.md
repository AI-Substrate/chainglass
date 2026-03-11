# Component: PR View (`pr-view`)

> **Domain Definition**: [pr-view/domain.md](../../domains/pr-view/domain.md)
> **Source**: `apps/web/src/features/071-pr-view/`
> **Registry**: [registry.md](../../domains/registry.md) — Row: PR View

GitHub-style change review overlay data layer. Provides aggregated diff data with two comparison modes (Working vs HEAD, Branch vs main), reviewed-file tracking with content-hash auto-invalidation, and per-file insertion/deletion stats.

```mermaid
C4Component
    title Component diagram — PR View (pr-view)

    Container_Boundary(prView, "PR View") {
        Component(types, "PR View Types", "TypeScript Types", "PRViewFile, PRViewFileState,<br/>ComparisonMode, PRViewData,<br/>DiffFileStatus, BranchChangedFile")
        Component(contentHash, "Content Hash", "Server Service", "computeContentHash via<br/>git hash-object for<br/>reviewed-state invalidation")
        Component(state, "PR View State", "Server Service", "JSONL read/write for<br/>reviewed file tracking with<br/>atomic rename + stale pruning")
        Component(branch, "Git Branch Service", "Server Service", "getCurrentBranch, getMergeBase,<br/>getDefaultBaseBranch,<br/>getChangedFilesBranch")
        Component(stats, "Per-File Diff Stats", "Server Service", "parseNumstat from<br/>git diff --numstat for<br/>per-file insertions/deletions")
        Component(allDiffs, "All Diffs Fetcher", "Server Service", "Single git diff command<br/>split by file header<br/>O(1) not O(N) processes")
        Component(aggregator, "Diff Aggregator", "Orchestrator", "Parallel fetch of files,<br/>diffs, stats, reviewed state<br/>with hash invalidation")
        Component(apiRoute, "PR View API Route", "Route Handler", "GET/POST/DELETE<br/>/api/pr-view with auth,<br/>worktree scoping")
        Component(actions, "Server Actions", "Server Actions", "fetchPRViewData,<br/>markFileAsReviewed,<br/>clearAllReviewedState")

        aggregator --> allDiffs
        aggregator --> stats
        aggregator --> branch
        aggregator --> state
        aggregator --> contentHash
        state --> types
        apiRoute --> aggregator
        apiRoute --> state
        apiRoute --> contentHash
        actions --> aggregator
        actions --> state
        actions --> contentHash
    }

    %% External dependencies (Auth, File Browser) documented in prose
    %% and at L2 in web-app.md per C4 authoring principle 4.
```

> Internal relationships only — cross-domain dependencies (overlay consuming PRViewData)
> belong at L2 in `web-app.md` per C4 authoring principle 4.

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md)
- **Domain**: [pr-view/domain.md](../../domains/pr-view/domain.md)
- **Hub**: [C4 Overview](../README.md)
