# Workshop: Upload Modal UX Flow

**Type**: CLI Flow / UX Design
**Plan**: 044-paste-upload
**Research**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-24T07:00:54Z
**Status**: Draft

**Related Documents**:
- [Binary Upload Server Actions](./01-binary-upload-server-actions.md)
- [Dialog component](../../../../apps/web/src/components/ui/dialog.tsx)
- [Toast (sonner) patterns](../../../../apps/web/src/components/ui/toaster.tsx)

**Domain Context**:
- **Primary Domain**: file-browser (owns the upload UI)
- **Related Domains**: _platform/notifications (toast feedback)

---

## Purpose

Define the complete user interaction flow for the paste/upload modal — from trigger to completion. Covers three input methods (paste, drag, file picker), single and multi-file handling, feedback, and error states.

## Key Questions Addressed

- What does the modal look like and how does it behave?
- How do paste, drag, and file-select differ in interaction?
- What happens with multiple files?
- When does the modal close automatically?
- What feedback does the user get?

---

## Modal Trigger

The upload button lives in the **ExplorerPanel** toolbar (plan 043 integration). For now, it's a standalone button that can be placed temporarily until ExplorerPanel lands.

```
┌──────────────────────────────────────────────────────────────────┐
│  ExplorerPanel (plan 043)                           [📋] [⬆]   │
│  /path/to/current/file.ts                                 ↑     │
│                                                     Upload btn  │
└──────────────────────────────────────────────────────────────────┘
```

**Button**: Small icon button (Upload/Clipboard icon from lucide-react), tooltip "Upload file".

---

## Modal Layout

```
┌──────────────────────────────────────────────────────────┐
│  Upload to scratch/paste                          [✕]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │        📋  Paste, drag, or select files           │  │
│  │                                                    │  │
│  │     Ctrl+V to paste from clipboard                │  │
│  │     Drag files here                               │  │
│  │                                                    │  │
│  │         ┌──────────────────────┐                  │  │
│  │         │   Browse files...    │                  │  │
│  │         └──────────────────────┘                  │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Files will be saved to: scratch/paste/                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Dropzone States

**Default** (no interaction):
```
┌────────────────────────────────────────────────────┐
│                                                    │
│     📋  Paste, drag, or select files              │
│                                                    │
│     Ctrl+V to paste from clipboard                │
│     Drag files here                               │
│                                                    │
│         ┌──────────────────────┐                  │
│         │   Browse files...    │                  │
│         └──────────────────────┘                  │
│                                                    │
└────────────────────────────────────────────────────┘
  border: dashed, muted color
```

**Drag over** (file hovering):
```
┌════════════════════════════════════════════════════┐
║                                                    ║
║           ⬇  Drop files here                      ║
║                                                    ║
└════════════════════════════════════════════════════┘
  border: solid, primary color, bg tint
```

**Uploading** (in progress):
```
┌────────────────────────────────────────────────────┐
│                                                    │
│     ⏳  Uploading 2 files...                      │
│                                                    │
│     screenshot.png          ✅ Done               │
│     diagram.svg             ⏳ Uploading...       │
│                                                    │
└────────────────────────────────────────────────────┘
  border: dashed, muted
```

---

## Interaction Flows

### Flow 1: Paste from Clipboard (Ctrl+V)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User opens modal (clicks upload button)                  │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Modal receives focus, registers paste listener           │
│    • onPaste event on the dialog content div                │
│    • Captures ClipboardEvent.clipboardData.files            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. User presses Ctrl+V                                      │
│    • event.clipboardData.files → File[]                     │
│    • If files present → start upload                        │
│    • If no files but text → ignore (not our concern)        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Upload starts                                            │
│    • toast.loading('Uploading screenshot.png...')           │
│    • Show progress in dropzone area                        │
│    • Call uploadFile(formData) server action                │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Upload completes                                         │
│    • toast.success('Uploaded: scratch/paste/2026...')       │
│    • Close modal automatically                              │
└─────────────────────────────────────────────────────────────┘
```

**Paste source examples**:
- Screenshot tool (macOS Cmd+Shift+4 → Cmd+V, Windows Snipping Tool)
- Copy image from browser (right-click → Copy Image → Ctrl+V)
- Copy file from OS file manager (Ctrl+C on file → Ctrl+V in modal)

