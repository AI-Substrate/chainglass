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
import { useCallback, useState } from 'react';
import type { FileEntry } from '../services/directory-listing';

export interface FileTreeProps {
  entries: FileEntry[];
  selectedFile?: string;
  changedFiles?: string[];
  showChangedOnly?: boolean;
  onSelect: (filePath: string) => void;
  onExpand: (dirPath: string) => void;
  onRefresh: () => void;
  childEntries?: Record<string, FileEntry[]>;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (filePath: string) => void;
  onCopyTree?: (dirPath: string) => void;
  onDownload?: (filePath: string) => void;
}

export function FileTree({
  entries,
  selectedFile,
  changedFiles,
  showChangedOnly,
  onSelect,
  onExpand,
  onRefresh,
  childEntries = {},
  onCopyFullPath,
  onCopyRelativePath,
  onCopyContent,
  onCopyTree,
  onDownload,
}: FileTreeProps) {
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

  const filteredEntries =
    showChangedOnly && changedFiles
      ? entries.filter(
          (e) =>
            e.type === 'directory' ||
            changedFiles.some((f) => f === e.path || f.startsWith(`${e.path}/`))
        )
      : entries;

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
    <div className="flex flex-col text-sm h-full">
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0 sticky top-0 bg-background z-10">
        <span className="text-xs font-medium text-muted-foreground uppercase">Files</span>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Refresh file tree"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="overflow-y-auto">
        {filteredEntries.map((entry) => (
          <TreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            selectedFile={selectedFile}
            changedFiles={changedFiles}
            showChangedOnly={showChangedOnly}
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
    </div>
  );
}

function TreeItem({
  entry,
  depth,
  expanded,
  selectedFile,
  changedFiles,
  showChangedOnly,
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
  showChangedOnly?: boolean;
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
  const children = childEntries[entry.path];

  if (entry.type === 'directory') {
    return (
      <div>
        <div
          className={`group relative flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
            isSelected ? 'bg-accent' : ''
          }`}
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
            onClick={() => onExpand(entry.path)}
            className="hidden group-hover:block shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Refresh ${entry.name}`}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {isExpanded && children && (
          <div>
            {children
              .filter(
                (c) =>
                  !showChangedOnly ||
                  !changedFiles ||
                  c.type === 'directory' ||
                  changedFiles.some((f) => f === c.path || f.startsWith(`${c.path}/`))
              )
              .map((child) => (
                <TreeItem
                  key={child.path}
                  entry={child}
                  depth={depth + 1}
                  expanded={expanded}
                  selectedFile={selectedFile}
                  changedFiles={changedFiles}
                  showChangedOnly={showChangedOnly}
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
          } ${isChanged ? 'text-amber-600 dark:text-amber-400' : ''}`}
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
