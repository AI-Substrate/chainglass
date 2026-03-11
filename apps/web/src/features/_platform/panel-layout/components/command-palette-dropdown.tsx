'use client';

/**
 * CommandPaletteDropdown — Multi-mode dropdown for the explorer bar.
 *
 * Shows different content based on mode:
 * - 'commands' (> prefix): filtered SDK commands with MRU ordering
 * - 'symbols' (# prefix): stub message for future LSP/Flowspace
 * - 'search' (no prefix): hints + command palette entry point
 * - 'param' (gathering params): hint label for param input
 *
 * DYK-P3-02: Container uses onMouseDown preventDefault to prevent blur.
 * DYK-P3-03: Exposes handleKeyDown via forwardRef for delegation from ExplorerPanel.
 * DYK-ST001-01: 'param' mode takes priority over prefix-derived mode.
 *
 * Per Plan 047 Phase 3, Task T002. Subtask 001: param gathering.
 */

import { FileIcon } from '@/features/_platform/themes';
import type { IUSDK, SDKCommand } from '@chainglass/shared/sdk';
import {
  ArrowDownAZ,
  ArrowUpZA,
  ClipboardCopy,
  Clock,
  Command,
  Download,
  Eye,
  EyeOff,
  File,
  FileText,
  Hash,
  Keyboard,
  Search,
  Terminal,
} from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { MruTracker } from '@/lib/sdk/sdk-provider';
import type { FileChangeInfo, FileSearchEntry, FileSearchSortMode } from '../types';
import {
  type CodeSearchAvailability,
  type CodeSearchResult,
  FLOWSPACE_CATEGORY_ICONS,
} from '../types';

import { AsciiSpinner } from './ascii-spinner';

export type DropdownMode = 'commands' | 'symbols' | 'semantic' | 'search' | 'param';

