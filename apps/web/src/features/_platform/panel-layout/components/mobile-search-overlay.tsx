'use client';

import { FileIcon } from '@/features/_platform/themes';
import type { MruTracker } from '@/lib/sdk/sdk-provider';
import type { IUSDK } from '@chainglass/shared/sdk';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FLOWSPACE_CATEGORY_ICONS } from '../types';
import type {
  CodeSearchAvailability,
  CodeSearchResult,
  FileChangeInfo,
  FileSearchEntry,
  FileSearchSortMode,
} from '../types';

interface MobileSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onFileSelect: (path: string) => void;
  onCodeSearchSelect: (filePath: string, startLine: number) => void;
  onCommandExecute: (commandId: string) => void;
  fileSearchResults?: FileSearchEntry[] | null;
  fileSearchLoading?: boolean;
  fileSearchError?: string | null;
  sortMode?: FileSearchSortMode;
  onSortModeChange?: () => void;
  includeHidden?: boolean;
  onIncludeHiddenChange?: () => void;
  onSearchQueryChange: (query: string) => void;
  codeSearchResults?: CodeSearchResult[] | null;
  codeSearchLoading?: boolean;
  /** Plan 084: cold-start state for the long-lived fs2 mcp child. */
  codeSearchSpawning?: boolean;
  codeSearchError?: string | null;
  codeSearchAvailability?: CodeSearchAvailability;
  codeSearchGraphAge?: string | null;
  codeSearchFolders?: Record<string, number> | null;
  onFlowspaceQueryChange: (query: string, mode: 'grep' | 'semantic') => void;
  workingChanges?: FileChangeInfo[];
  sdk?: IUSDK;
  mru?: MruTracker;
}

const STATUS_BADGE: Record<string, { letter: string; className: string }> = {
  modified: { letter: 'M', className: 'text-amber-500' },
  added: { letter: 'A', className: 'text-green-500' },
  deleted: { letter: 'D', className: 'text-red-500' },
  renamed: { letter: 'R', className: 'text-blue-500' },
  untracked: { letter: '?', className: 'text-muted-foreground' },
};

/**
 * MobileSearchOverlay — full-screen search overlay for phone viewports.
 *
 * Replaces MobileExplorerSheet. Renders as position:fixed inset-0 so
 * the input is a direct DOM child (iOS auto-focus works). Results render
 * inline below the input (not as an absolute dropdown).
 *
 * Supports same prefix modes as ExplorerPanel:
 * - plain text: file search
 * - > prefix: command palette
 * - # prefix: grep/symbol search
 * - $ prefix: semantic search
 *
 * Plan 078: Mobile Experience — Workshop 005
 */
