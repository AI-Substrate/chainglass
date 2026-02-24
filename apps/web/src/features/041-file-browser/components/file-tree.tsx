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

import { ChevronDown, ChevronRight, File, Folder, FolderOpen, RefreshCw } from 'lucide-react';
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
    <div className="flex flex-col text-sm">
      <div className="flex items-center justify-between border-b px-3 py-2">
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
}) {
  const isExpanded = expanded.has(entry.path);
  const isSelected = selectedFile === entry.path;
  const isChanged = changedFiles?.includes(entry.path);
  const children = childEntries[entry.path];

  if (entry.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          onClick={() => onDirClick(entry.path)}
          className={`flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
            isSelected ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
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
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  // Scroll selected file into view on mount
  const scrollRef = useCallback(
    (el: HTMLButtonElement | null) => {
      if (el && isSelected) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    [isSelected]
  );

  return (
    <button
      ref={scrollRef}
      type="button"
      onClick={() => onSelect(entry.path)}
      className={`flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-accent ${
        isSelected ? 'bg-accent font-medium' : ''
      } ${isChanged ? 'text-amber-600 dark:text-amber-400' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 8 + 14}px` }}
    >
      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
