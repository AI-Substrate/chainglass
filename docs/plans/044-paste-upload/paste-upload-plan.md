# Paste/Upload to Scratch Folder — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-24
**Spec**: [paste-upload-spec.md](./paste-upload-spec.md)
**Status**: DRAFT

## Summary

Users need to paste screenshots, drag files, or browse-select files in the browser and have them land on the server without SSH access. A small upload button in the sidebar header opens a Radix Dialog modal with paste/drag/select support. Files are written to `<worktree>/scratch/paste/<YYYYMMDDTHHMMSS>.<ext>` via a server action that accepts FormData, converts to Buffer, and writes atomically. Requires widening `IFileSystem.writeFile` to accept `string | Buffer` and raising Next.js server action body size limit to 10MB.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| file-browser | existing | **modify** | Upload button, modal, server action, upload service |
| _platform/file-ops | existing | **modify** | Widen `IFileSystem.writeFile` to `string \| Buffer` |
| _platform/notifications | existing | **consume** | Toast feedback (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/filesystem.interface.ts` | _platform/file-ops | contract | Widen writeFile signature |
| `packages/shared/src/adapters/node-filesystem.adapter.ts` | _platform/file-ops | internal | Buffer branch in writeFile impl |
| `packages/shared/src/fakes/fake-filesystem.ts` | _platform/file-ops | internal | Widen Map + setFile for Buffer |
| `test/contracts/filesystem.contract.ts` | _platform/file-ops | internal | Add Buffer write/stat contract test |
| `apps/web/next.config.mjs` | file-browser | internal | Raise serverActions bodySizeLimit to 10mb |
| `apps/web/src/features/041-file-browser/services/upload-file.ts` | file-browser | internal | Upload service: mkdir, timestamp naming, atomic write |
| `apps/web/app/actions/file-actions.ts` | file-browser | internal | Add uploadFile server action |
| `apps/web/src/features/041-file-browser/components/paste-upload-button.tsx` | file-browser | internal | Sidebar upload button + modal trigger |
| `apps/web/src/features/041-file-browser/components/paste-upload-modal.tsx` | file-browser | internal | Radix Dialog with paste/drag/select dropzone |
| `apps/web/src/components/dashboard-sidebar.tsx` | file-browser | cross-domain | Add PasteUploadButton to sidebar header |
| `test/unit/web/features/041-file-browser/upload-file.test.ts` | file-browser | internal | Upload service tests |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Next.js server action body size limit defaults to **500KB**. File uploads >500KB will fail silently. | Add `serverActions: { bodySizeLimit: '10mb' }` to `next.config.mjs`. Task T001. |
| 02 | High | `IFileSystem.writeFile` accepts `string` only. `NodeFileSystemAdapter` hardcodes `'utf-8'` encoding. Binary uploads need `Buffer` support. | Widen to `string \| Buffer`, branch on `typeof content` in adapter. Tasks T002-T005. |
| 03 | Medium | `FakeFileSystem` stores content in `Map<string, string>`. `readFile()` returns `string`. If Buffer is stored, `readFile` must handle the type. | Widen Map to `string \| Buffer`. `readFile` returns `buffer.toString('utf-8')` (matches real adapter parity — NOT throw). DYK-01. Task T004. |
| 04 | Medium | `DashboardSidebar` is `'use client'` with `useState`/`useSearchParams`. Upload button can use client state directly. Tooltip component available at `@/components/ui/tooltip`. | Clean integration point. Task T009. |
| 05 | Low | `.gitignore` line 147 already has `scratch/*`. No gitignore changes needed. | No action required. |

## Implementation

**Objective**: Add paste/drag/select file upload to scratch/paste/ via sidebar button + modal + server action.
**Testing Approach**: Service-level tests with FakeFileSystem + contract test for Buffer parity. No e2e.
**Complexity**: CS-2 (small)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Raise server action body size limit to 10MB | file-browser | `/home/jak/substrate/041-file-browser/apps/web/next.config.mjs` | `serverActions: { bodySizeLimit: '10mb' }` present in config | Per finding 01 |
| [ ] | T002 | Widen `IFileSystem.writeFile` signature to `string \| Buffer` | _platform/file-ops | `/home/jak/substrate/041-file-browser/packages/shared/src/interfaces/filesystem.interface.ts` | Interface accepts both types, JSDoc updated | Per finding 02 |
| [ ] | T003 | Update `NodeFileSystemAdapter.writeFile` to handle Buffer | _platform/file-ops | `/home/jak/substrate/041-file-browser/packages/shared/src/adapters/node-filesystem.adapter.ts` | Omits `'utf-8'` when content is Buffer, writes binary correctly | Per finding 02 |
| [ ] | T004 | Update `FakeFileSystem` for Buffer support | _platform/file-ops | `/home/jak/substrate/041-file-browser/packages/shared/src/fakes/fake-filesystem.ts` | Map typed `string \| Buffer`, `setFile` accepts both, `stat().size` uses `Buffer.byteLength` for Buffers, `readFile` returns `buffer.toString('utf-8')` for Buffer (contract parity) | DYK-01: readFile must NOT throw on Buffer |
| [ ] | T005 | Add Buffer contract test | _platform/file-ops | `/home/jak/substrate/041-file-browser/test/contracts/filesystem.contract.ts` | Test writes Buffer, verifies stat size, verifies readFile returns string (not throw) | DYK-01 corrected. Per finding 02. |
| [ ] | T006 | Create upload service (`uploadFileService`) | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/services/upload-file.ts` | Service: validates path, mkdir recursive, generates timestamp filename, resolves collisions, atomic write (tmp+rename) | Workshop 01, 04 |
| [ ] | T007 | Write upload service tests | file-browser | `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/upload-file.test.ts` | Tests: happy path write, mkdir creation, timestamp naming, collision suffix, path traversal rejection, size limit rejection | TDD per constitution |
| [ ] | T008 | Add `uploadFile` server action | file-browser | `/home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts` | Accepts FormData, extracts File, converts to Buffer, calls uploadFileService, returns `{ ok, filePath?, error? }` | Workshop 01 |
| [ ] | T009 | Create `PasteUploadButton` component | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/paste-upload-button.tsx` | Upload icon button with Tooltip, manages Dialog open state, conditionally renders when worktreePath present | Workshop 02 |
| [ ] | T010 | Create `PasteUploadModal` component | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/paste-upload-modal.tsx` | Radix Dialog with: paste handler (onPaste), drag handlers (onDragOver/Leave/Drop), hidden file input with "Browse files..." button, sequential upload with toast feedback, auto-close on success / stay open on error | Workshop 02 |
| [ ] | T011 | Add upload button to sidebar header | file-browser | `/home/jak/substrate/041-file-browser/apps/web/src/components/dashboard-sidebar.tsx` | PasteUploadButton rendered in sidebar header flex row (line ~79), visible only when `currentWorktree` is non-null | Per finding 04 |
| [ ] | T012 | Verify via Next.js MCP and `just fft` | file-browser | — | `nextjs_call get_errors` returns zero errors on port 3000, `just fft` passes (lint + format + test) | Verification |

### Acceptance Criteria

- [ ] AC-01: Upload button visible in sidebar header when worktree selected
- [ ] AC-02: Button hidden when no worktree context
- [ ] AC-03: Click opens modal with "Upload to scratch/paste" title
- [ ] AC-04: Modal has dropzone with paste/drag/select instructions
- [ ] AC-05: "Browse files..." button opens OS file picker (multiple)
- [ ] AC-08: Ctrl+V in modal with screenshot uploads the image
- [ ] AC-11: Drag over dropzone changes visual state
- [ ] AC-12: Drop uploads file
- [ ] AC-16: Files written to `<worktree>/scratch/paste/`
- [ ] AC-17: Directory auto-created on first upload
- [ ] AC-18: ISO timestamp naming (`YYYYMMDDTHHMMSS.<ext>`)
- [ ] AC-20: Collision suffix `-1`, `-2` for same-second uploads
- [ ] AC-21: Atomic write (tmp + rename)
- [ ] AC-23: Loading toast during upload
- [ ] AC-24: Success toast with server path
- [ ] AC-26: Modal auto-closes on success
- [ ] AC-28: 10MB size limit enforced
- [ ] AC-29: Worktree path validated (absolute, no traversal)
- [ ] AC-32: `IFileSystem.writeFile` accepts `string | Buffer`
- [ ] AC-35: Contract tests verify Buffer write/stat parity

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Next.js FormData File blob handling differs from expectation | Low | High | Test T008 early in implementation; Next.js docs confirm support |
| IFileSystem signature change breaks downstream consumers | Very Low | Medium | Purely additive widening; all existing callers pass `string` |
| Browser clipboard API varies across browsers | Low | Low | Standard `ClipboardEvent.clipboardData.files` — widely supported |

---

✅ Plan created:
- **Location**: `docs/plans/044-paste-upload/paste-upload-plan.md`
- **Mode**: Simple (single phase, inline tasks)
- **Tasks**: 12
- **Domains**: 2 modified + 1 consumed
- **Next step**: `/plan-6-v2-implement-phase --plan "docs/plans/044-paste-upload/paste-upload-plan.md"`
