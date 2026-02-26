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

import { AsciiSpinner } from './ascii-spinner';

export type DropdownMode = 'commands' | 'symbols' | 'search' | 'param';

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

  // Items count for keyboard nav
  const navItemCount =
    mode === 'commands' ? commands.length : showFileResults ? fileSearchResults?.length : 0;

  // Reset selection when filter, mode, or search results change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset on filter/mode/results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter, mode, fileSearchResults]);

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
    ]
  );

  useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

  return (
    // DYK-P3-02: onMouseDown preventDefault keeps input focused
    <div
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      {mode === 'symbols' && (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
          <Hash className="inline h-4 w-4 mr-1 -mt-0.5" />
          Symbol search (LSP/Flowspace) coming later
        </div>
      )}

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
                          {badge ? (
                            <span
                              className={`shrink-0 w-4 text-center font-mono text-xs font-bold ${badge.className}`}
                            >
                              {badge.letter}
                            </span>
                          ) : (
                            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
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
          // Empty input: Quick Access hints (unchanged)
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
              <span>Symbol search (coming soon)</span>
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
