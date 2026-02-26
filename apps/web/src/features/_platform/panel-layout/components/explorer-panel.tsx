'use client';

/**
 * ExplorerPanel — Top utility bar with composable input handler chain + command palette.
 *
 * Displays the current file path with a copy button. Clicking the path
 * enters edit mode where typing a path and pressing Enter triggers a
 * handler chain. Typing '>' activates command palette mode (DYK-P3-01).
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * Phase 3: Command Palette — Plan 047
 * DYK-P3-01: Palette activates on typing '>', not on Enter
 * DYK-P3-03: Keyboard events delegated to dropdown in palette mode
 */

import type { IUSDK } from '@chainglass/shared/sdk';
import { ArrowRight, ClipboardCopy } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { MruTracker } from '@/lib/sdk/sdk-provider';

import type {
  BarContext,
  BarHandler,
  ExplorerPanelHandle,
  FileChangeInfo,
  FileSearchEntry,
  FileSearchSortMode,
} from '../types';
import { AsciiSpinner } from './ascii-spinner';
import {
  CommandPaletteDropdown,
  type CommandPaletteDropdownHandle,
  type ParamGatheringInfo,
  extractFirstRequiredStringField,
  hasRequiredParams,
} from './command-palette-dropdown';

export interface ExplorerPanelProps {
  filePath: string;
  handlers: BarHandler[];
  context: BarContext;
  onCopy: () => void;
  placeholder?: string;
  /** SDK instance for command palette. When absent, palette is disabled. */
  sdk?: IUSDK;
  /** MRU tracker for command palette ordering. */
  mru?: MruTracker;
  /** Called when a command is executed via palette (for MRU persistence). */
  onCommandExecute?: (commandId: string) => void;
  /** File search results from useFileFilter (Plan 049 Feature 2) */
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
  /** Called when search query changes (for file filter hook) */
  onSearchQueryChange?: (query: string) => void;
}

