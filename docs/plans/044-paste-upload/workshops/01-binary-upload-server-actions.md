# Workshop: Binary Upload via Server Actions

**Type**: Integration Pattern
**Plan**: 044-paste-upload
**Research**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-24T07:00:54Z
**Status**: Draft

**Related Documents**:
- [IFileSystem interface](../../../../packages/shared/src/interfaces/filesystem.interface.ts)
- [NodeFileSystemAdapter](../../../../packages/shared/src/adapters/node-filesystem.adapter.ts)
- [file-actions.ts (server actions)](../../../../apps/web/app/actions/file-actions.ts)

**Domain Context**:
- **Primary Domain**: file-browser (owns the upload UI and server action)
- **Related Domains**: _platform/file-ops (IFileSystem contract extension)

---

## Purpose

Establish how binary files (screenshots, images, PDFs) flow from browser clipboard/drag-drop through a Next.js server action to disk. The codebase currently has no FormData/binary upload pattern — this workshop designs one.

## Key Questions Addressed

- How does a `File` blob in the browser reach `fs.writeFile(path, buffer)` on the server?
- Does `IFileSystem.writeFile` need a new overload for `Buffer`, or do we bypass it?
- How does the `FakeFileSystem` handle binary content in tests?
- What's the size limit, and where is it enforced?

---

## Current State

### IFileSystem.writeFile — String Only

```typescript
// packages/shared/src/interfaces/filesystem.interface.ts (line ~60)
writeFile(path: string, content: string): Promise<void>;
```

### NodeFileSystemAdapter — Hardcoded UTF-8

```typescript
// packages/shared/src/adapters/node-filesystem.adapter.ts (line ~39)
async writeFile(path: string, content: string): Promise<void> {
  await fs.writeFile(path, content, 'utf-8');
}
```

### FakeFileSystem — Map<string, string>

```typescript
// packages/shared/src/fakes/fake-filesystem.ts (line ~13)
private files = new Map<string, string>();

async writeFile(path: string, content: string): Promise<void> {
  this.files.set(path, content);
}
```

**Problem**: The entire stack is string-only. Binary data (images, PDFs) are `Buffer`/`Uint8Array` — passing through `string` would corrupt them.

---

## Design Decision

### Option A: Extend IFileSystem with `string | Buffer` (Recommended)

Widen the existing `writeFile` signature:

```typescript
// IFileSystem interface
writeFile(path: string, content: string | Buffer): Promise<void>;
```

```typescript
// NodeFileSystemAdapter
async writeFile(path: string, content: string | Buffer): Promise<void> {
  try {
    if (typeof content === 'string') {
      await fs.writeFile(path, content, 'utf-8');
    } else {
      await fs.writeFile(path, content);  // Buffer — no encoding
    }
  } catch (err) {
    throw this.wrapError(err, path);
  }
}
```

```typescript
// FakeFileSystem
private files = new Map<string, string | Buffer>();

async writeFile(path: string, content: string | Buffer): Promise<void> {
  this.checkSimulatedError(path);
  const parent = pathModule.dirname(path);
  if (parent !== '/' && parent !== '.' && !(await this.exists(parent))) {
    throw new FileSystemError(/*...*/);
  }
  this.files.set(path, content);
  this.mtimes.set(path, new Date().toISOString());
}
```

**Why this option**:
- Node.js `fs.writeFile` already accepts `string | Buffer` natively
- Minimal change — widen the type, branch on `typeof` in adapter
- FakeFileSystem just widens its Map value type
- All existing callers pass `string` — zero breakage
- Contract tests stay valid (string path still works identically)

### Option B: Bypass IFileSystem for Binary (Rejected)

Use `fs.promises.writeFile(path, buffer)` directly in the server action.

**Why rejected**:
- Breaks DI pattern — upload code can't use FakeFileSystem in tests
- Path security validation bypassed (no `IPathResolver` integration)
- Inconsistent with every other file operation in the codebase

### Option C: Base64 Encode/Decode (Rejected)

Convert binary to base64 string, pass through existing `writeFile(string)`.

**Why rejected**:
- 33% size overhead (a 5MB image becomes 6.7MB in memory)
- Unnecessary encode/decode round-trip
- Hides the real type — confusing for maintainers

---

## Server Action Design

### Upload Action Signature

```typescript
// apps/web/app/actions/file-actions.ts
'use server';

export interface UploadFileResult {
  ok: boolean;
  filePath?: string;    // Relative path within worktree (e.g., "scratch/paste/2026-02-24T070054.png")
  error?: 'too-large' | 'security' | 'write-failed' | 'no-file';
}

export async function uploadFile(formData: FormData): Promise<UploadFileResult> {
  const file = formData.get('file') as File | null;
  const worktreePath = formData.get('worktreePath') as string;
  const slug = formData.get('slug') as string;

  if (!file || file.size === 0) {
    return { ok: false, error: 'no-file' };
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, error: 'too-large' };
  }

  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  // Build destination path
  const ext = extensionFromFilename(file.name) || extensionFromMimeType(file.type) || 'bin';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const fileName = `${timestamp}.${ext}`;
  const relativePath = `scratch/paste/${fileName}`;

  // Validate path security
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, relativePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Ensure scratch/paste/ directory exists
  const destDir = pathResolver.resolvePath(worktreePath, 'scratch/paste');
  await fileSystem.mkdir(destDir, { recursive: true });

  // Atomic write: tmp → rename
  const tmpPath = `${absolutePath}.tmp`;
  await fileSystem.writeFile(tmpPath, buffer);
  await fileSystem.rename(tmpPath, absolutePath);

  return { ok: true, filePath: relativePath };
}
```