export interface CommandPaletteDropdownHandle {
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/** Info about a param being gathered. Passed from ExplorerPanel. */
export interface ParamGatheringInfo {
  commandId: string;
  commandTitle: string;
  fieldKey: string;
}

interface CommandPaletteDropdownProps {
  sdk: IUSDK;
  filter: string;
  mru: MruTracker;
  mode: DropdownMode;
  onExecute: (commandId: string) => void;
  onClose: () => void;
  /** When set, dropdown shows param gathering hint. */
  paramGathering?: ParamGatheringInfo | null;
  /** Current input value for search mode (Plan 049 Feature 2) */
  inputValue?: string;
  /** File search results from useFileFilter */
  fileSearchResults?: FileSearchEntry[] | null;
  /** Whether the file search cache is loading */
  fileSearchLoading?: boolean;
  /** File search error message */
  fileSearchError?: string | null;
  /** Current sort mode for file search */
  sortMode?: FileSearchSortMode;
  /** Cycle sort mode callback */
  onSortModeChange?: () => void;
  /** Whether hidden/ignored files are shown */
  includeHidden?: boolean;
  /** Toggle hidden files callback */
  onIncludeHiddenChange?: () => void;
  /** Navigate to a file from search results */
  onFileSelect?: (path: string) => void;
  /** Context menu: copy full (absolute) path */
  onCopyFullPath?: (path: string) => void;
  /** Context menu: copy relative path */
  onCopyRelativePath?: (path: string) => void;
  /** Context menu: copy file content */
  onCopyContent?: (path: string) => void;
  /** Context menu: download file */
  onDownload?: (path: string) => void;
  /** Working changes for status badge lookup */
  workingChanges?: FileChangeInfo[];
  /** FlowSpace search results (Plan 051) */
  codeSearchResults?: CodeSearchResult[] | null;
  codeSearchLoading?: boolean;
  codeSearchError?: string | null;
  codeSearchAvailability?: CodeSearchAvailability;
  codeSearchGraphAge?: string | null;
  codeSearchFolders?: Record<string, number> | null;
  /** Navigate to a code symbol from FlowSpace results */
  onCodeSearchSelect?: (filePath: string, startLine: number) => void;
}

// --- Schema introspection helpers (ST001) ---

/**
 * Check if a Zod schema has required fields that aren't satisfied by {}.
 */
export function hasRequiredParams(schema: {
  safeParse: (v: unknown) => { success: boolean };
}): boolean {
  return !schema.safeParse({}).success;
}

/**
 * Extract the first required string field from a Zod object schema.
 * Returns null if no required string field found or schema isn't a ZodObject.
 */
export function extractFirstRequiredStringField(schema: unknown): { key: string } | null {
  const s = schema as Record<string, unknown>;
  if (!s || typeof s !== 'object' || !('shape' in s)) return null;
  const shape = s.shape as Record<
    string,
    { isOptional: () => boolean; safeParse: (v: unknown) => { success: boolean } }
  >;
  if (!shape || typeof shape !== 'object') return null;
  for (const [key, field] of Object.entries(shape)) {
    if (typeof field?.isOptional !== 'function') continue;
    if (!field.isOptional()) {
      if (typeof field.safeParse === 'function' && field.safeParse('test').success) {
        return { key };
      }
    }
  }
  return null;
}

/** Filter and sort commands: MRU first, then alphabetical. Filtered by title substring. */
function filterAndSort(commands: SDKCommand[], filter: string, mruOrder: string[]): SDKCommand[] {
  const lowerFilter = filter.toLowerCase();
  const filtered = filter
    ? commands.filter((c) => c.title.toLowerCase().includes(lowerFilter))
    : commands;

  const mruSet = new Map(mruOrder.map((id, i) => [id, i]));

  return [...filtered].sort((a, b) => {
    const aIdx = mruSet.get(a.id);
    const bIdx = mruSet.get(b.id);
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
    if (aIdx !== undefined) return -1;
    if (bIdx !== undefined) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** Extracted results list — shared between # (grep) and $ (flowspace) modes */
function CodeSearchResultsList({
  results,
  selectedIndex,
  mode,
  codeSearchFolders,
  codeSearchGraphAge,
  listRef,
  onCodeSearchSelect,
  onCopyFullPath,
  onCopyRelativePath,
  onCopyContent,
  onDownload,
}: {
  results: CodeSearchResult[] | null | undefined;
  selectedIndex: number;
  mode: string;
  codeSearchFolders: Record<string, number> | null | undefined;
  codeSearchGraphAge: string | null | undefined;
  listRef: React.RefObject<HTMLDivElement | null>;
  onCodeSearchSelect?: (filePath: string, line: number) => void;
  onCopyFullPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onCopyContent?: (path: string) => void;
  onDownload?: (path: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="text-xs text-muted-foreground">
          {results?.length} results
          {codeSearchFolders &&
            Object.keys(codeSearchFolders).length > 0 &&
            ` · ${Object.entries(codeSearchFolders)
              .slice(0, 3)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')}`}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {mode === 'semantic' && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              🧠 semantic
            </span>
          )}
          {codeSearchGraphAge && <span>indexed {codeSearchGraphAge}</span>}
        </div>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: custom palette item list */}
      <div ref={listRef} role="listbox" tabIndex={-1} className="py-1">
        {results?.map((result, index) => (
          <ContextMenu
            key={result.kind === 'grep' ? `${result.filePath}:${result.lineNumber}` : result.nodeId}
          >
            <ContextMenuTrigger asChild>
              <div // biome-ignore lint/a11y/useSemanticElements: custom palette item
                role="option"
                tabIndex={-1}
                aria-selected={index === selectedIndex}
                className={`px-3 py-1.5 cursor-pointer ${
                  index === selectedIndex
                    ? 'bg-primary/15 text-foreground'
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onClick={() => {
                  const line = result.kind === 'grep' ? result.lineNumber : result.startLine;
                  onCodeSearchSelect?.(result.filePath, line);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const line = result.kind === 'grep' ? result.lineNumber : result.startLine;
                    onCodeSearchSelect?.(result.filePath, line);
                  }
                }}
              >
                {result.kind === 'grep' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Search className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium truncate">{result.filename}</span>
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                        :{result.lineNumber}
                      </span>
                      {result.matchCount > 1 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          +{result.matchCount - 1} more
                        </span>
                      )}
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
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                        L{result.startLine}
                        {result.endLine !== result.startLine && `-${result.endLine}`}
                      </span>
                    </div>
                    <div className="ml-6 text-xs text-muted-foreground truncate">
                      {result.filePath}
                    </div>
                    {result.smartContent &&
                      !result.smartContent.startsWith('[Empty content') &&
                      !result.smartContent.startsWith('[No ') &&
                      result.smartContent.length > 10 &&
                      !result.name.startsWith(result.smartContent.slice(0, 30)) && (
                        <div className="ml-6 text-xs text-muted-foreground/70 truncate">
                          {result.smartContent.slice(0, 120)}
                        </div>
                      )}
                  </>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onCopyFullPath?.(result.filePath)}>
                <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
                Copy Full Path
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onCopyRelativePath?.(result.filePath)}>
                <File className="mr-2 h-3.5 w-3.5" />
                Copy Relative Path
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onCopyContent?.(result.filePath)}>
                <FileText className="mr-2 h-3.5 w-3.5" />
                Copy Content
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onDownload?.(result.filePath)}>
                <Download className="mr-2 h-3.5 w-3.5" />
                Download
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </>
  );
}

export const CommandPaletteDropdown = forwardRef<
  CommandPaletteDropdownHandle,
  CommandPaletteDropdownProps
>(function CommandPaletteDropdown(
  {
    sdk,
    filter,
    mru,
    mode,
    onExecute,
    onClose,
    paramGathering,
    inputValue,
    fileSearchResults,
    fileSearchLoading,
    fileSearchError,
    sortMode,
    onSortModeChange,
    includeHidden,
    onIncludeHiddenChange,
    onFileSelect,
    onCopyFullPath,
    onCopyRelativePath,
    onCopyContent,
    onDownload,
    workingChanges,
    codeSearchResults,
    codeSearchLoading,
    codeSearchError,
    codeSearchAvailability,
    codeSearchGraphAge,
    codeSearchFolders,
    onCodeSearchSelect,
  },
  ref
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => {
    if (mode !== 'commands') return [];
    const all = sdk.commands.list().filter((c) => {
      // Hide openCommandPalette from the palette itself (circular)
      if (c.id === 'sdk.openCommandPalette') return false;
      if (!sdk.commands.isAvailable(c.id)) return false;
      return true;
    });
    return filterAndSort(all, filter, mru.getOrder());
  }, [sdk, filter, mru, mode]);

  // Build working changes lookup for status badges
  const changesMap = useMemo(() => {
    if (!workingChanges) return new Map<string, FileChangeInfo>();
    return new Map(workingChanges.map((f) => [f.path, f]));
  }, [workingChanges]);

  // Determine if we're showing file search results
  const hasSearchText = mode === 'search' && !!inputValue?.trim();
  const showFileResults =
    hasSearchText && Array.isArray(fileSearchResults) && fileSearchResults.length > 0;

  // FlowSpace mode detection
  const isFlowspaceMode = mode === 'symbols' || mode === 'semantic';
  const hasFlowspaceQuery =
    isFlowspaceMode && !!inputValue && inputValue.replace(/^[#$]\s*/, '').trim().length > 0;
  const showFlowspaceResults =
    hasFlowspaceQuery && Array.isArray(codeSearchResults) && codeSearchResults.length > 0;

  // Items count for keyboard nav
  const navItemCount =
    mode === 'commands'
      ? commands.length
      : showFlowspaceResults
        ? codeSearchResults?.length
        : showFileResults
          ? fileSearchResults?.length
          : 0;

  // Reset selection when filter, mode, or search results change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset on filter/mode/results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, mode, fileSearchResults, codeSearchResults]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (commandId: string) => {
      onExecute(commandId);
    },
    [onExecute]
  );

  // DYK-P3-03: Expose keyboard handler for delegation from ExplorerPanel
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Navigate items (commands or file search results)
      if (navItemCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, navItemCount - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (mode === 'commands') {
            const cmd = commands[selectedIndex];
            if (cmd) handleSelect(cmd.id);
          } else if (showFlowspaceResults) {
            const result = codeSearchResults?.[selectedIndex];
            if (result) {
              const line = result.kind === 'grep' ? result.lineNumber : result.startLine;
              onCodeSearchSelect?.(result.filePath, line);
            }
          } else if (showFileResults) {
            const file = fileSearchResults?.[selectedIndex];
            if (file) onFileSelect?.(file.path);
          }
        }
      }
    },
    [
      mode,
      commands,
      navItemCount,
      selectedIndex,
      handleSelect,
      onClose,
      showFileResults,
      fileSearchResults,
      onFileSelect,
      showFlowspaceResults,
      codeSearchResults,
      onCodeSearchSelect,
    ]
  );

  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

  return (
    // DYK-P3-02: onMouseDown preventDefault keeps input focused
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-lg border bg-popover shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Semantic mode ($) — FlowSpace availability gates apply */}
      {isFlowspaceMode &&
        mode === 'semantic' &&
        (codeSearchAvailability === 'not-installed' ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <Hash className="inline h-4 w-4 mr-1 -mt-0.5" />
            FlowSpace not installed
            <div className="mt-2 flex items-center justify-center gap-2">
              <code className="rounded bg-muted px-2 py-0.5 text-xs select-all">
                https://github.com/AI-Substrate/flow_squared
              </code>
              <button
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-accent"
                onClick={() =>
                  navigator.clipboard.writeText('https://github.com/AI-Substrate/flow_squared')
                }
              >
                <ClipboardCopy className="h-3 w-3" />
              </button>
            </div>
          </div>
        ) : codeSearchAvailability === 'no-graph' ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <Hash className="inline h-4 w-4 mr-1 -mt-0.5" />
            Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">fs2 scan</code> to index
            your codebase
          </div>
        ) : !hasFlowspaceQuery ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <Hash className="inline h-4 w-4 mr-1 -mt-0.5" />
            FlowSpace semantic search
          </div>
        ) : codeSearchLoading ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <AsciiSpinner active /> Searching...
          </div>
        ) : codeSearchError ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {codeSearchError}
          </div>
        ) : showFlowspaceResults ? (
          <CodeSearchResultsList
            results={codeSearchResults}
            selectedIndex={selectedIndex}
            mode={mode}
            codeSearchFolders={codeSearchFolders}
            codeSearchGraphAge={codeSearchGraphAge}
            listRef={listRef}
            onCodeSearchSelect={onCodeSearchSelect}
            onCopyFullPath={onCopyFullPath}
            onCopyRelativePath={onCopyRelativePath}
            onCopyContent={onCopyContent}
            onDownload={onDownload}
          />
        ) : hasFlowspaceQuery ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
        ) : null)}

      {/* Content search (#) — git grep, no FlowSpace gates */}
      {isFlowspaceMode &&
        mode === 'symbols' &&
        (!hasFlowspaceQuery ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <Search className="inline h-4 w-4 mr-1 -mt-0.5" />
            Content search (git grep)
          </div>
        ) : codeSearchLoading ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            <AsciiSpinner active /> Searching...
          </div>
        ) : codeSearchError ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {codeSearchError}
          </div>
        ) : showFlowspaceResults ? (
          <CodeSearchResultsList
            results={codeSearchResults}
            selectedIndex={selectedIndex}
            mode={mode}
            codeSearchFolders={null}
            codeSearchGraphAge={null}
            listRef={listRef}
            onCodeSearchSelect={onCodeSearchSelect}
            onCopyFullPath={onCopyFullPath}
            onCopyRelativePath={onCopyRelativePath}
            onCopyContent={onCopyContent}
            onDownload={onDownload}
          />
        ) : hasFlowspaceQuery ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</div>
        ) : null)}

      {mode === 'search' &&
        (hasSearchText ? (
          // Live file search results (Plan 049 Feature 2)
          fileSearchLoading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <AsciiSpinner active /> Scanning files...
            </div>
          ) : fileSearchError ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {fileSearchError}
            </div>
          ) : showFileResults ? (
            <>
              <div className="flex items-center justify-between border-b px-3 py-1">
                <span className="text-xs text-muted-foreground">
                  {fileSearchResults?.length} files
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onSortModeChange}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title={
                      sortMode === 'recent'
                        ? 'Sort: Recently changed'
                        : sortMode === 'alpha-asc'
                          ? 'Sort: A → Z'
                          : 'Sort: Z → A'
                    }
                    aria-label={
                      sortMode === 'recent'
                        ? 'Sort by recently changed'
                        : sortMode === 'alpha-asc'
                          ? 'Sort alphabetically A to Z'
                          : 'Sort alphabetically Z to A'
                    }
                  >
                    {sortMode === 'recent' ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : sortMode === 'alpha-asc' ? (
                      <ArrowDownAZ className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpZA className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onIncludeHiddenChange}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    title={includeHidden ? 'Hidden files: shown' : 'Hidden files: hidden'}
                    aria-label={includeHidden ? 'Hide hidden files' : 'Show hidden files'}
                  >
                    {includeHidden ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: custom file search list */}
              <div ref={listRef} role="listbox" tabIndex={-1} className="py-1">
                {fileSearchResults?.map((entry, index) => {
                  const changed = changesMap.get(entry.path);
                  const badge = changed ? STATUS_BADGE[changed.status] : null;
                  const dir = entry.path.includes('/')
                    ? entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
                    : '';
                  const name = entry.path.split('/').pop() ?? entry.path;
                  return (
                    <ContextMenu key={entry.path}>
                      <ContextMenuTrigger asChild>
                        <div // biome-ignore lint/a11y/useSemanticElements: custom file result item
                          role="option"
                          tabIndex={-1}
                          aria-selected={index === selectedIndex}
                          className={`flex items-center gap-1.5 px-3 py-1 text-sm cursor-pointer ${
                            index === selectedIndex
                              ? 'bg-primary/15 text-foreground'
                              : 'text-foreground hover:bg-accent/50'
                          }`}
                          onClick={() => onFileSelect?.(entry.path)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onFileSelect?.(entry.path);
                          }}
                        >
                          {badge && (
                            <span
                              className={`shrink-0 w-4 text-center font-mono text-xs font-bold ${badge.className}`}
                            >
                              {badge.letter}
                            </span>
                          )}
                          <FileIcon filename={name} className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">
                            <span className="text-muted-foreground">{dir}</span>
                            <span>{name}</span>
                          </span>
                        </div>
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
                })}
              </div>
            </>
          ) : (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No matching files
            </div>
          )
        ) : (
          // Empty input: Quick Access hints
          <div className="py-2">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Quick Access
            </div>
            <div className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-1 rounded">&gt;</span>
              <span>Commands</span>
            </div>
            <div className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-1 rounded">#</span>
              <span>Content search</span>
            </div>
            <div className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-1 rounded">$</span>
              <span>
                Semantic search
                {codeSearchAvailability === 'not-installed'
                  ? ' (install FlowSpace)'
                  : ' (FlowSpace)'}
              </span>
            </div>
            <div className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              <span>Type to search files</span>
            </div>
          </div>
        ))}

      {mode === 'commands' &&
        (commands.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {filter ? 'No matching commands' : 'No commands registered'}
          </div>
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: custom command palette, not a native select
          <div ref={listRef} role="listbox" tabIndex={-1} className="py-1">
            {commands.map((cmd, index) => (
              <div // biome-ignore lint/a11y/useSemanticElements: custom palette item
                key={cmd.id}
                role="option"
                tabIndex={-1}
                aria-selected={index === selectedIndex}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${
                  index === selectedIndex
                    ? 'bg-primary/15 text-foreground'
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onClick={() => handleSelect(cmd.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSelect(cmd.id);
                }}
              >
                <CommandIcon icon={cmd.icon} />
                <span className="flex-1 truncate">{cmd.title}</span>
                {cmd.domain && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {cmd.domain}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      {mode === 'param' && paramGathering && (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 shrink-0" />
            <span>
              Enter <strong className="text-foreground">{paramGathering.fieldKey}</strong> for{' '}
              <strong className="text-foreground">{paramGathering.commandTitle}</strong>
            </span>
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground/70">
            Press Enter to execute · Escape to go back
          </div>
        </div>
      )}
    </div>
  );
});

function CommandIcon({ icon }: { icon?: string }) {
  switch (icon) {
    case 'search':
      return <Search className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case 'terminal':
      return <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />;
    default:
      return <Command className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
}

/** Status badge colors matching ChangesView (Plan 043) */
const STATUS_BADGE: Record<string, { letter: string; className: string }> = {
  modified: { letter: 'M', className: 'text-amber-500' },
  added: { letter: 'A', className: 'text-green-500' },
  deleted: { letter: 'D', className: 'text-red-500' },
  untracked: { letter: '?', className: 'text-muted-foreground' },
  renamed: { letter: 'R', className: 'text-blue-500' },
};