### Flow 2: Drag and Drop

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User opens modal                                         │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. User drags file(s) from OS file manager over modal      │
│    • onDragEnter / onDragOver → highlight dropzone          │
│    • event.preventDefault() to allow drop                   │
│    • Visual: border goes solid, bg tints, "Drop here"      │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. User drops files                                         │
│    • onDrop → event.dataTransfer.files                     │
│    • Start upload for each file                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Same upload + toast + auto-close as paste flow          │
└─────────────────────────────────────────────────────────────┘
```

### Flow 3: File Picker (Browse)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks "Browse files..." button                     │
│    • Triggers hidden <input type="file" multiple>           │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. OS file picker opens                                     │
│    • User selects one or more files                         │
│    • onChange → FileList                                    │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Same upload + toast + auto-close                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Multi-File Handling

**Strategy**: Upload files sequentially (one at a time). Each file gets its own toast.

```typescript
async function handleFiles(files: FileList | File[]) {
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    const toastId = toast.loading(`Uploading ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('worktreePath', worktreePath);
    formData.append('slug', slug);

    const result = await uploadFile(formData);

    if (result.ok) {
      toast.success(`Uploaded: ${result.filePath}`, { id: toastId });
    } else {
      toast.error(`Failed: ${file.name} — ${result.error}`, { id: toastId });
    }
  }

  // Close modal after all uploads complete
  onOpenChange(false);
}
```

**Why sequential, not parallel**: Simpler error handling, clearer toast progression, avoids overwhelming the server. These are small files (screenshots), not batch imports.

---

## Error States

| Error | When | User Sees |
|-------|------|-----------|
| `no-file` | Paste/drop with no files | Toast: "No file found in clipboard" |
| `too-large` | File > 10MB | Toast: "File too large (max 10MB)" |
| `security` | Path traversal attempt | Toast: "Upload failed: security error" |
| `write-failed` | Disk full, permissions | Toast: "Upload failed: could not write file" |

**Error recovery**: Modal stays open on error (user can retry). Only auto-closes on success.

---

## Component Structure

```typescript
// paste-upload-button.tsx — Trigger (server or client component)
'use client';

import { Upload } from 'lucide-react';

export function PasteUploadButton({ slug, worktreePath }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(true)}
            className={cn('rounded-md p-1.5 hover:bg-muted', /* ... */)}
            aria-label="Upload file"
          >
            <Upload className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Upload file</TooltipContent>
      </Tooltip>
      <PasteUploadModal
        open={open}
        onOpenChange={setOpen}
        slug={slug}
        worktreePath={worktreePath}
      />
    </>
  );
}
```

```typescript
// paste-upload-modal.tsx — The modal
'use client';

export function PasteUploadModal({ open, onOpenChange, slug, worktreePath }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste handler — registered on the dialog content
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  }, [/* deps */]);

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  }, [/* deps */]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle>Upload to scratch/paste</DialogTitle>
        </DialogHeader>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          )}
        >
          {uploads.length === 0 ? (
            <>
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Paste, drag, or select files</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ctrl+V to paste from clipboard
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Browse files...
              </button>
            </>
          ) : (
            <UploadProgress uploads={uploads} />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Files saved to: <code className="rounded bg-muted px-1">scratch/paste/</code>
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

---

## Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Keyboard trigger | Button is focusable, Space/Enter opens modal |
| Screen reader | `aria-label="Upload file"` on trigger, Dialog handles focus trap |
| Paste support | Works with keyboard paste (Ctrl+V) — no mouse required |
| File picker | Native `<input type="file">` — fully accessible |
| Focus management | Radix Dialog handles focus trap and return |
| Escape to close | Radix Dialog built-in |

---

## Auto-Close Behavior

| Scenario | Modal Behavior |
|----------|----------------|
| Single file uploaded successfully | Close modal, show success toast |
| Multiple files, all succeed | Close modal after last upload, toasts for each |
| Multiple files, some fail | **Stay open** — user sees which failed |
| Single file fails | **Stay open** — user can retry |
| User clicks ✕ or Escape | Close immediately (cancel any pending uploads) |

---

## Open Questions

### Q1: Should we support paste without the modal open?

**RESOLVED**: No — modal-only paste for MVP. User clicks the upload button first, then pastes inside the modal. This avoids intercepting legitimate paste operations in CodeMirror or other inputs. A global paste handler with focus-area detection can be considered as a future enhancement.

### Q2: Image preview before upload?

**RESOLVED**: No preview for MVP. The upload is to a scratch folder — it's a quick "get this file onto the server" action, not a curated gallery. Show filename + size in the upload progress list, not a thumbnail.

### Q3: Should the dropzone accept any file type?

**RESOLVED**: Yes — no file type restrictions. The feature is a general-purpose "get files to the server" tool. Images, PDFs, text files, whatever. The extension is preserved from the original filename or inferred from MIME type.