### FormData Construction (Client Side)

```typescript
// In the upload modal component
async function handleUpload(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('worktreePath', worktreePath);
  formData.append('slug', slug);

  const toastId = toast.loading('Uploading...');
  const result = await uploadFile(formData);

  if (result.ok) {
    toast.success(`Uploaded: ${result.filePath}`, { id: toastId });
  } else {
    toast.error(`Upload failed: ${result.error}`, { id: toastId });
  }
}
```

---

## File → Buffer Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│  Clipboard paste  ──→  ClipboardEvent.clipboardData.files  │
│  Drag-and-drop    ──→  DragEvent.dataTransfer.files        │
│  File picker      ──→  <input type="file">.files           │
│                         ↓                                   │
│                    File object (Blob subclass)              │
│                         ↓                                   │
│                    new FormData().append('file', file)      │
└─────────────────────────┬───────────────────────────────────┘
                          │  (Next.js serializes as multipart)
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Server Action                                               │
│                                                             │
│  formData.get('file') → File                               │
│  file.arrayBuffer()   → ArrayBuffer                        │
│  Buffer.from(ab)      → Buffer                             │
│                          ↓                                  │
│  fileSystem.writeFile(path, buffer)                        │
└─────────────────────────────────────────────────────────────┘
```

**Key**: Next.js server actions transparently handle `FormData` with `File` blobs — no manual multipart parsing needed.

---

## Extension Detection

```typescript
function extensionFromFilename(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  if (dot > 0) return name.slice(dot + 1).toLowerCase();
  return undefined;
}

function extensionFromMimeType(mime: string): string | undefined {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/json': 'json',
  };
  return map[mime];
}
```

**Priority**: filename extension → MIME type → fallback `'bin'`.

---

## Size Limit

| Scenario | Limit | Rationale |
|----------|-------|-----------|
| Existing file viewer | 5 MB | Prevents editor crashes |
| Upload (this feature) | **10 MB** | High-DPI screenshots can be 3-8MB |

Enforced in the server action before `file.arrayBuffer()` — fail fast before reading the entire file into memory.

```typescript
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB
```

---

## Testing Strategy

### Service-Level Tests (FakeFileSystem)

```typescript
// test/unit/web/features/041-file-browser/upload-file.test.ts
describe('uploadFile', () => {
  it('writes binary file to scratch/paste/', async () => {
    const fakeFs = new FakeFileSystem();
    // Pre-create the worktree root
    await fakeFs.mkdir('/worktree', { recursive: true });

    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    await fakeFs.mkdir('/worktree/scratch/paste', { recursive: true });
    await fakeFs.writeFile('/worktree/scratch/paste/20260224T070054.png', buffer);

    const content = await fakeFs.readFile('/worktree/scratch/paste/20260224T070054.png');
    // Verify content was stored (FakeFileSystem with Buffer support)
  });

  it('rejects files over 10MB', async () => { /* ... */ });
  it('rejects path traversal in worktreePath', async () => { /* ... */ });
  it('creates scratch/paste/ directory if not exists', async () => { /* ... */ });
  it('generates ISO timestamp filename', async () => { /* ... */ });
});
```

### Contract Test Update

```typescript
// test/contracts/filesystem.contract.test.ts
it('writeFile accepts Buffer content', async () => {
  const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  await fs.writeFile('/test/binary.bin', buffer);
  // Verify file exists and has correct size
  const stat = await fs.stat('/test/binary.bin');
  expect(stat.size).toBe(4);
});
```

---

## Changes Required

| File | Change | Impact |
|------|--------|--------|
| `packages/shared/src/interfaces/filesystem.interface.ts` | Widen `writeFile` to `string \| Buffer` | Low — additive |
| `packages/shared/src/adapters/node-filesystem.adapter.ts` | Branch on `typeof content` | Low — backwards compatible |
| `packages/shared/src/fakes/fake-filesystem.ts` | Widen `Map<string, string>` to `string \| Buffer` | Low — test-only |
| `apps/web/app/actions/file-actions.ts` | Add `uploadFile(formData)` action | New code |
| `apps/web/src/features/041-file-browser/services/upload-file.ts` | Upload service logic | New code |

---

## Open Questions

### Q1: Should readFile also return Buffer for binary files?

**RESOLVED**: No. `readFile` returns `string` and rejects binary files (null-byte detection). Binary files uploaded via paste are write-only from the browser's perspective — they're viewed in the file browser via `<img>` tags or download links, not read back through `readFile`.

### Q2: What about readFileBuffer for downloading/viewing?

**RESOLVED**: Deferred. The current file browser can't display scratch/paste/ files (gitignored, so hidden from `git ls-files` tree listing) or render binary content (null-byte detection rejects images). For MVP, uploaded files are accessed via terminal/OS file manager — the upload toast shows the full path. A future plan can add a raw file serving route (`/api/.../files/raw`) or "Recent uploads" panel.

### Q3: Should FakeFileSystem.readFile return string for Buffer content?

**RESOLVED**: No. `readFile` should throw or return the string if content is string, and throw an error if content is Buffer (mirroring the binary detection behavior of the real implementation). This maintains contract parity.
