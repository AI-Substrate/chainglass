'use client';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

export interface MobileExplorerSheetProps {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Custom trigger element — defaults to a Search icon button */
  trigger?: ReactNode;
}

/**
 * MobileExplorerSheet — bottom Sheet wrapping ExplorerPanel for mobile.
 *
 * Triggered by a search icon (or custom trigger) in the MobileSwipeStrip
 * rightAction slot. Uses shadcn Sheet (Radix Dialog) with side="bottom".
 * Close via Escape, backdrop click, X button, or consumer calling onOpenChange(false).
 *
 * Plan 078: Mobile Experience — Phase 3
 */
export function MobileExplorerSheet({
  children,
  open,
  onOpenChange,
  trigger,
}: MobileExplorerSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ?? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      )}
      <SheetContent side="bottom" className="h-[60vh]">
        <VisuallyHidden>
          <SheetTitle>Explorer</SheetTitle>
          <SheetDescription>Search files and run commands</SheetDescription>
        </VisuallyHidden>
        {children}
      </SheetContent>
    </Sheet>
  );
}
