# Flight Plan: Fix FX001 — Markdown Link Interception

**Fix**: [FX001-markdown-link-interception.md](FX001-markdown-link-interception.md)
**Status**: Ready

## What → Why

**Problem**: Relative `.md` links in markdown preview navigate to wrong URL (e.g., `/workspaces/chainglass/containers/overview.md` instead of file browser route with `?file=docs/c4/containers/overview.md`).

**Fix**: Add custom `a` component override in MarkdownServer that intercepts relative `.md` links and transforms them to file browser URLs using `workspaceHref()`. Thread `currentFilePath` through the component chain.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/viewer` | modify | MarkdownServer gets `a` override + `currentFilePath` prop; MarkdownViewer threads file path |
| `file-browser` | consume | Passes file path context (likely already available) |
| `_platform/workspace-url` | consume | Uses `workspaceHref()` — no changes |

## Stages

- [ ] **Stage 1: Add props** — `currentFilePath` to MarkdownServer + MarkdownViewer threading
- [ ] **Stage 2: Link transform** — Custom `a` component in MarkdownServer resolving relative `.md` links
- [ ] **Stage 3: Verify** — C4 inter-level links work in dev server

## Acceptance

- [ ] Relative `.md` links navigate to correct file in browser
- [ ] Anchor `#` links still scroll (no regression)
- [ ] Absolute `http://` links open normally (no regression)
