'use client';

/**
 * FileTree — Lazy-loading file tree with expand/collapse, filter, refresh.
 *
 * Pure presentational: receives entries as props, fires callbacks for
 * file selection, directory expansion, and refresh.
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-01: Lazy per-directory (onExpand callback)
 * DYK-P4-03: Scales to huge repos
 */

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Download,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  RefreshCw,
} from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import type { FileEntry } from '../services/directory-listing';

/** Handle exposed via ref for external access to tree state */
export interface FileTreeHandle {
  getExpandedDirs: () => string[];
}

export interface FileTreeProps {
  entries: FileEntry[];
  selectedFile?: string;
  changedFiles?: string[];
  /** Paths of newly added files/dirs — get green fade-in animation */
  newlyAddedPaths?: Set<string>;
  onSelect: (filePath: string) => void;
  onExpand: (dirPath: string) => void;
  childEntries?: Record<string, FileEntry[]>;
  /** Programmatically expand these paths (merged into internal state) */
  expandPaths?: string[];
  /** Called when expanded dirs change (for external tracking) */
  onExpandedDirsChange?: (dirs: string[]) => void;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (filePath: string) => void;
  onCopyTree?: (dirPath: string) => void;
  onDownload?: (filePath: string) => void;
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  {
    entries,
    selectedFile,
    changedFiles,
    newlyAddedPaths,
    onSelect,
    onExpand,
    childEntries = {},
    expandPaths,
    onExpandedDirsChange,
    onCopyFullPath,
    onCopyRelativePath,
    onCopyContent,
    onCopyTree,
    onDownload,
  },
  ref
) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand to selected file on initial render
    if (!selectedFile) return new Set();
    const parts = selectedFile.split('/');
    const paths = new Set<string>();
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      paths.add(current);
    }
    return paths;
  });

  // Expose expanded dirs to parent via ref (DYK #4)
  useImperativeHandle(
    ref,
    () => ({
      getExpandedDirs: () => [...expanded],
    }),
    [expanded]
  );

  // Merge externally-requested expand paths into internal state
  useEffect(() => {
    if (!expandPaths || expandPaths.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of expandPaths) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [expandPaths]);

  // Notify parent when expanded dirs change
  useEffect(() => {
    onExpandedDirsChange?.([...expanded]);
  }, [expanded, onExpandedDirsChange]);

  const handleDirClick = (dirPath: string) => {
    const next = new Set(expanded);
    if (next.has(dirPath)) {
      next.delete(dirPath);
    } else {
      next.add(dirPath);
      if (!childEntries[dirPath]) {
        onExpand(dirPath);
      }
    }
    setExpanded(next);
  };

  if (entries.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No files found</div>;
  }

  return (
    <div className="text-sm h-full overflow-y-auto">
      {entries.map((entry) => (
        <TreeItem
          key={entry.path}
          entry={entry}
          depth={0}
          expanded={expanded}
          selectedFile={selectedFile}
          changedFiles={changedFiles}
          newlyAddedPaths={newlyAddedPaths}
          childEntries={childEntries}
          onSelect={onSelect}
          onDirClick={handleDirClick}
          onExpand={onExpand}
          onCopyFullPath={onCopyFullPath}
          onCopyRelativePath={onCopyRelativePath}
          onCopyContent={onCopyContent}
          onCopyTree={onCopyTree}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
});

function TreeItem({
  entry,
  depth,
  expanded,
  selectedFile,
  changedFiles,
  newlyAddedPaths,
  childEntries,
  onSelect,
  onDirClick,
  onExpand,
  onCopyFullPath,
  onCopyRelativePath,
  onCopyContent,
  onCopyTree,
  onDownload,
}: {
  entry: FileEntry;
  depth: number;
  expanded: Set<string>;
  selectedFile?: string;
  changedFiles?: string[];
  newlyAddedPaths?: Set<string>;
  childEntries: Record<string, FileEntry[]>;
  onSelect: (path: string) => void;
  onDirClick: (path: string) => void;
  onExpand: (path: string) => void;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (filePath: string) => void;
  onCopyTree?: (dirPath: string) => void;
  onDownload?: (filePath: string) => void;
}) {
  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedFile === entry.path;
  const isChanged = changedFiles?.includes(entry.path);
  const isNewlyAdded = newlyAddedPaths?.has(entry.path);
  const children = childEntries[entry.path];

  if (entry.type === 'directory') {
    return (
      <div>
        <div
          className={`group relative flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
            isSelected ? 'bg-accent' : ''
          } ${isNewlyAdded ? 'tree-entry-new' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => onDirClick(entry.path)}
                className="flex items-center gap-1 min-w-0 flex-1"
              >
                {isExpanded ? (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                  </>
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onCopyFullPath?.(entry.path)}>
                <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
                Copy Full Path
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCopyRelativePath?.(entry.path)}>
                <FileText className="h-3.5 w-3.5 mr-2" />
                Copy Relative Path
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onCopyTree?.(entry.path)}>
                <FolderTree className="h-3.5 w-3.5 mr-2" />
                Copy Tree From Here
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand(entry.path);
            }}
            className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Refresh ${entry.name}`}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {isExpanded && children && (
          <div>
            {children.map((child) => (
              <TreeItem
                key={child.path}
                entry={child}
                depth={depth + 1}
                expanded={expanded}
                selectedFile={selectedFile}
                changedFiles={changedFiles}
                newlyAddedPaths={newlyAddedPaths}
                childEntries={childEntries}
                onSelect={onSelect}
                onDirClick={onDirClick}
                onExpand={onExpand}
                onCopyFullPath={onCopyFullPath}
                onCopyRelativePath={onCopyRelativePath}
                onCopyContent={onCopyContent}
                onCopyTree={onCopyTree}
                onDownload={onDownload}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Scroll selected file into view on mount — center so it's not at the edge
  const scrollRef = useCallback(
    (el: HTMLButtonElement | null) => {
      if (el && isSelected) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
    [isSelected]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={scrollRef}
          type="button"
          onClick={() => onSelect(entry.path)}
          className={`relative flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
            isSelected ? 'bg-accent font-medium' : ''
          } ${isChanged ? 'text-amber-600 dark:text-amber-400' : ''} ${isNewlyAdded ? 'tree-entry-new' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8 + 14}px` }}
        >
          {isSelected && (
            <span className="absolute left-0.5 text-amber-500 font-black text-sm">▶</span>
          )}
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`truncate ${isSelected ? 'text-base' : ''}`}>{entry.name}</span>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onCopyFullPath?.(entry.path)}>
          <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
          Copy Full Path
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyRelativePath?.(entry.path)}>
          <FileText className="h-3.5 w-3.5 mr-2" />
          Copy Relative Path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCopyContent?.(entry.path)}>
          <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
          Copy Content
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDownload?.(entry.path)}>
          <Download className="h-3.5 w-3.5 mr-2" />
          Download
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
