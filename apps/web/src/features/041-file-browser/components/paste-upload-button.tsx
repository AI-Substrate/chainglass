'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { PasteUploadModal } from './paste-upload-modal';

interface PasteUploadButtonProps {
  slug: string;
  worktreePath: string;
}

export function PasteUploadButton({ slug, worktreePath }: PasteUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Upload file"
            className="h-8 w-8"
          >
            <Upload className="h-4 w-4" />
          </Button>
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
