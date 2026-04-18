'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadFile } from '../../../../app/actions/file-actions';

interface PasteUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  worktreePath: string;
}

export function PasteUploadModal({
  open,
  onOpenChange,
  slug,
  worktreePath,
}: PasteUploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setIsUploading(true);
      let anyFailed = false;

      for (const file of fileArray) {
        const toastId = toast.loading(`Uploading ${file.name}...`);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('worktreePath', worktreePath);
        formData.append('slug', slug);

        const result = await uploadFile(formData);

        if (result.ok) {
          const fullPath = `${worktreePath}/${result.filePath}`;
          toast.success(`Uploaded: ${result.filePath}`, {
            id: toastId,
            action: {
              label: 'Copy path',
              onClick: () => {
                if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(fullPath);
                } else {
                  setTimeout(() => {
                    const ta = document.createElement('textarea');
                    ta.value = fullPath;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    try {
                      document.execCommand('copy');
                    } finally {
                      document.body.removeChild(ta);
                    }
                  }, 0);
                }
              },
            },
          });
        } else {
          anyFailed = true;
          toast.error(`Failed: ${file.name} — ${result.error}`, { id: toastId });
        }
      }

      setIsUploading(false);
      if (!anyFailed) {
        onOpenChange(false);
      }
    },
    [worktreePath, slug, onOpenChange]
  );

  const handleClipboardRead = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/') || type === 'application/octet-stream') {
            const blob = await item.getType(type);
            const ext = type.split('/')[1] || 'png';
            const name = `paste-${Date.now()}.${ext}`;
            files.push(new File([blob], name, { type }));
          }
        }
      }
      if (files.length > 0) {
        handleUploadFiles(files);
      } else {
        toast.error('No image found in clipboard');
      }
    } catch {
      toast.error('Could not read clipboard — try "Browse files" instead');
    }
  }, [handleUploadFiles]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        handleUploadFiles(files);
      }
    },
    [handleUploadFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleUploadFiles(files);
      }
    },
    [handleUploadFiles]
  );

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
            'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          )}
        >
          {isUploading ? (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          ) : isDragOver ? (
            <>
              <Upload className="mb-3 h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Drop files here</p>
            </>
          ) : (
            <>
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Paste, drag, or select files</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Long-press below to paste an image, or browse files
              </p>
              {/* Paste target: long-press → Paste works without HTTPS */}
              <div
                contentEditable
                suppressContentEditableWarning
                onPaste={(e) => {
                  e.preventDefault();
                  const files = e.clipboardData?.files;
                  if (files && files.length > 0) {
                    handleUploadFiles(files);
                  } else {
                    toast.error('No image found — copy an image first');
                  }
                  // Clear any text that got pasted
                  e.currentTarget.textContent = '';
                }}
                className="mt-3 w-full rounded-md border-2 border-dashed px-4 py-3 text-center text-sm text-muted-foreground focus:border-primary focus:outline-none"
                style={{ minHeight: '44px', fontSize: '16px', WebkitUserSelect: 'text' }}
              >
                Tap here, then long-press to paste
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Browse files...
              </button>
            </>
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
            if (e.target.files) handleUploadFiles(e.target.files);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
