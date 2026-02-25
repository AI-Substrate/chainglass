# Paste/Upload to Scratch Folder

📚 This specification incorporates findings from [research-dossier.md](./research-dossier.md) and 4 workshops in [workshops/](./workshops/).

## Research Context

Research (63 findings, 8 subagents) and 4 workshops (all questions resolved) established:

- **Existing infrastructure covers ~90%**: `IFileSystem`, atomic tmp+rename writes, path security, DI container, Radix Dialog, sonner toast — all production-ready and reusable.
- **One critical gap**: `IFileSystem.writeFile` accepts only `string`. Binary uploads (screenshots) require widening to `string | Buffer` — a backwards-compatible, minimal change ([Workshop 01](./workshops/01-binary-upload-server-actions.md)).
- **Sidebar placement**: The upload button lives in the left sidebar header (next to theme toggle), visible on all workspace pages when a worktree is selected. When plan 043 lands, it can optionally also appear in the ExplorerPanel `actions` slot ([Workshop 03](./workshops/03-explorer-panel-integration.md)).
- **Scratch folder convention**: `<worktree>/scratch/paste/<YYYYMMDDTHHMMSS>.<ext>` — already gitignored (`scratch/*` in `.gitignore` line 147), created on-demand, collision suffix `-1`, `-2` ([Workshop 04](./workshops/04-scratch-paste-folder-convention.md)).

## Summary

Users need a way to transfer files (screenshots, documents, images) from their local machine to the server without direct filesystem access. A small upload button on the file browser page opens a modal where files can be pasted from clipboard, dragged from the OS, or selected via file picker. Files land in a `scratch/paste/` folder inside the active worktree, named with ISO timestamps for uniqueness. The upload completes silently with a toast notification showing the server path.

**Why**: During development, sharing a screenshot or uploading a reference file currently requires SSH/terminal access to the server. This friction breaks flow. A one-click upload from the browser eliminates that friction entirely.

## Goals

- **Frictionless file transfer**: Paste a screenshot (Ctrl+V), drag a file, or browse — any method works
- **Predictable destination**: Files always land in `scratch/paste/` with timestamp names — no configuration, no surprises
- **Ephemeral by design**: Scratch files are gitignored, disposable, and don't pollute the repository
- **Minimal UI footprint**: A single button + modal that appears only when relevant (worktree context present)
- **Safe writes**: Atomic tmp+rename pattern, path security validation, size limits

## Non-Goals

- **Viewing uploaded files in the browser** — deferred; scratch files are gitignored and binary, so the current file browser can't display them. Users access via terminal/OS file manager for now.
- **File type restrictions** — any file type is accepted (images, PDFs, text, whatever)
- **Configurable destination** — `scratch/paste/` is the convention; no settings UI
- **Global paste handler** — paste only works inside the modal, not anywhere on the page
- **Cleanup/expiry** — no auto-delete; users manage scratch folder manually
- **Upload progress bars** — files are small (screenshots); toast loading state is sufficient
- **ExplorerPanel integration** — sidebar placement works everywhere; ExplorerPanel slot is a future nicety, not a blocker
- **Original filename preservation** — timestamp-only naming for MVP

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| file-browser | existing | **modify** | Add upload button component, upload modal, server action |
| _platform/file-ops | existing | **modify** | Widen `IFileSystem.writeFile` to accept `string \| Buffer` |
| _platform/notifications | existing | **consume** | Toast feedback via `sonner` (no changes to domain) |
| _platform/panel-layout | existing | **consume** | Upload button mounts in ExplorerPanel `actions` slot (when 043 lands) |

No new domains required. The upload feature is a leaf capability within the file-browser domain, consuming existing infrastructure contracts.

### Domain Contract Changes

#### _platform/file-ops

`IFileSystem.writeFile` signature widens from `string` to `string | Buffer`:
- `NodeFileSystemAdapter`: branch on `typeof content` — omit `'utf-8'` encoding for Buffer
- `FakeFileSystem`: widen internal `Map<string, string>` to `Map<string, string | Buffer>`
- All existing callers pass `string` — zero breakage, purely additive

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=1 → Total P=3
  - **S=1** (Surface Area): Multiple files touched but within 2 domains (file-browser + file-ops)
  - **I=0** (Integration): All internal — no external APIs, services, or dependencies
  - **D=0** (Data/State): No schema changes, no migrations, no new data models
  - **N=0** (Novelty): Well-specified from 4 workshops with all questions resolved
  - **F=1** (Non-Functional): Path security validation, size limits, atomic writes (moderate but well-understood)
  - **T=1** (Testing): Service-level tests with FakeFileSystem + contract test update for Buffer support
- **Confidence**: 0.90
- **Assumptions**:
  - Next.js server actions transparently handle `FormData` with `File` blobs (no manual multipart parsing)
  - `scratch/*` gitignore entry already covers `scratch/paste/`
  - Plan 043 ExplorerPanel will expose an `actions` ReactNode slot
- **Dependencies**:
  - None blocking — sidebar placement is independent of plan 043
- **Risks**:
  - IFileSystem contract change touches `packages/shared` — needs contract test update to verify fake/real parity
- **Phases**:
  1. Infrastructure: Widen `IFileSystem.writeFile` to `string | Buffer`, update adapter + fake + contract tests
  2. Server action + service: `uploadFile(formData)` action with path security, atomic write, timestamp naming
  3. UI: Upload button + modal (paste, drag, file picker), toast feedback, temporary mount point

