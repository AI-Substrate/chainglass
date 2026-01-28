'use client';

/**
 * WorkspaceSelector - Dropdown for switching between workspaces
 *
 * Client component that allows workspace switching without going back to /workspaces.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 */

import { cn } from '@/lib/utils';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

export interface WorkspaceOption {
  slug: string;
  name: string;
}

export interface WorkspaceSelectorProps {
  /** Currently selected workspace slug */
  currentSlug: string;
  /** List of all available workspaces */
  workspaces: WorkspaceOption[];
  /** Base path for navigation (e.g., "/workspaces/{slug}/agents") */
  basePath: string;
  /** Additional CSS classes */
  className?: string;
}

export function WorkspaceSelector({
  currentSlug,
  workspaces,
  basePath,
  className,
}: WorkspaceSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const currentWorkspace = workspaces.find((w) => w.slug === currentSlug);

  const handleSelect = useCallback(
    (slug: string) => {
      setIsOpen(false);
      if (slug !== currentSlug) {
        const path = basePath.replace('{slug}', slug);
        router.push(path);
      }
    },
    [currentSlug, basePath, router]
  );

  if (workspaces.length <= 1) {
    // Don't show dropdown if only one workspace
    return null;
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border',
          'bg-background hover:bg-muted/50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/20'
        )}
      >
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{currentWorkspace?.name || currentSlug}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
            role="button"
            tabIndex={-1}
            aria-label="Close dropdown"
          />

          {/* Dropdown menu */}
          <div className="absolute top-full left-0 mt-1 z-20 min-w-[200px] rounded-md border bg-popover shadow-md">
            <div className="py-1">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.slug}
                  type="button"
                  onClick={() => handleSelect(workspace.slug)}
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left',
                    'hover:bg-muted/50 transition-colors',
                    workspace.slug === currentSlug && 'bg-muted font-medium'
                  )}
                >
                  {workspace.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