export const ExplorerPanel = forwardRef<ExplorerPanelHandle, ExplorerPanelProps>(
  function ExplorerPanel(
    {
      filePath,
      handlers,
      context,
      onCopy,
      placeholder,
      sdk,
      mru,
      onCommandExecute,
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
      onSearchQueryChange,
    },
    ref
  ) {
    const [editing, setEditing] = useState(false);
    const [inputValue, setInputValue] = useState(filePath);
    const [processing, setProcessing] = useState(false);
    const [paramGathering, setParamGathering] = useState<ParamGatheringInfo | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<CommandPaletteDropdownHandle>(null);
    const prevFilePathRef = useRef(filePath);

    // DYK-P3-01: Palette activates on typing '>', not on Enter
    // DYK-ST001-01: paramGathering overrides prefix-derived mode
    const paletteMode = editing && inputValue.startsWith('>') && !!sdk;
    const symbolMode = editing && inputValue.startsWith('#');
    const paletteFilter = paletteMode ? inputValue.slice(1).trim() : '';
    // Show dropdown whenever editing is active and SDK available (like VS Code)
    const showDropdown = editing && !!sdk && !processing;
    // Determine dropdown mode — param gathering takes priority
    const dropdownMode = paramGathering
      ? ('param' as const)
      : paletteMode
        ? ('commands' as const)
        : symbolMode
          ? ('symbols' as const)
          : ('search' as const);

    // Plan 049 Feature 2: File search mode has results — delegate keyboard
    const searchHasResults =
      dropdownMode === 'search' &&
      inputValue.trim().length > 0 &&
      !inputValue.startsWith('>') &&
      !inputValue.startsWith('#') &&
      Array.isArray(fileSearchResults) &&
      fileSearchResults.length > 0;

    // Sync: when filePath changes externally, exit edit mode and update input value
    useEffect(() => {
      if (filePath !== prevFilePathRef.current) {
        prevFilePathRef.current = filePath;
        if (!processing) {
          setEditing(false);
        }
        setInputValue(filePath);
      }
    }, [filePath, processing]);

    // Plan 049 Feature 2: Notify parent of search query changes
    useEffect(() => {
      if (dropdownMode === 'search' && editing) {
        onSearchQueryChange?.(inputValue.trim());
      } else {
        onSearchQueryChange?.('');
      }
    }, [inputValue, dropdownMode, editing, onSearchQueryChange]);

    // Expose focusInput + openPalette
    useImperativeHandle(ref, () => ({
      focusInput: () => {
        if (processing) return;
        setEditing(true);
        setInputValue(filePath);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 0);
      },
      openPalette: () => {
        if (!sdk || processing) return;
        setEditing(true);
        setInputValue('>');
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      },
    }));

    const enterEditMode = useCallback(() => {
      setEditing(true);
      setInputValue(filePath);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }, [filePath]);

    const exitEditMode = useCallback(() => {
      setEditing(false);
      setInputValue(filePath);
      setParamGathering(null);
    }, [filePath]);

    const exitPaletteMode = useCallback(() => {
      setEditing(false);
      setInputValue(filePath);
      setParamGathering(null);
    }, [filePath]);

    const handlePaletteExecute = useCallback(
      async (commandId: string) => {
        if (!sdk) return;

        // ST002: Check if command needs param gathering
        const cmd = sdk.commands.list().find((c) => c.id === commandId);
        if (cmd && hasRequiredParams(cmd.params)) {
          const field = extractFirstRequiredStringField(cmd.params);
          if (field) {
            // Transition to param input mode
            setParamGathering({ commandId, commandTitle: cmd.title, fieldKey: field.key });
            setInputValue('');
            setTimeout(() => inputRef.current?.focus(), 0);
            return;
          }
        }

        try {
          await sdk.commands.execute(commandId);
          onCommandExecute?.(commandId);
        } catch (error) {
          console.error('[CommandPalette] Execute failed:', error);
        } finally {
          exitPaletteMode();
        }
      },
      [sdk, onCommandExecute, exitPaletteMode]
    );

    // ST002: Execute command with gathered param value
    const handleParamSubmit = useCallback(async () => {
      if (!sdk || !paramGathering) return;
      const value = inputValue.trim();
      if (!value) return;

      try {
        await sdk.commands.execute(paramGathering.commandId, { [paramGathering.fieldKey]: value });
        onCommandExecute?.(paramGathering.commandId);
      } catch (error) {
        console.error('[CommandPalette] Execute with params failed:', error);
      } finally {
        exitPaletteMode();
      }
    }, [sdk, paramGathering, inputValue, onCommandExecute, exitPaletteMode]);

    const handleSubmit = useCallback(async () => {
      const value = inputValue.trim();
      if (!value) return;

      setProcessing(true);
      try {
        for (const handler of handlers) {
          const handled = await handler(value, context);
          if (handled) {
            setEditing(false);
            return;
          }
        }
        // DYK-P3-04: Search stub as fallback — informational, not error
        toast.info('Search coming soon');
      } finally {
        setProcessing(false);
      }
    }, [inputValue, handlers, context]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        // DYK-ST001-05: In param gathering mode, Escape goes back to command list
        if (paramGathering) {
          if (e.key === 'Escape') {
            e.preventDefault();
            setParamGathering(null);
            setInputValue('>');
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            handleParamSubmit();
            return;
          }
          return; // Don't delegate other keys in param mode
        }

        // In command palette mode (> prefix): delegate only palette-specific keys
        if (paletteMode) {
          if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
            dropdownRef.current?.handleKeyDown(e);
            return;
          }
        }

        // Plan 049 Feature 2: In search mode with results, delegate ↑↓ Enter to dropdown
        if (searchHasResults) {
          if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
            dropdownRef.current?.handleKeyDown(e);
            return;
          }
        }

        // Escape always exits edit mode (closes dropdown if showing)
        if (e.key === 'Escape') {
          exitEditMode();
          return;
        }

        // Enter runs handler chain (file path nav) even when dropdown hint is showing
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      },
      [paramGathering, paletteMode, searchHasResults, exitEditMode, handleSubmit, handleParamSubmit]
    );

    const handleBlur = useCallback(() => {
      if (!processing) {
        exitEditMode();
      }
    }, [processing, exitEditMode]);

    // Always show input when no file path (placeholder mode)
    const showInput = editing || !filePath;

    return (
      <div className="flex justify-center border-b bg-muted/30 shrink-0 px-4 py-1.5">
        <div className="relative flex items-center gap-1.5 w-full max-w-2xl rounded-lg border bg-background px-3 py-1 shadow-sm">
          {processing ? (
            <AsciiSpinner active={processing} />
          ) : (
            <button
              type="button"
              onClick={onCopy}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Copy file path"
              disabled={!filePath}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </button>
          )}

          {showInput ? (
            <>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onFocus={() => setEditing(true)}
                placeholder={paramGathering ? `Enter ${paramGathering.fieldKey}...` : placeholder}
                className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                aria-label="File path"
              />
              {inputValue.trim() && !processing && !showDropdown && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent blur before submit
                    handleSubmit();
                  }}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Go"
                  title="Navigate to path"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={enterEditMode}
              className="flex-1 text-left font-mono text-sm text-muted-foreground truncate"
            >
              {filePath}
            </button>
          )}

          {/* Command palette / mode dropdown — always visible when editing */}
          {showDropdown && sdk && mru && (
            <CommandPaletteDropdown
              ref={dropdownRef}
              sdk={sdk}
              filter={paletteFilter}
              mru={mru}
              mode={dropdownMode}
              onExecute={handlePaletteExecute}
              onClose={exitPaletteMode}
              paramGathering={paramGathering}
              inputValue={inputValue}
              fileSearchResults={fileSearchResults}
              fileSearchLoading={fileSearchLoading}
              fileSearchError={fileSearchError}
              sortMode={sortMode}
              onSortModeChange={onSortModeChange}
              includeHidden={includeHidden}
              onIncludeHiddenChange={onIncludeHiddenChange}
              onFileSelect={(path) => {
                onFileSelect?.(path);
                exitEditMode();
              }}
              onCopyFullPath={onCopyFullPath}
              onCopyRelativePath={onCopyRelativePath}
              onCopyContent={onCopyContent}
              onDownload={onDownload}
              workingChanges={workingChanges}
            />
          )}
        </div>
      </div>
    );
  }
);