## Acceptance Criteria

### Upload Button & Modal

- **AC-01**: A small upload icon button is visible in the left sidebar header (next to theme toggle) when a worktree is selected
- **AC-02**: The button is not visible when no worktree context is present (i.e., `?worktree=` param is absent)
- **AC-03**: Clicking the button opens a modal dialog with title "Upload to scratch/paste"
- **AC-04**: The modal contains a dropzone area with instructions: "Paste, drag, or select files"
- **AC-05**: The modal has a "Browse files..." button that opens the OS file picker
- **AC-06**: The modal shows the destination: "Files saved to: scratch/paste/"
- **AC-07**: Pressing Escape or clicking outside closes the modal

### Paste Input

- **AC-08**: When the modal is open, pressing Ctrl+V with a screenshot in the clipboard uploads the image
- **AC-09**: When the modal is open, pressing Ctrl+V with a copied file uploads the file
- **AC-10**: Pasting text (not files) in the modal is ignored (no action taken)

### Drag and Drop

- **AC-11**: Dragging a file over the dropzone changes the visual state (border color, background tint, "Drop files here" text)
- **AC-12**: Dropping a file on the dropzone uploads it
- **AC-13**: Dragging away from the dropzone reverts the visual state

### File Picker

- **AC-14**: Clicking "Browse files..." opens the native OS file picker with `multiple` support
- **AC-15**: Selecting one or more files starts the upload

### Upload Behavior

- **AC-16**: Uploaded files are written to `<worktree>/scratch/paste/` directory
- **AC-17**: The `scratch/paste/` directory is created automatically on first upload if it doesn't exist
- **AC-18**: Files are named with ISO timestamp format: `YYYYMMDDTHHMMSS.<ext>` (e.g., `20260224T070054.png`)
- **AC-19**: File extension is derived from: original filename → MIME type → fallback `bin`
- **AC-20**: If two files upload in the same second, a numeric suffix is appended: `20260224T070054-1.png`
- **AC-21**: Files are written atomically (tmp file + rename)
- **AC-22**: Multiple files are uploaded sequentially, each with its own toast notification

### Feedback

- **AC-23**: Upload shows a loading toast: "Uploading {filename}..."
- **AC-24**: Successful upload shows a success toast with the server path: "Uploaded: scratch/paste/20260224T070054.png"
- **AC-25**: Failed upload shows an error toast with the reason
- **AC-26**: Modal closes automatically after all uploads succeed
- **AC-27**: Modal stays open if any upload fails (user can retry)

### Security & Limits

- **AC-28**: Files larger than 10 MB are rejected with an error before upload
- **AC-29**: The server action validates the worktree path (absolute, no traversal)
- **AC-30**: The server action validates the destination path via `IPathResolver.resolvePath()`
- **AC-31**: The original filename is never used as the destination filename (timestamp only)

### Infrastructure

- **AC-32**: `IFileSystem.writeFile` accepts both `string` and `Buffer` content
- **AC-33**: `NodeFileSystemAdapter.writeFile` writes Buffer content without encoding
- **AC-34**: `FakeFileSystem.writeFile` stores Buffer content in its internal Map
- **AC-35**: Contract tests verify Buffer write/stat parity between real and fake implementations

## Risks & Assumptions

| Risk/Assumption | Impact | Mitigation |
|----------------|--------|------------|
| Next.js server action FormData with File blobs works transparently | High | Validated by Next.js docs; test early in implementation |
| `scratch/*` in `.gitignore` covers `scratch/paste/` | Medium | Verified: line 147 of `.gitignore` has `scratch/*` |
| Plan 043 ExplorerPanel provides `actions` slot | None | Button lives in sidebar header — works on all workspace pages. ExplorerPanel slot is optional future enhancement |
| 10 MB is sufficient for high-DPI screenshots | Low | Modern screenshots are 3-8MB; 10MB covers most cases. Can raise later. |
| `IFileSystem.writeFile` signature change doesn't break consumers | Low | Purely additive widening — all existing callers pass `string`, which still matches |

## Clarifications

**Workflow Mode**: Simple (CS-2, single/few phases, quick path)
**Testing Strategy**: Service-level tests with `FakeFileSystem` + contract test update for `Buffer` write parity. No e2e browser tests.
**Documentation Strategy**: No additional docs — workshops are sufficient.
**Domain Review**: No new domains. file-browser (modify) + _platform/file-ops (modify, additive contract widening).

## Open Questions

None — all questions resolved across 4 workshops and clarification.

## Workshop Opportunities

All workshops completed:

| # | Topic | Type | Workshop | Status |
|---|-------|------|----------|--------|
| 1 | Binary upload via server actions | Integration Pattern | [01-binary-upload-server-actions.md](./workshops/01-binary-upload-server-actions.md) | ✅ Complete |
| 2 | Upload modal UX flow | CLI Flow | [02-upload-modal-ux-flow.md](./workshops/02-upload-modal-ux-flow.md) | ✅ Complete |
| 3 | ExplorerPanel integration (Plan 043) | Integration Pattern | [03-explorer-panel-integration.md](./workshops/03-explorer-panel-integration.md) | ✅ Complete |
| 4 | Scratch/paste folder convention | Storage Design | [04-scratch-paste-folder-convention.md](./workshops/04-scratch-paste-folder-convention.md) | ✅ Complete |