export function MobileSearchOverlay({
  open,
  onClose,
  onFileSelect,
  onCodeSearchSelect,
  onCommandExecute,
  fileSearchResults,
  fileSearchLoading,
  onSearchQueryChange,
  codeSearchResults,
  codeSearchLoading,
  codeSearchSpawning,
  codeSearchError,
  codeSearchAvailability,
  codeSearchGraphAge,
  codeSearchFolders,
  onFlowspaceQueryChange,
  workingChanges,
  sdk,
  mru,
}: MobileSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // Mode detection from prefix
  const isCommandMode = query.startsWith('>');
  const isSymbolMode = query.startsWith('#');
  const isSemanticMode = query.startsWith('$');
  const isFileMode = !isCommandMode && !isSymbolMode && !isSemanticMode;

  // Commands from SDK
  const commands = useMemo(() => {
    if (!isCommandMode || !sdk) return [];
    const filter = query.slice(1).trim().toLowerCase();
    const all = sdk.commands.getAll();
    const mruOrder = mru?.getOrderedIds() ?? [];
    const mruSet = new Set(mruOrder);

    const sorted = [...all].sort((a, b) => {
      const aIdx = mruOrder.indexOf(a.id);
      const bIdx = mruOrder.indexOf(b.id);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.label.localeCompare(b.label);
    });

    if (!filter) return sorted;
    return sorted.filter(
      (cmd) => cmd.label.toLowerCase().includes(filter) || cmd.id.toLowerCase().includes(filter)
    );
  }, [isCommandMode, query, sdk, mru]);

  // Notify parent hooks of query changes
  useEffect(() => {
    if (!open) return;
    if (isFileMode) {
      onSearchQueryChange(query.trim());
      onFlowspaceQueryChange('', 'grep');
    } else if (isSymbolMode) {
      onSearchQueryChange('');
      onFlowspaceQueryChange(query.slice(1).trim(), 'grep');
    } else if (isSemanticMode) {
      onSearchQueryChange('');
      onFlowspaceQueryChange(query.slice(1).trim(), 'semantic');
    } else {
      onSearchQueryChange('');
      onFlowspaceQueryChange('', 'grep');
    }
  }, [
    open,
    query,
    isFileMode,
    isSymbolMode,
    isSemanticMode,
    onSearchQueryChange,
    onFlowspaceQueryChange,
  ]);

  // Auto-focus input on open
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Changes map for status badges
  const changesMap = useMemo(() => {
    const m = new Map<string, FileChangeInfo>();
    if (workingChanges) {
      for (const c of workingChanges) m.set(c.path, c);
    }
    return m;
  }, [workingChanges]);

  const handleFileClick = useCallback(
    (path: string) => {
      onFileSelect(path);
      onClose();
    },
    [onFileSelect, onClose]
  );

  const handleCodeClick = useCallback(
    (path: string, line: number) => {
      onCodeSearchSelect(path, line);
      onClose();
    },
    [onCodeSearchSelect, onClose]
  );

  const handleCommandClick = useCallback(
    (cmdId: string) => {
      onCommandExecute(cmdId);
      onClose();
    },
    [onCommandExecute, onClose]
  );

  if (!open) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      data-testid="mobile-search-overlay"
    >
      {/* Header: close + input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Close search"
        >
          <X className="h-5 w-5" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files, > commands, # symbols"
          className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          style={{ fontSize: '16px' }}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Empty state — show hints */}
        {!hasQuery && (
          <div className="py-4 px-4 space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick Access
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span>Type to search files</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">&gt;</span>
              <span>Commands</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">#</span>
              <span>Content search (grep)</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">$</span>
              <span>Semantic search</span>
            </div>
          </div>
        )}

        {/* File search results */}
        {isFileMode && hasQuery && (
          <>
            {fileSearchLoading && (
              <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
            )}
            {fileSearchResults && fileSearchResults.length > 0 ? (
              <div className="py-1">
                {fileSearchResults.map((entry) => {
                  const changed = changesMap.get(entry.path);
                  const badge = changed ? STATUS_BADGE[changed.status] : null;
                  const dir = entry.path.includes('/')
                    ? entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
                    : '';
                  const name = entry.path.split('/').pop() ?? entry.path;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => handleFileClick(entry.path)}
                      className="flex w-full items-center gap-1.5 px-4 py-2 text-sm text-left hover:bg-accent active:bg-accent/70"
                    >
                      {badge && (
                        <span
                          className={`shrink-0 w-4 text-center font-mono text-xs font-bold ${badge.className}`}
                        >
                          {badge.letter}
                        </span>
                      )}
                      <FileIcon filename={name} className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">
                        <span className="text-muted-foreground">{dir}</span>
                        <span>{name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              !fileSearchLoading && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No matching files
                </div>
              )
            )}
          </>
        )}

        {/* Command palette results */}
        {isCommandMode &&
          (commands.length > 0 ? (
            <div className="py-1">
              {commands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => handleCommandClick(cmd.id)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-accent active:bg-accent/70"
                >
                  <span className="text-muted-foreground">⚡</span>
                  <span className="flex-1 truncate">{cmd.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query.trim() === '>' ? 'Type to filter commands' : 'No matching commands'}
            </div>
          ))}

        {/* Code search results (# grep / $ semantic) */}
        {(isSymbolMode || isSemanticMode) && (
          <>
            {codeSearchSpawning ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Loading FlowSpace, please wait…
                <div className="text-xs text-muted-foreground/70 mt-0.5">
                  first search loads the code graph
                </div>
              </div>
            ) : codeSearchLoading ? (
              <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
            ) : null}
            {codeSearchError && (
              <div className="px-4 py-3 text-sm text-red-500">{codeSearchError}</div>
            )}
            {codeSearchResults && codeSearchResults.length > 0 ? (
              <div className="py-1">
                {codeSearchFolders && Object.keys(codeSearchFolders).length > 0 && (
                  <div className="flex items-center justify-between px-4 py-1 border-b">
                    <span className="text-xs text-muted-foreground">
                      {codeSearchResults.length} results
                    </span>
                    {isSemanticMode && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        🧠 semantic
                      </span>
                    )}
                  </div>
                )}
                {codeSearchResults.map((result) => {
                  const key =
                    result.kind === 'grep'
                      ? `${result.filePath}:${result.lineNumber}`
                      : result.nodeId;
                  const line = result.kind === 'grep' ? result.lineNumber : result.startLine;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCodeClick(result.filePath, line)}
                      className="flex w-full flex-col gap-0.5 px-4 py-2 text-sm text-left hover:bg-accent active:bg-accent/70"
                    >
                      {result.kind === 'grep' ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Search className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-medium truncate">{result.filename}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              :{result.lineNumber}
                            </span>
                          </div>
                          <div className="ml-6 text-xs text-muted-foreground font-mono truncate">
                            {result.matchContent}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 w-4 text-center text-xs">
                              {FLOWSPACE_CATEGORY_ICONS[result.category] || '○'}
                            </span>
                            <span className="font-medium truncate">{result.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              L{result.startLine}
                            </span>
                          </div>
                          <div className="ml-6 text-xs text-muted-foreground truncate">
                            {result.filePath}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              !codeSearchLoading &&
              !codeSearchError &&
              query.length > 1 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No results
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
